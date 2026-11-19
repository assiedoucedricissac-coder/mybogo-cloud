const { db } = require('../config/database');

function getActive(req, res) {
  try {
    const session = db.prepare(`
      SELECT s.*, u.nom as user_nom FROM sessions_caisse s
      LEFT JOIN users u ON s.user_id = u.id
      WHERE s.statut = 'ouvert'
      ORDER BY s.created_at DESC LIMIT 1
    `).get();
    if (!session) return res.json(null);

    // Règlements crédit rattachés à cette session (argent reçu en remboursement de dettes)
    const rc = db.prepare(`
      SELECT COALESCE(SUM(montant), 0) as total
      FROM paiements_credit
      WHERE session_id = ? AND mode_paiement IN ('especes','mixte')
    `).get(session.id);
    const reglements = db.prepare(`
      SELECT p.id, p.montant, p.mode_paiement, p.note, p.created_at, c.nom as client_nom
      FROM paiements_credit p
      JOIN clients c ON p.client_id = c.id
      WHERE p.session_id = ?
      ORDER BY p.created_at DESC
    `).all(session.id);

    // Règlements facture rattachés à cette session (client qui règle une facture en espèces —
    // cet argent entre dans le même tiroir-caisse mais n'était auparavant jamais compté).
    const rf = db.prepare(`
      SELECT COALESCE(SUM(montant), 0) as total
      FROM paiements_facture
      WHERE session_id = ? AND mode_paiement IN ('especes','mixte')
    `).get(session.id);
    const reglementsFacture = db.prepare(`
      SELECT pf.id, pf.montant, pf.mode_paiement, pf.note, pf.created_at, f.numero as facture_numero, c.nom as client_nom
      FROM paiements_facture pf
      JOIN factures f ON pf.facture_id = f.id
      LEFT JOIN clients c ON f.client_id = c.id
      WHERE pf.session_id = ?
      ORDER BY pf.created_at DESC
    `).all(session.id);

    res.json({
      ...session,
      total_reglements_credit: rc.total, reglements_credit: reglements,
      total_reglements_facture: rf.total, reglements_facture: reglementsFacture,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
}

function getHistorique(req, res) {
  try {
    const sessions = db.prepare(`
      SELECT s.*, u.nom as user_nom FROM sessions_caisse s
      LEFT JOIN users u ON s.user_id = u.id
      ORDER BY s.created_at DESC LIMIT 30
    `).all();
    res.json(sessions);
  } catch (err) { res.status(500).json({ message: err.message }); }
}

// Détail complet d'une session PASSÉE (ouverte ou déjà clôturée), avec le détail des
// règlements crédit/facture rattachés — sert à réimprimer l'arrêté d'un jour antérieur
// (le décompte billet par billet, lui, n'est jamais enregistré, seul le total l'est).
function getOne(req, res) {
  try {
    const session = db.prepare(`
      SELECT s.*, u.nom as user_nom FROM sessions_caisse s
      LEFT JOIN users u ON s.user_id = u.id
      WHERE s.id = ?
    `).get(req.params.id);
    if (!session) return res.status(404).json({ message: 'Session introuvable' });

    const reglements = db.prepare(`
      SELECT p.id, p.montant, p.mode_paiement, p.note, p.created_at, c.nom as client_nom
      FROM paiements_credit p JOIN clients c ON p.client_id = c.id
      WHERE p.session_id = ? ORDER BY p.created_at DESC
    `).all(session.id);
    const reglementsFacture = db.prepare(`
      SELECT pf.id, pf.montant, pf.mode_paiement, pf.note, pf.created_at, f.numero as facture_numero, c.nom as client_nom
      FROM paiements_facture pf JOIN factures f ON pf.facture_id = f.id
      LEFT JOIN clients c ON f.client_id = c.id
      WHERE pf.session_id = ? ORDER BY pf.created_at DESC
    `).all(session.id);

    res.json({ ...session, reglements_credit: reglements, reglements_facture: reglementsFacture });
  } catch (err) { res.status(500).json({ message: err.message }); }
}

function ouvrir(req, res) {
  try {
    const { fond_ouverture, note } = req.body;
    if (fond_ouverture === undefined || fond_ouverture === null) {
      return res.status(400).json({ message: 'Le fond de caisse est requis' });
    }
    const existing = db.prepare("SELECT id FROM sessions_caisse WHERE statut='ouvert'").get();
    if (existing) return res.status(400).json({ message: 'Une session est déjà ouverte' });
    const today = new Date().toISOString().slice(0, 10);
    const r = db.prepare(
      'INSERT INTO sessions_caisse (date, fond_ouverture, user_id, note) VALUES (?,?,?,?)'
    ).run(today, fond_ouverture, req.user.id, note || null);
    res.status(201).json({ id: r.lastInsertRowid, fond_ouverture, statut: 'ouvert' });
  } catch (err) { res.status(500).json({ message: err.message }); }
}

function cloturer(req, res) {
  try {
    const { fond_cloture, detail_billets } = req.body;
    if (fond_cloture === undefined || fond_cloture === null) {
      return res.status(400).json({ message: 'Le montant compté est requis' });
    }
    const session = db.prepare("SELECT * FROM sessions_caisse WHERE statut='ouvert' ORDER BY created_at DESC LIMIT 1").get();
    if (!session) return res.status(404).json({ message: 'Aucune session ouverte' });

    const result = db.prepare(`
      SELECT COALESCE(SUM(total), 0) as total
      FROM ventes
      WHERE mode_paiement IN ('especes','mixte')
      AND statut != 'annulee'
      AND date(created_at) >= date(?)
    `).get(session.created_at);
    const total_ventes = result.total || 0;

    const rc = db.prepare(`
      SELECT COALESCE(SUM(montant), 0) as total
      FROM paiements_credit
      WHERE session_id = ? AND mode_paiement IN ('especes','mixte')
    `).get(session.id);
    const total_reglements_credit = rc.total || 0;

    // Règlements sur factures encaissés en espèces pendant cette session — voir getActive()
    // pour l'explication du pourquoi (argent réel dans le tiroir, invisible auparavant).
    const rf = db.prepare(`
      SELECT COALESCE(SUM(montant), 0) as total
      FROM paiements_facture
      WHERE session_id = ? AND mode_paiement IN ('especes','mixte')
    `).get(session.id);
    const total_reglements_facture = rf.total || 0;

    const ecart = fond_cloture - (session.fond_ouverture + total_ventes + total_reglements_credit + total_reglements_facture);

    db.prepare(`
      UPDATE sessions_caisse
      SET fond_cloture=?, total_ventes=?, total_reglements_credit=?, total_reglements_facture=?, detail_billets=?, ecart=?, statut='clos', clos_a=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(fond_cloture, total_ventes, total_reglements_credit, total_reglements_facture, detail_billets ? JSON.stringify(detail_billets) : null, ecart, session.id);

    res.json({ fond_ouverture: session.fond_ouverture, total_ventes, total_reglements_credit, total_reglements_facture, fond_cloture, ecart });
  } catch (err) { res.status(500).json({ message: err.message }); }
}

// Correction d'une clôture déjà faite (le caissier s'est trompé en comptant les espèces) —
// on ne touche qu'au montant compté et on recalcule l'écart à partir des totaux DÉJÀ figés
// sur la session (ventes/règlements de CETTE session précise), jamais recalculés depuis la
// base — sinon on inclurait à tort des ventes d'une session suivante.
function corriger(req, res) {
  const { fond_cloture, detail_billets } = req.body;
  if (fond_cloture === undefined || fond_cloture === null) {
    return res.status(400).json({ message: 'Le montant compté est requis' });
  }
  const session = db.prepare('SELECT * FROM sessions_caisse WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ message: 'Session introuvable' });
  if (session.statut !== 'clos') return res.status(400).json({ message: 'Seule une session déjà clôturée peut être corrigée' });

  const ecart = fond_cloture - (session.fond_ouverture + (session.total_ventes || 0) + (session.total_reglements_credit || 0) + (session.total_reglements_facture || 0));
  db.prepare('UPDATE sessions_caisse SET fond_cloture=?, detail_billets=?, ecart=? WHERE id=?')
    .run(fond_cloture, detail_billets ? JSON.stringify(detail_billets) : session.detail_billets, ecart, req.params.id);
  res.json({ message: 'Clôture corrigée', fond_cloture, ecart });
}

// Suppression d'une clôture erronée — les règlements crédit/facture éventuellement rattachés
// à cette session sont détachés (session_id remis à NULL) plutôt que supprimés : l'argent
// encaissé et son historique restent intacts, seule l'appartenance à CETTE session disparaît.
function remove(req, res) {
  const session = db.prepare('SELECT * FROM sessions_caisse WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ message: 'Session introuvable' });
  if (session.statut !== 'clos') return res.status(400).json({ message: 'Seule une session déjà clôturée peut être supprimée' });

  const tx = db.transaction(() => {
    db.prepare('UPDATE paiements_credit SET session_id = NULL WHERE session_id = ?').run(req.params.id);
    db.prepare('UPDATE paiements_facture SET session_id = NULL WHERE session_id = ?').run(req.params.id);
    db.prepare('DELETE FROM sessions_caisse WHERE id = ?').run(req.params.id);
  });
  tx();
  res.json({ message: 'Session supprimée' });
}

module.exports = { getActive, getHistorique, getOne, ouvrir, cloturer, corriger, remove };
