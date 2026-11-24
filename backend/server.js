require('dotenv').config({ path: require('path').join(__dirname, '.env') });

// Empêche les erreurs non gérées de crasher l'app Electron
process.on('uncaughtException',  err => console.error('[CRASH ÉVITÉ] uncaughtException:', err.message));
process.on('unhandledRejection', err => console.error('[CRASH ÉVITÉ] unhandledRejection:', err?.message || err));

// Version SaaS hébergée : contrairement à la version desktop (un secret embarqué dans
// chaque installation ne posait pas de risque, l'app ne quittait jamais le PC du client),
// ici le secret protège TOUS les clients à la fois — donc pas de valeur par défaut :
// il doit être défini comme variable d'environnement Railway, sinon on refuse de démarrer.
if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET manquant — définissez cette variable d\'environnement avant de démarrer en production.');
  }
  process.env.JWT_SECRET = 'dev-only-secret-do-not-use-in-production';
  console.warn('[DEV] JWT_SECRET non défini — valeur de développement utilisée, à ne jamais utiliser en production.');
}
if (!process.env.JWT_EXPIRES_IN) process.env.JWT_EXPIRES_IN = '7d';

const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDatabase, runInTenantContext } = require('./src/config/database');
const tenantRegistry = require('./src/services/tenantRegistry');

const app = express();

// ── Multi-tenant : chaque boutique cliente a sa propre base, choisie par sous-domaine.
// Deux sources, fusionnées à chaque requête (registre relu à chaud — pas besoin de
// redémarrer le serveur après la création d'une boutique depuis /admin) :
//  - MYBOGO_TENANTS (variable d'environnement, JSON "slug -> chemin .db") — utile pour un
//    tenant configuré manuellement une fois pour toutes ;
//  - le registre (backend/scripts/creer-boutique.js ou le panneau /admin).
// Tant qu'aucune des deux n'a d'entrée, rien ne change : comportement mono-client
// identique à l'Étape 1 (la base par défaut de MYBOGO_DB_PATH est utilisée pour tout).
// /admin, /admin-api et /health ne passent jamais par cette résolution : ce ne sont pas
// des données de boutique, l'espace d'administration est commun à tout le serveur.
const ENV_TENANTS = (() => {
  try { return JSON.parse(process.env.MYBOGO_TENANTS || '{}'); }
  catch (e) { console.error('[TENANTS] MYBOGO_TENANTS invalide (JSON attendu):', e.message); return {}; }
})();

app.use((req, res, next) => {
  if (req.path === '/admin' || req.path.startsWith('/admin-api') || req.path === '/health') return next();
  const tenants = { ...ENV_TENANTS, ...tenantRegistry.tenantsMap() };
  if (Object.keys(tenants).length === 0) return next(); // mode mono-client (Étape 1), inchangé
  const host = (req.headers.host || '').split(':')[0];
  // Priorité : header X-Boutique (login par code) > sous-domaine (custom domain)
  const slug = (req.headers['x-boutique'] || '').trim().toLowerCase() || host.split('.')[0];
  const tenantDbPath = tenants[slug];
  // Adresse qui ne correspond à aucune boutique connue (le domaine Railway de base, une
  // faute de frappe...) : on continue avec la base par défaut plutôt que de bloquer —
  // l'adresse principale garde ainsi son comportement d'origine, quel que soit le nombre
  // de boutiques créées par ailleurs.
  if (!tenantDbPath) return next();
  runInTenantContext(slug, tenantDbPath, next);
});

// Express génère par défaut un ETag sur res.json() : si le navigateur redemande la même URL,
// le serveur répond "304 Not Modified" avec un corps VIDE. Sur une API (données qui changent
// à chaque vente/versement), ce cache n'a aucun intérêt et peut laisser le renderer Electron
// bloqué à attendre un contenu qui ne viendra jamais (gel silencieux, sans erreur JS).
app.set('etag', false);
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

// Webhook Jèko : monté avant express.json(), qui consommerait le corps et casserait la signature.
app.post('/api/webhook/jeko', express.raw({ type: '*/*', limit: '1mb' }), (req, res, next) => {
  req.rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  try { req.body = JSON.parse(req.rawBody); } catch { req.body = {}; }
  next();
}, require('./src/controllers/abonnementController').webhookJeko);

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Servir les images uploadées
const uploadsDir = process.env.MYBOGO_UPLOADS_PATH || path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadsDir));

// Patch Express pour capturer les erreurs dans les routes async
const Layer = require('express/lib/router/layer');
const origHandle = Layer.prototype.handle_request;
Layer.prototype.handle_request = function(req, res, next) {
  try {
    const ret = origHandle.call(this, req, res, next);
    if (ret && typeof ret.catch === 'function') ret.catch(next);
    return ret;
  } catch (err) { next(err); }
};

// Routes API
app.use('/api', require('./src/routes/index'));

// Panneau d'administration (création/gestion des boutiques) — indépendant de toute boutique
app.use('/admin-api', require('./src/routes/adminRoutes'));

// Route de santé
app.get('/health', (req, res) => res.json({ status: 'ok', app: 'MYBOGO-STOCK', version: '1.0.0' }));

// Servir le frontend React en production (Electron)
if (process.env.NODE_ENV === 'production') {
  const distPath = process.env.MYBOGO_FRONTEND_DIST || path.join(__dirname, '../frontend/dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Gestion des erreurs
app.use((err, req, res, next) => {
  console.error('[EXPRESS ERR]', err.message);
  if (res.headersSent) { res.end(); return; }
  res.status(500).json({ message: err.message || 'Erreur interne du serveur' });
});

const PORT = process.env.PORT || 3001;

function startServer() {
  return new Promise((resolve, reject) => {
    try {
      initDatabase();
      require('./src/services/comptesParDefaut').securiserComptesParDefaut();
      const server = app.listen(PORT, () => {
        console.log('SERVER_READY:' + PORT);
        console.log(`Serveur MYBOGO-STOCK demarre sur http://localhost:${PORT}`);
        require('./src/services/autoBackup').demarrer();
        resolve(PORT);
      });
      server.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
}

// Lancement direct (développement)
if (require.main === module) {
  startServer().catch(console.error);
}

module.exports = { startServer };
