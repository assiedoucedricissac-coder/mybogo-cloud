const { db } = require('../config/database');

function genNumero() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const base = `LOC-${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`;
  const existing = db.prepare(`SELECT COUNT(*) as n FROM location_contrats WHERE numero LIKE ?`).get(`${base}%`);
  return `${base}-${String(existing.n + 1).padStart(3, '0')}`;
}

function getArticles(req, res) {
  try {
    const articles = db.prepare(`
      SELECT a.*,
        COALESCE((
          SELECT SUM(cl.quantite - cl.quantite_rendue)
          FROM location_contrat_lignes cl
          JOIN location_contrats c ON c.id = cl.contrat_id
          WHERE cl.article_id = a.id AND c.statut IN ('reserve','en_cours')
        ), 0) as stock_en_location
      FROM location_articles a
      WHERE a.actif = 1
      ORDER BY a.categorie, a.nom
    `).all();
    res.json(articles);
  } catch (err) { res.status(500).json({ message: err.message }); }
}

function saveArticle(req, res) {
  const { nom, categorie, description, stock_total, prix_location, unite } = req.body;
  if (!nom) return res.status(400).json({ message: 'Nom requis' });
  try {
    if (req.params.id) {
      db.prepare(`UPDATE location_articles SET nom=?, categorie=?, description=?, stock_total=?, prix_location=?, unite=? WHERE id=?`)
        .run(nom, categorie||'Général', description||'', Number(stock_total)||0, Number(prix_location)||0, unite||'pièce', req.params.id);
      res.json({ message: 'Article mis à jour' });
    } else {
      const r = db.prepare(`INSERT INTO location_articles (nom, categorie, description, stock_total, prix_location, unite) VALUES (?,?,?,?,?,?)`)
        .run(nom, categorie||'Général', description||'', Number(stock_total)||0, Number(prix_location)||0, unite||'pièce');
      res.status(201).json({ id: r.lastInsertRowid, message: 'Article créé' });
    }
  } catch (err) { res.status(500).json({ message: err.message }); }
}

function deleteArticle(req, res) {
  try {
    db.prepare('UPDATE location_articles SET actif=0 WHERE id=?').run(req.params.id);
    res.json({ message: 'Article archivé' });
  } catch (err) { res.status(500).json({ message: err.message }); }
}

function getContrats(req, res) {
  try {
    const { statut, q } = req.query;
    let sql = `SELECT c.*, (SELECT COUNT(*) FROM location_contrat_lignes WHERE contrat_id=c.id) as nb_articles FROM location_contrats c WHERE 1=1`;
    const params = [];
    if (statut) { sql += ' AND c.statut=?'; params.push(statut); }
    if (q) { sql += ' AND (c.client_nom LIKE ? OR c.numero LIKE ? OR COALESCE(c.event_nom,"") LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    sql += ' ORDER BY c.created_at DESC LIMIT 200';
    res.json(db.prepare(sql).all(...params));
  } catch (err) { res.status(500).json({ message: err.message }); }
}

function getContrat(req, res) {
  try {
    const c = db.prepare('SELECT * FROM location_contrats WHERE id=?').get(req.params.id);
    if (!c) return res.status(404).json({ message: 'Contrat introuvable' });
    const lignes = db.prepare(`
      SELECT cl.*, a.nom as article_nom, a.unite, a.categorie
      FROM location_contrat_lignes cl
      JOIN location_articles a ON a.id=cl.article_id
      WHERE cl.contrat_id=?
    `).all(req.params.id);
    res.json({ ...c, lignes });
  } catch (err) { res.status(500).json({ message: err.message }); }
}

function createContrat(req, res) {
  const { client_nom, client_telephone, event_nom, event_lieu, date_debut, date_fin, acompte, notes, lignes } = req.body;
  if (!client_nom || !date_debut || !date_fin) return res.status(400).json({ message: 'Client et dates requis' });
  if (!lignes || lignes.length === 0) return res.status(400).json({ message: 'Ajoutez au moins un article' });
  try {
    const numero = genNumero();
    const montant_total = lignes.reduce((s, l) => s + (Number(l.prix_unitaire) * Number(l.quantite)), 0);
    const r = db.prepare(`INSERT INTO location_contrats (numero, client_nom, client_telephone, event_nom, event_lieu, date_debut, date_fin, acompte, montant_total, notes, user_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(numero, client_nom, client_telephone||'', event_nom||'', event_lieu||'', date_debut, date_fin, Number(acompte)||0, montant_total, notes||'', req.user.id);
    const contratId = r.lastInsertRowid;
    const ins = db.prepare(`INSERT INTO location_contrat_lignes (contrat_id, article_id, quantite, prix_unitaire) VALUES (?,?,?,?)`);
    for (const l of lignes) ins.run(contratId, l.article_id, Number(l.quantite), Number(l.prix_unitaire));
    res.status(201).json({ id: contratId, numero, message: 'Contrat créé' });
  } catch (err) { res.status(500).json({ message: err.message }); }
}

function updateContrat(req, res) {
  const { client_nom, client_telephone, event_nom, event_lieu, date_debut, date_fin, acompte, notes, statut } = req.body;
  try {
    db.prepare(`UPDATE location_contrats SET client_nom=?, client_telephone=?, event_nom=?, event_lieu=?, date_debut=?, date_fin=?, acompte=?, notes=?, statut=? WHERE id=?`)
      .run(client_nom, client_telephone||'', event_nom||'', event_lieu||'', date_debut, date_fin, Number(acompte)||0, notes||'', statut, req.params.id);
    res.json({ message: 'Contrat mis à jour' });
  } catch (err) { res.status(500).json({ message: err.message }); }
}

function enregistrerRetour(req, res) {
  const { retours } = req.body;
  if (!retours || retours.length === 0) return res.status(400).json({ message: 'Données de retour requises' });
  try {
    const upd = db.prepare(`UPDATE location_contrat_lignes SET quantite_rendue=?, quantite_manquante=? WHERE id=?`);
    for (const r of retours) upd.run(Number(r.quantite_rendue)||0, Number(r.quantite_manquante)||0, r.ligne_id);
    db.prepare(`UPDATE location_contrats SET statut='retourne' WHERE id=?`).run(req.params.id);
    res.json({ message: 'Retour enregistré' });
  } catch (err) { res.status(500).json({ message: err.message }); }
}

function getStats(req, res) {
  try {
    const actifs      = db.prepare(`SELECT COUNT(*) as n FROM location_contrats WHERE statut IN ('reserve','en_cours')`).get().n;
    const retours_dus = db.prepare(`SELECT COUNT(*) as n FROM location_contrats WHERE statut IN ('reserve','en_cours') AND date_fin < date('now')`).get().n;
    const total       = db.prepare(`SELECT COUNT(*) as n FROM location_contrats WHERE statut != 'annule'`).get().n;
    const ca_mois     = db.prepare(`SELECT COALESCE(SUM(montant_total),0) as s FROM location_contrats WHERE statut != 'annule' AND strftime('%Y-%m', created_at)=strftime('%Y-%m','now')`).get().s;
    res.json({ actifs, retours_dus, total, ca_mois });
  } catch (err) { res.status(500).json({ message: err.message }); }
}

module.exports = { getArticles, saveArticle, deleteArticle, getContrats, getContrat, createContrat, updateContrat, enregistrerRetour, getStats };
