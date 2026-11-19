const { db }   = require('../config/database');
const dgi      = require('../services/dgiService');

// Statut de la connexion DGI
function getStatut(req, res) {
  res.json({
    mode:         dgi.getMode(),
    configured:   dgi.isConfigured(),
    nif_emetteur: process.env.DGI_NIF_EMETTEUR || process.env.SOCIETE_NIF || '',
    message:      dgi.getMode() === 'mock'
      ? 'Mode simulation — aucun appel réel à la DGI'
      : dgi.isConfigured()
        ? 'Credentials configurés — prêt pour soumission'
        : 'Credentials manquants dans .env',
  });
}

// Soumettre une facture à la DGI
async function soumettre(req, res) {
  const facture = db.prepare(`
    SELECT f.*, c.nom as client_nom, c.telephone as client_tel,
           c.adresse as client_adresse, c.numero_contribuable
    FROM factures f LEFT JOIN clients c ON f.client_id=c.id
    WHERE f.id=?
  `).get(req.params.id);

  if (!facture) return res.status(404).json({ message: 'Facture introuvable' });
  if (facture.type !== 'facture') return res.status(400).json({ message: 'Seules les factures normalisées peuvent être soumises à la DGI' });

  // Vérifie si déjà validée
  const existing = db.prepare(`SELECT * FROM dgi_submissions WHERE facture_id=? AND statut='valide'`).get(facture.id);
  if (existing) return res.status(400).json({ message: `Déjà soumise — N° DGI: ${existing.dgi_numero}` });

  const lignes = db.prepare(`SELECT * FROM lignes_facture WHERE facture_id=?`).all(facture.id);
  const client = facture.client_id
    ? db.prepare('SELECT * FROM clients WHERE id=?').get(facture.client_id)
    : null;

  // Créer une entrée "en attente"
  const sub = db.prepare(`
    INSERT INTO dgi_submissions (facture_id, facture_numero, statut, mode, tentatives)
    VALUES (?,?,?,?,0)
  `).run(facture.id, facture.numero, 'en_attente', dgi.getMode());
  const subId = sub.lastInsertRowid;

  try {
    const { payload, reponse } = await dgi.soumettreFacture(facture, lignes, client);

    const statutDB = reponse.statut === 'VALIDE' ? 'valide'
      : reponse.statut === 'REJETE' ? 'rejete' : 'soumis';

    db.prepare(`
      UPDATE dgi_submissions SET
        statut=?, dgi_numero=?, dgi_qr_data=?, dgi_token=?,
        requete_json=?, reponse_json=?, soumis_at=CURRENT_TIMESTAMP,
        valide_at=CASE WHEN ?='valide' THEN CURRENT_TIMESTAMP ELSE NULL END,
        tentatives=tentatives+1
      WHERE id=?
    `).run(
      statutDB,
      reponse.dgi_numero || null,
      reponse.qr_data    || null,
      reponse.token_validation || null,
      JSON.stringify(payload),
      JSON.stringify(reponse),
      statutDB,
      subId
    );

    db.prepare(`INSERT INTO journal_activites (user_id,action,module,details) VALUES (?,?,?,?)`)
      .run(req.user.id, 'soumission_dgi', 'dgi',
        `Facture ${facture.numero} → DGI ${reponse.dgi_numero || '?'} [${statutDB}]`);

    res.json({
      succes:     true,
      statut:     statutDB,
      dgi_numero: reponse.dgi_numero,
      qr_data:    reponse.qr_data,
      message:    reponse.message,
      mode:       dgi.getMode(),
    });

  } catch (err) {
    db.prepare(`UPDATE dgi_submissions SET statut='rejete', message_erreur=?, tentatives=tentatives+1 WHERE id=?`)
      .run(err.message, subId);
    res.status(502).json({ message: `Échec soumission DGI: ${err.message}` });
  }
}

// Vérifier le statut DGI d'une facture
async function verifierStatut(req, res) {
  const sub = db.prepare(`SELECT * FROM dgi_submissions WHERE facture_id=? ORDER BY id DESC LIMIT 1`)
    .get(req.params.id);
  if (!sub) return res.json({ statut: 'non_soumis', message: 'Cette facture n\'a pas encore été soumise à la DGI' });

  if (sub.statut === 'valide') {
    return res.json({
      statut:     'valide',
      dgi_numero: sub.dgi_numero,
      qr_data:    sub.dgi_qr_data,
      valide_at:  sub.valide_at,
      mode:       sub.mode,
    });
  }

  // Pour sandbox/production, re-vérifier en live
  if (sub.dgi_numero && dgi.getMode() !== 'mock') {
    try {
      const check = await dgi.verifierStatut(sub.dgi_numero);
      res.json({ ...check, mode: dgi.getMode() });
    } catch(err) {
      res.json({ statut: sub.statut, dgi_numero: sub.dgi_numero, erreur: err.message });
    }
  } else {
    res.json({
      statut:     sub.statut,
      dgi_numero: sub.dgi_numero,
      qr_data:    sub.dgi_qr_data,
      mode:       sub.mode,
      soumis_at:  sub.soumis_at,
    });
  }
}

// Historique des soumissions DGI
function historique(req, res) {
  const rows = db.prepare(`
    SELECT ds.*, f.numero as facture_numero, f.total, c.nom as client_nom
    FROM dgi_submissions ds
    JOIN factures f ON ds.facture_id=f.id
    LEFT JOIN clients c ON f.client_id=c.id
    ORDER BY ds.created_at DESC LIMIT 100
  `).all();
  res.json(rows);
}

// Re-soumettre une facture rejetée
async function resoumettre(req, res) {
  const sub = db.prepare(`SELECT * FROM dgi_submissions WHERE facture_id=? AND statut='rejete' ORDER BY id DESC LIMIT 1`)
    .get(req.params.id);
  if (!sub) return res.status(400).json({ message: 'Aucune soumission rejetée pour cette facture' });

  db.prepare(`UPDATE dgi_submissions SET statut='en_attente' WHERE id=?`).run(sub.id);
  req.params.id = req.params.id; // pass through
  return soumettre(req, res);
}

module.exports = { getStatut, soumettre, verifierStatut, historique, resoumettre };
