const { db } = require('../config/database');

function ventesParPeriode(req, res) {
  try {
    const { debut, fin, grouper } = req.query;
    let groupFormat = grouper === 'mois' ? `strftime('%Y-%m', created_at, 'localtime')` : grouper === 'annee' ? `strftime('%Y', created_at, 'localtime')` : `date(created_at,'localtime')`;
    const params = [];
    let where = `WHERE statut != 'annulee'`;
    if (debut) { where += ` AND date(created_at,'localtime') >= ?`; params.push(debut); }
    if (fin) { where += ` AND date(created_at,'localtime') <= ?`; params.push(fin); }
    const data = db.prepare(`SELECT ${groupFormat} as periode, COUNT(*) as nb_ventes, SUM(total) as ca, SUM(tva_total) as tva FROM ventes ${where} GROUP BY periode ORDER BY periode`).all(...params);
    res.json(data);
  } catch (err) { res.status(500).json({ message: err.message }); }
}

function produitsVendus(req, res) {
  try {
    const { debut, fin } = req.query;
    const params = [];
    let where = `WHERE v.statut != 'annulee'`;
    if (debut) { where += ` AND date(v.created_at,'localtime') >= ?`; params.push(debut); }
    if (fin) { where += ` AND date(v.created_at,'localtime') <= ?`; params.push(fin); }
    where += ` AND p.is_fictif = 0`;
    const data = db.prepare(`SELECT p.code, p.nom, c.nom as categorie, SUM(lv.quantite) as qte_vendue, SUM(lv.total) as ca, AVG(lv.prix_unitaire) as prix_moyen FROM lignes_vente lv JOIN produits p ON lv.produit_id=p.id LEFT JOIN categories c ON p.categorie_id=c.id JOIN ventes v ON lv.vente_id=v.id ${where} GROUP BY lv.produit_id ORDER BY qte_vendue DESC`).all(...params);
    res.json(data);
  } catch (err) { res.status(500).json({ message: err.message }); }
}

function inventaire(req, res) {
  try {
    const data = db.prepare(`SELECT p.code, p.nom, c.nom as categorie, p.qte_actuelle, p.prix_achat, p.prix_vente, p.qte_min, p.date_expiration, (p.qte_actuelle * p.prix_achat) as valeur_stock FROM produits p LEFT JOIN categories c ON p.categorie_id=c.id WHERE p.actif=1 AND p.is_fictif=0 ORDER BY p.nom`).all();
    const total_valeur = data.reduce((s, p) => s + (p.valeur_stock || 0), 0);
    res.json({ produits: data, total_valeur });
  } catch (err) { res.status(500).json({ message: err.message }); }
}

function mouvementsStock(req, res) {
  try {
    const { debut, fin, produit_id, type } = req.query;
    const params = [];
    let where = 'WHERE 1=1';
    if (debut) { where += ` AND date(m.created_at,'localtime') >= ?`; params.push(debut); }
    if (fin) { where += ` AND date(m.created_at,'localtime') <= ?`; params.push(fin); }
    if (produit_id) { where += ` AND m.produit_id = ?`; params.push(produit_id); }
    if (type) { where += ` AND m.type = ?`; params.push(type); }
    const data = db.prepare(`SELECT m.*, p.nom as produit_nom, p.code, u.nom as user_nom FROM mouvements_stock m JOIN produits p ON m.produit_id=p.id LEFT JOIN users u ON m.user_id=u.id ${where} ORDER BY m.created_at DESC LIMIT 500`).all(...params);
    res.json(data);
  } catch (err) { res.status(500).json({ message: err.message }); }
}

function benefices(req, res) {
  try {
    const { debut, fin } = req.query;
    const params = [];
    let where = `WHERE v.statut != 'annulee'`;
    if (debut) { where += ` AND date(v.created_at,'localtime') >= ?`; params.push(debut); }
    if (fin) { where += ` AND date(v.created_at,'localtime') <= ?`; params.push(fin); }
    where += ` AND p.is_fictif = 0`;
    const data = db.prepare(`SELECT date(v.created_at,'localtime') as date, SUM(lv.total) as ca, SUM(CASE WHEN lv.cout_achat > 0 THEN lv.cout_achat ELSE lv.quantite * COALESCE(lv.contenance,1) * p.prix_achat END) as cout, SUM(lv.total - CASE WHEN lv.cout_achat > 0 THEN lv.cout_achat ELSE lv.quantite * COALESCE(lv.contenance,1) * p.prix_achat END) as benefice FROM ventes v JOIN lignes_vente lv ON v.id=lv.vente_id JOIN produits p ON lv.produit_id=p.id ${where} GROUP BY date(v.created_at,'localtime') ORDER BY date`).all(...params);
    res.json(data);
  } catch (err) { res.status(500).json({ message: err.message }); }
}

function remises(req, res) {
  try {
    const { debut, fin, grouper } = req.query;

    // "Remise" = tout écart entre le prix brut (avant remise, ligne par ligne ET globale) et
    // le total réellement encaissé. v.remise ne stocke QUE la remise globale (champ "Remise"
    // sur le total du ticket) — une remise faite directement sur un article en Caisse ne s'y
    // reflète jamais, alors qu'elle réduit bien l'argent encaissé. On calcule donc le brut réel
    // à partir des lignes de vente (prix_unitaire × quantité, avant toute remise) plutôt que de
    // se fier à v.sous_total (déjà net des remises par ligne) ou à v.remise seul.
    const brutJoin = `LEFT JOIN (SELECT vente_id, SUM(prix_unitaire * quantite) as brut FROM lignes_vente GROUP BY vente_id) lb ON lb.vente_id = v.id`;
    const brutExpr = `COALESCE(lb.brut, v.sous_total)`;

    const params = [];
    let where = `WHERE v.statut != 'annulee' AND (${brutExpr} - v.total) > 0`;
    if (debut) { where += ` AND date(v.created_at,'localtime') >= ?`; params.push(debut); }
    if (fin)   { where += ` AND date(v.created_at,'localtime') <= ?`; params.push(fin);   }

    const pAll = [];
    let whereAll = `WHERE v.statut != 'annulee'`;
    if (debut) { whereAll += ` AND date(v.created_at,'localtime') >= ?`; pAll.push(debut); }
    if (fin)   { whereAll += ` AND date(v.created_at,'localtime') <= ?`; pAll.push(fin);   }

    const resume = db.prepare(`
      SELECT
        COUNT(*) as nb_ventes_total,
        COUNT(CASE WHEN (${brutExpr} - v.total) > 0 THEN 1 END) as nb_avec_remise,
        COALESCE(SUM(${brutExpr} + v.tva_total - v.total), 0) as total_remises,
        COALESCE(AVG(CASE WHEN (${brutExpr} - v.total) > 0
          THEN (${brutExpr} - v.total) * 100.0 / NULLIF(${brutExpr}, 0) END), 0) as pct_moyen,
        COALESCE(SUM(v.total), 0) as ca_total
      FROM ventes v ${brutJoin} ${whereAll}
    `).get(...pAll);

    const groupFmt = (grouper === 'mois')
      ? `strftime('%Y-%m', v.created_at, 'localtime')`
      : `date(v.created_at,'localtime')`;
    const evolution = db.prepare(`
      SELECT
        ${groupFmt} as periode,
        COUNT(*) as nb_ventes,
        COALESCE(SUM(${brutExpr} + v.tva_total - v.total), 0) as montant_remise,
        COALESCE(SUM(v.total), 0) as ca
      FROM ventes v ${brutJoin} ${where}
      GROUP BY periode ORDER BY periode
    `).all(...params);

    const detail = db.prepare(`
      SELECT
        v.numero, v.created_at,
        CASE WHEN ${brutExpr} > 0 THEN (${brutExpr} - v.total) * 100.0 / ${brutExpr} ELSE 0 END as pct_remise,
        (${brutExpr} + v.tva_total) as avant_remise,
        (${brutExpr} + v.tva_total) - v.total as montant_remise,
        v.total, v.mode_paiement,
        c.nom as client_nom,
        u.nom as user_nom
      FROM ventes v
      ${brutJoin}
      LEFT JOIN clients c ON v.client_id = c.id
      LEFT JOIN users  u ON v.user_id   = u.id
      ${where}
      ORDER BY v.created_at DESC LIMIT 300
    `).all(...params);

    res.json({ resume, evolution, detail });
  } catch (err) { res.status(500).json({ message: err.message }); }
}

function margeRapport(req, res) {
  try {
    const { debut, fin, grouper } = req.query;

    let whereV = `WHERE v.statut != 'annulee'`;
    const paramsV = [];
    if (debut) { whereV += ` AND date(v.created_at,'localtime') >= ?`; paramsV.push(debut); }
    if (fin)   { whereV += ` AND date(v.created_at,'localtime') <= ?`; paramsV.push(fin);   }

    // Factures créées directement (pas issues d'une vente, sinon double-compte avec les
    // lignes_vente ci-dessus) — brouillon et annulée exclus, et seul le type "facture" compte :
    // un "reçu" n'est qu'un encaissement d'une dette déjà comptée en marge à sa création (sinon
    // un règlement de crédit fait gonfler la marge à tort), une "proforma" n'est qu'un devis.
    let whereF = `WHERE f.type = 'facture' AND f.vente_id IS NULL AND f.statut != 'brouillon' AND f.statut != 'annulee'`;
    const paramsF = [];
    if (debut) { whereF += ` AND date(f.created_at,'localtime') >= ?`; paramsF.push(debut); }
    if (fin)   { whereF += ` AND date(f.created_at,'localtime') <= ?`; paramsF.push(fin);   }

    const groupFmtV = (grouper === 'mois') ? `strftime('%Y-%m', v.created_at, 'localtime')` : `date(v.created_at,'localtime')`;
    const groupFmtF = (grouper === 'mois') ? `strftime('%Y-%m', f.created_at, 'localtime')` : `date(f.created_at,'localtime')`;

    // Surplus = écart entre ce qui a été réellement encaissé (lv.total, prix éventuellement
    // modifié en caisse) et ce qu'aurait rapporté la même quantité au prix catalogue — positif
    // si vendu au-dessus du catalogue, négatif si bradé/remisé. Uniquement sur les ventes
    // (Caisse) : les factures n'enregistrent ni conditionnement ni toujours de produit_id,
    // donc aucun prix catalogue fiable à comparer.
    const surplusExprLV = `
      lv.total - (lv.quantite * CASE
        WHEN lv.contenance = 1 THEN p.prix_vente
        ELSE COALESCE((SELECT co.prix_vente FROM conditionnements co WHERE co.produit_id = lv.produit_id AND co.contenance = lv.contenance LIMIT 1), p.prix_vente * lv.contenance)
      END)
    `;

    const parPeriode = db.prepare(`
      SELECT periode,
        COALESCE(SUM(ca), 0) as ca,
        COALESCE(SUM(cout), 0) as cout,
        COALESCE(SUM(ca - cout), 0) as marge,
        COUNT(DISTINCT doc_id) as nb_ventes
      FROM (
        SELECT ${groupFmtV} as periode, lv.total as ca,
          CASE WHEN lv.cout_achat > 0 THEN lv.cout_achat ELSE lv.quantite * COALESCE(lv.contenance,1) * p.prix_achat END as cout,
          'v' || v.id as doc_id
        FROM ventes v JOIN lignes_vente lv ON v.id = lv.vente_id JOIN produits p ON lv.produit_id = p.id
        ${whereV}
        UNION ALL
        SELECT ${groupFmtF} as periode, lf.montant_ttc as ca,
          CASE WHEN lf.cout_achat > 0 THEN lf.cout_achat ELSE 0 END as cout,
          'f' || f.id as doc_id
        FROM factures f JOIN lignes_facture lf ON lf.facture_id = f.id
        ${whereF}
      )
      GROUP BY periode ORDER BY periode
    `).all(...paramsV, ...paramsF);

    let cumul = 0;
    const evolution = parPeriode.map(p => {
      cumul += p.marge;
      return { ...p, marge_cumul: Math.round(cumul) };
    });

    const total_ca    = evolution.reduce((s, p) => s + p.ca,    0);
    const total_cout  = evolution.reduce((s, p) => s + p.cout,  0);
    const total_marge = evolution.reduce((s, p) => s + p.marge, 0);
    const taux_marge  = total_ca > 0 ? total_marge / total_ca * 100 : 0;
    const marge_moy   = evolution.length > 0 ? total_marge / evolution.length : 0;

    const { total_surplus } = db.prepare(`
      SELECT COALESCE(SUM(${surplusExprLV}), 0) as total_surplus
      FROM lignes_vente lv JOIN produits p ON lv.produit_id = p.id JOIN ventes v ON lv.vente_id = v.id
      ${whereV}
    `).get(...paramsV);

    const top_produits = db.prepare(`
      SELECT nom, code,
        COALESCE(SUM(marge), 0) as marge,
        COALESCE(SUM(ca), 0) as ca,
        COALESCE(SUM(qte), 0) as qte,
        COALESCE(SUM(surplus), 0) as surplus,
        CASE WHEN SUM(ca) > 0 THEN ROUND(SUM(marge) / SUM(ca) * 100, 1) ELSE 0 END as taux_marge
      FROM (
        SELECT p.id as produit_id, p.nom, p.code,
          lv.total - CASE WHEN lv.cout_achat > 0 THEN lv.cout_achat ELSE lv.quantite * COALESCE(lv.contenance,1) * p.prix_achat END as marge,
          lv.total as ca, lv.quantite as qte,
          ${surplusExprLV} as surplus
        FROM lignes_vente lv JOIN produits p ON lv.produit_id = p.id JOIN ventes v ON lv.vente_id = v.id
        ${whereV}
        UNION ALL
        SELECT p.id as produit_id, p.nom, p.code,
          lf.montant_ttc - CASE WHEN lf.cout_achat > 0 THEN lf.cout_achat ELSE 0 END as marge,
          lf.montant_ttc as ca, lf.quantite as qte,
          0 as surplus
        FROM lignes_facture lf JOIN factures f ON lf.facture_id = f.id JOIN produits p ON lf.produit_id = p.id
        ${whereF}
      )
      GROUP BY produit_id
      ORDER BY marge DESC LIMIT 15
    `).all(...paramsV, ...paramsF);

    const top_vendeurs = db.prepare(`
      SELECT v.user_id, u.nom, u.prenom,
        COALESCE(SUM(${surplusExprLV}), 0) as surplus,
        COUNT(*) as nb_lignes
      FROM lignes_vente lv JOIN produits p ON lv.produit_id = p.id JOIN ventes v ON lv.vente_id = v.id
      LEFT JOIN users u ON v.user_id = u.id
      ${whereV}
      GROUP BY v.user_id
      ORDER BY surplus DESC
    `).all(...paramsV);

    res.json({
      resume: { total_ca, total_cout, total_marge, taux_marge, marge_moy, total_surplus },
      evolution,
      top_produits,
      top_vendeurs
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
}

const MODE_LABELS = {
  especes: 'Espèces', mobile_money: 'Mobile Money', carte: 'Carte',
  virement: 'Virement', credit: 'Crédit', mixte: 'Mixte',
};

function paiementsRapport(req, res) {
  try {
    const { debut, fin } = req.query;
    let where = `WHERE statut != 'annulee'`;
    const params = [];
    if (debut) { where += ` AND date(created_at,'localtime') >= ?`; params.push(debut); }
    if (fin)   { where += ` AND date(created_at,'localtime') <= ?`; params.push(fin);   }

    const parMode = db.prepare(`
      SELECT mode_paiement, COUNT(*) as nb_ventes, COALESCE(SUM(total), 0) as montant
      FROM ventes ${where}
      GROUP BY mode_paiement
      ORDER BY montant DESC
    `).all(...params);

    // "Crédit" = marchandise sortie mais argent pas (encore) reçu — exclu du total réellement
    // encaissé, sinon la caisse paraîtrait avoir plus d'argent physique/mobile qu'en réalité.
    const total_encaisse = parMode.filter(m => m.mode_paiement !== 'credit').reduce((s, m) => s + m.montant, 0);
    const total_credit   = parMode.find(m => m.mode_paiement === 'credit')?.montant || 0;

    // Espèces et Mobile Money toujours présents dans la liste (même à 0 vente) — sinon l'absence
    // totale d'une ligne se lit comme "ça ne marche pas" plutôt que "aucune vente sur ce mode".
    const mapMode = Object.fromEntries(parMode.map(m => [m.mode_paiement, m]));
    const modesAffiches = ['especes', 'mobile_money', ...Object.keys(mapMode).filter(m => !['especes','mobile_money'].includes(m))];
    const resume = modesAffiches.map(mode => {
      const m = mapMode[mode];
      const montant = m?.montant || 0;
      return {
        mode,
        label: MODE_LABELS[mode] || mode,
        nb_ventes: m?.nb_ventes || 0,
        montant,
        pct: total_encaisse > 0 && mode !== 'credit' ? Math.round(montant / total_encaisse * 1000) / 10 : 0,
      };
    }).sort((a, b) => b.montant - a.montant);

    res.json({ resume, total_encaisse, total_credit });
  } catch (err) { res.status(500).json({ message: err.message }); }
}

module.exports = { ventesParPeriode, produitsVendus, inventaire, mouvementsStock, benefices, remises, margeRapport, paiementsRapport };
