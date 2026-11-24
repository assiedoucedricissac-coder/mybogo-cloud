const bcrypt = require('bcryptjs');
const { db } = require('../config/database');

// initDatabase() crée ces comptes avec des mots de passe connus de tous (présents dans le code).
// En production, on désactive à chaque démarrage ceux qui ont encore leur mot de passe d'origine ;
// un compte dont le mot de passe a été changé n'est pas touché.
const DEFAUTS = [
  ['superadmin@mybogo.ci', 'Bonjour@2026'],
  ['admin@mybogo.com', 'admin123'],
];

function securiserComptesParDefaut() {
  if (process.env.NODE_ENV !== 'production') return;
  for (const [email, motDePasse] of DEFAUTS) {
    try {
      const u = db.prepare('SELECT id, mot_de_passe, actif FROM users WHERE email = ?').get(email);
      if (u && u.actif && bcrypt.compareSync(motDePasse, u.mot_de_passe)) {
        db.prepare('UPDATE users SET actif = 0 WHERE id = ?').run(u.id);
        console.warn(`[SÉCURITÉ] Compte par défaut désactivé : ${email}`);
      }
    } catch (e) {
      console.error('[SÉCURITÉ] Vérification des comptes par défaut:', e.message);
    }
  }
}

module.exports = { securiserComptesParDefaut };
