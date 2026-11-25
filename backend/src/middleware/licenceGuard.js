const { db, currentTenantSlug } = require('../config/database');

// Routes toujours accessibles : connexion, pages publiques, état et paiement de la licence, webhook.
const LIBRES = ['/auth/', '/public/', '/licence/', '/webhook/'];

// Bloque l'API d'une boutique dont la licence est expirée ou suspendue (402). Sans ce contrôle,
// seul l'écran de l'application était bloqué : l'API restait utilisable directement.
function licenceGuard(req, res, next) {
  if (!currentTenantSlug()) return next();
  if (LIBRES.some(p => req.path.startsWith(p))) return next();
  let licence;
  try { licence = db.prepare('SELECT type, expires_at FROM licence WHERE id = 1').get(); }
  catch { return next(); }
  if (!licence) return next();
  const aujourdhui = new Date().toISOString().split('T')[0];
  if (licence.type === 'suspended' || (licence.expires_at && licence.expires_at <= aujourdhui)) {
    return res.status(402).json({
      code: 'LICENCE_EXPIREE',
      message: licence.type === 'suspended'
        ? "Cette boutique est suspendue. Contactez le support."
        : 'Votre licence a expiré. Abonnez-vous pour continuer.',
    });
  }
  next();
}

module.exports = licenceGuard;
