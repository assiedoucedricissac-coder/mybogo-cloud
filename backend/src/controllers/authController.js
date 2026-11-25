const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db, currentTenantSlug } = require('../config/database');

function login(req, res) {
  const { email, mot_de_passe } = req.body;
  if (!email || !mot_de_passe) {
    return res.status(400).json({ message: 'Email et mot de passe requis' });
  }
  // Insensible à la casse et aux espaces : les claviers de téléphone ajoutent souvent une majuscule.
  const emailNorm = String(email).trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE lower(email) = ? AND actif = 1').get(emailNorm);
  if (!user || !bcrypt.compareSync(mot_de_passe, user.mot_de_passe)) {
    return res.status(401).json({ message: 'Email ou mot de passe incorrect' });
  }
  db.prepare('UPDATE users SET derniere_connexion = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
  db.prepare('INSERT INTO journal_activites (user_id, action, module) VALUES (?, ?, ?)').run(user.id, 'connexion', 'auth');
  const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });
  const { mot_de_passe: _, ...userSafe } = user;
  res.json({ token, user: userSafe, boutique: currentTenantSlug() });
}

function getMe(req, res) {
  res.json(req.user);
}

function changePassword(req, res) {
  const { ancien_mdp, nouveau_mdp } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(ancien_mdp, user.mot_de_passe)) {
    return res.status(400).json({ message: 'Ancien mot de passe incorrect' });
  }
  const hash = bcrypt.hashSync(nouveau_mdp, 10);
  db.prepare('UPDATE users SET mot_de_passe = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hash, req.user.id);
  res.json({ message: 'Mot de passe modifié avec succès' });
}

module.exports = { login, getMe, changePassword };
