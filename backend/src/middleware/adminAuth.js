const jwt = require('jsonwebtoken');

// Protège les routes /admin-api/* — vérifie un jeton distinct de celui des comptes de
// boutique (claim `admin: true`), pour qu'un compte tenant ne puisse jamais y accéder.
function adminAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Authentification requise' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.admin) return res.status(403).json({ message: 'Accès refusé' });
    next();
  } catch (e) {
    res.status(401).json({ message: 'Session expirée, reconnectez-vous' });
  }
}

module.exports = adminAuth;
