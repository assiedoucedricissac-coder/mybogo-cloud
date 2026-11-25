const fs = require('fs');
const path = require('path');
const tenantRegistry = require('./tenantRegistry');
const { tenantsDir } = require('./provisionnement');

// Diagnostic du stockage : les boutiques sont-elles écrites sur un volume persistant (survit aux
// redéploiements) ou sur le disque éphémère du conteneur (effacé à chaque mise à jour) ?
function diagnostic() {
  const registre = tenantRegistry.REGISTRY_PATH;
  const dossier = path.dirname(registre);
  let montage = null;
  let persistant = null; // null = impossible à déterminer (hors Linux)

  try {
    let meilleur = null;
    for (const ligne of fs.readFileSync('/proc/mounts', 'utf8').split('\n')) {
      const [dev, pt, type] = ligne.split(' ');
      if (!pt) continue;
      const prefixe = pt.endsWith('/') ? pt : pt + '/';
      if ((dossier === pt || (dossier + '/').startsWith(prefixe)) && (!meilleur || pt.length > meilleur.pt.length)) {
        meilleur = { dev, pt, type };
      }
    }
    if (meilleur) {
      montage = meilleur;
      persistant = meilleur.pt !== '/';
    }
  } catch { /* pas de /proc/mounts (Windows, macOS) */ }

  return {
    persistant,
    montage,
    dossierRegistre: dossier,
    dossierBoutiques: tenantsDir(),
    cheminBasePrincipale: process.env.MYBOGO_DB_PATH || null,
    variableDefinie: !!process.env.MYBOGO_DB_PATH,
    registreExiste: fs.existsSync(registre),
    nbBoutiques: tenantRegistry.lister().length,
  };
}

module.exports = { diagnostic };
