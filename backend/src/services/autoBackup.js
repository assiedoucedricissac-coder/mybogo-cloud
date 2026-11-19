const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { exec } = require('child_process');
const { db } = require('../config/database');

const DB_PATH     = process.env.MYBOGO_DB_PATH || path.join(__dirname, '../../../database/mybogo.db');
const BACKUP_DIR  = path.join(path.dirname(DB_PATH), 'sauvegardes_auto');
const MAX_BACKUPS = 7;
const INTERVAL_MS = 2 * 60 * 60 * 1000; // toutes les 2 heures

let dernierBackup = null; // horodatage de la dernière sauvegarde réussie

function pad(n) { return String(n).padStart(2, '0'); }

function nomFichier() {
  const d = new Date();
  return `mybogo-auto-${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}h${pad(d.getMinutes())}.db`;
}

/* ── Détecte les clés USB (async, sans bloquer l'event loop) ── */
function clesUSB() {
  return new Promise(resolve => {
    exec('wmic logicaldisk where drivetype=2 get deviceid /format:csv', { timeout: 3000 }, (err, stdout) => {
      if (err || !stdout) return resolve([]);
      const lecteurs = stdout.split('\n')
        .map(l => l.trim())
        .filter(l => /^[A-Z]:$/i.test(l.split(',').pop()))
        .map(l => l.split(',').pop().trim());
      resolve(lecteurs);
    });
  });
}

/* ── Détecte OneDrive ou Google Drive ── */
function dossiersCloud() {
  const user = os.homedir();
  const candidats = [
    path.join(user, 'OneDrive'),
    path.join(user, 'OneDrive - Personal'),
    path.join(user, 'Google Drive'),
    path.join(user, 'My Drive'),
    path.join(user, 'Dropbox'),
  ];
  return candidats.filter(d => {
    try { return fs.statSync(d).isDirectory(); } catch { return false; }
  });
}

/* ── Copie avec rotation dans un répertoire cible ── */
function copierVers(dir, nom, src) {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(src, path.join(dir, nom));
    // Garder MAX_BACKUPS fichiers
    const fichiers = fs.readdirSync(dir)
      .filter(f => f.startsWith('mybogo-auto-') && f.endsWith('.db'))
      .sort();
    while (fichiers.length > MAX_BACKUPS) {
      try { fs.unlinkSync(path.join(dir, fichiers.shift())); } catch {}
    }
    return true;
  } catch {
    return false;
  }
}

/* ── Sauvegarde principale (async) ── */
async function faireBackup() {
  try {
    if (!fs.existsSync(DB_PATH)) return;

    // PASSIVE : ne bloque pas la DB, laisse les transactions en cours finir
    try { db.exec('PRAGMA wal_checkpoint(PASSIVE)'); } catch {}

    const nom = nomFichier();

    // 1. Sauvegarde locale (toujours)
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const fichierLocal = path.join(BACKUP_DIR, nom);
    fs.copyFileSync(DB_PATH, fichierLocal);

    // Rotation locale
    const locaux = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('mybogo-auto-') && f.endsWith('.db'))
      .sort();
    while (locaux.length > MAX_BACKUPS) {
      try { fs.unlinkSync(path.join(BACKUP_DIR, locaux.shift())); } catch {}
    }

    const destinations = ['LOCAL'];

    // 2. Clés USB (async, sans bloquer)
    const lecteurs = await clesUSB();
    for (const lettre of lecteurs) {
      const dir = path.join(lettre + '\\', 'MYBOGO-SAUVEGARDES');
      if (copierVers(dir, nom, fichierLocal)) destinations.push(`USB(${lettre})`);
    }

    // 3. Cloud (OneDrive / Google Drive / Dropbox)
    for (const cloud of dossiersCloud()) {
      const dir = path.join(cloud, 'MYBOGO-SAUVEGARDES');
      if (copierVers(dir, nom, fichierLocal)) destinations.push(path.basename(cloud));
    }

    dernierBackup = new Date().toISOString();
    console.log(`[AutoBackup] OK → ${nom} | Destinations : ${destinations.join(', ')}`);

  } catch (err) {
    console.error('[AutoBackup] Erreur :', err.message);
  }
}

function demarrer() {
  setTimeout(() => faireBackup().catch(e => console.error('[AutoBackup] Erreur timer:', e.message)), 30_000);
  setInterval(() => faireBackup().catch(e => console.error('[AutoBackup] Erreur interval:', e.message)), INTERVAL_MS);
  console.log(`[AutoBackup] Démarré — sauvegarde toutes les 2h`);
}

function getStatut() {
  return { dernierBackup, dossierLocal: BACKUP_DIR };
}

module.exports = { demarrer, faireBackup, getStatut };
