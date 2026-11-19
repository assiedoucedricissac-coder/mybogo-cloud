const bcrypt = require('bcryptjs');
const { db } = require('../config/database');

function getAll(req, res) {
  const isSuperAdmin = req.user.role === 'super_admin';
  const sql = isSuperAdmin
    ? 'SELECT id, nom, prenom, email, role, actif, derniere_connexion, created_at FROM users ORDER BY nom'
    : "SELECT id, nom, prenom, email, role, actif, derniere_connexion, created_at FROM users WHERE role != 'super_admin' ORDER BY nom";
  res.json(db.prepare(sql).all());
}

function getOne(req, res) {
  const user = db.prepare('SELECT id, nom, prenom, email, role, actif, created_at FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ message: 'Utilisateur introuvable' });
  if (user.role === 'super_admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ message: 'Accès refusé' });
  }
  res.json(user);
}

function create(req, res) {
  const { nom, prenom, email, mot_de_passe, role } = req.body;
  if (!nom || !email || !mot_de_passe || !role) {
    return res.status(400).json({ message: 'Champs obligatoires manquants' });
  }
  if (role === 'super_admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ message: 'Création du rôle super_admin non autorisée' });
  }
  const exist = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exist) return res.status(400).json({ message: 'Email déjà utilisé' });
  const hash = bcrypt.hashSync(mot_de_passe, 10);
  const result = db.prepare('INSERT INTO users (nom, prenom, email, mot_de_passe, role) VALUES (?, ?, ?, ?, ?)').run(nom, prenom || '', email, hash, role);
  res.status(201).json({ id: result.lastInsertRowid, message: 'Utilisateur créé' });
}

function update(req, res) {
  const target = db.prepare('SELECT id, role FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ message: 'Utilisateur introuvable' });
  if (target.role === 'super_admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ message: 'Modification non autorisée' });
  }
  const { nom, prenom, email, role, actif } = req.body;
  if (role === 'super_admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ message: 'Rôle super_admin non autorisé' });
  }
  db.prepare('UPDATE users SET nom=?, prenom=?, email=?, role=?, actif=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(nom, prenom, email, role, actif, req.params.id);
  res.json({ message: 'Utilisateur mis à jour' });
}

function resetPassword(req, res) {
  const { nouveau_mdp } = req.body;
  if (!nouveau_mdp) return res.status(400).json({ message: 'Nouveau mot de passe requis' });
  const target = db.prepare('SELECT id, role FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ message: 'Utilisateur introuvable' });
  if (target.role === 'super_admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ message: 'Modification non autorisée' });
  }
  const hash = bcrypt.hashSync(nouveau_mdp, 10);
  db.prepare('UPDATE users SET mot_de_passe=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(hash, req.params.id);
  res.json({ message: 'Mot de passe réinitialisé' });
}

function remove(req, res) {
  const target = db.prepare('SELECT id, role FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ message: 'Utilisateur introuvable' });
  if (target.role === 'super_admin') {
    return res.status(403).json({ message: 'Impossible de désactiver le super administrateur' });
  }
  db.prepare('UPDATE users SET actif=0, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(req.params.id);
  res.json({ message: 'Utilisateur désactivé' });
}

module.exports = { getAll, getOne, create, update, resetPassword, remove };
