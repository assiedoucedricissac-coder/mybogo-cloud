// Registre des boutiques (tenants) — un simple fichier JSON sur le volume persistant,
// volontairement pas une base à part : peu de boutiques au démarrage, pas besoin
// d'ajouter une dépendance/coût supplémentaire pour ça.
const fs = require('fs');
const path = require('path');

const REGISTRY_PATH = process.env.MYBOGO_TENANTS_REGISTRY
  || path.join(__dirname, '../../data/tenants-registry.json');

function lire() {
  try { return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8')); }
  catch (e) { return []; }
}

function ecrire(liste) {
  fs.mkdirSync(path.dirname(REGISTRY_PATH), { recursive: true });
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(liste, null, 2));
}

function lister() {
  return lire();
}

function ajouter(tenant) {
  const liste = lire();
  if (liste.some(t => t.slug === tenant.slug)) {
    throw new Error(`Une boutique "${tenant.slug}" existe déjà.`);
  }
  liste.push(tenant);
  ecrire(liste);
}

// slug -> chemin du fichier .db, pour le middleware de résolution de tenant.
function tenantsMap() {
  const map = {};
  for (const t of lire()) map[t.slug] = t.dbPath;
  return map;
}

module.exports = { lister, ajouter, tenantsMap, REGISTRY_PATH };
