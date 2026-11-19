const crypto = require('crypto');
const os     = require('os');
const { execSync } = require('child_process');
const { db }  = require('../config/database');

// ⚠️  NE PAS MODIFIER — clé secrète de signature des licences
const SECRET = 'STOCK-PRO-MBG-2025-LIC-SECRET-K3Y';

function daysLeft(dateStr) {
  const diff = new Date(dateStr) - new Date(new Date().toISOString().split('T')[0]);
  return Math.ceil(diff / 86400000);
}

// ── Empreinte machine (verrouillage licence à un seul poste) ──────────────
// Utilise le MachineGuid Windows (stable, unique par installation Windows,
// lisible sans droits admin) — pas de dépendance externe, pas de compilation
// native. Un repli existe si la commande échoue (environnement inhabituel).
function getMachineGuidRaw() {
  try {
    const out = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid', { windowsHide: true }).toString();
    const match = out.match(/MachineGuid\s+REG_SZ\s+([a-fA-F0-9-]+)/i);
    if (match) return match[1].toLowerCase();
  } catch (_) {}
  return `${os.hostname()}|${os.platform()}|${os.arch()}`;
}

// Identifiant court, lisible, à communiquer par téléphone/WhatsApp/email.
function getMachineId() {
  const hash = crypto.createHash('sha256').update(getMachineGuidRaw()).digest('hex').slice(0, 12).toUpperCase();
  return hash.match(/.{1,4}/g).join('-'); // ex: A1B2-C3D4-E5F6
}

function machineId(req, res) {
  res.json({ machineId: getMachineId() });
}

function getStatus(req, res) {
  let row = db.prepare('SELECT * FROM licence WHERE id = 1').get();

  if (!row) {
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 30);
    const exp = trialEnd.toISOString().split('T')[0];
    db.prepare(`INSERT INTO licence (id, type, expires_at, first_launch)
                VALUES (1, 'trial', ?, date('now'))`).run(exp);
    row = db.prepare('SELECT * FROM licence WHERE id = 1').get();
  }

  const dl = daysLeft(row.expires_at);
  const expired = dl <= 0;

  res.json({
    type:       expired ? 'expired' : row.type,
    expires_at: row.expires_at,
    days_left:  Math.max(0, dl),
    client:     row.client_name || '',
    expired,
  });
}

function activate(req, res) {
  const { key } = req.body;
  if (!key || !key.trim()) return res.status(400).json({ message: 'Clé de licence requise' });

  try {
    const parts = key.trim().split('.');
    if (parts.length !== 2) throw new Error('Format invalide');

    const payload = Buffer.from(parts[0], 'base64url').toString('utf8');
    const data    = JSON.parse(payload);

    const expected = crypto.createHmac('sha256', SECRET).update(parts[0]).digest('hex').slice(0, 12);
    if (parts[1] !== expected) throw new Error('Signature invalide — clé incorrecte');

    const today = new Date().toISOString().split('T')[0];
    if (data.exp && data.exp < today) throw new Error('Cette licence est expirée');

    // Verrouillage à un seul poste : si la clé a été générée pour un ID Machine précis,
    // elle ne s'active que sur CE poste-là — empêche un simple transfert du fichier de clé
    // (ou du .exe) vers une autre machine sans nouvelle autorisation du fournisseur.
    if (data.machineId && data.machineId !== getMachineId()) {
      throw new Error(`Cette licence est verrouillée sur un autre poste. ID de ce poste-ci : ${getMachineId()}`);
    }

    db.prepare(`INSERT INTO licence (id, type, expires_at, licence_key, client_name, activated_at)
      VALUES (1, ?, ?, ?, ?, date('now'))
      ON CONFLICT(id) DO UPDATE SET
        type=excluded.type, expires_at=excluded.expires_at,
        licence_key=excluded.licence_key, client_name=excluded.client_name,
        activated_at=excluded.activated_at`
    ).run(data.type || 'full', data.exp || '2099-12-31', key.trim(), data.client || '');

    res.json({
      message:    'Licence activée avec succès',
      type:       data.type || 'full',
      expires_at: data.exp  || '2099-12-31',
      client:     data.client || '',
    });
  } catch(e) {
    res.status(400).json({ message: e.message || 'Clé invalide' });
  }
}

function generate(req, res) {
  const { client, type = 'full', days = 365, machine_id } = req.body;
  if (!client || !client.trim()) return res.status(400).json({ message: 'Nom du client requis' });
  if (!days || days < 1)         return res.status(400).json({ message: 'Durée invalide' });

  const exp = new Date();
  exp.setDate(exp.getDate() + parseInt(days));
  const expiresAt = exp.toISOString().split('T')[0];

  const payloadObj = { client: client.trim(), type, exp: expiresAt };
  if (machine_id && machine_id.trim()) payloadObj.machineId = machine_id.trim().toUpperCase();

  const payload = JSON.stringify(payloadObj);
  const b64     = Buffer.from(payload).toString('base64url');
  const sig     = crypto.createHmac('sha256', SECRET).update(b64).digest('hex').slice(0, 12);

  res.json({ key: `${b64}.${sig}`, expiresAt, client: client.trim(), type, machineId: payloadObj.machineId || null });
}

module.exports = { getStatus, activate, generate, machineId };
