const { db } = require('../config/database');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

const uploadsDir = process.env.MYBOGO_UPLOADS_PATH || path.join(__dirname, '../../../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

function makeImageUpload(fieldName, filename) {
  return multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, uploadsDir),
      filename:    (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase() || '.png';
        cb(null, `${filename}${ext}`);
      }
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (['image/jpeg','image/png','image/webp'].includes(file.mimetype)) cb(null, true);
      else cb(new Error('Format non supporté (jpg, png, webp)'));
    }
  }).single(fieldName);
}
const uploadLogo   = makeImageUpload('logo',   'logo_entreprise');
const uploadCachet = makeImageUpload('cachet', 'cachet_entreprise');

function getEntreprise(req, res) {
  const e = db.prepare('SELECT * FROM entreprise WHERE id = 1').get();
  const base = e || { id: 1, nom: '', adresse: '', telephone: '', email: '', nif: '', rccm: '', regime_tva: 'normal', logo: null, slogan: '', historique_pin: '',
    feat_vente_melange: 1, feat_facturation_sans_vente: 1, feat_modifier_prix_caisse: 1, feat_vente_conditionnement: 1,
    feat_vente_credit: 1, feat_multi_tickets: 1, feat_achats_correction: 1, feat_rapports: 1,
    feat_module_inventaires: 1, feat_module_facturation: 1, feat_module_caisse: 1,
    feat_module_clients: 1, feat_module_dgi: 0, feat_module_sauvegarde: 1, feat_module_location: 0, feat_module_restauration: 0 };
  // Le PIN n'est jamais renvoyé en clair (même à l'admin qui l'a défini) — cette route est
  // accessible à tous les rôles connectés (impression ticket, etc.), et renvoyer la valeur
  // réelle ici permettrait de contourner la protection simplement en lisant la réponse réseau.
  const { historique_pin, ...rest } = base;
  res.json({ ...rest, historique_pin_actif: !!historique_pin });
}

// Vérifie un code PIN saisi contre celui configuré, sans jamais exposer la valeur réelle au
// client — accessible à tous les rôles connectés puisque tout le monde doit pouvoir tenter de
// déverrouiller Historique Vente / Historique Achat.
function verifierHistoriquePin(req, res) {
  const { pin } = req.body;
  const e = db.prepare('SELECT historique_pin FROM entreprise WHERE id = 1').get();
  const configured = e?.historique_pin || '';
  if (!configured) return res.json({ ok: true }); // pas de PIN configuré = pas de protection
  res.json({ ok: !!pin && String(pin) === configured });
}

// Fonctionnalités activables/désactivables par client — contrôlées uniquement par le Super
// Admin (le fournisseur du logiciel), pas par l'admin local du client, pour désactiver
// proprement ce dont un magasin simple n'a pas besoin sans avoir à maintenir un autre build.
function updateFonctionnalites(req, res) {
  const {
    feat_vente_melange, feat_facturation_sans_vente, feat_modifier_prix_caisse, feat_vente_conditionnement,
    feat_vente_credit, feat_multi_tickets, feat_achats_correction, feat_rapports,
    feat_module_inventaires, feat_module_facturation, feat_module_caisse,
    feat_module_clients, feat_module_dgi, feat_module_sauvegarde, feat_module_location,
    feat_module_restauration,
  } = req.body;
  db.prepare(`
    INSERT INTO entreprise (id,
      feat_vente_melange, feat_facturation_sans_vente, feat_modifier_prix_caisse, feat_vente_conditionnement,
      feat_vente_credit, feat_multi_tickets, feat_achats_correction, feat_rapports,
      feat_module_inventaires, feat_module_facturation, feat_module_caisse,
      feat_module_clients, feat_module_dgi, feat_module_sauvegarde, feat_module_location,
      feat_module_restauration,
      updated_at)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      feat_vente_melange=excluded.feat_vente_melange,
      feat_facturation_sans_vente=excluded.feat_facturation_sans_vente,
      feat_modifier_prix_caisse=excluded.feat_modifier_prix_caisse,
      feat_vente_conditionnement=excluded.feat_vente_conditionnement,
      feat_vente_credit=excluded.feat_vente_credit,
      feat_multi_tickets=excluded.feat_multi_tickets,
      feat_achats_correction=excluded.feat_achats_correction,
      feat_rapports=excluded.feat_rapports,
      feat_module_inventaires=excluded.feat_module_inventaires,
      feat_module_facturation=excluded.feat_module_facturation,
      feat_module_caisse=excluded.feat_module_caisse,
      feat_module_clients=excluded.feat_module_clients,
      feat_module_dgi=excluded.feat_module_dgi,
      feat_module_sauvegarde=excluded.feat_module_sauvegarde,
      feat_module_location=excluded.feat_module_location,
      feat_module_restauration=excluded.feat_module_restauration,
      updated_at=CURRENT_TIMESTAMP
  `).run(
    feat_vente_melange ? 1 : 0, feat_facturation_sans_vente ? 1 : 0,
    feat_modifier_prix_caisse ? 1 : 0, feat_vente_conditionnement ? 1 : 0,
    feat_vente_credit ? 1 : 0, feat_multi_tickets ? 1 : 0,
    feat_achats_correction ? 1 : 0, feat_rapports ? 1 : 0,
    feat_module_inventaires !== false ? 1 : 0, feat_module_facturation !== false ? 1 : 0,
    feat_module_caisse !== false ? 1 : 0, feat_module_clients !== false ? 1 : 0,
    feat_module_dgi ? 1 : 0, feat_module_sauvegarde !== false ? 1 : 0,
    feat_module_location ? 1 : 0,
    feat_module_restauration ? 1 : 0
  );
  res.json({ message: 'Options mises à jour' });
}

function updateEntreprise(req, res) {
  const { nom, adresse, telephone, email, nif, rccm, regime_tva, slogan, historique_pin, clear_historique_pin } = req.body;
  // Champ à saisie unique (comme un mot de passe) : vide = on ne touche pas au PIN existant,
  // sauf si clear_historique_pin est explicitement demandé (bouton "Désactiver la protection").
  const current = db.prepare('SELECT historique_pin FROM entreprise WHERE id = 1').get();
  let pinToStore = current?.historique_pin || '';
  if (clear_historique_pin) pinToStore = '';
  else if (historique_pin && String(historique_pin).trim()) pinToStore = String(historique_pin).trim();

  db.prepare(`
    INSERT INTO entreprise (id, nom, adresse, telephone, email, nif, rccm, regime_tva, slogan, historique_pin, updated_at)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      nom=excluded.nom, adresse=excluded.adresse, telephone=excluded.telephone,
      email=excluded.email, nif=excluded.nif, rccm=excluded.rccm,
      regime_tva=excluded.regime_tva, slogan=excluded.slogan, historique_pin=excluded.historique_pin, updated_at=CURRENT_TIMESTAMP
  `).run(nom || '', adresse || '', telephone || '', email || '', nif || '', rccm || '', regime_tva || 'normal', slogan || '', pinToStore);
  res.json({ message: 'Informations entreprise mises à jour' });
}

function uploadLogoEntreprise(req, res) {
  uploadLogo(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message });
    if (!req.file) return res.status(400).json({ message: 'Aucun fichier reçu' });
    const logoUrl = `/uploads/${req.file.filename}`;
    db.prepare(`INSERT INTO entreprise (id, logo) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET logo=excluded.logo, updated_at=CURRENT_TIMESTAMP`).run(logoUrl);
    res.json({ logo: logoUrl });
  });
}

function uploadCachetEntreprise(req, res) {
  uploadCachet(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message });
    if (!req.file) return res.status(400).json({ message: 'Aucun fichier reçu' });
    const cachetUrl = `/uploads/${req.file.filename}`;
    db.prepare(`INSERT INTO entreprise (id, cachet) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET cachet=excluded.cachet, updated_at=CURRENT_TIMESTAMP`).run(cachetUrl);
    res.json({ cachet: cachetUrl });
  });
}

function seedDemo(req, res) {
  const tx = db.transaction(() => {
    // Supprimer anciens articles de demo si existants
    db.exec("DELETE FROM produits WHERE code LIKE 'DEMO-%'");
    db.exec("DELETE FROM categories WHERE nom IN ('Ordinateurs portables','PC de bureau','Écrans & Moniteurs','Composants PC','Claviers & Souris','Téléphones & Smartphones','Tablettes','Imprimantes','Stockage & Mémoire','Réseaux & Câbles','Accessoires','Audio & Son')");

    // ── Rayons (catégories) ──────────────────────────────────────
    const rayons = [
      'Ordinateurs portables', 'PC de bureau', 'Écrans & Moniteurs',
      'Composants PC', 'Claviers & Souris', 'Téléphones & Smartphones',
      'Tablettes', 'Imprimantes', 'Stockage & Mémoire',
      'Réseaux & Câbles', 'Accessoires', 'Audio & Son',
    ];
    const catIds = {};
    const insCAT = db.prepare('INSERT INTO categories (nom) VALUES (?)');
    for (const n of rayons) {
      const r = insCAT.run(n);
      catIds[n] = r.lastInsertRowid;
    }

    // ── Produits ─────────────────────────────────────────────────
    const produits = [
      // Ordinateurs portables
      { code:'DEMO-LAP001', nom:'HP Pavilion 15 – Core i5 12e Gen', cat:'Ordinateurs portables', pa:280000, pv:395000, qte:8, unite:'pièce' },
      { code:'DEMO-LAP002', nom:'Lenovo IdeaPad 3 – Core i3', cat:'Ordinateurs portables', pa:185000, pv:265000, qte:12, unite:'pièce' },
      { code:'DEMO-LAP003', nom:'Dell Inspiron 15 – Core i7', cat:'Ordinateurs portables', pa:420000, pv:595000, qte:5, unite:'pièce' },
      { code:'DEMO-LAP004', nom:'ASUS VivoBook 14 – Core i5', cat:'Ordinateurs portables', pa:265000, pv:375000, qte:7, unite:'pièce' },
      { code:'DEMO-LAP005', nom:'Acer Aspire 5 – Core i5 Ryzen', cat:'Ordinateurs portables', pa:245000, pv:345000, qte:6, unite:'pièce' },
      // PC Bureau
      { code:'DEMO-DES001', nom:'PC Bureau HP Compaq Core i5', cat:'PC de bureau', pa:220000, pv:320000, qte:4, unite:'pièce' },
      { code:'DEMO-DES002', nom:'PC Bureau Dell OptiPlex Core i7', cat:'PC de bureau', pa:320000, pv:455000, qte:3, unite:'pièce' },
      { code:'DEMO-DES003', nom:'PC All-in-One Lenovo Core i5', cat:'PC de bureau', pa:380000, pv:530000, qte:2, unite:'pièce' },
      // Écrans
      { code:'DEMO-ECR001', nom:'Écran Samsung 24" Full HD 75Hz', cat:'Écrans & Moniteurs', pa:75000, pv:115000, qte:10, unite:'pièce' },
      { code:'DEMO-ECR002', nom:'Écran LG 27" IPS 4K', cat:'Écrans & Moniteurs', pa:120000, pv:178000, qte:6, unite:'pièce' },
      { code:'DEMO-ECR003', nom:'Écran HP 21.5" VGA/HDMI', cat:'Écrans & Moniteurs', pa:52000, pv:79000, qte:15, unite:'pièce' },
      // Composants
      { code:'DEMO-RAM001', nom:'Barrette RAM DDR4 8Go 3200MHz', cat:'Composants PC', pa:18000, pv:29000, qte:25, unite:'pièce' },
      { code:'DEMO-RAM002', nom:'Barrette RAM DDR4 16Go 3200MHz', cat:'Composants PC', pa:32000, pv:52000, qte:15, unite:'pièce' },
      { code:'DEMO-SSD001', nom:'SSD 256Go SATA 2.5"', cat:'Composants PC', pa:25000, pv:42000, qte:20, unite:'pièce' },
      { code:'DEMO-SSD002', nom:'SSD 512Go NVMe M.2', cat:'Composants PC', pa:45000, pv:72000, qte:12, unite:'pièce' },
      { code:'DEMO-HDD001', nom:'Disque dur interne 1To HDD SATA', cat:'Composants PC', pa:22000, pv:38000, qte:18, unite:'pièce' },
      { code:'DEMO-PRO001', nom:'Processeur Intel Core i5-12400', cat:'Composants PC', pa:85000, pv:125000, qte:8, unite:'pièce' },
      // Claviers & Souris
      { code:'DEMO-CLA001', nom:'Clavier USB Logitech K120 Azerty', cat:'Claviers & Souris', pa:7500, pv:13500, qte:30, unite:'pièce' },
      { code:'DEMO-SOU001', nom:'Souris optique USB filaire', cat:'Claviers & Souris', pa:3500, pv:7000, qte:40, unite:'pièce' },
      { code:'DEMO-KIT001', nom:'Kit clavier+souris sans fil Logitech MK220', cat:'Claviers & Souris', pa:18000, pv:32000, qte:15, unite:'pièce' },
      { code:'DEMO-PAD001', nom:'Tapis de souris gaming XL', cat:'Claviers & Souris', pa:4000, pv:8500, qte:20, unite:'pièce' },
      // Téléphones
      { code:'DEMO-TEL001', nom:'Samsung Galaxy A15 4G 128Go', cat:'Téléphones & Smartphones', pa:85000, pv:125000, qte:15, unite:'pièce' },
      { code:'DEMO-TEL002', nom:'Tecno Spark 20 Pro 256Go', cat:'Téléphones & Smartphones', pa:65000, pv:95000, qte:20, unite:'pièce' },
      { code:'DEMO-TEL003', nom:'iPhone 14 128Go Reconditionné', cat:'Téléphones & Smartphones', pa:295000, pv:420000, qte:4, unite:'pièce' },
      { code:'DEMO-TEL004', nom:'Infinix Hot 40i 128Go', cat:'Téléphones & Smartphones', pa:45000, pv:72000, qte:18, unite:'pièce' },
      { code:'DEMO-TEL005', nom:'Samsung Galaxy A54 5G 128Go', cat:'Téléphones & Smartphones', pa:175000, pv:248000, qte:8, unite:'pièce' },
      // Tablettes
      { code:'DEMO-TAB001', nom:'Samsung Galaxy Tab A8 32Go', cat:'Tablettes', pa:115000, pv:168000, qte:6, unite:'pièce' },
      { code:'DEMO-TAB002', nom:'iPad 9ème Gen 64Go WiFi', cat:'Tablettes', pa:215000, pv:298000, qte:3, unite:'pièce' },
      { code:'DEMO-TAB003', nom:'Lenovo Tab M10 Plus 64Go', cat:'Tablettes', pa:95000, pv:145000, qte:5, unite:'pièce' },
      // Imprimantes
      { code:'DEMO-IMP001', nom:'Imprimante HP DeskJet 2700 WiFi', cat:'Imprimantes', pa:38000, pv:62000, qte:8, unite:'pièce' },
      { code:'DEMO-IMP002', nom:'Imprimante Canon PIXMA MG2540', cat:'Imprimantes', pa:42000, pv:68000, qte:6, unite:'pièce' },
      { code:'DEMO-IMP003', nom:'Imprimante laser HP LaserJet Pro', cat:'Imprimantes', pa:88000, pv:138000, qte:4, unite:'pièce' },
      { code:'DEMO-IMP004', nom:'Cartouche HP 305 Noir', cat:'Imprimantes', pa:6500, pv:12000, qte:25, unite:'pièce' },
      // Stockage
      { code:'DEMO-USB001', nom:'Clé USB 32Go SanDisk', cat:'Stockage & Mémoire', pa:3000, pv:5500, qte:50, unite:'pièce' },
      { code:'DEMO-USB002', nom:'Clé USB 64Go Kingston', cat:'Stockage & Mémoire', pa:5500, pv:9500, qte:35, unite:'pièce' },
      { code:'DEMO-USB003', nom:'Clé USB 128Go SanDisk Ultra', cat:'Stockage & Mémoire', pa:9000, pv:16000, qte:20, unite:'pièce' },
      { code:'DEMO-EXT001', nom:'Disque dur externe 1To USB 3.0', cat:'Stockage & Mémoire', pa:38000, pv:62000, qte:10, unite:'pièce' },
      { code:'DEMO-SD001', nom:'Carte mémoire microSD 64Go Class10', cat:'Stockage & Mémoire', pa:6500, pv:12000, qte:30, unite:'pièce' },
      // Réseaux
      { code:'DEMO-RTR001', nom:'Routeur WiFi TP-Link Archer AX23', cat:'Réseaux & Câbles', pa:28000, pv:45000, qte:8, unite:'pièce' },
      { code:'DEMO-SWT001', nom:'Switch réseau 8 ports Gigabit', cat:'Réseaux & Câbles', pa:12000, pv:22000, qte:10, unite:'pièce' },
      { code:'DEMO-NET001', nom:'Câble réseau Cat6 5m', cat:'Réseaux & Câbles', pa:2000, pv:4000, qte:40, unite:'pièce' },
      { code:'DEMO-NET002', nom:'Répéteur WiFi TP-Link N300', cat:'Réseaux & Câbles', pa:15000, pv:25000, qte:12, unite:'pièce' },
      // Accessoires
      { code:'DEMO-SAC001', nom:'Sac ordinateur 15.6" Samsonite', cat:'Accessoires', pa:12000, pv:22000, qte:15, unite:'pièce' },
      { code:'DEMO-HUB001', nom:'Hub USB-C 7 en 1 (HDMI+USB3+SD)', cat:'Accessoires', pa:14000, pv:25000, qte:12, unite:'pièce' },
      { code:'DEMO-HDM001', nom:'Câble HDMI 2.0 2m (4K)', cat:'Accessoires', pa:3500, pv:7000, qte:30, unite:'pièce' },
      { code:'DEMO-CHG001', nom:'Chargeur universel laptop 65W USB-C', cat:'Accessoires', pa:14000, pv:24000, qte:10, unite:'pièce' },
      { code:'DEMO-OND001', nom:'Onduleur 600VA APC Back-UPS', cat:'Accessoires', pa:55000, pv:85000, qte:5, unite:'pièce' },
      // Audio
      { code:'DEMO-CAS001', nom:'Casque gaming filaire Redragon H120', cat:'Audio & Son', pa:9000, pv:17000, qte:15, unite:'pièce' },
      { code:'DEMO-CAS002', nom:'Casque Bluetooth JBL Tune 510BT', cat:'Audio & Son', pa:22000, pv:38000, qte:8, unite:'pièce' },
      { code:'DEMO-SPK001', nom:'Haut-parleur Bluetooth JBL Go 3', cat:'Audio & Son', pa:18000, pv:30000, qte:10, unite:'pièce' },
      { code:'DEMO-ECO001', nom:'Écouteurs intra sans fil TWS', cat:'Audio & Son', pa:8000, pv:15000, qte:20, unite:'pièce' },
    ];

    const insP = db.prepare(`
      INSERT OR IGNORE INTO produits (code, nom, categorie_id, prix_achat, prix_vente, qte_actuelle, qte_min, unite, actif)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    for (const p of produits) {
      insP.run(p.code, p.nom, catIds[p.cat], p.pa, p.pv, p.qte, Math.max(2, Math.floor(p.qte * 0.2)), p.unite);
    }

    return { categories: rayons.length, produits: produits.length };
  });

  try {
    const r = tx();
    res.json({ message: `Données de démo créées : ${r.categories} rayons, ${r.produits} articles`, ...r });
  } catch(e) {
    res.status(500).json({ message: e.message });
  }
}

function updateCompte(req, res) {
  const { nom, prenom, email, nouveau_mdp, ancien_mdp } = req.body;
  const id = req.user.id;

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ message: 'Compte introuvable' });

  if (email && email !== user.email) {
    const exist = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, id);
    if (exist) return res.status(400).json({ message: 'Cet email est déjà utilisé' });
  }

  let hash = user.mot_de_passe;
  if (nouveau_mdp) {
    if (!ancien_mdp) return res.status(400).json({ message: 'Ancien mot de passe requis' });
    if (!bcrypt.compareSync(ancien_mdp, user.mot_de_passe))
      return res.status(400).json({ message: 'Ancien mot de passe incorrect' });
    if (nouveau_mdp.length < 6) return res.status(400).json({ message: 'Mot de passe trop court (6 car. min)' });
    hash = bcrypt.hashSync(nouveau_mdp, 10);
  }

  db.prepare('UPDATE users SET nom=?, prenom=?, email=?, mot_de_passe=? WHERE id=?')
    .run(nom || user.nom, prenom || user.prenom, email || user.email, hash, id);

  res.json({ message: 'Compte mis à jour' });
}

module.exports = { getEntreprise, updateEntreprise, updateFonctionnalites, uploadLogoEntreprise, uploadCachetEntreprise, seedDemo, updateCompte, verifierHistoriquePin };
