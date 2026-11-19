const { db } = require('../config/database');

function getAll(req, res) {
  res.json(db.prepare('SELECT * FROM fournisseurs WHERE actif = 1 ORDER BY nom').all());
}

function getOne(req, res) {
  const f = db.prepare('SELECT * FROM fournisseurs WHERE id = ?').get(req.params.id);
  if (!f) return res.status(404).json({ message: 'Fournisseur introuvable' });
  const achats = db.prepare('SELECT id, numero, total, montant_paye, created_at, statut FROM achats WHERE fournisseur_id = ? ORDER BY created_at DESC LIMIT 20').all(req.params.id);
  const paiements = db.prepare(`
    SELECT p.*, a.numero as achat_numero FROM paiements_fournisseur p
    LEFT JOIN achats a ON p.achat_id = a.id
    WHERE p.fournisseur_id = ? ORDER BY p.created_at DESC LIMIT 30
  `).all(req.params.id);
  res.json({ ...f, achats, paiements });
}

function ajouterPaiement(req, res) {
  const { montant, mode_paiement, note, achat_id } = req.body;
  const fournisseur = db.prepare('SELECT * FROM fournisseurs WHERE id = ?').get(req.params.id);
  if (!fournisseur) return res.status(404).json({ message: 'Fournisseur introuvable' });
  const mt = parseFloat(montant);
  if (!mt || mt <= 0) return res.status(400).json({ message: 'Montant invalide' });

  const tx = db.transaction(() => {
    db.prepare('INSERT INTO paiements_fournisseur (fournisseur_id, achat_id, montant, mode_paiement, note, user_id) VALUES (?,?,?,?,?,?)')
      .run(req.params.id, achat_id || null, mt, mode_paiement || 'especes', note || null, req.user.id);
    db.prepare('UPDATE fournisseurs SET solde = solde - ?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(mt, req.params.id);
    if (achat_id) {
      const a = db.prepare('SELECT montant_paye FROM achats WHERE id = ?').get(achat_id);
      if (a) {
        db.prepare('UPDATE achats SET montant_paye=? WHERE id=?').run((a.montant_paye || 0) + mt, achat_id);
      }
    }
  });

  try {
    tx();
    const maj = db.prepare('SELECT solde FROM fournisseurs WHERE id = ?').get(req.params.id);
    res.json({ message: 'Paiement enregistré', solde: maj.solde });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

function create(req, res) {
  const { nom, telephone, email, adresse, nif, rccm } = req.body;
  if (!nom) return res.status(400).json({ message: 'Nom requis' });
  const result = db.prepare('INSERT INTO fournisseurs (nom, telephone, email, adresse, nif, rccm) VALUES (?,?,?,?,?,?)').run(nom, telephone||null, email||null, adresse||null, nif||null, rccm||null);
  res.status(201).json({ id: result.lastInsertRowid, message: 'Fournisseur créé' });
}

function update(req, res) {
  const { nom, telephone, email, adresse, nif, rccm } = req.body;
  db.prepare('UPDATE fournisseurs SET nom=?,telephone=?,email=?,adresse=?,nif=?,rccm=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(nom, telephone, email, adresse, nif, rccm, req.params.id);
  res.json({ message: 'Fournisseur mis à jour' });
}

function remove(req, res) {
  db.prepare('UPDATE fournisseurs SET actif=0 WHERE id=?').run(req.params.id);
  res.json({ message: 'Fournisseur supprimé' });
}

module.exports = { getAll, getOne, create, update, remove, ajouterPaiement };
