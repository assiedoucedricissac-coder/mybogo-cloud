const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const tenantRegistry = require('../services/tenantRegistry');
const { provisionnerBoutique } = require('../services/provisionnement');
const fs = require('fs');
const path = require('path');
const { mainDb, tenantDbWrapped, fermerConnexionTenant } = require('../config/database');
const { tenantsDir } = require('../services/provisionnement');

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

function compter(db, sql) {
  try { return db.prepare(sql).get().n || 0; } catch { return 0; }
}

function statsBoutique(db) {
  let derniereConnexion = null;
  try { derniereConnexion = db.prepare("SELECT MAX(derniere_connexion) AS d FROM users WHERE role != 'super_admin'").get().d; } catch {}
  return {
    nbUtilisateurs: compter(db, "SELECT COUNT(*) AS n FROM users WHERE role != 'super_admin' AND actif = 1"),
    nbProduits: compter(db, 'SELECT COUNT(*) AS n FROM produits WHERE actif = 1'),
    nbClients: compter(db, 'SELECT COUNT(*) AS n FROM clients WHERE actif = 1'),
    nbVentes: compter(db, "SELECT COUNT(*) AS n FROM ventes WHERE statut != 'annulee'"),
    chiffreAffaires: compter(db, "SELECT COALESCE(SUM(total), 0) AS n FROM ventes WHERE statut != 'annulee'"),
    derniereConnexion,
  };
}

function lister(req, res) {
  const derniersAbos = {};
  for (const a of mainDb.prepare(
    'SELECT slug, plan, montant, statut, date_fin, created_at FROM abonnements ORDER BY id'
  ).all()) derniersAbos[a.slug] = a;

  const boutiques = tenantRegistry.lister().map(t => {
    let licence = null;
    let activite = {};
    try {
      const tdb = tenantDbWrapped(t.slug, t.dbPath);
      licence = lireLicence(tdb);
      activite = statsBoutique(tdb);
    } catch (e) {
      console.error(`[ADMIN] Lecture licence "${t.slug}":`, e.message);
    }
    const abo = derniersAbos[t.slug] || null;
    return {
      ...activite,
      slug: t.slug,
      nom: t.nom,
      email: t.email,
      telephone: t.telephone || '',
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

function utilisateurs(req, res) {
  const b = trouverBoutique(req.params.slug);
  if (!b) return res.status(404).json({ message: 'Boutique introuvable.' });
  res.json(b.db.prepare(
    "SELECT id, nom, prenom, email, role, actif, derniere_connexion, created_at FROM users WHERE role != 'super_admin' AND email NOT IN ('admin@mybogo.com', 'superadmin@mybogo.ci') ORDER BY role, nom"
  ).all());
}

function basculerUtilisateur(req, res) {
  const b = trouverBoutique(req.params.slug);
  if (!b) return res.status(404).json({ message: 'Boutique introuvable.' });
  const u = b.db.prepare("SELECT id, actif FROM users WHERE id = ? AND role != 'super_admin'").get(Number(req.params.id));
  if (!u) return res.status(404).json({ message: 'Utilisateur introuvable.' });
  const actif = u.actif ? 0 : 1;
  b.db.prepare('UPDATE users SET actif = ? WHERE id = ?').run(actif, u.id);
  res.json({ id: u.id, actif });
}

function motDePasseUtilisateur(req, res) {
  const b = trouverBoutique(req.params.slug);
  if (!b) return res.status(404).json({ message: 'Boutique introuvable.' });
  const { motDePasse } = req.body;
  if (!motDePasse || motDePasse.length < 6) return res.status(400).json({ message: 'Mot de passe : 6 caractères minimum.' });
  const u = b.db.prepare("SELECT id FROM users WHERE id = ? AND role != 'super_admin'").get(Number(req.params.id));
  if (!u) return res.status(404).json({ message: 'Utilisateur introuvable.' });
  b.db.prepare('UPDATE users SET mot_de_passe = ?, actif = 1 WHERE id = ?').run(bcrypt.hashSync(motDePasse, 10), u.id);
  res.json({ id: u.id });
}

function definirExpiration(req, res) {
  const b = trouverBoutique(req.params.slug);
  if (!b) return res.status(404).json({ message: 'Boutique introuvable.' });
  const { date } = req.body;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || isNaN(new Date(date + 'T00:00:00Z'))) return res.status(400).json({ message: 'Date invalide.' });
  const licence = lireLicence(b.db);
  const type = !licence || licence.type === 'suspended' ? 'full' : licence.type;
  b.db.prepare('UPDATE licence SET type = ?, expires_at = ? WHERE id = 1').run(type, date);
  res.json({ slug: b.tenant.slug, expiresAt: date });
}

// Ouvre la boutique en tant que son administrateur (comme « Accéder » dans Ecole Manager).
function acceder(req, res) {
  const b = trouverBoutique(req.params.slug);
  if (!b) return res.status(404).json({ message: 'Boutique introuvable.' });
  const user = b.db.prepare("SELECT id, nom, prenom, email, role, actif FROM users WHERE email = ? AND role = 'admin'").get(b.tenant.email);
  if (!user) return res.status(404).json({ message: "Compte administrateur introuvable dans cette boutique." });
  const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '2h' });
  res.json({ token, user, boutique: b.tenant.slug });
}

// Suppression définitive : base de données, entrée du registre, paiements non aboutis.
// Les paiements aboutis (abonnements actifs) sont conservés comme historique comptable.
function supprimerBoutique(req, res) {
  const t = tenantRegistry.lister().find(x => x.slug === req.params.slug);
  if (!t) return res.status(404).json({ message: 'Boutique introuvable.' });
  if (req.body.confirmation !== t.slug) return res.status(400).json({ message: 'Confirmation incorrecte : retapez le code de la boutique.' });

  const racine = path.resolve(tenantsDir());
  const fichier = path.resolve(t.dbPath);
  const dansLeDossier = fichier.startsWith(racine + path.sep);

  try {
    fermerConnexionTenant(t.slug);
    if (dansLeDossier) {
      for (const suffixe of ['', '-wal', '-shm', '-journal', '.lock']) {
        fs.rmSync(fichier + suffixe, { recursive: true, force: true });
      }
    } else {
      console.warn(`[ADMIN] Base hors du dossier des boutiques, fichier conservé : ${fichier}`);
    }
    tenantRegistry.supprimer(t.slug);
    mainDb.prepare("DELETE FROM abonnements WHERE slug = ? AND statut != 'actif'").run(t.slug);
    console.log(`[ADMIN] Boutique supprimée : ${t.slug}`);
    res.json({ slug: t.slug, supprimee: true });
  } catch (err) {
    console.error('[ADMIN] Suppression échouée :', err.message);
    res.status(500).json({ message: `Suppression échouée : ${err.message}` });
  }
}

async function testerEmail(req, res) {
  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ ok: false, message: 'Adresse e-mail invalide.' });
  res.json(await require('../services/mailer').tester(email));
}

module.exports = { login, lister, creer, prolonger, suspendre, reactiver, reinitialiserMotDePasse, testerEmail, utilisateurs, basculerUtilisateur, motDePasseUtilisateur, definirExpiration, acceder, supprimerBoutique };
