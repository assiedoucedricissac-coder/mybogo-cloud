const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const tenantRegistry = require('../services/tenantRegistry');
const { provisionnerBoutique } = require('../services/provisionnement');
const { mainDb, tenantDbWrapped } = require('../config/database');

// Un seul "compte" — vous, le revendeur — protégé par un mot de passe défini en variable
// d'environnement Railway (ADMIN_PASSWORD), séparé de tout compte utilisateur d'une boutique.
function login(req, res) {
  const { motDePasse } = req.body;
  if (!process.env.ADMIN_PASSWORD) {
    return res.status(500).json({ message: "ADMIN_PASSWORD n'est pas configuré sur le serveur." });
  }
  if (!motDePasse || motDePasse !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ message: 'Mot de passe incorrect' });
  }
  const token = jwt.sign({ admin: true }, process.env.JWT_SECRET, { expiresIn: '12h' });
  res.json({ token });
}

const aujourdhui = () => new Date().toISOString().split('T')[0];
const ajouterJours = (dateStr, n) => {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split('T')[0];
};
const joursRestants = (dateStr) => Math.ceil((new Date(dateStr + 'T00:00:00Z') - new Date(aujourdhui() + 'T00:00:00Z')) / 86400000);

function statutDe(licence) {
  if (!licence) return 'inconnu';
  if (licence.type === 'suspended') return 'suspendu';
  if (joursRestants(licence.expires_at) <= 0) return 'expire';
  return licence.type === 'trial' ? 'essai' : 'actif';
}

function trouverBoutique(slug) {
  const t = tenantRegistry.lister().find(x => x.slug === slug);
  if (!t) return null;
  return { tenant: t, db: tenantDbWrapped(t.slug, t.dbPath) };
}

function lireLicence(db) {
  return db.prepare('SELECT type, expires_at, activated_at FROM licence WHERE id = 1').get();
}

function lister(req, res) {
  const derniersAbos = {};
  for (const a of mainDb.prepare(
    'SELECT slug, plan, montant, statut, date_fin, created_at FROM abonnements ORDER BY id'
  ).all()) derniersAbos[a.slug] = a;

  const boutiques = tenantRegistry.lister().map(t => {
    let licence = null;
    try { licence = lireLicence(tenantDbWrapped(t.slug, t.dbPath)); } catch (e) {
      console.error(`[ADMIN] Lecture licence "${t.slug}":`, e.message);
    }
    const abo = derniersAbos[t.slug] || null;
    return {
      slug: t.slug,
      nom: t.nom,
      email: t.email,
      createdAt: t.createdAt,
      statut: statutDe(licence),
      licenceType: licence?.type || null,
      expiresAt: licence?.expires_at || null,
      joursRestants: licence ? joursRestants(licence.expires_at) : null,
      dernierPaiement: abo && abo.statut === 'actif' ? { plan: abo.plan, montant: abo.montant } : null,
    };
  });

  const stats = { total: boutiques.length, actif: 0, essai: 0, expire: 0, suspendu: 0, inconnu: 0 };
  for (const b of boutiques) stats[b.statut] = (stats[b.statut] || 0) + 1;
  stats.revenus = mainDb.prepare("SELECT COALESCE(SUM(montant), 0) AS total FROM abonnements WHERE statut = 'actif'").get().total;

  res.json({ stats, boutiques });
}

function creer(req, res) {
  const { slug, nomBoutique, email, motDePasse, dureeJours, type } = req.body;
  try {
    const result = provisionnerBoutique({ slug, nomBoutique, email, motDePasse, dureeJours, type });
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

// Prolonge à partir de la date de fin actuelle si elle est future, sinon à partir d'aujourd'hui.
function prolonger(req, res) {
  const b = trouverBoutique(req.params.slug);
  if (!b) return res.status(404).json({ message: 'Boutique introuvable.' });
  const jours = parseInt(req.body.jours, 10);
  if (!jours || jours < 1 || jours > 3650) return res.status(400).json({ message: 'Durée invalide (1 à 3650 jours).' });
  const type = req.body.type === 'trial' ? 'trial' : 'full';

  const licence = lireLicence(b.db);
  const base = licence && licence.type !== 'suspended' && joursRestants(licence.expires_at) > 0
    ? licence.expires_at : aujourdhui();
  const nouvelleFin = ajouterJours(base, jours);
  b.db.prepare("UPDATE licence SET type = ?, expires_at = ?, activated_at = date('now') WHERE id = 1").run(type, nouvelleFin);
  res.json({ slug: b.tenant.slug, expiresAt: nouvelleFin, type });
}

function suspendre(req, res) {
  const b = trouverBoutique(req.params.slug);
  if (!b) return res.status(404).json({ message: 'Boutique introuvable.' });
  b.db.prepare("UPDATE licence SET type = 'suspended', expires_at = ? WHERE id = 1").run(ajouterJours(aujourdhui(), -1));
  res.json({ slug: b.tenant.slug, statut: 'suspendu' });
}

function reactiver(req, res) {
  const b = trouverBoutique(req.params.slug);
  if (!b) return res.status(404).json({ message: 'Boutique introuvable.' });
  const jours = parseInt(req.body.jours, 10) || 30;
  const nouvelleFin = ajouterJours(aujourdhui(), Math.min(Math.max(jours, 1), 3650));
  b.db.prepare("UPDATE licence SET type = 'full', expires_at = ?, activated_at = date('now') WHERE id = 1").run(nouvelleFin);
  res.json({ slug: b.tenant.slug, expiresAt: nouvelleFin });
}

function reinitialiserMotDePasse(req, res) {
  const b = trouverBoutique(req.params.slug);
  if (!b) return res.status(404).json({ message: 'Boutique introuvable.' });
  const { motDePasse } = req.body;
  if (!motDePasse || motDePasse.length < 6) return res.status(400).json({ message: 'Mot de passe : 6 caractères minimum.' });
  const user = b.db.prepare("SELECT id FROM users WHERE email = ? AND role = 'admin'").get(b.tenant.email);
  if (!user) return res.status(404).json({ message: "Compte administrateur introuvable dans cette boutique." });
  b.db.prepare('UPDATE users SET mot_de_passe = ?, actif = 1 WHERE id = ?').run(bcrypt.hashSync(motDePasse, 10), user.id);
  res.json({ slug: b.tenant.slug, email: b.tenant.email });
}

module.exports = { login, lister, creer, prolonger, suspendre, reactiver, reinitialiserMotDePasse };
