const { db } = require('../config/database');
const { genererNumero } = require('./facturationController');

function getAll(req, res) {
  const { search } = req.query;
  let query = `SELECT c.*,
      COALESCE((SELECT SUM(f.total - f.montant_paye) FROM factures f
                WHERE f.client_id = c.id AND f.type = 'facture' AND f.statut IN ('emise','partielle')), 0) as dette_factures
    FROM clients c WHERE c.actif = 1`;
  const params = [];
  if (search) { query += ' AND (nom LIKE ? OR telephone LIKE ? OR email LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  query += ' ORDER BY nom';
  res.json(db.prepare(query).all(...params));
}

function getOne(req, res) {
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!client) return res.status(404).json({ message: 'Client introuvable' });
  const ventes = db.prepare('SELECT id, numero, total, montant_paye, statut, created_at FROM ventes WHERE client_id = ? ORDER BY created_at DESC LIMIT 20').all(req.params.id);
  const paiements = db.prepare('SELECT * FROM paiements_credit WHERE client_id = ? ORDER BY created_at DESC LIMIT 30').all(req.params.id);
  const factures = db.prepare(`SELECT id, numero, type, total, montant_paye, statut, created_at FROM factures WHERE client_id = ? AND type = 'facture' ORDER BY created_at DESC LIMIT 20`).all(req.params.id);
  const paiementsFacture = db.prepare(`
    SELECT pf.*, f.numero as facture_numero FROM paiements_facture pf
    JOIN factures f ON pf.facture_id = f.id
    WHERE f.client_id = ? ORDER BY pf.created_at DESC LIMIT 30
  `).all(req.params.id);
  const dette_factures = factures.reduce((s, f) => s + (['emise','partielle'].includes(f.statut) ? (f.total - (f.montant_paye || 0)) : 0), 0);
  // Historique des reçus de règlement (un document "recu" est créé à chaque versement, cf.
  // ajouterPaiement ci-dessous) — permet de réimprimer le ticket de n'importe quel versement
  // passé, pas seulement le tout dernier.
  const recus = db.prepare(`SELECT id, numero, total, mode_paiement, note, created_at FROM factures WHERE client_id = ? AND type = 'recu' ORDER BY created_at DESC LIMIT 50`).all(req.params.id);
  res.json({ ...client, dette_factures, ventes, paiements, factures, paiements_facture: paiementsFacture, recus });
}

function create(req, res) {
  const { nom, telephone, email, adresse, numero_contribuable, limite_credit } = req.body;
  if (!nom) return res.status(400).json({ message: 'Nom requis' });
  const result = db.prepare('INSERT INTO clients (nom, telephone, email, adresse, numero_contribuable, limite_credit) VALUES (?,?,?,?,?,?)').run(nom, telephone||null, email||null, adresse||null, numero_contribuable||null, limite_credit||0);
  res.status(201).json({ id: result.lastInsertRowid, message: 'Client créé' });
}

function update(req, res) {
  const { nom, telephone, email, adresse, numero_contribuable, limite_credit } = req.body;
  const c = db.prepare('SELECT id FROM clients WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ message: 'Client introuvable' });
  db.prepare('UPDATE clients SET nom=?,telephone=?,email=?,adresse=?,numero_contribuable=?,limite_credit=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(nom, telephone, email, adresse, numero_contribuable, limite_credit, req.params.id);
  res.json({ message: 'Client mis à jour' });
}

function remove(req, res) {
  db.prepare('UPDATE clients SET actif=0 WHERE id=?').run(req.params.id);
  res.json({ message: 'Client supprimé' });
}

function ajouterPaiement(req, res) {
  const { montant, mode_paiement, note, vente_id } = req.body;
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!client) return res.status(404).json({ message: 'Client introuvable' });
  const mt = parseFloat(montant);
  if (!mt || mt <= 0) return res.status(400).json({ message: 'Montant invalide' });

  const activeSession = db.prepare("SELECT id FROM sessions_caisse WHERE statut='ouvert' ORDER BY created_at DESC LIMIT 1").get();
  const session_id = activeSession?.id || null;

  const tx = db.transaction(() => {
    if (vente_id) {
      // Paiement ciblé sur une vente précise (comportement inchangé)
      db.prepare('INSERT INTO paiements_credit (client_id, vente_id, montant, mode_paiement, note, user_id, session_id) VALUES (?,?,?,?,?,?,?)')
        .run(req.params.id, vente_id, mt, mode_paiement || 'especes', note || null, req.user.id, session_id);
      db.prepare('UPDATE clients SET solde = solde + ?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(mt, req.params.id);
      const v = db.prepare('SELECT total, montant_paye FROM ventes WHERE id = ?').get(vente_id);
      if (v) {
        const nouveau_paye = (v.montant_paye || 0) + mt;
        const nouveau_statut = nouveau_paye >= v.total ? 'payee' : 'partielle';
        db.prepare('UPDATE ventes SET montant_paye=?, statut=? WHERE id=?').run(nouveau_paye, nouveau_statut, vente_id);
      }
    } else {
      // Paiement générique depuis la fiche client : on règle d'abord les factures
      // impayées les plus anciennes, puis ce qui reste réduit la dette liée aux ventes.
      let restant = mt;
      const facturesImpayees = db.prepare(`
        SELECT id, total, montant_paye FROM factures
        WHERE client_id = ? AND type = 'facture' AND statut IN ('emise','partielle')
        ORDER BY created_at ASC
      `).all(req.params.id);

      for (const f of facturesImpayees) {
        if (restant <= 0) break;
        const resteFacture = f.total - (f.montant_paye || 0);
        if (resteFacture <= 0) continue;
        const alloue = Math.min(restant, resteFacture);
        db.prepare('INSERT INTO paiements_facture (facture_id, montant, mode_paiement, note, user_id, session_id) VALUES (?,?,?,?,?,?)')
          .run(f.id, alloue, mode_paiement || 'especes', note || null, req.user.id, session_id);
        const nouveauPaye = (f.montant_paye || 0) + alloue;
        const nouveauStatut = nouveauPaye >= f.total ? 'payee' : 'partielle';
        db.prepare('UPDATE factures SET montant_paye=?, statut=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(nouveauPaye, nouveauStatut, f.id);
        restant -= alloue;
      }

      if (restant > 0) {
        db.prepare('INSERT INTO paiements_credit (client_id, vente_id, montant, mode_paiement, note, user_id, session_id) VALUES (?,?,?,?,?,?,?)')
          .run(req.params.id, null, restant, mode_paiement || 'especes', note || null, req.user.id, session_id);
        db.prepare('UPDATE clients SET solde = solde + ?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(restant, req.params.id);
      }
    }

    // Génère un Reçu imprimable pour ce règlement, quelle que soit la façon dont il a été affecté.
    const numero = genererNumero('recu');
    const motif = note || 'Règlement reçu';
    const r = db.prepare(`
      INSERT INTO factures (numero,type,client_id,user_id,regime_tva,sous_total,total,montant_paye,mode_paiement,statut,note)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(numero, 'recu', req.params.id, req.user.id, 'exonere', mt, mt, mt, mode_paiement || 'especes', 'payee', motif);
    const recuId = r.lastInsertRowid;
    db.prepare(`
      INSERT INTO lignes_facture (facture_id,designation,quantite,unite,prix_ht,montant_ht,montant_tva,montant_ttc)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(recuId, motif, 1, 'pièce', mt, mt, 0, mt);

    return recuId;
  });

  try {
    const recuId = tx();
    const clientMaj = db.prepare('SELECT solde FROM clients WHERE id = ?').get(req.params.id);
    res.json({ message: 'Paiement enregistré', solde: clientMaj.solde, recu_id: recuId });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

function getPaiements(req, res) {
  const paiements = db.prepare('SELECT p.*, v.numero as vente_numero FROM paiements_credit p LEFT JOIN ventes v ON p.vente_id = v.id WHERE p.client_id = ? ORDER BY p.created_at DESC').all(req.params.id);
  res.json(paiements);
}

module.exports = { getAll, getOne, create, update, remove, ajouterPaiement, getPaiements };
