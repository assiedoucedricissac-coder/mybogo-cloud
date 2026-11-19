const { db } = require('../config/database');
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const { genererNumero } = require('./achatController');

const uploadsDir = process.env.MYBOGO_UPLOADS_PATH || path.join(__dirname, '../../../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `produit_${req.params.id}_${Date.now()}${ext}`);
  }
});
const uploadMiddleware = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg','image/png','image/webp','image/gif'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Format non supporté (jpg, png, webp)'));
  }
}).single('photo');

function getAll(req, res) {
  const { search, categorie_id, actif, alerte } = req.query;
  let query = `SELECT p.*, c.nom as categorie_nom FROM produits p LEFT JOIN categories c ON p.categorie_id = c.id WHERE 1=1`;
  const params = [];
  if (search) { query += ` AND (p.nom LIKE ? OR p.code LIKE ? OR p.code_barres LIKE ?)`; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  if (categorie_id) { query += ` AND p.categorie_id = ?`; params.push(categorie_id); }
  if (actif !== undefined) { query += ` AND p.actif = ?`; params.push(actif); }
  if (alerte === 'rupture') { query += ` AND p.qte_actuelle = 0`; }
  if (alerte === 'faible') { query += ` AND p.qte_actuelle > 0 AND p.qte_actuelle <= p.qte_min`; }
  if (alerte === 'expire') { query += ` AND p.date_expiration IS NOT NULL AND date(p.date_expiration) <= date('now')`; }
  query += ` ORDER BY p.nom`;
  const produits = db.prepare(query).all(...params);
  res.json(produits);
}

function getOne(req, res) {
  const p = db.prepare('SELECT p.*, c.nom as categorie_nom FROM produits p LEFT JOIN categories c ON p.categorie_id = c.id WHERE p.id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ message: 'Produit introuvable' });
  res.json(p);
}

function create(req, res) {
  const { code, nom, prix_vente, prix_achat, categorie_id, unite, tva, qte_min, qte_max, qte_actuelle, marque, reference, code_barres, description, emplacement, date_expiration, prix_grossiste, prix_revendeur, is_fictif } = req.body;
  if (!code || !nom) return res.status(400).json({ message: 'Code et nom requis' });
  const exist = db.prepare('SELECT id FROM produits WHERE code = ?').get(code);
  if (exist) return res.status(400).json({ message: 'Code produit déjà utilisé' });
  const fictif = is_fictif ? 1 : 0;
  const qte = parseFloat(qte_actuelle) || 0;
  const pa = parseFloat(prix_achat) || 0;

  const tx = db.transaction(() => {
    // Le stock de départ (mise en place de l'inventaire) est inséré à 0 ici, puis posé par le
    // même mécanisme qu'un achat classique juste en dessous — pour que "Total des achats" et
    // "Valeur du stock" restent liés et cohérents dès la création, au lieu d'être déconnectés
    // comme avant (un simple ajustement de stock qui n'apparaissait dans aucun achat).
    const result = db.prepare(`INSERT INTO produits (code, nom, prix_vente, prix_achat, categorie_id, unite, tva, qte_min, qte_max, qte_actuelle, marque, reference, code_barres, description, emplacement, date_expiration, prix_grossiste, prix_revendeur, is_fictif)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(code, nom, prix_vente, pa, categorie_id || null, unite || 'pièce', tva || 18, qte_min || 5, qte_max || 1000, 0, marque || null, reference || null, code_barres || null, description || null, emplacement || null, date_expiration || null, prix_grossiste || null, prix_revendeur || null, fictif);
    const produitId = result.lastInsertRowid;

    if (qte > 0 && !fictif) {
      const numero = genererNumero();
      const total = qte * pa;
      const achatResult = db.prepare(`
        INSERT INTO achats (numero, fournisseur_id, user_id, sous_total, tva_total, total, note, montant_paye, mode_paiement, frais_livraison)
        VALUES (?,?,?,?,?,?,?,?,?,?)
      `).run(numero, null, req.user.id, total, 0, total, "Stock initial (reprise d'inventaire)", total, 'especes', 0);
      db.prepare('INSERT INTO lignes_achat (achat_id, produit_id, quantite, prix_unitaire, tva, total) VALUES (?,?,?,?,?,?)')
        .run(achatResult.lastInsertRowid, produitId, qte, pa, 0, total);
      db.prepare('UPDATE produits SET qte_actuelle=? WHERE id=?').run(qte, produitId);
      db.prepare('INSERT INTO mouvements_stock (produit_id, type, quantite, qte_avant, qte_apres, reference_doc, user_id) VALUES (?,?,?,?,?,?,?)')
        .run(produitId, 'achat', qte, 0, qte, numero, req.user.id);
    }

    return produitId;
  });

  const produitId = tx();
  res.status(201).json({ id: produitId, message: 'Produit créé' });
}

function update(req, res) {
  const p = db.prepare('SELECT id FROM produits WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ message: 'Produit introuvable' });
  const { nom, prix_vente, prix_achat, categorie_id, unite, tva, qte_min, qte_max, marque, reference, code_barres, description, emplacement, date_expiration, prix_grossiste, prix_revendeur, actif, is_fictif } = req.body;
  db.prepare(`UPDATE produits SET nom=?,prix_vente=?,prix_achat=?,categorie_id=?,unite=?,tva=?,qte_min=?,qte_max=?,marque=?,reference=?,code_barres=?,description=?,emplacement=?,date_expiration=?,prix_grossiste=?,prix_revendeur=?,actif=?,is_fictif=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(nom, prix_vente, prix_achat, categorie_id, unite, tva, qte_min, qte_max, marque, reference, code_barres, description, emplacement, date_expiration, prix_grossiste, prix_revendeur, actif, is_fictif ? 1 : 0, req.params.id);
  res.json({ message: 'Produit mis à jour' });
}

function purgeFictifs(req, res) {
  const fictifs = db.prepare('SELECT id, photo FROM produits WHERE is_fictif = 1').all();
  for (const p of fictifs) {
    if (p.photo) { try { fs.unlinkSync(path.join(uploadsDir, path.basename(p.photo))); } catch(_) {} }
    db.prepare('UPDATE lignes_facture SET produit_id = NULL WHERE produit_id = ?').run(p.id);
    db.prepare('DELETE FROM lignes_inventaire WHERE produit_id = ?').run(p.id);
    db.prepare('DELETE FROM lignes_achat WHERE produit_id = ?').run(p.id);
    db.prepare('DELETE FROM lignes_vente WHERE produit_id = ?').run(p.id);
    db.prepare('DELETE FROM mouvements_stock WHERE produit_id = ?').run(p.id);
    db.prepare('DELETE FROM conditionnements WHERE produit_id = ?').run(p.id);
    db.prepare('DELETE FROM produits WHERE id = ?').run(p.id);
  }
  res.json({ message: `${fictifs.length} produit(s) fictif(s) supprimé(s)`, count: fictifs.length });
}

function remove(req, res) {
  const p = db.prepare('SELECT photo FROM produits WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ message: 'Produit introuvable' });

  // Un produit déjà acheté ou vendu a un historique financier réel (montants, marges déjà
  // affichés dans les rapports). Le supprimer détruirait ces lignes pour de bon (achat_id et
  // vente_id ne peuvent pas être mis à NULL dans le schéma) — un achat resterait dans la liste
  // avec son total mais plus aucun article ni marge, comme vu chez un client en production.
  // On bloque et on propose de désactiver le produit à la place : il disparaît des listes
  // actives sans perdre une seule ligne d'historique.
  const aAchats = db.prepare('SELECT COUNT(*) as n FROM lignes_achat WHERE produit_id = ?').get(req.params.id).n;
  const aVentes = db.prepare('SELECT COUNT(*) as n FROM lignes_vente WHERE produit_id = ?').get(req.params.id).n;
  if (aAchats > 0 || aVentes > 0) {
    return res.status(400).json({
      message: `Suppression impossible : ce produit a déjà ${aAchats > 0 && aVentes > 0 ? 'des achats et des ventes enregistrés' : aAchats > 0 ? 'des achats enregistrés' : 'des ventes enregistrées'} — le supprimer effacerait cet historique. Désactivez-le plutôt (case "Actif" décochée dans sa fiche) pour qu'il disparaisse des listes sans perdre les données.`
    });
  }

  const supprimerTx = db.transaction(() => {
    const id = req.params.id;
    // lignes_facture.produit_id accepte NULL (on garde la ligne, juste détachée du produit).
    // lignes_vente.produit_id est NOT NULL dans le schéma : on ne peut pas la mettre à NULL,
    // il faut supprimer la ligne — sinon la suppression du produit échoue (contrainte NOT NULL)
    // dès qu'il a déjà été vendu une seule fois, ce qui bloquait toute suppression.
    db.prepare('UPDATE lignes_facture SET produit_id = NULL WHERE produit_id = ?').run(id);
    db.prepare('DELETE FROM lignes_vente WHERE produit_id = ?').run(id);
    db.prepare('DELETE FROM lignes_inventaire WHERE produit_id = ?').run(id);
    db.prepare('DELETE FROM lignes_achat WHERE produit_id = ?').run(id);
    db.prepare('DELETE FROM mouvements_stock WHERE produit_id = ?').run(id);
    db.prepare('DELETE FROM conditionnements WHERE produit_id = ?').run(id);
    db.prepare('DELETE FROM produits WHERE id = ?').run(id);
  });

  try {
    supprimerTx();
    if (p.photo) {
      try { fs.unlinkSync(path.join(uploadsDir, path.basename(p.photo))); } catch(_) {}
    }
    res.json({ message: 'Produit supprimé' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur lors de la suppression : ' + err.message });
  }
}

function ajusterStock(req, res) {
  const { quantite, motif, type } = req.body;
  const p = db.prepare('SELECT id, qte_actuelle FROM produits WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ message: 'Produit introuvable' });
  const qte_avant = p.qte_actuelle;
  const qte_apres = ['sortie', 'casse'].includes(type) ? qte_avant - quantite : qte_avant + quantite;
  if (qte_apres < 0) return res.status(400).json({ message: 'Stock insuffisant' });
  db.prepare('UPDATE produits SET qte_actuelle=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(qte_apres, p.id);
  db.prepare('INSERT INTO mouvements_stock (produit_id, type, quantite, qte_avant, qte_apres, motif, user_id) VALUES (?,?,?,?,?,?,?)').run(p.id, type || 'ajustement', quantite, qte_avant, qte_apres, motif || '', req.user.id);
  res.json({ message: 'Stock ajusté', qte_apres });
}

function getMouvements(req, res) {
  const mvts = db.prepare(`SELECT m.*, p.nom as produit_nom, u.nom as user_nom FROM mouvements_stock m JOIN produits p ON m.produit_id=p.id LEFT JOIN users u ON m.user_id=u.id WHERE m.produit_id=? ORDER BY m.created_at DESC LIMIT 50`).all(req.params.id);
  res.json(mvts);
}

function getCategories(req, res) {
  const cats = db.prepare('SELECT * FROM categories ORDER BY nom').all();
  res.json(cats);
}

function createCategorie(req, res) {
  const { nom, description } = req.body;
  if (!nom) return res.status(400).json({ message: 'Nom requis' });
  const result = db.prepare('INSERT INTO categories (nom, description) VALUES (?,?)').run(nom, description || null);
  res.status(201).json({ id: result.lastInsertRowid, message: 'Catégorie créée' });
}

function uploadPhoto(req, res) {
  uploadMiddleware(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message });
    if (!req.file) return res.status(400).json({ message: 'Aucun fichier reçu' });
    const photoUrl = `/uploads/${req.file.filename}`;
    // Supprimer l'ancienne photo
    const old = db.prepare('SELECT photo FROM produits WHERE id = ?').get(req.params.id);
    if (old?.photo) {
      try { fs.unlinkSync(path.join(uploadsDir, path.basename(old.photo))); } catch(_) {}
    }
    db.prepare('UPDATE produits SET photo=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(photoUrl, req.params.id);
    res.json({ photo: photoUrl });
  });
}

function supprimerPhoto(req, res) {
  const p = db.prepare('SELECT photo FROM produits WHERE id = ?').get(req.params.id);
  if (p?.photo) {
    try { fs.unlinkSync(path.join(uploadsDir, path.basename(p.photo))); } catch(_) {}
  }
  db.prepare('UPDATE produits SET photo=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(req.params.id);
  res.json({ message: 'Photo supprimée' });
}

module.exports = { getAll, getOne, create, update, remove, purgeFictifs, ajusterStock, getMouvements, getCategories, createCategorie, uploadPhoto, supprimerPhoto };
