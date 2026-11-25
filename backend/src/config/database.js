const { Database } = require('node-sqlite3-wasm');
const path = require('path');
const fs = require('fs');
const { AsyncLocalStorage } = require('async_hooks');

const dbPath = process.env.MYBOGO_DB_PATH || path.join(__dirname, '../../database/mybogo.db');

const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

// Supprimer le dossier lock résiduel avant d'ouvrir (crash précédent)
try { fs.rmSync(dbPath + '.lock', { recursive: true, force: true }); } catch(e) {}

// `let` (pas `const`) : sert de connexion par défaut (mode mono-client), et est aussi
// temporairement redirigée lors de la création/migration d'une base de tenant (voir
// ouvrirConnexionTenant ci-dessous) — initDatabase() continue de la lire telle quelle,
// aucune de ses ~765 lignes de migrations n'a besoin d'être modifiée pour le multi-tenant.
let _rawDb = new Database(dbPath);

// Performance optimizations
_rawDb.exec('PRAGMA journal_mode = WAL');
_rawDb.exec('PRAGMA foreign_keys = ON');

// ── Multi-tenant : chaque requête est associée (par le middleware de server.js) à la
// connexion de SA boutique via ce contexte asynchrone. Sans middleware (mode mono-client
// actuel), currentRawDb() retombe simplement sur _rawDb — comportement inchangé.
const tenantContext = new AsyncLocalStorage();
const tenantConnections = new Map(); // slug -> { raw, lastUsed }
const MAX_CONNEXIONS_OUVERTES = 30; // largement suffisant pour démarrer
const INACTIVITE_MAX_MS = 30 * 60 * 1000; // ferme une boutique inactive depuis 30 min

function currentRawDb() {
  const store = tenantContext.getStore();
  return (store && store.rawDb) ? store.rawDb : _rawDb;
}

// Ouvre (ou réutilise) la base d'un tenant précis, en s'assurant qu'elle est à jour —
// réutilise initDatabase() tel quel en lui faisant temporairement croire que c'est "la" base.
function ouvrirConnexionTenant(tenantDbPath) {
  const dir = path.dirname(tenantDbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  try { fs.rmSync(tenantDbPath + '.lock', { recursive: true, force: true }); } catch (e) {}
  const raw = new Database(tenantDbPath);
  raw.exec('PRAGMA journal_mode = WAL');
  raw.exec('PRAGMA foreign_keys = ON');
  const precedente = _rawDb;
  _rawDb = raw;
  try { initDatabase(); } finally { _rawDb = precedente; }
  return raw;
}

// node-sqlite3-wasm prévient explicitement qu'elle n'est pas garbage-collectée — sans
// fermeture explicite, garder une connexion ouverte par boutique pour toujours finirait
// par fuir de la mémoire. On ferme donc les connexions inactives, et on plafonne le nombre
// de connexions ouvertes en même temps (la moins récemment utilisée est fermée en premier).
function fermerConnexionTenant(slug) {
  const entry = tenantConnections.get(slug);
  if (!entry) return;
  try { entry.raw.close(); } catch (e) {}
  tenantConnections.delete(slug);
}

function evincerSiNecessaire() {
  if (tenantConnections.size < MAX_CONNEXIONS_OUVERTES) return;
  let plusAncien = null;
  for (const [slug, entry] of tenantConnections) {
    if (!plusAncien || entry.lastUsed < tenantConnections.get(plusAncien).lastUsed) plusAncien = slug;
  }
  if (plusAncien) fermerConnexionTenant(plusAncien);
}

// Objet "db" (prepare/exec/transaction, arguments façon better-sqlite3) lié à UNE connexion
// précise, indépendamment du contexte de requête — utilisé pour provisionner une nouvelle
// boutique depuis le serveur déjà en cours d'exécution, sans toucher au dispatcher par tenant.
function wrapRaw(raw) {
  return {
    exec: (sql) => raw.exec(sql),
    prepare: (sql) => wrapStmt(raw.prepare(sql)),
    close: () => raw.close(),
  };
}

// Crée (ou ouvre) la base d'une nouvelle boutique et renvoie une interface db utilisable
// directement — sans passer par le cache de connexions ni le contexte de tenant courant.
function provisionnerNouvelleBase(tenantDbPath) {
  return wrapRaw(ouvrirConnexionTenant(tenantDbPath));
}

function getTenantDb(slug, tenantDbPath) {
  const existing = tenantConnections.get(slug);
  if (existing) {
    existing.lastUsed = Date.now();
    return existing.raw;
  }
  evincerSiNecessaire();
  const raw = ouvrirConnexionTenant(tenantDbPath);
  tenantConnections.set(slug, { raw, lastUsed: Date.now() });
  return raw;
}

// Ménage périodique des connexions inactives depuis trop longtemps.
setInterval(() => {
  const seuil = Date.now() - INACTIVITE_MAX_MS;
  for (const [slug, entry] of tenantConnections) {
    if (entry.lastUsed < seuil) fermerConnexionTenant(slug);
  }
}, 5 * 60 * 1000).unref();

// Exécute fn() (typiquement next() du middleware Express) avec la base de ce tenant
// active pour toute la suite du traitement de la requête — aucun contrôleur ne change.
function runInTenantContext(slug, tenantDbPath, fn) {
  const raw = getTenantDb(slug, tenantDbPath);
  return tenantContext.run({ rawDb: raw, slug }, fn);
}

// Compatibility wrapper: node-sqlite3-wasm requires params as array,
// better-sqlite3 accepts spread args. We normalize here so all controllers
// can use the better-sqlite3 style (spread args).
function wrapStmt(stmt) {
  const normalize = (args) => {
    if (args.length === 0) return [];
    if (args.length === 1 && Array.isArray(args[0])) return args[0];
    return args;
  };
  const origRun = stmt.run.bind(stmt);
  const origGet = stmt.get.bind(stmt);
  const origAll = stmt.all.bind(stmt);
  stmt.run = (...args) => origRun(normalize(args));
  stmt.get = (...args) => origGet(normalize(args));
  stmt.all = (...args) => origAll(normalize(args));
  return stmt;
}

const db = {
  exec: (sql) => currentRawDb().exec(sql),
  prepare: (sql) => wrapStmt(currentRawDb().prepare(sql)),
  transaction: (fn) => (...args) => {
    const raw = currentRawDb();
    raw.exec('BEGIN');
    try {
      const result = fn(...args);
      raw.exec('COMMIT');
      return result;
    } catch (err) {
      raw.exec('ROLLBACK');
      throw err;
    }
  },
  close: () => currentRawDb().close()
};

function initDatabase() {
  // Migration v1: ajout rôle super_admin + table entreprise
  const vRow = _rawDb.prepare('PRAGMA user_version').get();
  const version = vRow ? (vRow['user_version'] || 0) : 0;
  if (version < 1) {
    const usersExist = _rawDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
    if (usersExist) {
      try {
        _rawDb.exec('PRAGMA foreign_keys = OFF');
        _rawDb.exec('DROP TABLE IF EXISTS users_old');
        _rawDb.exec('ALTER TABLE users RENAME TO users_old');
        _rawDb.exec(`CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nom TEXT NOT NULL, prenom TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
          mot_de_passe TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'caissier' CHECK(role IN ('admin','gestionnaire','caissier','magasinier','comptable','super_admin')),
          actif INTEGER NOT NULL DEFAULT 1, derniere_connexion TEXT,
          created_at TEXT DEFAULT (CURRENT_TIMESTAMP), updated_at TEXT DEFAULT (CURRENT_TIMESTAMP)
        )`);
        _rawDb.exec('INSERT OR IGNORE INTO users SELECT * FROM users_old');
        _rawDb.exec('DROP TABLE users_old');
        _rawDb.exec('PRAGMA foreign_keys = ON');
        console.log('Migration v1: table users mise à jour');
      } catch(e) {
        try { _rawDb.exec('PRAGMA foreign_keys = ON'); } catch(_) {}
        console.error('Migration v1 erreur:', e.message);
      }
    }
    _rawDb.exec('PRAGMA user_version = 1');
  }

  // Migration v2: inventaires — ajout statuts soumis/rejete + colonnes soumis_at/soumis_par/note_rejet
  if (version < 2) {
    const invExist = _rawDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='inventaires'").get();
    if (invExist) {
      try {
        _rawDb.exec('PRAGMA foreign_keys = OFF');
        _rawDb.exec('DROP TABLE IF EXISTS inventaires_old');
        _rawDb.exec('ALTER TABLE inventaires RENAME TO inventaires_old');
        _rawDb.exec(`CREATE TABLE inventaires (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          reference TEXT UNIQUE NOT NULL,
          statut TEXT NOT NULL DEFAULT 'brouillon'
            CHECK(statut IN ('brouillon','soumis','valide','rejete','annule')),
          note TEXT, note_rejet TEXT,
          user_id INTEGER REFERENCES users(id),
          soumis_at TEXT, soumis_par INTEGER REFERENCES users(id),
          valide_at TEXT, valide_par INTEGER REFERENCES users(id),
          created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
        )`);
        _rawDb.exec('INSERT OR IGNORE INTO inventaires (id,reference,statut,note,user_id,valide_at,valide_par,created_at) SELECT id,reference,statut,note,user_id,valide_at,valide_par,created_at FROM inventaires_old');
        _rawDb.exec('DROP TABLE inventaires_old');
        _rawDb.exec('PRAGMA foreign_keys = ON');
        console.log('Migration v2: inventaires OK');
      } catch(e) {
        try { _rawDb.exec('PRAGMA foreign_keys = ON'); } catch(_) {}
        console.error('Migration v2 erreur:', e.message);
      }
    }
    _rawDb.exec('PRAGMA user_version = 2');
  }

  // Migration v3: conditionnements (vente en bouteille / carton / etc.)
  if (version < 3) {
    try { _rawDb.exec('ALTER TABLE lignes_vente ADD COLUMN contenance INTEGER DEFAULT 1'); } catch(e) {}
    try { _rawDb.exec("ALTER TABLE lignes_vente ADD COLUMN unite_libelle TEXT DEFAULT 'unité'"); } catch(e) {}
    _rawDb.exec(`CREATE TABLE IF NOT EXISTS conditionnements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produit_id INTEGER NOT NULL REFERENCES produits(id) ON DELETE CASCADE,
      libelle TEXT NOT NULL,
      contenance INTEGER NOT NULL DEFAULT 1,
      prix_vente REAL NOT NULL,
      actif INTEGER DEFAULT 1,
      ordre INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
    )`);
    _rawDb.exec('PRAGMA user_version = 3');
    console.log('Migration v3: conditionnements OK');
  }

  // Migration v4: ventes à crédit — table paiements_credit
  if (version < 4) {
    _rawDb.exec(`CREATE TABLE IF NOT EXISTS paiements_credit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      vente_id INTEGER REFERENCES ventes(id),
      montant REAL NOT NULL,
      mode_paiement TEXT DEFAULT 'especes',
      note TEXT,
      user_id INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
    )`);
    _rawDb.exec('PRAGMA user_version = 4');
    console.log('Migration v4: paiements_credit OK');
  }

  // Migration v5: colonnes produits ajoutées progressivement (marque, ref, codes, prix spéciaux, etc.)
  if (version < 5) {
    const colonnesProduits = [
      "ALTER TABLE produits ADD COLUMN marque TEXT",
      "ALTER TABLE produits ADD COLUMN reference TEXT",
      "ALTER TABLE produits ADD COLUMN code_barres TEXT",
      "ALTER TABLE produits ADD COLUMN description TEXT",
      "ALTER TABLE produits ADD COLUMN emplacement TEXT",
      "ALTER TABLE produits ADD COLUMN date_expiration TEXT",
      "ALTER TABLE produits ADD COLUMN prix_grossiste REAL",
      "ALTER TABLE produits ADD COLUMN prix_revendeur REAL",
      "ALTER TABLE produits ADD COLUMN photo TEXT",
      "ALTER TABLE produits ADD COLUMN tva REAL DEFAULT 18",
    ];
    for (const sql of colonnesProduits) {
      try { _rawDb.exec(sql); } catch(e) { /* colonne déjà existante — OK */ }
    }
    // Colonnes manquantes dans lignes_vente (conditionnements)
    try { _rawDb.exec("ALTER TABLE lignes_vente ADD COLUMN contenance INTEGER DEFAULT 1"); } catch(e) {}
    try { _rawDb.exec("ALTER TABLE lignes_vente ADD COLUMN unite_libelle TEXT DEFAULT 'unité'"); } catch(e) {}
    // Table sessions_caisse si absente
    _rawDb.exec(`CREATE TABLE IF NOT EXISTS sessions_caisse (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      fond_ouverture REAL NOT NULL DEFAULT 0,
      fond_cloture REAL,
      total_ventes REAL DEFAULT 0,
      ecart REAL,
      statut TEXT DEFAULT 'ouvert',
      user_id INTEGER REFERENCES users(id),
      note TEXT,
      clos_a TEXT,
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
    )`);
    // Table retraits_caisse si absente
    _rawDb.exec(`CREATE TABLE IF NOT EXISTS retraits_caisse (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      montant REAL NOT NULL,
      motif TEXT,
      user_id INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
    )`);
    _rawDb.exec('PRAGMA user_version = 5');
    console.log('Migration v5: colonnes produits + tables caisse OK');
  }

  // ── Migration v6 : logo + slogan entreprise ──────────────────────
  const v6 = _rawDb.prepare('PRAGMA user_version').get().user_version;
  if (v6 < 6) {
    try { _rawDb.exec('ALTER TABLE entreprise ADD COLUMN logo TEXT'); } catch(_) {}
    try { _rawDb.exec('ALTER TABLE entreprise ADD COLUMN slogan TEXT'); } catch(_) {}
    _rawDb.exec('PRAGMA user_version = 6');
    console.log('Migration v6: logo + slogan entreprise OK');
  }

  const v7 = _rawDb.prepare('PRAGMA user_version').get().user_version;
  if (v7 < 7) {
    try { _rawDb.exec('ALTER TABLE entreprise ADD COLUMN cachet TEXT'); } catch(_) {}
    _rawDb.exec('PRAGMA user_version = 7');
    console.log('Migration v7: cachet entreprise OK');
  }

  // ── Vérification inconditionnelle des colonnes entreprise ─────────
  // Garantit que logo/slogan/cachet existent même si les migrations
  // ont été manquées (table existante, user_version déjà élevé, etc.)
  try {
    const cols = _rawDb.prepare("PRAGMA table_info(entreprise)").all().map(c => c.name);
    if (!cols.includes('logo'))   _rawDb.exec('ALTER TABLE entreprise ADD COLUMN logo TEXT');
    if (!cols.includes('slogan')) _rawDb.exec('ALTER TABLE entreprise ADD COLUMN slogan TEXT');
    if (!cols.includes('cachet')) _rawDb.exec('ALTER TABLE entreprise ADD COLUMN cachet TEXT');
  } catch(_) {}

  try {
    const pcols = _rawDb.prepare("PRAGMA table_info(produits)").all().map(c => c.name);
    if (!pcols.includes('is_fictif')) _rawDb.exec('ALTER TABLE produits ADD COLUMN is_fictif INTEGER DEFAULT 0');
  } catch(_) {}

  const v8 = _rawDb.prepare('PRAGMA user_version').get().user_version;
  if (v8 < 8) {
    _rawDb.exec(`CREATE TABLE IF NOT EXISTS licence (
      id           INTEGER PRIMARY KEY,
      type         TEXT    DEFAULT 'trial',
      expires_at   TEXT,
      licence_key  TEXT,
      client_name  TEXT,
      activated_at TEXT,
      first_launch TEXT    DEFAULT (date('now'))
    )`);
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 30);
    const exp = trialEnd.toISOString().split('T')[0];
    _rawDb.exec(`INSERT OR IGNORE INTO licence (id, type, expires_at) VALUES (1, 'trial', '${exp}')`);
    _rawDb.exec('PRAGMA user_version = 8');
    console.log('Migration v8: table licence OK');
  }
  const v9 = _rawDb.prepare('PRAGMA user_version').get().user_version;
  if (v9 < 9) {
    _rawDb.exec('PRAGMA user_version = 9');
    console.log('Migration v9: marqueur de version OK (colonnes vérifiées ci-dessous)');
  }

  // ── Vérification inconditionnelle des colonnes remise_montant / is_fictif ──
  // Remplace l'ancien try/catch silencieux de la migration v9 : celui-ci pouvait
  // échouer sans jamais réessayer (le user_version avançait quand même).
  // Ici on vérifie explicitement l'existence de chaque colonne à chaque démarrage.
  try {
    const factExist = _rawDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='factures'").get();
    if (factExist) {
      const fCols = _rawDb.prepare('PRAGMA table_info(factures)').all().map(c => c.name);
      if (!fCols.includes('remise_montant')) _rawDb.exec('ALTER TABLE factures ADD COLUMN remise_montant REAL DEFAULT 0');
    }
    const lfExist = _rawDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='lignes_facture'").get();
    if (lfExist) {
      const lfCols = _rawDb.prepare('PRAGMA table_info(lignes_facture)').all().map(c => c.name);
      if (!lfCols.includes('remise_montant')) _rawDb.exec('ALTER TABLE lignes_facture ADD COLUMN remise_montant REAL DEFAULT 0');
    }
    const prodExist = _rawDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='produits'").get();
    if (prodExist) {
      const pCols = _rawDb.prepare('PRAGMA table_info(produits)').all().map(c => c.name);
      if (!pCols.includes('is_fictif')) _rawDb.exec('ALTER TABLE produits ADD COLUMN is_fictif INTEGER DEFAULT 0');
    }
  } catch(e) { console.error('Vérification colonnes remise_montant/is_fictif erreur:', e.message); }

  // ── Migration v10 : règlements successifs sur factures ────────────
  const v10 = _rawDb.prepare('PRAGMA user_version').get().user_version;
  if (v10 < 10) {
    _rawDb.exec(`CREATE TABLE IF NOT EXISTS paiements_facture (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      facture_id INTEGER NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
      montant REAL NOT NULL,
      mode_paiement TEXT DEFAULT 'especes',
      note TEXT,
      user_id INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
    )`);
    _rawDb.exec('PRAGMA user_version = 10');
    console.log('Migration v10: paiements_facture OK');
  }

  // ── Migration v11 : règlements fournisseurs + achat payé cash ou crédit ──
  const v11 = _rawDb.prepare('PRAGMA user_version').get().user_version;
  if (v11 < 11) {
    _rawDb.exec(`CREATE TABLE IF NOT EXISTS paiements_fournisseur (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fournisseur_id INTEGER NOT NULL REFERENCES fournisseurs(id) ON DELETE CASCADE,
      achat_id INTEGER REFERENCES achats(id),
      montant REAL NOT NULL,
      mode_paiement TEXT DEFAULT 'especes',
      note TEXT,
      user_id INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
    )`);
    _rawDb.exec('PRAGMA user_version = 11');
    console.log('Migration v11: paiements_fournisseur OK');
  }

  // ── Vérification inconditionnelle des colonnes montant_paye/mode_paiement/frais_livraison sur achats ──
  try {
    const achExist = _rawDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='achats'").get();
    if (achExist) {
      const aCols = _rawDb.prepare('PRAGMA table_info(achats)').all().map(c => c.name);
      if (!aCols.includes('montant_paye'))    _rawDb.exec('ALTER TABLE achats ADD COLUMN montant_paye REAL DEFAULT 0');
      if (!aCols.includes('mode_paiement'))   _rawDb.exec("ALTER TABLE achats ADD COLUMN mode_paiement TEXT DEFAULT 'especes'");
      if (!aCols.includes('frais_livraison')) _rawDb.exec('ALTER TABLE achats ADD COLUMN frais_livraison REAL DEFAULT 0');
    }
  } catch(e) { console.error('Vérification colonnes achats erreur:', e.message); }

  // ── Vérification inconditionnelle des colonnes conditionnement_id/nb_format sur lignes_achat ──
  // Permet d'afficher la quantité achetée dans le FORMAT réellement saisi (ex: "2 Carton(s) de 24")
  // plutôt que seulement en pièces — sans casser les anciennes lignes qui n'ont pas ces infos.
  try {
    const laExist = _rawDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='lignes_achat'").get();
    if (laExist) {
      const laCols = _rawDb.prepare('PRAGMA table_info(lignes_achat)').all().map(c => c.name);
      if (!laCols.includes('conditionnement_id')) _rawDb.exec('ALTER TABLE lignes_achat ADD COLUMN conditionnement_id INTEGER');
      if (!laCols.includes('nb_format'))          _rawDb.exec('ALTER TABLE lignes_achat ADD COLUMN nb_format INTEGER');
    }
  } catch(e) { console.error('Vérification colonnes lignes_achat erreur:', e.message); }

  // ── Vérification inconditionnelle des colonnes feat_* (fonctionnalités activables) sur entreprise ──
  // Contrôlées depuis Super Admin pour désactiver, par client, des fonctionnalités non utilisées
  // (vente mélange, facture sans vente en caisse, modif prix en caisse, vente par conditionnement).
  try {
    const entExist = _rawDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='entreprise'").get();
    if (entExist) {
      const entCols = _rawDb.prepare('PRAGMA table_info(entreprise)').all().map(c => c.name);
      if (!entCols.includes('feat_vente_melange'))          _rawDb.exec('ALTER TABLE entreprise ADD COLUMN feat_vente_melange INTEGER DEFAULT 1');
      if (!entCols.includes('feat_facturation_sans_vente'))  _rawDb.exec('ALTER TABLE entreprise ADD COLUMN feat_facturation_sans_vente INTEGER DEFAULT 1');
      if (!entCols.includes('feat_modifier_prix_caisse'))    _rawDb.exec('ALTER TABLE entreprise ADD COLUMN feat_modifier_prix_caisse INTEGER DEFAULT 1');
      if (!entCols.includes('feat_vente_conditionnement'))   _rawDb.exec('ALTER TABLE entreprise ADD COLUMN feat_vente_conditionnement INTEGER DEFAULT 1');
      if (!entCols.includes('feat_vente_credit'))            _rawDb.exec('ALTER TABLE entreprise ADD COLUMN feat_vente_credit INTEGER DEFAULT 1');
      if (!entCols.includes('feat_multi_tickets'))           _rawDb.exec('ALTER TABLE entreprise ADD COLUMN feat_multi_tickets INTEGER DEFAULT 1');
      if (!entCols.includes('feat_achats_correction'))       _rawDb.exec('ALTER TABLE entreprise ADD COLUMN feat_achats_correction INTEGER DEFAULT 1');
      if (!entCols.includes('feat_rapports'))                _rawDb.exec('ALTER TABLE entreprise ADD COLUMN feat_rapports INTEGER DEFAULT 1');
      // ── Modules activables/désactivables (masquent entièrement le menu et bloquent l'accès) ──
      if (!entCols.includes('feat_module_inventaires'))      _rawDb.exec('ALTER TABLE entreprise ADD COLUMN feat_module_inventaires INTEGER DEFAULT 1');
      if (!entCols.includes('feat_module_facturation'))      _rawDb.exec('ALTER TABLE entreprise ADD COLUMN feat_module_facturation INTEGER DEFAULT 1');
      if (!entCols.includes('feat_module_caisse'))           _rawDb.exec('ALTER TABLE entreprise ADD COLUMN feat_module_caisse INTEGER DEFAULT 1');
      if (!entCols.includes('feat_module_clients'))          _rawDb.exec('ALTER TABLE entreprise ADD COLUMN feat_module_clients INTEGER DEFAULT 1');
      if (!entCols.includes('feat_module_dgi'))              _rawDb.exec('ALTER TABLE entreprise ADD COLUMN feat_module_dgi INTEGER DEFAULT 0');
      if (!entCols.includes('feat_module_sauvegarde'))       _rawDb.exec('ALTER TABLE entreprise ADD COLUMN feat_module_sauvegarde INTEGER DEFAULT 1');
      // Code PIN optionnel protégeant Historique Vente + Historique Achat — vide/NULL = pas de
      // protection (comportement historique inchangé tant que le client ne configure rien).
      if (!entCols.includes('historique_pin'))               _rawDb.exec('ALTER TABLE entreprise ADD COLUMN historique_pin TEXT');
      if (!entCols.includes('feat_module_location'))      _rawDb.exec('ALTER TABLE entreprise ADD COLUMN feat_module_location INTEGER DEFAULT 0');
      if (!entCols.includes('feat_module_restauration'))  _rawDb.exec('ALTER TABLE entreprise ADD COLUMN feat_module_restauration INTEGER DEFAULT 0');
    }
  } catch(e) { console.error('Vérification colonnes entreprise erreur:', e.message); }

  // ── Vérification inconditionnelle : session_id sur paiements_credit + total_reglements_credit sur sessions_caisse ──
  // session_id rattache chaque règlement crédit à la session de caisse active,
  // pour les inclure dans le total espèces attendu à la clôture.
  try {
    const pcExist = _rawDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='paiements_credit'").get();
    if (pcExist) {
      const pcCols = _rawDb.prepare('PRAGMA table_info(paiements_credit)').all().map(c => c.name);
      if (!pcCols.includes('session_id')) _rawDb.exec('ALTER TABLE paiements_credit ADD COLUMN session_id INTEGER REFERENCES sessions_caisse(id)');
    }
    const scExist = _rawDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions_caisse'").get();
    if (scExist) {
      const scCols = _rawDb.prepare('PRAGMA table_info(sessions_caisse)').all().map(c => c.name);
      if (!scCols.includes('total_reglements_credit')) _rawDb.exec('ALTER TABLE sessions_caisse ADD COLUMN total_reglements_credit REAL DEFAULT 0');
      if (!scCols.includes('total_reglements_facture')) _rawDb.exec('ALTER TABLE sessions_caisse ADD COLUMN total_reglements_facture REAL DEFAULT 0');
      // Détail du décompte billet par billet (JSON : { "10000": 3, "5000": 2, ... }) — jusqu'ici
      // jamais conservé, seul le total l'était, rendant toute correction ultérieure imprécise.
      // NULL pour les sessions déjà closes avant ce correctif (rien à afficher pour elles).
      if (!scCols.includes('detail_billets')) _rawDb.exec('ALTER TABLE sessions_caisse ADD COLUMN detail_billets TEXT');
    }
  } catch(e) { console.error('Vérification colonnes règlements crédit erreur:', e.message); }

  // ── Vérification inconditionnelle : session_id sur paiements_facture ──
  // Un client qui vient régler une FACTURE en espèces met de l'argent dans le tiroir, mais
  // ce montant était invisible à la clôture de caisse (seuls les règlements sur ventes à
  // crédit, via paiements_credit, étaient comptés) — d'où des écarts de caisse inexpliqués.
  try {
    const pfExist = _rawDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='paiements_facture'").get();
    if (pfExist) {
      const pfCols = _rawDb.prepare('PRAGMA table_info(paiements_facture)').all().map(c => c.name);
      if (!pfCols.includes('session_id')) _rawDb.exec('ALTER TABLE paiements_facture ADD COLUMN session_id INTEGER REFERENCES sessions_caisse(id)');
    }
  } catch(e) { console.error('Vérification colonne session_id paiements_facture erreur:', e.message); }

  // ── Vérification inconditionnelle : prix_achat sur conditionnements + cout_achat sur lignes_vente ──
  // prix_achat stocke le coût exact par format (Carton=12600, ¼Carton=3150…) pour éviter les arrondis
  // lors du calcul de marge (12600/48=262.5→263, 263×48=12624≠12600).
  // cout_achat snapshoote le coût total de la ligne au moment de la vente (immuable même si prix_achat change).
  try {
    const condExist = _rawDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='conditionnements'").get();
    if (condExist) {
      const condCols = _rawDb.prepare('PRAGMA table_info(conditionnements)').all().map(c => c.name);
      if (!condCols.includes('prix_achat')) _rawDb.exec('ALTER TABLE conditionnements ADD COLUMN prix_achat REAL DEFAULT 0');
    }
    const lvExist = _rawDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='lignes_vente'").get();
    if (lvExist) {
      const lvCols = _rawDb.prepare('PRAGMA table_info(lignes_vente)').all().map(c => c.name);
      if (!lvCols.includes('cout_achat')) _rawDb.exec('ALTER TABLE lignes_vente ADD COLUMN cout_achat REAL DEFAULT 0');
    }
    // Même logique pour les factures créées DIRECTEMENT (pas via une vente) : sans ce coût
    // figé par ligne, leur marge était invisible du tableau de bord/rapports (toujours 0).
    const lfExist2 = _rawDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='lignes_facture'").get();
    if (lfExist2) {
      const lfCols2 = _rawDb.prepare('PRAGMA table_info(lignes_facture)').all().map(c => c.name);
      if (!lfCols2.includes('cout_achat')) _rawDb.exec('ALTER TABLE lignes_facture ADD COLUMN cout_achat REAL DEFAULT 0');
    }
  } catch(e) { console.error('Vérification colonnes prix_achat/cout_achat erreur:', e.message); }

  db.exec(`
    -- Utilisateurs
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      prenom TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      mot_de_passe TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'caissier' CHECK(role IN ('admin','gestionnaire','caissier','magasinier','comptable','super_admin')),
      actif INTEGER NOT NULL DEFAULT 1,
      derniere_connexion TEXT,
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
      updated_at TEXT DEFAULT (CURRENT_TIMESTAMP)
    );

    -- Informations de l'entreprise cliente
    CREATE TABLE IF NOT EXISTS entreprise (
      id INTEGER PRIMARY KEY DEFAULT 1,
      nom TEXT DEFAULT 'Mon Entreprise',
      adresse TEXT DEFAULT '',
      telephone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      nif TEXT DEFAULT '',
      rccm TEXT DEFAULT '',
      regime_tva TEXT DEFAULT 'normal',
      logo TEXT,
      slogan TEXT,
      cachet TEXT,
      feat_vente_melange INTEGER DEFAULT 1,
      feat_facturation_sans_vente INTEGER DEFAULT 1,
      feat_modifier_prix_caisse INTEGER DEFAULT 1,
      feat_vente_conditionnement INTEGER DEFAULT 1,
      feat_vente_credit INTEGER DEFAULT 1,
      feat_multi_tickets INTEGER DEFAULT 1,
      feat_achats_correction INTEGER DEFAULT 1,
      feat_rapports INTEGER DEFAULT 1,
      feat_module_inventaires INTEGER DEFAULT 1,
      feat_module_facturation INTEGER DEFAULT 1,
      feat_module_caisse INTEGER DEFAULT 1,
      feat_module_clients INTEGER DEFAULT 1,
      feat_module_dgi INTEGER DEFAULT 0,
      feat_module_sauvegarde INTEGER DEFAULT 1,
      feat_module_location INTEGER DEFAULT 0,
      feat_module_restauration INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
      updated_at TEXT DEFAULT (CURRENT_TIMESTAMP)
    );

    -- Catégories produits
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      description TEXT,
      parent_id INTEGER REFERENCES categories(id),
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
    );

    -- Fournisseurs
    CREATE TABLE IF NOT EXISTS fournisseurs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      telephone TEXT,
      email TEXT,
      adresse TEXT,
      nif TEXT,
      rccm TEXT,
      solde REAL DEFAULT 0,
      actif INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
      updated_at TEXT DEFAULT (CURRENT_TIMESTAMP)
    );

    -- Clients
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      telephone TEXT,
      email TEXT,
      adresse TEXT,
      numero_contribuable TEXT,
      solde REAL DEFAULT 0,
      limite_credit REAL DEFAULT 0,
      points_fidelite INTEGER DEFAULT 0,
      actif INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
      updated_at TEXT DEFAULT (CURRENT_TIMESTAMP)
    );

    -- Produits
    CREATE TABLE IF NOT EXISTS produits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      reference TEXT,
      code_barres TEXT,
      nom TEXT NOT NULL,
      description TEXT,
      categorie_id INTEGER REFERENCES categories(id),
      marque TEXT,
      unite TEXT DEFAULT 'pièce',
      photo TEXT,
      prix_achat REAL DEFAULT 0,
      prix_vente REAL NOT NULL,
      prix_grossiste REAL,
      prix_revendeur REAL,
      tva REAL DEFAULT 18,
      qte_min INTEGER DEFAULT 5,
      qte_max INTEGER DEFAULT 1000,
      qte_actuelle INTEGER DEFAULT 0,
      emplacement TEXT,
      date_expiration TEXT,
      actif INTEGER DEFAULT 1,
      is_fictif INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
      updated_at TEXT DEFAULT (CURRENT_TIMESTAMP)
    );

    -- Mouvements de stock
    CREATE TABLE IF NOT EXISTS mouvements_stock (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produit_id INTEGER NOT NULL REFERENCES produits(id),
      type TEXT NOT NULL CHECK(type IN ('entree','sortie','ajustement','transfert','retour_client','retour_fournisseur','casse','vente','achat')),
      quantite INTEGER NOT NULL,
      qte_avant INTEGER NOT NULL,
      qte_apres INTEGER NOT NULL,
      reference_doc TEXT,
      motif TEXT,
      user_id INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
    );

    -- Ventes (en-tête)
    CREATE TABLE IF NOT EXISTS ventes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero TEXT UNIQUE NOT NULL,
      client_id INTEGER REFERENCES clients(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      sous_total REAL NOT NULL DEFAULT 0,
      remise REAL DEFAULT 0,
      tva_total REAL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      montant_paye REAL DEFAULT 0,
      monnaie REAL DEFAULT 0,
      mode_paiement TEXT DEFAULT 'especes' CHECK(mode_paiement IN ('especes','mobile_money','carte','virement','mixte','credit')),
      statut TEXT DEFAULT 'payee' CHECK(statut IN ('payee','partielle','annulee')),
      note TEXT,
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
    );

    -- Lignes de vente
    CREATE TABLE IF NOT EXISTS lignes_vente (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vente_id INTEGER NOT NULL REFERENCES ventes(id) ON DELETE CASCADE,
      produit_id INTEGER NOT NULL REFERENCES produits(id),
      quantite INTEGER NOT NULL,
      prix_unitaire REAL NOT NULL,
      remise REAL DEFAULT 0,
      tva REAL DEFAULT 18,
      total REAL NOT NULL,
      contenance INTEGER DEFAULT 1,
      unite_libelle TEXT DEFAULT 'unité',
      cout_achat REAL DEFAULT 0
    );

    -- Paiements crédit clients
    CREATE TABLE IF NOT EXISTS paiements_credit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      vente_id INTEGER REFERENCES ventes(id),
      montant REAL NOT NULL,
      mode_paiement TEXT DEFAULT 'especes',
      note TEXT,
      user_id INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
    );

    -- Règlements successifs sur factures (facture/proforma/avoir/reçu)
    CREATE TABLE IF NOT EXISTS paiements_facture (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      facture_id INTEGER NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
      montant REAL NOT NULL,
      mode_paiement TEXT DEFAULT 'especes',
      note TEXT,
      user_id INTEGER REFERENCES users(id),
      session_id INTEGER REFERENCES sessions_caisse(id),
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
    );

    -- Conditionnements produit (bouteille / ¼ carton / ½ carton / carton)
    CREATE TABLE IF NOT EXISTS conditionnements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produit_id INTEGER NOT NULL REFERENCES produits(id) ON DELETE CASCADE,
      libelle TEXT NOT NULL,
      contenance INTEGER NOT NULL DEFAULT 1,
      prix_vente REAL NOT NULL,
      actif INTEGER DEFAULT 1,
      ordre INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
    );

    -- Achats (en-tête)
    CREATE TABLE IF NOT EXISTS achats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero TEXT UNIQUE NOT NULL,
      fournisseur_id INTEGER REFERENCES fournisseurs(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      sous_total REAL DEFAULT 0,
      tva_total REAL DEFAULT 0,
      total REAL DEFAULT 0,
      montant_paye REAL DEFAULT 0,
      mode_paiement TEXT DEFAULT 'especes',
      frais_livraison REAL DEFAULT 0,
      statut TEXT DEFAULT 'recu' CHECK(statut IN ('commande','recu','partiel','annule')),
      note TEXT,
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
    );

    -- Lignes d'achat
    CREATE TABLE IF NOT EXISTS lignes_achat (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      achat_id INTEGER NOT NULL REFERENCES achats(id) ON DELETE CASCADE,
      produit_id INTEGER NOT NULL REFERENCES produits(id),
      quantite INTEGER NOT NULL,
      prix_unitaire REAL NOT NULL,
      tva REAL DEFAULT 18,
      total REAL NOT NULL,
      conditionnement_id INTEGER,
      nb_format INTEGER
    );

    -- Règlements progressifs sur dette fournisseur
    CREATE TABLE IF NOT EXISTS paiements_fournisseur (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fournisseur_id INTEGER NOT NULL REFERENCES fournisseurs(id) ON DELETE CASCADE,
      achat_id INTEGER REFERENCES achats(id),
      montant REAL NOT NULL,
      mode_paiement TEXT DEFAULT 'especes',
      note TEXT,
      user_id INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
    );

    -- Journal d'activité
    CREATE TABLE IF NOT EXISTS journal_activites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      action TEXT NOT NULL,
      module TEXT NOT NULL,
      details TEXT,
      ip TEXT,
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
    );

    -- Factures (normalisées, proforma, avoir, reçu)
    CREATE TABLE IF NOT EXISTS factures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL DEFAULT 'facture' CHECK(type IN ('facture','proforma','avoir','recu')),
      vente_id INTEGER REFERENCES ventes(id),
      avoir_ref_id INTEGER REFERENCES factures(id),
      client_id INTEGER REFERENCES clients(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      regime_tva TEXT DEFAULT 'normal' CHECK(regime_tva IN ('normal','exonere','ttc_inclus')),
      sous_total REAL DEFAULT 0,
      remise REAL DEFAULT 0,
      remise_montant REAL DEFAULT 0,
      tva_total REAL DEFAULT 0,
      total REAL DEFAULT 0,
      montant_paye REAL DEFAULT 0,
      mode_paiement TEXT DEFAULT 'especes',
      statut TEXT DEFAULT 'emise' CHECK(statut IN ('brouillon','emise','payee','partielle','annulee')),
      echeance TEXT,
      note TEXT,
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
      updated_at TEXT DEFAULT (CURRENT_TIMESTAMP)
    );

    CREATE TABLE IF NOT EXISTS lignes_facture (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      facture_id INTEGER NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
      produit_id INTEGER REFERENCES produits(id),
      designation TEXT NOT NULL,
      quantite REAL NOT NULL DEFAULT 1,
      unite TEXT DEFAULT 'pièce',
      prix_ht REAL NOT NULL,
      remise REAL DEFAULT 0,
      remise_montant REAL DEFAULT 0,
      taux_tva REAL DEFAULT 18,
      montant_ht REAL NOT NULL,
      montant_tva REAL NOT NULL,
      montant_ttc REAL NOT NULL,
      cout_achat REAL DEFAULT 0
    );

    -- Index pour performance
    CREATE INDEX IF NOT EXISTS idx_produits_code ON produits(code);
    CREATE INDEX IF NOT EXISTS idx_produits_categorie ON produits(categorie_id);
    CREATE INDEX IF NOT EXISTS idx_ventes_date ON ventes(created_at);
    CREATE INDEX IF NOT EXISTS idx_mvt_produit ON mouvements_stock(produit_id);
    CREATE INDEX IF NOT EXISTS idx_mvt_date ON mouvements_stock(created_at);
    -- Clés étrangères les plus jointes (marge/rapports/détail vente-facture) : sans ces index,
    -- ces jointures font un scan complet de la table à chaque appel, de plus en plus lent
    -- à mesure que l'historique du client grandit.
    CREATE INDEX IF NOT EXISTS idx_lignes_vente_vente ON lignes_vente(vente_id);
    CREATE INDEX IF NOT EXISTS idx_lignes_vente_produit ON lignes_vente(produit_id);
    CREATE INDEX IF NOT EXISTS idx_lignes_facture_facture ON lignes_facture(facture_id);
    CREATE INDEX IF NOT EXISTS idx_lignes_facture_produit ON lignes_facture(produit_id);
    CREATE INDEX IF NOT EXISTS idx_paiements_credit_session ON paiements_credit(session_id);
    CREATE INDEX IF NOT EXISTS idx_paiements_credit_client ON paiements_credit(client_id);
    CREATE INDEX IF NOT EXISTS idx_paiements_facture_session ON paiements_facture(session_id);
    CREATE INDEX IF NOT EXISTS idx_paiements_facture_facture ON paiements_facture(facture_id);
    -- Soumissions DGI (traçabilité complète)
    CREATE TABLE IF NOT EXISTS dgi_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      facture_id INTEGER NOT NULL REFERENCES factures(id),
      facture_numero TEXT NOT NULL,
      statut TEXT NOT NULL DEFAULT 'en_attente'
        CHECK(statut IN ('en_attente','soumis','valide','rejete','annule')),
      mode TEXT NOT NULL DEFAULT 'mock' CHECK(mode IN ('mock','sandbox','production')),
      dgi_numero TEXT,
      dgi_qr_data TEXT,
      dgi_token TEXT,
      requete_json TEXT,
      reponse_json TEXT,
      message_erreur TEXT,
      tentatives INTEGER DEFAULT 0,
      soumis_at TEXT,
      valide_at TEXT,
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
    );

    CREATE INDEX IF NOT EXISTS idx_factures_type ON factures(type);
    CREATE INDEX IF NOT EXISTS idx_factures_client ON factures(client_id);
    CREATE INDEX IF NOT EXISTS idx_factures_date ON factures(created_at);
    CREATE INDEX IF NOT EXISTS idx_dgi_facture ON dgi_submissions(facture_id);
    CREATE INDEX IF NOT EXISTS idx_dgi_statut ON dgi_submissions(statut);

    -- Inventaires physiques
    CREATE TABLE IF NOT EXISTS inventaires (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT UNIQUE NOT NULL,
      statut TEXT NOT NULL DEFAULT 'brouillon'
        CHECK(statut IN ('brouillon','soumis','valide','rejete','annule')),
      note TEXT,
      note_rejet TEXT,
      user_id INTEGER REFERENCES users(id),
      soumis_at TEXT,
      soumis_par INTEGER REFERENCES users(id),
      valide_at TEXT,
      valide_par INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
    );

    CREATE TABLE IF NOT EXISTS lignes_inventaire (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inventaire_id INTEGER NOT NULL REFERENCES inventaires(id) ON DELETE CASCADE,
      produit_id INTEGER NOT NULL REFERENCES produits(id),
      qte_systeme INTEGER NOT NULL,
      qte_comptee INTEGER,
      ecart INTEGER,
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
    );

    CREATE INDEX IF NOT EXISTS idx_inv_statut ON inventaires(statut);
    CREATE INDEX IF NOT EXISTS idx_inv_ligne ON lignes_inventaire(inventaire_id);

    CREATE TABLE IF NOT EXISTS sessions_caisse (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      fond_ouverture REAL NOT NULL DEFAULT 0,
      fond_cloture REAL,
      total_ventes REAL DEFAULT 0,
      total_reglements_credit REAL DEFAULT 0,
      total_reglements_facture REAL DEFAULT 0,
      detail_billets TEXT,
      ecart REAL,
      statut TEXT DEFAULT 'ouvert',
      user_id INTEGER REFERENCES users(id),
      note TEXT,
      clos_a TEXT,
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
    );

    CREATE TABLE IF NOT EXISTS retraits_caisse (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      montant REAL NOT NULL,
      motif TEXT,
      user_id INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
    );

    -- Location événementielle : catalogue d'articles
    CREATE TABLE IF NOT EXISTS location_articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      categorie TEXT DEFAULT 'Général',
      description TEXT,
      stock_total INTEGER DEFAULT 0,
      prix_location REAL DEFAULT 0,
      unite TEXT DEFAULT 'pièce',
      actif INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
    );

    -- Contrats de location
    CREATE TABLE IF NOT EXISTS location_contrats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero TEXT UNIQUE NOT NULL,
      client_nom TEXT NOT NULL,
      client_telephone TEXT,
      event_nom TEXT,
      event_lieu TEXT,
      date_debut TEXT NOT NULL,
      date_fin TEXT NOT NULL,
      statut TEXT DEFAULT 'reserve' CHECK(statut IN ('reserve','en_cours','retourne','annule')),
      acompte REAL DEFAULT 0,
      montant_total REAL DEFAULT 0,
      notes TEXT,
      user_id INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
    );

    -- Lignes de contrat de location
    CREATE TABLE IF NOT EXISTS location_contrat_lignes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contrat_id INTEGER NOT NULL REFERENCES location_contrats(id) ON DELETE CASCADE,
      article_id INTEGER NOT NULL REFERENCES location_articles(id),
      quantite INTEGER NOT NULL,
      prix_unitaire REAL NOT NULL,
      quantite_rendue INTEGER DEFAULT 0,
      quantite_manquante INTEGER DEFAULT 0
    );

    -- Restauration : carte (plats & boissons)
    CREATE TABLE IF NOT EXISTS resto_plats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      categorie TEXT DEFAULT 'Plats',
      description TEXT,
      prix REAL NOT NULL DEFAULT 0,
      disponible INTEGER DEFAULT 1,
      actif INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
    );

    -- Restauration : tables de la salle
    CREATE TABLE IF NOT EXISTS resto_tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      capacite INTEGER DEFAULT 4,
      zone TEXT DEFAULT 'Salle',
      actif INTEGER DEFAULT 1
    );

    -- Restauration : commandes (sur place, à emporter, livraison)
    CREATE TABLE IF NOT EXISTS resto_commandes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero TEXT UNIQUE NOT NULL,
      type TEXT DEFAULT 'sur_place' CHECK(type IN ('sur_place','emporter','livraison')),
      table_id INTEGER REFERENCES resto_tables(id),
      client_nom TEXT,
      client_telephone TEXT,
      adresse_livraison TEXT,
      statut TEXT DEFAULT 'en_attente' CHECK(statut IN ('en_attente','en_preparation','pret','servi','paye','annule')),
      sous_total REAL DEFAULT 0,
      remise REAL DEFAULT 0,
      total REAL DEFAULT 0,
      mode_paiement TEXT,
      montant_paye REAL DEFAULT 0,
      notes TEXT,
      user_id INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
      paye_at TEXT
    );

    CREATE TABLE IF NOT EXISTS resto_commande_lignes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      commande_id INTEGER NOT NULL REFERENCES resto_commandes(id) ON DELETE CASCADE,
      plat_id INTEGER REFERENCES resto_plats(id),
      nom TEXT NOT NULL,
      quantite INTEGER NOT NULL,
      prix_unitaire REAL NOT NULL,
      note TEXT
    );
  `);

  // Tables globales (base principale uniquement, pas par tenant)
  _rawDb.exec(`
    CREATE TABLE IF NOT EXISTS plans_abonnement (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      nom TEXT NOT NULL,
      prix INTEGER NOT NULL,
      duree_jours INTEGER NOT NULL,
      actif INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS abonnements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL,
      plan TEXT NOT NULL DEFAULT 'mensuel',
      montant INTEGER NOT NULL,
      date_debut TEXT,
      date_fin TEXT,
      statut TEXT NOT NULL DEFAULT 'en_attente',
      wave_ref TEXT,
      jeko_payment_id TEXT,
      nom_boutique TEXT,
      email TEXT,
      mdp_temp TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    INSERT OR REPLACE INTO plans_abonnement (code, nom, prix, duree_jours) VALUES
      ('mensuel', 'Mensuel', 12500, 30),
      ('trimestriel', 'Trimestriel', 35000, 90),
      ('annuel', 'Annuel', 125000, 365);
  `);

  // Migration : colonne jeko_payment_id
  try { _rawDb.exec('ALTER TABLE abonnements ADD COLUMN jeko_payment_id TEXT'); } catch(_) {}

  const bcrypt = require('bcryptjs');

  // Créer le super admin (compte vendeur, protégé)
  try {
    const superAdminExist = db.prepare("SELECT id FROM users WHERE role = 'super_admin'").get();
    if (!superAdminExist) {
      const hash = bcrypt.hashSync('Bonjour@2026', 10);
      db.prepare('INSERT INTO users (nom, prenom, email, mot_de_passe, role) VALUES (?, ?, ?, ?, ?)').run('MYBOGO', 'SuperAdmin', 'superadmin@mybogo.ci', hash, 'super_admin');
      console.log('SuperAdmin cree: superadmin@mybogo.ci / Bonjour@2026');
    }
  } catch(e) { console.error('Erreur creation super admin:', e.message); }

  // Créer l'admin par défaut s'il n'existe pas (base vide, sans données démo)
  const adminExist = db.prepare("SELECT id FROM users WHERE role = 'admin'").get();
  if (!adminExist) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT INTO users (nom, prenom, email, mot_de_passe, role) VALUES (?, ?, ?, ?, ?)').run('Admin', 'Principal', 'admin@mybogo.com', hash, 'admin');
    // Client de passage par défaut
    db.prepare('INSERT OR IGNORE INTO clients (nom, telephone) VALUES (?, ?)').run('Client de passage', '');
    console.log('Admin cree: admin@mybogo.com / admin123');
  }

  // Ligne entreprise par défaut
  const entrepriseExist = db.prepare('SELECT id FROM entreprise WHERE id = 1').get();
  if (!entrepriseExist) {
    db.prepare("INSERT INTO entreprise (id, nom) VALUES (1, 'Mon Entreprise')").run();
  }
}

// Fermer proprement la DB à l'arrêt pour éviter les lock files
function closeDatabase() {
  try { _rawDb.close(); } catch (e) {}
  for (const entry of tenantConnections.values()) {
    try { entry.raw.close(); } catch (e) {}
  }
  tenantConnections.clear();
}
process.on('exit', closeDatabase);
process.on('SIGTERM', () => { closeDatabase(); process.exit(0); });
process.on('SIGINT', () => { closeDatabase(); process.exit(0); });

// Accès direct à la base principale (abonnements, plans — données globales non-tenant)
const mainDb = {
  prepare: (sql) => wrapStmt(_rawDb.prepare(sql)),
  exec: (sql) => _rawDb.exec(sql),
};

// Interface db (prepare/exec) sur la connexion en cache d'une boutique — pour l'administration
// centrale, hors contexte de requête d'une boutique.
function tenantDbWrapped(slug, tenantDbPath) {
  const raw = getTenantDb(slug, tenantDbPath);
  return {
    exec: (sql) => raw.exec(sql),
    prepare: (sql) => wrapStmt(raw.prepare(sql)),
  };
}

function currentTenantSlug() {
  const store = tenantContext.getStore();
  return store && store.slug ? store.slug : null;
}

module.exports = { db, mainDb, initDatabase, runInTenantContext, getTenantDb, provisionnerNouvelleBase, tenantDbWrapped, currentTenantSlug, fermerConnexionTenant };
