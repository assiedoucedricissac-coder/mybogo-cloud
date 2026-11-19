const { db } = require('../config/database');

function getStats(req, res) {
  try {
    // "Aujourd'hui" doit suivre le calendrier LOCAL de la machine, pas le calendrier UTC :
    // created_at est enregistré en UTC par SQLite (CURRENT_TIMESTAMP), donc new Date().toISOString()
    // décale "aujourd'hui" d'un jour pendant les heures qui suivent minuit dans tout fuseau
    // différent de UTC+0 (ex: 1h du matin en France = encore la veille en UTC). On calcule donc
    // le repère du jour en heure locale, et on convertit created_at en heure locale (date(col,
    // 'localtime')) avant de comparer, pour que les deux bouts se rejoignent correctement.
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const firstOfMonth = today.slice(0, 7) + '-01';

    const ca_jour        = db.prepare(`SELECT COALESCE(SUM(total),0) as val FROM ventes WHERE date(created_at,'localtime') = ? AND statut != 'annulee'`).get(today);
    const ca_mois        = db.prepare(`SELECT COALESCE(SUM(total),0) as val FROM ventes WHERE date(created_at,'localtime') >= ? AND statut != 'annulee'`).get(firstOfMonth);
    const nb_ventes_jour = db.prepare(`SELECT COUNT(*) as val FROM ventes WHERE date(created_at,'localtime') = ? AND statut != 'annulee'`).get(today);
    const nb_clients     = db.prepare(`SELECT COUNT(*) as val FROM clients WHERE actif = 1`).get();
    const nb_produits    = db.prepare(`SELECT COUNT(*) as val FROM produits WHERE actif = 1 AND is_fictif = 0`).get();
    const rupture        = db.prepare(`SELECT COUNT(*) as val FROM produits WHERE qte_actuelle = 0 AND actif = 1 AND is_fictif = 0`).get();
    const stock_faible   = db.prepare(`SELECT COUNT(*) as val FROM produits WHERE qte_actuelle > 0 AND qte_actuelle <= qte_min AND actif = 1 AND is_fictif = 0`).get();
    const expires        = db.prepare(`SELECT COUNT(*) as val FROM produits WHERE date_expiration IS NOT NULL AND date(date_expiration) <= date('now') AND actif = 1 AND is_fictif = 0`).get();
    const valeur_stock   = db.prepare(`SELECT COALESCE(SUM(qte_actuelle * prix_achat),0) as val FROM produits WHERE actif = 1 AND is_fictif = 0`).get();

    // Ventes du jour réparties par mode de paiement — le crédit est exclu (marchandise sortie
    // mais argent pas encore reçu). Espèces et Mobile Money sont toujours affichés même à 0,
    // pour que le caissier ait ces deux repères en permanence dès l'ouverture de la caisse ;
    // les autres modes (carte, virement...) n'apparaissent que s'ils ont servi aujourd'hui.
    const MODE_LABELS = { especes: 'Espèces', mobile_money: 'Mobile Money', carte: 'Carte', virement: 'Virement', mixte: 'Mixte' };
    const parModeJourRaw = db.prepare(`
      SELECT mode_paiement, COUNT(*) as nb_ventes, COALESCE(SUM(total),0) as montant
      FROM ventes WHERE date(created_at,'localtime') = ? AND statut != 'annulee' AND mode_paiement != 'credit'
      GROUP BY mode_paiement
    `).all(today);
    const mapModeJour = Object.fromEntries(parModeJourRaw.map(m => [m.mode_paiement, m]));
    const modesAffiches = ['especes', 'mobile_money', ...Object.keys(mapModeJour).filter(m => !['especes','mobile_money'].includes(m))];
    const paiements_jour = modesAffiches.map(mode => ({
      mode, label: MODE_LABELS[mode] || mode,
      montant: mapModeJour[mode]?.montant || 0,
      nb_ventes: mapModeJour[mode]?.nb_ventes || 0,
    }));

    // Argent reçu AUJOURD'HUI en remboursement de dettes anciennes (crédit vente ou facture) —
    // n'est PAS une vente du jour (pas dans ca_jour, sinon double-compte le chiffre d'affaires),
    // mais c'est de l'argent bien réel qui doit se trouver dans le tiroir-caisse aujourd'hui.
    // Affiché séparément pour que le caissier puisse recouper : ca_jour (especes) + ceci = attendu en caisse.
    const credits_encaisses_jour = db.prepare(`
      SELECT COALESCE((
        SELECT SUM(montant) FROM paiements_credit WHERE date(created_at,'localtime')=? AND mode_paiement IN ('especes','mixte')
      ),0) + COALESCE((
        SELECT SUM(montant) FROM paiements_facture WHERE date(created_at,'localtime')=? AND mode_paiement IN ('especes','mixte')
      ),0) as val
    `).get(today, today);

    // Marge des ventes comptoir (Caisse)
    const margeVenteJour  = db.prepare(`SELECT COALESCE(SUM(lv.total - CASE WHEN lv.cout_achat > 0 THEN lv.cout_achat ELSE lv.quantite * COALESCE(lv.contenance,1) * p.prix_achat END),0) as val FROM lignes_vente lv JOIN produits p ON lv.produit_id=p.id JOIN ventes v ON lv.vente_id=v.id WHERE date(v.created_at,'localtime')=? AND v.statut!='annulee' AND p.is_fictif=0`).get(today).val;
    const margeVenteMois  = db.prepare(`SELECT COALESCE(SUM(lv.total - CASE WHEN lv.cout_achat > 0 THEN lv.cout_achat ELSE lv.quantite * COALESCE(lv.contenance,1) * p.prix_achat END),0) as val FROM lignes_vente lv JOIN produits p ON lv.produit_id=p.id JOIN ventes v ON lv.vente_id=v.id WHERE date(v.created_at,'localtime')>=? AND v.statut!='annulee' AND p.is_fictif=0`).get(firstOfMonth).val;
    const margeVenteTotal = db.prepare(`SELECT COALESCE(SUM(lv.total - CASE WHEN lv.cout_achat > 0 THEN lv.cout_achat ELSE lv.quantite * COALESCE(lv.contenance,1) * p.prix_achat END),0) as val FROM lignes_vente lv JOIN produits p ON lv.produit_id=p.id JOIN ventes v ON lv.vente_id=v.id WHERE v.statut!='annulee' AND p.is_fictif=0`).get().val;

    // Marge des factures créées DIRECTEMENT (pas issues d'une vente, sinon double-compte avec
    // margeVente* ci-dessus) — le brouillon est exclu (pas encore un engagement ferme), et seul
    // le type "facture" compte : un "reçu" n'est qu'un encaissement d'une dette déjà comptée en
    // marge à sa création (sinon un règlement de crédit fait gonfler la marge du jour à tort),
    // et une "proforma" n'est qu'un devis non définitif.
    const margeFactureJour  = db.prepare(`SELECT COALESCE(SUM(lf.montant_ttc - CASE WHEN lf.cout_achat > 0 THEN lf.cout_achat ELSE 0 END),0) as val FROM lignes_facture lf JOIN factures f ON lf.facture_id=f.id WHERE f.type='facture' AND f.vente_id IS NULL AND f.statut!='brouillon' AND f.statut!='annulee' AND date(f.created_at,'localtime')=?`).get(today).val;
    const margeFactureMois  = db.prepare(`SELECT COALESCE(SUM(lf.montant_ttc - CASE WHEN lf.cout_achat > 0 THEN lf.cout_achat ELSE 0 END),0) as val FROM lignes_facture lf JOIN factures f ON lf.facture_id=f.id WHERE f.type='facture' AND f.vente_id IS NULL AND f.statut!='brouillon' AND f.statut!='annulee' AND date(f.created_at,'localtime')>=?`).get(firstOfMonth).val;
    const margeFactureTotal = db.prepare(`SELECT COALESCE(SUM(lf.montant_ttc - CASE WHEN lf.cout_achat > 0 THEN lf.cout_achat ELSE 0 END),0) as val FROM lignes_facture lf JOIN factures f ON lf.facture_id=f.id WHERE f.type='facture' AND f.vente_id IS NULL AND f.statut!='brouillon' AND f.statut!='annulee'`).get().val;

    const marge_jour  = { val: margeVenteJour  + margeFactureJour };
    const marge_mois  = { val: margeVenteMois  + margeFactureMois };
    const marge_total = { val: margeVenteTotal + margeFactureTotal };

    const top_produits       = db.prepare(`SELECT p.nom, SUM(lv.quantite) as total_vendu, SUM(lv.total) as ca FROM lignes_vente lv JOIN produits p ON lv.produit_id=p.id JOIN ventes v ON lv.vente_id=v.id WHERE v.statut != 'annulee' AND date(v.created_at,'localtime') >= ? AND p.is_fictif=0 GROUP BY lv.produit_id ORDER BY total_vendu DESC LIMIT 5`).all(firstOfMonth);
    const top_clients        = db.prepare(`SELECT c.nom, COUNT(v.id) as nb_achats, SUM(v.total) as total FROM ventes v JOIN clients c ON v.client_id=c.id WHERE v.statut != 'annulee' AND date(v.created_at,'localtime') >= ? GROUP BY v.client_id ORDER BY total DESC LIMIT 5`).all(firstOfMonth);
    const ventes_7j          = db.prepare(`SELECT date(created_at,'localtime') as date, COALESCE(SUM(total),0) as total FROM ventes WHERE date(created_at,'localtime') >= date('now','localtime','-6 days') AND statut != 'annulee' GROUP BY date(created_at,'localtime') ORDER BY date`).all();
    const activites_recentes = db.prepare(`SELECT j.*, u.nom as user_nom FROM journal_activites j LEFT JOIN users u ON j.user_id=u.id ORDER BY j.created_at DESC LIMIT 10`).all();
    const alertes_stock      = db.prepare(`SELECT id, code, nom, qte_actuelle, qte_min FROM produits WHERE (qte_actuelle = 0 OR qte_actuelle <= qte_min) AND actif = 1 AND is_fictif = 0 ORDER BY qte_actuelle LIMIT 10`).all();

    res.json({
      ca_jour: ca_jour.val,
      ca_mois: ca_mois.val,
      paiements_jour,
      credits_encaisses_jour: credits_encaisses_jour.val,
      marge_jour: marge_jour.val,
      marge_mois: marge_mois.val,
      marge_total: marge_total.val,
      taux_marge_jour: ca_jour.val > 0 ? (marge_jour.val / ca_jour.val * 100) : 0,
      taux_marge_mois: ca_mois.val > 0 ? (marge_mois.val / ca_mois.val * 100) : 0,
      nb_ventes_jour: nb_ventes_jour.val,
      nb_clients: nb_clients.val,
      nb_produits: nb_produits.val,
      rupture: rupture.val,
      stock_faible: stock_faible.val,
      expires: expires.val,
      valeur_stock: valeur_stock.val,
      top_produits,
      top_clients,
      ventes_7j,
      activites_recentes,
      alertes_stock
    });
  } catch (err) {
    console.error('[Dashboard] Erreur:', err.message);
    res.status(500).json({ message: 'Erreur chargement tableau de bord', detail: err.message });
  }
}

module.exports = { getStats };
