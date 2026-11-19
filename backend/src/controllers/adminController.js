const jwt = require('jsonwebtoken');
const tenantRegistry = require('../services/tenantRegistry');
const { provisionnerBoutique } = require('../services/provisionnement');

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

function lister(req, res) {
  res.json(tenantRegistry.lister());
}

function creer(req, res) {
  const { slug, nomBoutique, email, motDePasse } = req.body;
  try {
    const result = provisionnerBoutique({ slug, nomBoutique, email, motDePasse });
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

module.exports = { login, lister, creer };
