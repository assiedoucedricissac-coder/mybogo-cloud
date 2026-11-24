// Logique de création d'une nouvelle boutique — partagée entre le script CLI
// (backend/scripts/creer-boutique.js) et l'API du panneau d'administration.
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const tenantRegistry = require('./tenantRegistry');

function tenantsDir() {
  if (process.env.MYBOGO_TENANT_DB_DIR) return process.env.MYBOGO_TENANT_DB_DIR;
  if (process.env.MYBOGO_DB_PATH) return path.join(path.dirname(process.env.MYBOGO_DB_PATH), 'tenants');
  return path.join(__dirname, '../../database/tenants');
}

// dureeJours / type : licence initiale (essai de 15 jours par défaut ; un paiement confirmé
// passe la durée du plan payé avec type 'full').
function provisionnerBoutique({ slug, nomBoutique, email, motDePasse, dureeJours = 15, type = 'trial', telephone = '' }) {
  const jours = Math.max(1, Math.min(3650, parseInt(dureeJours, 10) || 15));
  const typeLicence = type === 'full' ? 'full' : 'trial';
  if (!slug || !nomBoutique || !email || !motDePasse) {
    throw new Error('slug, nomBoutique, email et motDePasse sont requis.');
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw new Error('Le slug ne doit contenir que des lettres minuscules, chiffres et tirets.');
  }
  if (tenantRegistry.lister().some(t => t.slug === slug)) {
    throw new Error(`Une boutique "${slug}" existe déjà.`);
  }

  const dbPath = path.join(tenantsDir(), `${slug}.db`);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  if (fs.existsSync(dbPath)) {
    throw new Error(`Le fichier de base "${dbPath}" existe déjà (incohérence avec le registre).`);
  }

  // provisionnerNouvelleBase() ouvre ce fichier et exécute initDatabase() dessus exactement
  // comme au premier lancement de l'app desktop sur une base vide (même code) — sans toucher
  // à la connexion utilisée par le serveur pour servir les autres boutiques en ce moment même.
  const { provisionnerNouvelleBase } = require('../config/database');
  const db = provisionnerNouvelleBase(dbPath);

  // initDatabase() crée automatiquement deux comptes par défaut, avec des mots de passe FIXES,
  // identiques sur toute nouvelle base — sans risque sur la version desktop (jamais exposée sur
  // internet), mais un vrai trou de sécurité ici : n'importe qui les connaissant pourrait se
  // connecter à N'IMPORTE QUELLE boutique du SaaS. On les désactive systématiquement.
  db.prepare("UPDATE users SET actif = 0 WHERE email IN ('superadmin@mybogo.ci', 'admin@mybogo.com')").run();

  const hash = bcrypt.hashSync(motDePasse, 10);
  db.prepare('INSERT INTO users (nom, prenom, email, mot_de_passe, role) VALUES (?, ?, ?, ?, ?)')
    .run(nomBoutique, 'Admin', email, hash, 'admin');

  db.prepare(`
    INSERT INTO licence (id, type, expires_at, client_name, activated_at)
    VALUES (1, ?, date('now', ?), ?, date('now'))
    ON CONFLICT(id) DO UPDATE SET type=excluded.type, expires_at=excluded.expires_at, client_name=excluded.client_name, activated_at=date('now')
  `).run(typeLicence, `+${jours} days`, nomBoutique);

  db.prepare('INSERT INTO entreprise (id, nom, telephone, email) VALUES (1, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET nom=excluded.nom, telephone=excluded.telephone, email=excluded.email')
    .run(nomBoutique, telephone || '', email);

  db.close();

  tenantRegistry.ajouter({ slug, nom: nomBoutique, dbPath, email, telephone: telephone || '', createdAt: new Date().toISOString() });

  return { slug, nomBoutique, dbPath, email, telephone: telephone || '' };
}

module.exports = { provisionnerBoutique, tenantsDir };
