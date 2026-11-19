const path = require('path');
const fs   = require('fs');
const os   = require('os');
const multer = require('multer');
const { db } = require('../config/database');

const DB_PATH = process.env.MYBOGO_DB_PATH || path.join(__dirname, '../../database/mybogo.db');
const upload  = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

function infos(req, res) {
  try {
    const stat = fs.statSync(DB_PATH);
    const nb_ventes   = db.prepare('SELECT COUNT(*) as n FROM ventes').get()?.n   || 0;
    const nb_clients  = db.prepare('SELECT COUNT(*) as n FROM clients').get()?.n  || 0;
    const nb_produits = db.prepare('SELECT COUNT(*) as n FROM produits').get()?.n || 0;
    res.json({ taille: stat.size, derniere_modif: stat.mtime, nb_ventes, nb_clients, nb_produits });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

function telecharger(req, res) {
  try {
    const d = new Date();
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const filename = `mybogo-sauvegarde-${dateStr}.db`;
    const tmpPath  = path.join(os.tmpdir(), `mybogo-bk-${Date.now()}.db`);

    // PASSIVE : ne bloque pas les transactions actives
    try { db.exec('PRAGMA wal_checkpoint(PASSIVE)'); } catch {}
    fs.copyFileSync(DB_PATH, tmpPath);

    res.download(tmpPath, filename, () => {
      try { fs.unlinkSync(tmpPath); } catch {}
    });
  } catch (err) {
    res.status(500).json({ message: 'Impossible de créer la sauvegarde : ' + err.message });
  }
}

function restaurer(req, res) {
  upload.single('backup')(req, res, (uploadErr) => {
    if (uploadErr) return res.status(400).json({ message: 'Erreur upload : ' + uploadErr.message });
    if (!req.file)  return res.status(400).json({ message: 'Aucun fichier reçu' });

    const buf = req.file.buffer;

    // Vérifier le magic bytes SQLite
    const MAGIC = Buffer.from([0x53,0x51,0x4C,0x69,0x74,0x65,0x20,0x66,0x6F,0x72,0x6D,0x61,0x74,0x20,0x33,0x00]);
    if (buf.length < 16 || !buf.slice(0, 16).equals(MAGIC)) {
      return res.status(400).json({ message: 'Fichier invalide — ce n\'est pas une base de données MYBOGO (.db)' });
    }

    // Sauvegarder l'actuelle avant d'écraser
    try { fs.copyFileSync(DB_PATH, DB_PATH + '.avant-restauration'); } catch {}

    // Écrire le nouveau fichier
    fs.writeFileSync(DB_PATH, buf);

    res.json({ message: 'Restauration réussie. Redémarrez l\'application pour appliquer les données.', restart: true });
  });
}

// Vide toutes les données métier (produits, ventes, achats, clients, factures...) pour
// repartir sur une base vierge — typiquement avant d'installer chez un nouveau client,
// afin de ne pas laisser les données de test/développement. Les comptes utilisateurs,
// les infos entreprise et la licence sont conservés.
const TABLES_A_VIDER = [
  'dgi_submissions', 'paiements_facture', 'lignes_facture', 'factures',
  'paiements_credit', 'lignes_vente', 'ventes',
  'paiements_fournisseur', 'lignes_achat', 'achats',
  'lignes_inventaire', 'inventaires',
  'mouvements_stock', 'conditionnements',
  'produits', 'clients', 'fournisseurs', 'categories',
  'journal_activites', 'sessions_caisse', 'retraits_caisse',
];

function reinitialiser(req, res) {
  const { confirmation } = req.body;
  if (confirmation !== 'REINITIALISER') {
    return res.status(400).json({ message: 'Confirmation invalide' });
  }

  // Sauvegarde automatique de sécurité avant de tout vider.
  // Le checkpoint et la copie sont isolés l'un de l'autre (comme dans telecharger()) :
  // si le checkpoint échoue (table verrouillée momentanément), la copie doit quand même
  // être tentée plutôt que d'abandonner la sauvegarde entièrement.
  let safetyOk = false;
  try {
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
    const safetyPath = DB_PATH + `.avant-reinitialisation-${stamp}`;
    try { db.exec('PRAGMA wal_checkpoint(PASSIVE)'); } catch(_) {}
    fs.copyFileSync(DB_PATH, safetyPath);
    safetyOk = true;
  } catch (e) { console.error('Sauvegarde de sécurité échouée:', e.message); }

  try {
    db.exec('PRAGMA foreign_keys = OFF');
    const tx = db.transaction(() => {
      for (const table of TABLES_A_VIDER) {
        db.exec(`DELETE FROM ${table}`);
      }
      // Ligne entreprise par défaut resituée si elle avait été supprimée par erreur ailleurs
    });
    tx();
    db.exec('PRAGMA foreign_keys = ON');
    res.json({
      message: safetyOk
        ? 'Toutes les données métier ont été effacées. Une sauvegarde de sécurité a été conservée.'
        : 'Toutes les données métier ont été effacées. ⚠️ La sauvegarde de sécurité automatique a échoué — pensez à en faire une manuellement la prochaine fois avant de réinitialiser.',
      safetyBackup: safetyOk,
    });
  } catch (err) {
    try { db.exec('PRAGMA foreign_keys = ON'); } catch(_) {}
    res.status(500).json({ message: 'Erreur lors de la réinitialisation : ' + err.message });
  }
}

function statutAuto(req, res) {
  try {
    const { getStatut } = require('../services/autoBackup');
    res.json(getStatut());
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

function lancerMaintenant(req, res) {
  try {
    const { faireBackup } = require('../services/autoBackup');
    faireBackup();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { infos, telecharger, restaurer, statutAuto, lancerMaintenant, reinitialiser };
