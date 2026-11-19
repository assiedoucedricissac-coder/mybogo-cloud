const { db } = require('../config/database');

function getAll(req, res) {
  const { debut, fin } = req.query;
  let where = 'WHERE 1=1';
  const params = [];
  if (debut) { where += ' AND date(r.created_at) >= ?'; params.push(debut); }
  if (fin)   { where += ' AND date(r.created_at) <= ?'; params.push(fin); }
  const retraits = db.prepare(`
    SELECT r.*, u.nom as user_nom FROM retraits_caisse r
    LEFT JOIN users u ON r.user_id = u.id
    ${where} ORDER BY r.created_at DESC
  `).all(...params);
  const total = retraits.reduce((s, r) => s + r.montant, 0);
  res.json({ retraits, total });
}

function create(req, res) {
  const { montant, motif } = req.body;
  if (!montant || montant <= 0) return res.status(400).json({ message: 'Montant invalide' });
  const r = db.prepare('INSERT INTO retraits_caisse (montant, motif, user_id) VALUES (?,?,?)').run(montant, motif || null, req.user.id);
  res.status(201).json({ id: r.lastInsertRowid, montant, motif });
}

module.exports = { getAll, create };
