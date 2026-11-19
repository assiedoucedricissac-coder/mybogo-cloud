/**
 * Provisionne une nouvelle boutique (tenant) pour MYBOGO-STOCK-SAAS — en ligne de commande.
 * (Le panneau d'administration web fait exactement la même chose, voir /admin.)
 *
 * Usage :
 *   node backend/scripts/creer-boutique.js <slug> "<Nom boutique>" <email-admin> <mot-de-passe>
 *
 * Exemple :
 *   node backend/scripts/creer-boutique.js eljireh "EL-JIREH" admin@eljireh.ci MotDePasse123
 */
const { provisionnerBoutique } = require('../src/services/provisionnement');

const [slug, nomBoutique, email, motDePasse] = process.argv.slice(2);
if (!slug || !nomBoutique || !email || !motDePasse) {
  console.error('Usage: node creer-boutique.js <slug> "<Nom boutique>" <email-admin> <mot-de-passe>');
  process.exit(1);
}

try {
  const result = provisionnerBoutique({ slug, nomBoutique, email, motDePasse });
  console.log('\n✅ Boutique créée avec succès.\n');
  console.log(`Fichier base de données : ${result.dbPath}`);
  console.log(`\n— Identifiants à transmettre au client —`);
  console.log(`Adresse      : https://${slug}.<votre-domaine-railway>`);
  console.log(`Email        : ${email}`);
  console.log(`Mot de passe : ${motDePasse}`);
  console.log('');
} catch (err) {
  console.error('❌', err.message);
  process.exit(1);
}
