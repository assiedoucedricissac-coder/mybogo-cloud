/**
 * Script de seed — produits de test MYBOGO-STOCK
 * Usage: node seed.js
 */
const path = require('path');
const { db, initDatabase } = require('./src/config/database');

initDatabase();

function genCode(catNom, prodNom, existingCodes) {
  const clean = (str) =>
    (str || '').toUpperCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Z0-9]/g, '').substring(0, 3).padEnd(3, 'X');
  const prefix = `${clean(catNom)}-${clean(prodNom)}`;
  const existing = existingCodes.filter(c => c && c.startsWith(prefix));
  const nums = existing.map(c => parseInt(c.slice(-3)) || 0);
  const seq = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  const code = `${prefix}-${String(seq).padStart(3, '0')}`;
  existingCodes.push(code);
  return code;
}

// Récupérer les catégories existantes
const cats = db.prepare('SELECT id, nom FROM categories').all();
const catMap = {};
cats.forEach(c => { catMap[c.nom] = c.id; });

console.log('Catégories trouvées :', Object.keys(catMap).join(', '));

const existingCodes = db.prepare('SELECT code FROM produits').all().map(p => p.code);

const produits = [
  // ── Boissons ──────────────────────────────────────────────
  { cat: 'Boissons', nom: 'Coca-Cola 33cl',      unite: 'pièce',  prix_achat: 400,   prix_vente: 500,   qte_actuelle: 48, qte_min: 12, marque: 'Coca-Cola',  description: 'Canette 33cl' },
  { cat: 'Boissons', nom: 'Fanta Orange 33cl',   unite: 'pièce',  prix_achat: 400,   prix_vente: 500,   qte_actuelle: 36, qte_min: 12, marque: 'Coca-Cola' },
  { cat: 'Boissons', nom: 'Sprite 33cl',         unite: 'pièce',  prix_achat: 400,   prix_vente: 500,   qte_actuelle: 24, qte_min: 12, marque: 'Coca-Cola' },
  { cat: 'Boissons', nom: 'Youki Ananas 33cl',   unite: 'pièce',  prix_achat: 300,   prix_vente: 400,   qte_actuelle: 60, qte_min: 24, marque: 'Youki' },
  { cat: 'Boissons', nom: 'Bock Malta 33cl',     unite: 'pièce',  prix_achat: 350,   prix_vente: 450,   qte_actuelle: 48, qte_min: 12, marque: 'Solibra' },
  { cat: 'Boissons', nom: 'Eau Minérale 1.5L',   unite: 'pièce',  prix_achat: 400,   prix_vente: 600,   qte_actuelle: 100,qte_min: 24, marque: 'Awa' },
  { cat: 'Boissons', nom: 'Eau Minérale 50cl',   unite: 'pièce',  prix_achat: 200,   prix_vente: 300,   qte_actuelle: 144,qte_min: 48, marque: 'Awa' },
  { cat: 'Boissons', nom: 'Flag Bière 65cl',     unite: 'pièce',  prix_achat: 550,   prix_vente: 700,   qte_actuelle: 36, qte_min: 12, marque: 'Solibra' },
  { cat: 'Boissons', nom: 'Ivoire Club Bière',   unite: 'pièce',  prix_achat: 500,   prix_vente: 650,   qte_actuelle: 24, qte_min: 12, marque: 'BGCI' },
  { cat: 'Boissons', nom: 'Jus de bissap 1L',    unite: 'litre',  prix_achat: 800,   prix_vente: 1200,  qte_actuelle: 20, qte_min: 6 },

  // ── Alimentation ──────────────────────────────────────────
  { cat: 'Alimentation', nom: 'Riz Thaïlandais 5kg',  unite: 'kg',    prix_achat: 3500,  prix_vente: 4500,  qte_actuelle: 20, qte_min: 5,  marque: 'Cobra' },
  { cat: 'Alimentation', nom: 'Riz Local 25kg',        unite: 'kg',    prix_achat: 12000, prix_vente: 15000, qte_actuelle: 10, qte_min: 3 },
  { cat: 'Alimentation', nom: 'Huile Végétale 1L',     unite: 'litre', prix_achat: 1200,  prix_vente: 1500,  qte_actuelle: 30, qte_min: 10, marque: 'Dinor' },
  { cat: 'Alimentation', nom: 'Huile Végétale 5L',     unite: 'litre', prix_achat: 5500,  prix_vente: 7000,  qte_actuelle: 15, qte_min: 5,  marque: 'Dinor' },
  { cat: 'Alimentation', nom: 'Cube Maggi Crevettes', unite: 'boîte', prix_achat: 1500,  prix_vente: 2000,  qte_actuelle: 50, qte_min: 20, marque: 'Maggi',  description: 'Boîte 100 cubes' },
  { cat: 'Alimentation', nom: 'Farine de blé 1kg',    unite: 'kg',    prix_achat: 700,   prix_vente: 950,   qte_actuelle: 40, qte_min: 10, marque: 'Nioto' },
  { cat: 'Alimentation', nom: 'Sucre en poudre 1kg',  unite: 'kg',    prix_achat: 700,   prix_vente: 900,   qte_actuelle: 30, qte_min: 10 },
  { cat: 'Alimentation', nom: 'Sel iodé 1kg',         unite: 'kg',    prix_achat: 200,   prix_vente: 350,   qte_actuelle: 50, qte_min: 20 },
  { cat: 'Alimentation', nom: 'Lait en poudre 400g',  unite: 'pièce', prix_achat: 2500,  prix_vente: 3200,  qte_actuelle: 20, qte_min: 5,  marque: 'Nido' },
  { cat: 'Alimentation', nom: 'Sardines en boîte',    unite: 'pièce', prix_achat: 800,   prix_vente: 1100,  qte_actuelle: 48, qte_min: 12, marque: 'Saupiquet' },
  { cat: 'Alimentation', nom: 'Pâtes Macaroni 500g',  unite: 'pièce', prix_achat: 500,   prix_vente: 700,   qte_actuelle: 60, qte_min: 24, marque: 'Panzani' },
  { cat: 'Alimentation', nom: 'Tomate concentrée 70g',unite: 'pièce', prix_achat: 150,   prix_vente: 250,   qte_actuelle: 120,qte_min: 30, marque: 'Tropico' },

  // ── Hygiène ───────────────────────────────────────────────
  { cat: 'Hygiène', nom: 'Savon La Kirikou 200g',  unite: 'pièce', prix_achat: 250,  prix_vente: 400,  qte_actuelle: 60, qte_min: 20, marque: 'Blohorn' },
  { cat: 'Hygiène', nom: 'Savon Lux 125g',         unite: 'pièce', prix_achat: 300,  prix_vente: 450,  qte_actuelle: 48, qte_min: 20, marque: 'Unilever' },
  { cat: 'Hygiène', nom: 'Dentifrice Colgate 75ml',unite: 'pièce', prix_achat: 900,  prix_vente: 1200, qte_actuelle: 24, qte_min: 6,  marque: 'Colgate' },
  { cat: 'Hygiène', nom: 'Shampoing Pantène 200ml',unite: 'pièce', prix_achat: 2000, prix_vente: 2800, qte_actuelle: 18, qte_min: 6,  marque: 'P&G' },
  { cat: 'Hygiène', nom: 'Gel douche 250ml',       unite: 'pièce', prix_achat: 1500, prix_vente: 2200, qte_actuelle: 20, qte_min: 6,  marque: 'Dettol' },
  { cat: 'Hygiène', nom: 'Déodorant Axe 150ml',    unite: 'pièce', prix_achat: 1800, prix_vente: 2500, qte_actuelle: 15, qte_min: 5,  marque: 'Axe' },
  { cat: 'Hygiène', nom: 'Papier toilette x4',     unite: 'pack',  prix_achat: 1000, prix_vente: 1400, qte_actuelle: 36, qte_min: 12, marque: 'Confort' },
  { cat: 'Hygiène', nom: 'Lessive Omo 1kg',        unite: 'kg',    prix_achat: 1200, prix_vente: 1600, qte_actuelle: 25, qte_min: 10, marque: 'Omo' },

  // ── Médicaments ───────────────────────────────────────────
  { cat: 'Médicaments', nom: 'Paracétamol 500mg x16', unite: 'boîte', prix_achat: 500,  prix_vente: 800,  qte_actuelle: 50, qte_min: 15, marque: 'Générique', date_expiration: '2027-06-30' },
  { cat: 'Médicaments', nom: 'Ibuprofène 400mg x20',  unite: 'boîte', prix_achat: 700,  prix_vente: 1100, qte_actuelle: 30, qte_min: 10, marque: 'Générique', date_expiration: '2027-03-31' },
  { cat: 'Médicaments', nom: 'Amoxicilline 500mg x21',unite: 'boîte', prix_achat: 2000, prix_vente: 3000, qte_actuelle: 20, qte_min: 8,  marque: 'Générique', date_expiration: '2026-12-31' },
  { cat: 'Médicaments', nom: 'Vitamine C 500mg x30',  unite: 'boîte', prix_achat: 1500, prix_vente: 2200, qte_actuelle: 25, qte_min: 8,  marque: 'Générique', date_expiration: '2027-09-30' },
  { cat: 'Médicaments', nom: 'Sérum physiologique 5ml',unite:'pièce', prix_achat: 200,  prix_vente: 350,  qte_actuelle: 60, qte_min: 20, date_expiration: '2026-11-30' },

  // ── Électronique ──────────────────────────────────────────
  { cat: 'Électronique', nom: 'Piles AA x4',       unite: 'pack',  prix_achat: 500,   prix_vente: 750,   qte_actuelle: 40, qte_min: 10, marque: 'Duracell' },
  { cat: 'Électronique', nom: 'Chargeur USB-C 20W',unite: 'pièce', prix_achat: 3500,  prix_vente: 5000,  qte_actuelle: 10, qte_min: 3 },
  { cat: 'Électronique', nom: 'Câble USB-C 1m',    unite: 'pièce', prix_achat: 1500,  prix_vente: 2500,  qte_actuelle: 15, qte_min: 5 },
  { cat: 'Électronique', nom: 'Ampoule LED 9W',    unite: 'pièce', prix_achat: 1200,  prix_vente: 1800,  qte_actuelle: 30, qte_min: 10, marque: 'Philips' },

  // ── Quincaillerie ─────────────────────────────────────────
  { cat: 'Quincaillerie', nom: 'Bougie x12',        unite: 'boîte', prix_achat: 500,  prix_vente: 800,  qte_actuelle: 20, qte_min: 5 },
  { cat: 'Quincaillerie', nom: 'Sac plastique 50L', unite: 'sachet',prix_achat: 1000, prix_vente: 1500, qte_actuelle: 30, qte_min: 10 },
  { cat: 'Quincaillerie', nom: 'Allumettes x10',    unite: 'pack',  prix_achat: 300,  prix_vente: 500,  qte_actuelle: 60, qte_min: 20 },
];

const insertProduit = db.prepare(`
  INSERT OR IGNORE INTO produits
    (code, nom, description, categorie_id, marque, unite, prix_achat, prix_vente, tva,
     qte_min, qte_max, qte_actuelle, date_expiration, actif)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1)
`);

let created = 0, skipped = 0;

for (const p of produits) {
  const cat_id = catMap[p.cat];
  if (!cat_id) { console.warn(`⚠  Catégorie introuvable: ${p.cat}`); skipped++; continue; }

  const code = genCode(p.cat, p.nom, existingCodes);
  const result = insertProduit.run(
    code, p.nom, p.description || null, cat_id,
    p.marque || null, p.unite,
    p.prix_achat, p.prix_vente, 18,
    p.qte_min, p.qte_max || 1000, p.qte_actuelle,
    p.date_expiration || null
  );
  if (result.changes > 0) {
    console.log(`✅ ${code}  ${p.nom}`);
    created++;
  } else {
    console.log(`⏭  Ignoré (existe déjà): ${p.nom}`);
    skipped++;
  }
}

console.log(`\n🎉 Terminé — ${created} produit(s) créé(s), ${skipped} ignoré(s).`);
db.close();
