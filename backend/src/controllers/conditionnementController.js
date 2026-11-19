const { db } = require('../config/database');

function getAll(req, res) {
  try {
    const data = db.prepare(
      'SELECT * FROM conditionnements WHERE actif = 1 ORDER BY produit_id, ordre, id'
    ).all();
    res.json(data);
  } catch (err) { res.status(500).json({ message: err.message }); }
}

function getByProduit(req, res) {
  try {
    const data = db.prepare(
      'SELECT * FROM conditionnements WHERE produit_id = ? AND actif = 1 ORDER BY ordre, id'
    ).all(req.params.produitId);
    res.json(data);
  } catch (err) { res.status(500).json({ message: err.message }); }
}

function create(req, res) {
  try {
    const { produit_id, libelle, contenance, prix_vente, prix_achat, ordre } = req.body;
    if (!produit_id || !libelle || !contenance || prix_vente === undefined) {
      return res.status(400).json({ message: 'Champs manquants (produit_id, libelle, contenance, prix_vente)' });
    }
    const r = db.prepare(
      'INSERT INTO conditionnements (produit_id, libelle, contenance, prix_vente, prix_achat, ordre) VALUES (?,?,?,?,?,?)'
    ).run(produit_id, libelle.trim(), parseInt(contenance), parseFloat(prix_vente), parseFloat(prix_achat) || 0, parseInt(ordre) || 0);
    res.status(201).json({ id: r.lastInsertRowid, message: 'Créé' });
  } catch (err) { res.status(500).json({ message: err.message }); }
}

function update(req, res) {
  try {
    const { libelle, contenance, prix_vente, prix_achat, ordre } = req.body;
    db.prepare(
      'UPDATE conditionnements SET libelle=?, contenance=?, prix_vente=?, prix_achat=?, ordre=? WHERE id=?'
    ).run(libelle.trim(), parseInt(contenance), parseFloat(prix_vente), parseFloat(prix_achat) || 0, parseInt(ordre) || 0, req.params.id);
    res.json({ message: 'OK' });
  } catch (err) { res.status(500).json({ message: err.message }); }
}

function remove(req, res) {
  try {
    db.prepare('UPDATE conditionnements SET actif=0 WHERE id=?').run(req.params.id);
    res.json({ message: 'Supprimé' });
  } catch (err) { res.status(500).json({ message: err.message }); }
}

module.exports = { getAll, getByProduit, create, update, remove };
