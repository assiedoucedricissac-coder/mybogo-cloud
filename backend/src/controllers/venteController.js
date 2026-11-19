const { db } = require('../config/database');

function genererNumero() {
  const date = new Date();
  const prefix = `FAC${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}`;
  const last = db.prepare(`SELECT numero FROM ventes WHERE numero LIKE ? ORDER BY id DESC LIMIT 1`).get(`${prefix}%`);
  const seq = last ? parseInt(last.numero.slice(-4)) + 1 : 1;
  return `${prefix}${String(seq).padStart(4,'0')}`;
}

function getAll(req, res) {
  const { date_debut, date_fin, statut, client_id } = req.query;
  let query = `
    SELECT v.*, c.nom as client_nom, u.nom as user_nom,
      (SELECT GROUP_CONCAT(p.nom, ' · ')
       FROM lignes_vente lv JOIN produits p ON lv.produit_id=p.id
       WHERE lv.vente_id=v.id) as produits_resume
    FROM ventes v
    LEFT JOIN clients c ON v.client_id=c.id
    LEFT JOIN users u ON v.user_id=u.id
    WHERE 1=1`;
  const params = [];
  if (date_debut) { query += ` AND date(v.created_at) >= ?`; params.push(date_debut); }
  if (date_fin) { query += ` AND date(v.created_at) <= ?`; params.push(date_fin); }
  if (statut) { query += ` AND v.statut = ?`; params.push(statut); }
  if (client_id) { query += ` AND v.client_id = ?`; params.push(client_id); }
  query += ` ORDER BY v.created_at DESC LIMIT 200`;
  res.json(db.prepare(query).all(...params));
}

function getOne(req, res) {
  const vente = db.prepare(`SELECT v.*, c.nom as client_nom, c.telephone as client_tel, c.adresse as client_adresse, u.nom as user_nom FROM ventes v LEFT JOIN clients c ON v.client_id=c.id LEFT JOIN users u ON v.user_id=u.id WHERE v.id=?`).get(req.params.id);
  if (!vente) return res.status(404).json({ message: 'Vente introuvable' });
  const lignes = db.prepare(`SELECT l.*, p.nom as produit_nom, p.code FROM lignes_vente l JOIN produits p ON l.produit_id=p.id WHERE l.vente_id=?`).all(req.params.id);
  res.json({ ...vente, lignes });
}

function create(req, res) {
  const { client_id, lignes, remise, mode_paiement, montant_paye, note } = req.body;
  if (!lignes || !lignes.length) return res.status(400).json({ message: 'Au moins un article requis' });

  const createVente = db.transaction(() => {
    let sous_total = 0;
    for (const l of lignes) {
      const p = db.prepare('SELECT id, prix_vente, qte_actuelle, nom FROM produits WHERE id = ?').get(l.produit_id);
      if (!p) throw new Error(`Produit ID ${l.produit_id} introuvable`);
      if (p.qte_actuelle < l.quantite) throw new Error(`Stock insuffisant pour ${p.nom}`);
      const prix = l.prix_unitaire || p.prix_vente;
      const remiseLigne = l.remise || 0;
      sous_total += prix * l.quantite * (1 - remiseLigne / 100);
    }
    const remiseGlobale = remise || 0;
    const total = sous_total * (1 - remiseGlobale / 100);
    const numero = genererNumero();
    const isCredit = mode_paiement === 'credit';
    const paye = isCredit ? (parseFloat(montant_paye) || 0) : (parseFloat(montant_paye) || total);
    const statut_vente = paye < total ? 'partielle' : 'payee';

    // Vérifier la limite de crédit avant d'insérer
    if (client_id && paye < total) {
      const cli = db.prepare('SELECT solde, limite_credit, nom FROM clients WHERE id = ?').get(client_id);
      if (cli && cli.limite_credit > 0) {
        const detteActuelle = cli.solde < 0 ? -cli.solde : 0;
        const nouvelleDette = detteActuelle + (total - paye);
        if (nouvelleDette > cli.limite_credit) {
          const fmt = n => new Intl.NumberFormat('fr-FR').format(Math.round(n));
          throw new Error(`Limite de crédit dépassée pour ${cli.nom}. Limite : ${fmt(cli.limite_credit)} FCFA — Créance actuelle : ${fmt(detteActuelle)} FCFA — Reste disponible : ${fmt(cli.limite_credit - detteActuelle)} FCFA`);
        }
      }
    }

    const venteResult = db.prepare(`INSERT INTO ventes (numero, client_id, user_id, sous_total, remise, tva_total, total, montant_paye, monnaie, mode_paiement, statut, note)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(numero, client_id || null, req.user.id, sous_total, remiseGlobale, 0, total, paye, paye - total, mode_paiement || 'especes', statut_vente, note || null);
    const venteId = venteResult.lastInsertRowid;

    for (const l of lignes) {
      const p = db.prepare('SELECT prix_vente, prix_achat, qte_actuelle FROM produits WHERE id = ?').get(l.produit_id);
      const prix = l.prix_unitaire || p.prix_vente;
      const total_ligne = prix * l.quantite * (1 - (l.remise||0)/100);
      const contenance = parseInt(l.contenance) || 1;
      const unite_libelle = l.unite_libelle || 'unité';
      const qte_a_deduire = l.quantite * contenance;
      if (p.qte_actuelle < qte_a_deduire) throw new Error(`Stock insuffisant pour "${p.nom}" (stock : ${p.qte_actuelle}, demandé : ${qte_a_deduire})`);
      // Coût d'achat exact : cherche le prix_achat du conditionnement (Carton=12600, pas 48×263=12624)
      let cout_achat = 0;
      const cond = db.prepare('SELECT prix_achat FROM conditionnements WHERE produit_id=? AND libelle=? AND actif=1 LIMIT 1').get(l.produit_id, unite_libelle);
      if (cond && cond.prix_achat > 0) {
        cout_achat = l.quantite * cond.prix_achat;
      } else {
        cout_achat = l.quantite * contenance * (p.prix_achat || 0);
      }
      db.prepare('INSERT INTO lignes_vente (vente_id, produit_id, quantite, prix_unitaire, remise, tva, total, contenance, unite_libelle, cout_achat) VALUES (?,?,?,?,?,?,?,?,?,?)').run(venteId, l.produit_id, l.quantite, prix, l.remise||0, 0, total_ligne, contenance, unite_libelle, cout_achat);
      const qte_avant = p.qte_actuelle;
      const qte_apres = qte_avant - qte_a_deduire;
      db.prepare('UPDATE produits SET qte_actuelle=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(qte_apres, l.produit_id);
      db.prepare('INSERT INTO mouvements_stock (produit_id, type, quantite, qte_avant, qte_apres, reference_doc, user_id) VALUES (?,?,?,?,?,?,?)').run(l.produit_id, 'vente', qte_a_deduire, qte_avant, qte_apres, numero, req.user.id);
      db.prepare(`
        UPDATE lignes_inventaire
        SET qte_systeme = ?,
            ecart = CASE WHEN qte_comptee IS NOT NULL THEN qte_comptee - ? ELSE NULL END
        WHERE produit_id = ?
        AND inventaire_id IN (SELECT id FROM inventaires WHERE statut IN ('brouillon','soumis'))
      `).run(qte_apres, qte_apres, l.produit_id);
    }

    if (client_id) {
      db.prepare('UPDATE clients SET points_fidelite = points_fidelite + ?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(Math.floor(total/1000), client_id);
      // Si vente à crédit ou paiement partiel: mettre à jour la dette du client (solde négatif = il doit de l'argent)
      if (paye < total) {
        const dette = total - paye;
        db.prepare('UPDATE clients SET solde = solde - ?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(dette, client_id);
      }
    }

    db.prepare('INSERT INTO journal_activites (user_id, action, module, details) VALUES (?,?,?,?)').run(req.user.id, 'creation_vente', 'ventes', `Vente ${numero} - ${total} FCFA`);

    return { id: venteId, numero, total };
  });

  try {
    const result = createVente();
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

function annuler(req, res) {
  const vente = db.prepare('SELECT * FROM ventes WHERE id=?').get(req.params.id);
  if (!vente) return res.status(404).json({ message: 'Vente introuvable' });
  if (vente.statut === 'annulee') return res.status(400).json({ message: 'Vente déjà annulée' });

  const annulerTx = db.transaction(() => {
    const lignes = db.prepare('SELECT * FROM lignes_vente WHERE vente_id=?').all(vente.id);
    for (const l of lignes) {
      const p = db.prepare('SELECT qte_actuelle FROM produits WHERE id=?').get(l.produit_id);
      const contenance = l.contenance || 1;
      const qte_a_retourner = l.quantite * contenance;
      const qte_avant = p.qte_actuelle;
      const qte_apres = qte_avant + qte_a_retourner;
      db.prepare('UPDATE produits SET qte_actuelle=? WHERE id=?').run(qte_apres, l.produit_id);
      db.prepare('INSERT INTO mouvements_stock (produit_id, type, quantite, qte_avant, qte_apres, reference_doc, motif, user_id) VALUES (?,?,?,?,?,?,?,?)').run(l.produit_id, 'retour_client', qte_a_retourner, qte_avant, qte_apres, vente.numero, 'Annulation vente', req.user.id);
    }
    db.prepare('UPDATE ventes SET statut=? WHERE id=?').run('annulee', vente.id);
    // Si vente à crédit: rembourser la dette du client
    if (vente.client_id && vente.montant_paye < vente.total) {
      const dette = vente.total - vente.montant_paye;
      db.prepare('UPDATE clients SET solde = solde + ?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(dette, vente.client_id);
    }
  });

  try {
    annulerTx();
    res.json({ message: 'Vente annulée' });
  } catch (err) { res.status(500).json({ message: err.message }); }
}

// Suppression DÉFINITIVE (contrairement à "annuler" qui ne fait que marquer le statut et garde
// la trace) — réservée aux ventes déjà annulées : le stock a donc déjà été restitué par
// annuler(), pas besoin d'y retoucher ici. Refusée si une facture ou un règlement crédit est
// encore rattaché à cette vente, pour ne jamais casser une pièce comptable liée.
function supprimer(req, res) {
  const vente = db.prepare('SELECT * FROM ventes WHERE id=?').get(req.params.id);
  if (!vente) return res.status(404).json({ message: 'Vente introuvable' });
  if (vente.statut !== 'annulee') {
    return res.status(400).json({ message: 'Annulez d\'abord cette vente avant de pouvoir la supprimer définitivement' });
  }
  const factureLiee = db.prepare('SELECT id FROM factures WHERE vente_id=? LIMIT 1').get(vente.id);
  if (factureLiee) return res.status(400).json({ message: 'Impossible : une facture est rattachée à cette vente' });
  const paiementLie = db.prepare('SELECT id FROM paiements_credit WHERE vente_id=? LIMIT 1').get(vente.id);
  if (paiementLie) return res.status(400).json({ message: 'Impossible : un règlement crédit est rattaché à cette vente' });

  try {
    db.prepare('INSERT INTO journal_activites (user_id,action,module,details) VALUES (?,?,?,?)')
      .run(req.user.id, 'suppression_vente', 'ventes', `${vente.numero} - ${vente.total} FCFA`);
    db.prepare('DELETE FROM ventes WHERE id=?').run(vente.id); // lignes_vente supprimées en cascade
    res.json({ message: 'Vente supprimée définitivement' });
  } catch (err) { res.status(500).json({ message: err.message }); }
}

module.exports = { getAll, getOne, create, annuler, supprimer };
