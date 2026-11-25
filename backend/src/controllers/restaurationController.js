const { db } = require('../config/database');

// Module Restauration : carte, tables, commandes (sur place / à emporter / livraison), encaissement.
// Activé ou non par boutique depuis le Super Admin (feat_module_restauration).

const TYPES = ['sur_place', 'emporter', 'livraison'];
const STATUTS = ['en_attente', 'en_preparation', 'pret', 'servi', 'paye', 'annule'];
const OUVERTS = ['en_attente', 'en_preparation', 'pret', 'servi'];

// Bloque l'API si le module est désactivé pour cette boutique.
function moduleActif(req, res, next) {
  try {
    const e = db.prepare('SELECT feat_module_restauration FROM entreprise WHERE id = 1').get();
    if (e && e.feat_module_restauration === 1) return next();
  } catch { /* colonne absente : module inactif */ }
  res.status(403).json({ message: "Le module Restauration n'est pas activé pour cette boutique." });
}

function genNumero() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const base = `CMD-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const n = db.prepare('SELECT COUNT(*) as n FROM resto_commandes WHERE numero LIKE ?').get(`${base}%`).n;
  return `${base}-${String(n + 1).padStart(3, '0')}`;
}

// ── Carte ────────────────────────────────────────────────────────────
function getPlats(req, res) {
  try {
    res.json(db.prepare('SELECT * FROM resto_plats WHERE actif = 1 ORDER BY categorie, nom').all());
  } catch (err) { res.status(500).json({ message: err.message }); }
}

function savePlat(req, res) {
  const { nom, categorie, description, prix, disponible } = req.body;
  if (!nom || !String(nom).trim()) return res.status(400).json({ message: 'Nom requis' });
  const p = Number(prix);
  if (!Number.isFinite(p) || p < 0) return res.status(400).json({ message: 'Prix invalide' });
  try {
    if (req.params.id) {
      db.prepare('UPDATE resto_plats SET nom=?, categorie=?, description=?, prix=?, disponible=? WHERE id=?')
        .run(String(nom).trim(), categorie || 'Plats', description || '', p, disponible === 0 || disponible === false ? 0 : 1, req.params.id);
      res.json({ message: 'Plat mis à jour' });
    } else {
      const r = db.prepare('INSERT INTO resto_plats (nom, categorie, description, prix, disponible) VALUES (?,?,?,?,?)')
        .run(String(nom).trim(), categorie || 'Plats', description || '', p, disponible === 0 || disponible === false ? 0 : 1);
      res.status(201).json({ id: r.lastInsertRowid, message: 'Plat créé' });
    }
  } catch (err) { res.status(500).json({ message: err.message }); }
}

function deletePlat(req, res) {
  try {
    db.prepare('UPDATE resto_plats SET actif = 0 WHERE id = ?').run(req.params.id);
    res.json({ message: 'Plat retiré de la carte' });
  } catch (err) { res.status(500).json({ message: err.message }); }
}

// ── Tables ───────────────────────────────────────────────────────────
function getTables(req, res) {
  try {
    const tables = db.prepare(`
      SELECT t.*,
        (SELECT c.id FROM resto_commandes c
          WHERE c.table_id = t.id AND c.statut IN ('en_attente','en_preparation','pret','servi')
          ORDER BY c.id DESC LIMIT 1) AS commande_ouverte_id
      FROM resto_tables t WHERE t.actif = 1 ORDER BY t.zone, t.nom
    `).all();
    res.json(tables);
  } catch (err) { res.status(500).json({ message: err.message }); }
}

function saveTable(req, res) {
  const { nom, capacite, zone } = req.body;
  if (!nom || !String(nom).trim()) return res.status(400).json({ message: 'Nom requis' });
  try {
    if (req.params.id) {
      db.prepare('UPDATE resto_tables SET nom=?, capacite=?, zone=? WHERE id=?')
        .run(String(nom).trim(), Number(capacite) || 4, zone || 'Salle', req.params.id);
      res.json({ message: 'Table mise à jour' });
    } else {
      const r = db.prepare('INSERT INTO resto_tables (nom, capacite, zone) VALUES (?,?,?)')
        .run(String(nom).trim(), Number(capacite) || 4, zone || 'Salle');
      res.status(201).json({ id: r.lastInsertRowid, message: 'Table créée' });
    }
  } catch (err) { res.status(500).json({ message: err.message }); }
}

function deleteTable(req, res) {
  try {
    const ouverte = db.prepare("SELECT id FROM resto_commandes WHERE table_id = ? AND statut IN ('en_attente','en_preparation','pret','servi')").get(req.params.id);
    if (ouverte) return res.status(400).json({ message: 'Cette table a une commande en cours.' });
    db.prepare('UPDATE resto_tables SET actif = 0 WHERE id = ?').run(req.params.id);
    res.json({ message: 'Table supprimée' });
  } catch (err) { res.status(500).json({ message: err.message }); }
}

// ── Commandes ────────────────────────────────────────────────────────
function getCommandes(req, res) {
  try {
    const { statut, ouvertes, q, date } = req.query;
    let sql = `SELECT c.*, t.nom AS table_nom,
        (SELECT COUNT(*) FROM resto_commande_lignes WHERE commande_id = c.id) AS nb_lignes
      FROM resto_commandes c LEFT JOIN resto_tables t ON t.id = c.table_id WHERE 1=1`;
    const params = [];
    if (ouvertes) sql += " AND c.statut IN ('en_attente','en_preparation','pret','servi')";
    if (statut && STATUTS.includes(statut)) { sql += ' AND c.statut = ?'; params.push(statut); }
    if (date) { sql += ' AND date(c.created_at) = ?'; params.push(date); }
    if (q) { sql += ' AND (c.numero LIKE ? OR COALESCE(c.client_nom,"") LIKE ? OR COALESCE(t.nom,"") LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    sql += ' ORDER BY c.id DESC LIMIT 200';
    const rows = db.prepare(sql).all(...params);
    if (ouvertes) {
      const lig = db.prepare('SELECT nom, quantite, note FROM resto_commande_lignes WHERE commande_id = ?');
      rows.forEach(r => { r.lignes = lig.all(r.id); });
    }
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
}

function getCommande(req, res) {
  try {
    const c = db.prepare(`SELECT c.*, t.nom AS table_nom FROM resto_commandes c
      LEFT JOIN resto_tables t ON t.id = c.table_id WHERE c.id = ?`).get(req.params.id);
    if (!c) return res.status(404).json({ message: 'Commande introuvable' });
    c.lignes = db.prepare('SELECT * FROM resto_commande_lignes WHERE commande_id = ?').all(c.id);
    res.json(c);
  } catch (err) { res.status(500).json({ message: err.message }); }
}

function recalculer(commandeId, remise) {
  const s = db.prepare('SELECT COALESCE(SUM(quantite * prix_unitaire),0) AS s FROM resto_commande_lignes WHERE commande_id = ?').get(commandeId).s;
  const r = Math.min(Math.max(Number(remise) || 0, 0), s);
  db.prepare('UPDATE resto_commandes SET sous_total = ?, remise = ?, total = ? WHERE id = ?').run(s, r, s - r, commandeId);
}

function insererLignes(commandeId, lignes) {
  const plat = db.prepare('SELECT * FROM resto_plats WHERE id = ? AND actif = 1');
  const ins = db.prepare('INSERT INTO resto_commande_lignes (commande_id, plat_id, nom, quantite, prix_unitaire, note) VALUES (?,?,?,?,?,?)');
  for (const l of lignes) {
    const q = parseInt(l.quantite, 10);
    if (!(q > 0)) continue;
    const p = plat.get(l.plat_id);
    if (!p) throw new Error('Plat introuvable dans la carte');
    if (!p.disponible) throw new Error(`« ${p.nom} » est indisponible`);
    // Le prix vient toujours de la carte, jamais du client.
    ins.run(commandeId, p.id, p.nom, q, p.prix, l.note ? String(l.note).slice(0, 200) : null);
  }
}

function createCommande(req, res) {
  const { type, table_id, client_nom, client_telephone, adresse_livraison, notes, remise, lignes } = req.body;
  if (!TYPES.includes(type || 'sur_place')) return res.status(400).json({ message: 'Type de commande invalide' });
  const t = type || 'sur_place';
  if (!Array.isArray(lignes) || !lignes.some(l => parseInt(l.quantite, 10) > 0)) return res.status(400).json({ message: 'Ajoutez au moins un plat' });
  if (t === 'sur_place' && !table_id) return res.status(400).json({ message: 'Choisissez une table' });
  if (t === 'livraison' && !String(adresse_livraison || '').trim()) return res.status(400).json({ message: 'Adresse de livraison requise' });
  try {
    const id = db.transaction(() => {
      const r = db.prepare(`INSERT INTO resto_commandes (numero, type, table_id, client_nom, client_telephone, adresse_livraison, notes, user_id)
        VALUES (?,?,?,?,?,?,?,?)`)
        .run(genNumero(), t, t === 'sur_place' ? table_id : null, client_nom || null, client_telephone || null, adresse_livraison || null, notes || null, req.user?.id || null);
      insererLignes(r.lastInsertRowid, lignes);
      recalculer(r.lastInsertRowid, remise);
      return r.lastInsertRowid;
    })();
    res.status(201).json({ id, message: 'Commande envoyée en cuisine' });
  } catch (err) { res.status(400).json({ message: err.message }); }
}

// Ajoute des plats à une commande encore ouverte (la table recommande).
function ajouterLignes(req, res) {
  try {
    const c = db.prepare('SELECT * FROM resto_commandes WHERE id = ?').get(req.params.id);
    if (!c) return res.status(404).json({ message: 'Commande introuvable' });
    if (!OUVERTS.includes(c.statut)) return res.status(400).json({ message: 'Cette commande est clôturée' });
    db.transaction(() => {
      insererLignes(c.id, req.body.lignes || []);
      recalculer(c.id, c.remise);
      if (c.statut !== 'en_attente') db.prepare("UPDATE resto_commandes SET statut = 'en_attente' WHERE id = ?").run(c.id);
    })();
    res.json({ message: 'Plats ajoutés' });
  } catch (err) { res.status(400).json({ message: err.message }); }
}

function changerStatut(req, res) {
  const { statut } = req.body;
  if (!['en_attente', 'en_preparation', 'pret', 'servi', 'annule'].includes(statut)) return res.status(400).json({ message: 'Statut invalide (utilisez « encaisser » pour payer)' });
  try {
    const c = db.prepare('SELECT statut FROM resto_commandes WHERE id = ?').get(req.params.id);
    if (!c) return res.status(404).json({ message: 'Commande introuvable' });
    if (c.statut === 'paye') return res.status(400).json({ message: 'Commande déjà payée' });
    db.prepare('UPDATE resto_commandes SET statut = ? WHERE id = ?').run(statut, req.params.id);
    res.json({ message: 'Statut mis à jour' });
  } catch (err) { res.status(500).json({ message: err.message }); }
}

function encaisser(req, res) {
  const { mode_paiement, montant_paye, remise } = req.body;
  const modes = ['especes', 'mobile_money', 'carte'];
  if (!modes.includes(mode_paiement)) return res.status(400).json({ message: 'Mode de paiement invalide' });
  try {
    const c = db.prepare('SELECT * FROM resto_commandes WHERE id = ?').get(req.params.id);
    if (!c) return res.status(404).json({ message: 'Commande introuvable' });
    if (!OUVERTS.includes(c.statut)) return res.status(400).json({ message: 'Commande déjà clôturée' });
    db.transaction(() => {
      if (remise !== undefined) recalculer(c.id, remise);
      const total = db.prepare('SELECT total FROM resto_commandes WHERE id = ?').get(c.id).total;
      const recu = montant_paye === undefined || montant_paye === '' ? total : Number(montant_paye);
      if (!(recu >= total)) throw new Error('Montant reçu insuffisant');
      db.prepare("UPDATE resto_commandes SET statut='paye', mode_paiement=?, montant_paye=?, paye_at=CURRENT_TIMESTAMP WHERE id=?")
        .run(mode_paiement, recu, c.id);
    })();
    res.json({ message: 'Commande encaissée' });
  } catch (err) { res.status(400).json({ message: err.message }); }
}

function getStats(req, res) {
  try {
    const jour = db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS ca FROM resto_commandes WHERE statut='paye' AND date(paye_at)=date('now','localtime')").get();
    const mois = db.prepare("SELECT COALESCE(SUM(total),0) AS ca FROM resto_commandes WHERE statut='paye' AND strftime('%Y-%m', paye_at)=strftime('%Y-%m','now','localtime')").get();
    const ouvertes = db.prepare("SELECT COUNT(*) AS n FROM resto_commandes WHERE statut IN ('en_attente','en_preparation','pret','servi')").get().n;
    const cuisine = db.prepare("SELECT COUNT(*) AS n FROM resto_commandes WHERE statut IN ('en_attente','en_preparation')").get().n;
    const top = db.prepare(`SELECT l.nom, SUM(l.quantite) AS qte FROM resto_commande_lignes l
      JOIN resto_commandes c ON c.id = l.commande_id WHERE c.statut='paye' AND strftime('%Y-%m', c.paye_at)=strftime('%Y-%m','now','localtime')
      GROUP BY l.nom ORDER BY qte DESC LIMIT 5`).all();
    res.json({ commandes_jour: jour.n, ca_jour: jour.ca, ca_mois: mois.ca, ouvertes, en_cuisine: cuisine, top });
  } catch (err) { res.status(500).json({ message: err.message }); }
}

module.exports = {
  moduleActif, getPlats, savePlat, deletePlat, getTables, saveTable, deleteTable,
  getCommandes, getCommande, createCommande, ajouterLignes, changerStatut, encaisser, getStats,
};
