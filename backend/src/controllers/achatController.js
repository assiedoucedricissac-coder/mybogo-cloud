const { db } = require('../config/database');

function genererNumero() {
  const date = new Date();
  const prefix = `ACH${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}`;
  const last = db.prepare(`SELECT numero FROM achats WHERE numero LIKE ? ORDER BY id DESC LIMIT 1`).get(`${prefix}%`);
  const seq = last ? parseInt(last.numero.slice(-4)) + 1 : 1;
  return `${prefix}${String(seq).padStart(4,'0')}`;
}

// Traduit un préréglage de période (ou une plage personnalisée) en clause SQL + paramètres
// liés, sur la colonne de date donnée. Ne s'applique qu'aux totaux historiques
// (achats/ventes/marge) — la projection sur le stock actuel reste une photo du présent.
function periodeClause(col, periode, dateDebut, dateFin) {
  if (periode === 'jour')    return { clause: `AND date(${col}) = date('now')`, params: [] };
  if (periode === 'semaine') return { clause: `AND date(${col}) >= date('now','-6 days')`, params: [] };
  if (periode === 'mois')    return { clause: `AND date(${col}) >= date('now','start of month')`, params: [] };
  if (periode === 'personnalise' && dateDebut && dateFin) {
    return { clause: `AND date(${col}) BETWEEN ? AND ?`, params: [dateDebut, dateFin] };
  }
  return { clause: '', params: [] };
}

function getStats(req, res) {
  try {
    const { periode, date_debut, date_fin } = req.query; // 'jour'|'semaine'|'mois'|'personnalise'|'tout'
    const pVentes  = periodeClause('created_at', periode, date_debut, date_fin);
    const pMarge   = periodeClause('v.created_at', periode, date_debut, date_fin);
    // Factures directes (pas issues d'une vente, sinon double-compte avec les lignes_vente
    // ci-dessous) : même filtre de période que le reste, sur leur propre date de création.
    const pFacture = periodeClause('f.created_at', periode, date_debut, date_fin);
    const whereFacture = `f.type='facture' AND f.vente_id IS NULL AND f.statut != 'brouillon' AND f.statut != 'annulee'`;

    const total_ventes_caisse = db.prepare(`SELECT COALESCE(SUM(total),0) as val FROM ventes WHERE statut != 'annulee' ${pVentes.clause}`).get(...pVentes.params).val;
    const total_ventes_facture = db.prepare(`SELECT COALESCE(SUM(f.total),0) as val FROM factures f WHERE ${whereFacture} ${pFacture.clause}`).get(...pFacture.params).val;
    const total_ventes = total_ventes_caisse + total_ventes_facture;

    // Coût réel : on préfère la valeur figée au moment de la vente (lv.cout_achat, déjà
    // multipliée par le conditionnement) — sinon on retombe sur le CMUP actuel du produit
    // multiplié par le conditionnement de la ligne. Sans ce COALESCE(lv.contenance,1),
    // une vente d'1 carton de 24 comparait le prix du carton entier au coût d'UNE SEULE
    // pièce, gonflant artificiellement la marge affichée (même bug que dashboard/rapports).
    // "Total des achats" ici = le coût de CE QUI A ÉTÉ VENDU (pas tous les achats jamais
    // faits) — pour que les 3 cartes se lisent comme un vrai résultat : Achat (vendu) → Vente
    // (réelle) → Marge, cohérent entre eux (achat + marge = vente, toujours). Le total de TOUS
    // les achats (y compris le stock pas encore vendu) reste visible dans "Valeur du stock".
    // Les factures directes (crédit ou pas) sont incluses au même titre que les ventes Caisse,
    // depuis qu'elles font aussi sortir du stock.
    const coutBase = `lv.quantite * COALESCE(lv.contenance,1) * p.prix_achat`;
    const total_achats_caisse = db.prepare(`
      SELECT COALESCE(SUM(CASE WHEN lv.cout_achat > 0 THEN lv.cout_achat ELSE ${coutBase} END),0) as val
      FROM lignes_vente lv
      JOIN produits p ON lv.produit_id=p.id
      JOIN ventes v ON lv.vente_id=v.id
      WHERE v.statut != 'annulee' AND p.is_fictif=0 ${pMarge.clause}
    `).get(...pMarge.params).val;
    const total_achats_facture = db.prepare(`
      SELECT COALESCE(SUM(CASE WHEN lf.cout_achat > 0 THEN lf.cout_achat ELSE 0 END),0) as val
      FROM lignes_facture lf JOIN factures f ON lf.facture_id=f.id
      WHERE ${whereFacture} ${pFacture.clause}
    `).get(...pFacture.params).val;
    const total_achats = total_achats_caisse + total_achats_facture;

    const marge_caisse = db.prepare(`
      SELECT COALESCE(SUM(lv.total - CASE WHEN lv.cout_achat > 0 THEN lv.cout_achat ELSE ${coutBase} END),0) as val
      FROM lignes_vente lv
      JOIN produits p ON lv.produit_id=p.id
      JOIN ventes v ON lv.vente_id=v.id
      WHERE v.statut != 'annulee' AND p.is_fictif=0 ${pMarge.clause}
    `).get(...pMarge.params).val;
    const marge_facture = db.prepare(`
      SELECT COALESCE(SUM(lf.montant_ttc - CASE WHEN lf.cout_achat > 0 THEN lf.cout_achat ELSE 0 END),0) as val
      FROM lignes_facture lf JOIN factures f ON lf.facture_id=f.id
      WHERE ${whereFacture} ${pFacture.clause}
    `).get(...pFacture.params).val;
    const marge = marge_caisse + marge_facture;

    // Valeur d'achat de tout le stock actuellement en magasin (vendu ou non) — reste utile
    // séparément, affiché sous "Si je vends tout mon stock actuel".
    const valeur_stock_achat = db.prepare(`
      SELECT COALESCE(SUM(qte_actuelle * prix_achat),0) as val FROM produits WHERE actif=1 AND is_fictif=0
    `).get().val;

    res.json({ total_achats, total_ventes, marge, valeur_stock_achat });
  } catch (err) { res.status(500).json({ message: err.message }); }
}

// Totaux d'achat/vente/marge par produit, sur une période donnée (ou tout l'historique si
// aucune date fournie) — sert à afficher soit le détail d'un seul article, soit le total
// global de tous les articles. Même logique "format-aware" que marge_potentielle ci-dessus :
// si un format a été choisi à l'achat et que son prix de vente est renseigné, on compare
// carton-contre-carton (exact, sans arrondi) plutôt que de passer par le prix à la pièce.
function getMargeParProduit(req, res) {
  try {
    const { date_debut, date_fin } = req.query;
    let where = '';
    const params = [];
    if (date_debut && date_fin) {
      where = 'AND date(a.created_at) BETWEEN ? AND ?';
      params.push(date_debut, date_fin);
    }
    const rows = db.prepare(`
      SELECT p.id as produit_id, p.nom as produit_nom, p.code,
        SUM(la.quantite) as qte_achetee,
        SUM(la.quantite * la.prix_unitaire) as total_achat,
        SUM(la.quantite * (
          CASE WHEN la.conditionnement_id IS NOT NULL AND c.prix_vente > 0 AND c.contenance > 0
               THEN c.prix_vente * 1.0 / c.contenance
               ELSE p.prix_vente END
        )) as total_vente,
        -- Format de référence pour afficher la quantité en cartons plutôt qu'en pièces
        -- (le plus grand conditionnement actif du produit — typiquement "Carton").
        (SELECT libelle FROM conditionnements WHERE produit_id = p.id AND actif = 1 ORDER BY contenance DESC LIMIT 1) as format_libelle,
        (SELECT contenance FROM conditionnements WHERE produit_id = p.id AND actif = 1 ORDER BY contenance DESC LIMIT 1) as format_contenance
      FROM lignes_achat la
      JOIN achats a ON la.achat_id = a.id
      JOIN produits p ON la.produit_id = p.id
      LEFT JOIN conditionnements c ON la.conditionnement_id = c.id
      WHERE 1=1 ${where}
      GROUP BY p.id
      ORDER BY p.nom
    `).all(...params);
    const data = rows.map(r => ({ ...r, total_marge: r.total_vente - r.total_achat }));
    res.json(data);
  } catch (err) { res.status(500).json({ message: err.message }); }
}

function getAll(req, res) {
  const { date_debut, date_fin } = req.query;
  const whereDate = (date_debut && date_fin) ? `WHERE date(a.created_at) BETWEEN date(?) AND date(?)` : '';
  const params = whereDate ? [date_debut, date_fin] : [];
  const achats = db.prepare(`
    SELECT a.*, f.nom as fournisseur_nom, u.nom as user_nom,
      (SELECT GROUP_CONCAT(
          p.nom || ' (' || CASE
            WHEN la.conditionnement_id IS NOT NULL AND la.nb_format IS NOT NULL
            THEN la.nb_format || ' ' || c.libelle
            ELSE la.quantite || ' ' || p.unite
          END || ')'
        , ', ')
       FROM lignes_achat la
       JOIN produits p ON la.produit_id = p.id
       LEFT JOIN conditionnements c ON la.conditionnement_id = c.id
       WHERE la.achat_id = a.id
      ) as articles_resume,
      (SELECT COALESCE(SUM(
          la.quantite * (
            -- Si un format (carton, etc.) a été choisi ET que son prix de vente est renseigné,
            -- on compare directement carton-contre-carton (aucune conversion, donc aucun
            -- arrondi) plutôt que de passer par le prix de vente à la pièce du produit — qui,
            -- s'il n'a jamais été renseigné, faisait ressortir une marge négative trompeuse.
            CASE WHEN la.conditionnement_id IS NOT NULL AND c.prix_vente > 0 AND c.contenance > 0
                 THEN c.prix_vente * 1.0 / c.contenance
                 ELSE p.prix_vente END
            - la.prix_unitaire
          )
        ), 0)
       FROM lignes_achat la
       JOIN produits p ON la.produit_id = p.id
       LEFT JOIN conditionnements c ON la.conditionnement_id = c.id
       WHERE la.achat_id = a.id
      ) as marge_potentielle
    FROM achats a
    LEFT JOIN fournisseurs f ON a.fournisseur_id=f.id
    LEFT JOIN users u ON a.user_id=u.id
    ${whereDate}
    ORDER BY a.created_at DESC LIMIT 200
  `).all(...params);
  res.json(achats);
}

function getOne(req, res) {
  const achat = db.prepare(`SELECT a.*, f.nom as fournisseur_nom FROM achats a LEFT JOIN fournisseurs f ON a.fournisseur_id=f.id WHERE a.id=?`).get(req.params.id);
  if (!achat) return res.status(404).json({ message: 'Achat introuvable' });
  const lignes = db.prepare(`SELECT l.*, p.nom as produit_nom, p.code FROM lignes_achat l JOIN produits p ON l.produit_id=p.id WHERE l.achat_id=?`).all(req.params.id);
  res.json({ ...achat, lignes });
}

function create(req, res) {
  const { fournisseur_id, lignes, note, mode_paiement, montant_paye, date_achat, frais_livraison } = req.body;
  if (!lignes || !lignes.length) return res.status(400).json({ message: 'Au moins un article requis' });

  const createAchat = db.transaction(() => {
    let sous_total = 0;
    for (const l of lignes) {
      sous_total += l.prix_unitaire * l.quantite;
    }
    const livraison = Math.max(0, parseFloat(frais_livraison) || 0);
    // Les frais de livraison facturés par le fournisseur s'ajoutent au total dû,
    // sans être répartis sur le coût des articles (pas d'impact sur le CMUP produit).
    const total = sous_total + livraison;
    const paye = (montant_paye !== undefined && montant_paye !== null && montant_paye !== '' && !isNaN(parseFloat(montant_paye)))
      ? Math.min(parseFloat(montant_paye), total) : 0;
    const reste = Math.max(0, total - paye);
    const numero = genererNumero();
    // Date réelle de l'achat (peut différer du jour de saisie) — sert à calculer
    // les marges par période sans mélanger des achats saisis en différé.
    const createdAt = date_achat ? `${date_achat} 12:00:00` : null;
    const result = db.prepare(`
      INSERT INTO achats (numero, fournisseur_id, user_id, sous_total, tva_total, total, note, montant_paye, mode_paiement, frais_livraison${createdAt ? ',created_at' : ''})
      VALUES (?,?,?,?,?,?,?,?,?,?${createdAt ? ',?' : ''})
    `).run(numero, fournisseur_id || null, req.user.id, sous_total, 0, total, note || null, paye, mode_paiement || 'especes', livraison,
           ...(createdAt ? [createdAt] : []));
    const achatId = result.lastInsertRowid;

    for (const l of lignes) {
      const p = db.prepare('SELECT qte_actuelle, prix_achat FROM produits WHERE id=?').get(l.produit_id);
      if (!p) throw new Error(`Produit ID ${l.produit_id} introuvable`);
      const total_ligne = l.prix_unitaire * l.quantite;
      db.prepare('INSERT INTO lignes_achat (achat_id, produit_id, quantite, prix_unitaire, tva, total, conditionnement_id, nb_format) VALUES (?,?,?,?,?,?,?,?)')
        .run(achatId, l.produit_id, l.quantite, l.prix_unitaire, 0, total_ligne, l.conditionnement_id || null, l.nb_format || null);
      const qte_avant = p.qte_actuelle;
      const qte_apres = qte_avant + l.quantite;
      // CMUP : Coût Moyen Unitaire Pondéré
      // On fusionne la valeur de l'ancien stock avec la valeur du lot entrant
      const valeur_ancienne = (qte_avant > 0 && p.prix_achat > 0) ? qte_avant * p.prix_achat : 0;
      const valeur_nouvelle  = l.quantite * l.prix_unitaire;
      // Pas d'arrondi : sinon la valeur du stock (qte × prix_achat arrondi) ne retombe plus
      // exactement sur le total réellement payé dans l'achat (même principe que le prix
      // unitaire non arrondi ci-dessus) — l'écart se voyait dans "Valeur du stock" du tableau
      // de bord, différent de "Total des achats" alors qu'aucune vente n'avait eu lieu.
      const cmup = qte_apres > 0 ? (valeur_ancienne + valeur_nouvelle) / qte_apres : l.prix_unitaire;
      db.prepare('UPDATE produits SET qte_actuelle=?, prix_achat=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(qte_apres, cmup, l.produit_id);
      db.prepare('INSERT INTO mouvements_stock (produit_id, type, quantite, qte_avant, qte_apres, reference_doc, user_id) VALUES (?,?,?,?,?,?,?)').run(l.produit_id, 'achat', l.quantite, qte_avant, qte_apres, numero, req.user.id);
      db.prepare(`
        UPDATE lignes_inventaire
        SET qte_systeme = ?,
            ecart = CASE WHEN qte_comptee IS NOT NULL THEN qte_comptee - ? ELSE NULL END
        WHERE produit_id = ?
        AND inventaire_id IN (SELECT id FROM inventaires WHERE statut IN ('brouillon','soumis'))
      `).run(qte_apres, qte_apres, l.produit_id);
    }

    // Seul le montant NON payé (crédit) vient s'ajouter à la dette envers le fournisseur.
    // Un achat payé cash intégralement ne doit rien ajouter au solde dû.
    if (fournisseur_id && reste > 0) {
      db.prepare('UPDATE fournisseurs SET solde = solde + ?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(reste, fournisseur_id);
    }

    return { id: achatId, numero, total };
  });

  try {
    const result = createAchat();
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

// Correction après coup d'un achat déjà enregistré (fournisseur, paiement, date, note...).
// On ne touche PAS aux lignes/quantités : ça toucherait au stock et au CMUP déjà recalculé,
// ce qui est risqué à défaire proprement. Seuls les champs administratifs et le paiement
// sont modifiables — c'est la cause la plus fréquente d'erreur de saisie rapide en caisse.
function update(req, res) {
  const old = db.prepare('SELECT * FROM achats WHERE id=?').get(req.params.id);
  if (!old) return res.status(404).json({ message: 'Achat introuvable' });

  const { fournisseur_id, note, mode_paiement, montant_paye, date_achat, frais_livraison } = req.body;

  const tx = db.transaction(() => {
    const livraison = frais_livraison !== undefined && frais_livraison !== ''
      ? Math.max(0, parseFloat(frais_livraison) || 0) : old.frais_livraison;
    const total = old.sous_total + livraison;
    const paye = (montant_paye !== undefined && montant_paye !== null && montant_paye !== '' && !isNaN(parseFloat(montant_paye)))
      ? Math.min(parseFloat(montant_paye), total) : 0;
    const nouveauReste = Math.max(0, total - paye);
    const ancienReste  = Math.max(0, old.total - (old.montant_paye || 0));
    const nouveauFournisseur = fournisseur_id !== undefined ? (fournisseur_id || null) : old.fournisseur_id;

    // Retire l'ancien impact sur le solde du fournisseur d'origine, puis applique le nouveau
    // (le fournisseur a pu changer, ou juste le montant payé).
    if (old.fournisseur_id && ancienReste > 0) {
      db.prepare('UPDATE fournisseurs SET solde = solde - ?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(ancienReste, old.fournisseur_id);
    }
    if (nouveauFournisseur && nouveauReste > 0) {
      db.prepare('UPDATE fournisseurs SET solde = solde + ?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(nouveauReste, nouveauFournisseur);
    }

    const createdAt = date_achat ? `${date_achat} 12:00:00` : old.created_at;
    const nouveauStatut = nouveauReste <= 0 ? 'recu' : (paye > 0 ? 'partiel' : old.statut);

    db.prepare(`
      UPDATE achats SET fournisseur_id=?, note=?, mode_paiement=?, montant_paye=?, frais_livraison=?, total=?, statut=?, created_at=?
      WHERE id=?
    `).run(nouveauFournisseur, note ?? old.note, mode_paiement || old.mode_paiement, paye, livraison, total, nouveauStatut, createdAt, old.id);

    return { id: old.id, total, montant_paye: paye, reste: nouveauReste };
  });

  try { res.json(tx()); }
  catch (err) { res.status(400).json({ message: err.message }); }
}

// Continue un achat déjà enregistré : ajoute d'autres lignes à la MÊME facture fournisseur
// (cas fréquent : la facture papier a beaucoup d'articles, saisis en plusieurs fois).
// Applique exactement la même logique stock/CMUP que create(), et augmente le total —
// le supplément non payé s'ajoute au solde du fournisseur.
function ajouterLignes(req, res) {
  const achat = db.prepare('SELECT * FROM achats WHERE id=?').get(req.params.id);
  if (!achat) return res.status(404).json({ message: 'Achat introuvable' });
  const { lignes } = req.body;
  if (!lignes || !lignes.length) return res.status(400).json({ message: 'Au moins un article requis' });

  const tx = db.transaction(() => {
    let ajoutTotal = 0;
    for (const l of lignes) {
      const p = db.prepare('SELECT qte_actuelle, prix_achat FROM produits WHERE id=?').get(l.produit_id);
      if (!p) throw new Error(`Produit ID ${l.produit_id} introuvable`);
      const total_ligne = l.prix_unitaire * l.quantite;
      ajoutTotal += total_ligne;
      db.prepare('INSERT INTO lignes_achat (achat_id, produit_id, quantite, prix_unitaire, tva, total, conditionnement_id, nb_format) VALUES (?,?,?,?,?,?,?,?)')
        .run(achat.id, l.produit_id, l.quantite, l.prix_unitaire, 0, total_ligne, l.conditionnement_id || null, l.nb_format || null);
      const qte_avant = p.qte_actuelle;
      const qte_apres = qte_avant + l.quantite;
      const valeur_ancienne = (qte_avant > 0 && p.prix_achat > 0) ? qte_avant * p.prix_achat : 0;
      const valeur_nouvelle  = l.quantite * l.prix_unitaire;
      // Pas d'arrondi : sinon la valeur du stock (qte × prix_achat arrondi) ne retombe plus
      // exactement sur le total réellement payé dans l'achat (même principe que le prix
      // unitaire non arrondi ci-dessus) — l'écart se voyait dans "Valeur du stock" du tableau
      // de bord, différent de "Total des achats" alors qu'aucune vente n'avait eu lieu.
      const cmup = qte_apres > 0 ? (valeur_ancienne + valeur_nouvelle) / qte_apres : l.prix_unitaire;
      db.prepare('UPDATE produits SET qte_actuelle=?, prix_achat=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(qte_apres, cmup, l.produit_id);
      db.prepare('INSERT INTO mouvements_stock (produit_id, type, quantite, qte_avant, qte_apres, reference_doc, user_id) VALUES (?,?,?,?,?,?,?)')
        .run(l.produit_id, 'achat', l.quantite, qte_avant, qte_apres, achat.numero, req.user.id);
      db.prepare(`
        UPDATE lignes_inventaire
        SET qte_systeme = ?,
            ecart = CASE WHEN qte_comptee IS NOT NULL THEN qte_comptee - ? ELSE NULL END
        WHERE produit_id = ?
        AND inventaire_id IN (SELECT id FROM inventaires WHERE statut IN ('brouillon','soumis'))
      `).run(qte_apres, qte_apres, l.produit_id);
    }

    const nouveauSousTotal = achat.sous_total + ajoutTotal;
    const nouveauTotal = nouveauSousTotal + (achat.frais_livraison || 0);
    db.prepare('UPDATE achats SET sous_total=?, total=?, statut=? WHERE id=?')
      .run(nouveauSousTotal, nouveauTotal, nouveauTotal - (achat.montant_paye||0) > 0 ? 'partiel' : achat.statut, achat.id);

    // Le supplément d'articles n'a pas été payé au moment de l'ajout : il s'ajoute
    // intégralement à la dette envers le fournisseur.
    if (achat.fournisseur_id && ajoutTotal > 0) {
      db.prepare('UPDATE fournisseurs SET solde = solde + ?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(ajoutTotal, achat.fournisseur_id);
    }

    return { id: achat.id, numero: achat.numero, total: nouveauTotal, ajout: ajoutTotal };
  });

  try { res.json(tx()); }
  catch (err) { res.status(400).json({ message: err.message }); }
}

// Corrige les articles (produit/quantité/prix) d'un achat déjà enregistré : remplace
// TOUTES les lignes par la liste envoyée. On défait proprement l'impact stock/CMUP des
// anciennes lignes (regroupées par produit, pour gérer le cas où un même produit apparaît
// plusieurs fois) avant de réappliquer les nouvelles — bloqué si une partie du stock
// concerné a déjà été vendue depuis, comme pour la suppression.
function remplacerLignes(req, res) {
  const achat = db.prepare('SELECT * FROM achats WHERE id=?').get(req.params.id);
  if (!achat) return res.status(404).json({ message: 'Achat introuvable' });
  const { lignes } = req.body;
  if (!lignes || !lignes.length) return res.status(400).json({ message: 'Au moins un article requis' });

  const anciennesLignes = db.prepare('SELECT * FROM lignes_achat WHERE achat_id=?').all(achat.id);
  const ancienParProduit = {};
  for (const old of anciennesLignes) {
    if (!ancienParProduit[old.produit_id]) ancienParProduit[old.produit_id] = { quantite: 0, valeur: 0 };
    ancienParProduit[old.produit_id].quantite += old.quantite;
    ancienParProduit[old.produit_id].valeur += old.quantite * old.prix_unitaire;
  }

  const tx = db.transaction(() => {
    for (const produitId in ancienParProduit) {
      const p = db.prepare('SELECT qte_actuelle FROM produits WHERE id=?').get(produitId);
      if (p && p.qte_actuelle < ancienParProduit[produitId].quantite) {
        throw new Error('Correction impossible : une partie du stock de cet achat a déjà été vendue ou utilisée ailleurs.');
      }
    }

    for (const produitId in ancienParProduit) {
      const { quantite: qteAncienne, valeur: valeurAncienne } = ancienParProduit[produitId];
      const p = db.prepare('SELECT qte_actuelle, prix_achat FROM produits WHERE id=?').get(produitId);
      if (!p) continue;
      const qte_avant = p.qte_actuelle;
      const qte_apres = qte_avant - qteAncienne;
      const valeur_totale = qte_avant * p.prix_achat;
      const valeur_sans = valeur_totale - valeurAncienne;
      const cmup_sans = qte_apres > 0 ? valeur_sans / qte_apres : 0;
      db.prepare('UPDATE produits SET qte_actuelle=?, prix_achat=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(qte_apres, cmup_sans, produitId);
      db.prepare('INSERT INTO mouvements_stock (produit_id, type, quantite, qte_avant, qte_apres, reference_doc, user_id) VALUES (?,?,?,?,?,?,?)')
        .run(produitId, 'sortie', qteAncienne, qte_avant, qte_apres, `Correction ${achat.numero}`, req.user.id);
    }

    db.prepare('DELETE FROM lignes_achat WHERE achat_id=?').run(achat.id);

    let sous_total = 0;
    for (const l of lignes) {
      const p = db.prepare('SELECT qte_actuelle, prix_achat FROM produits WHERE id=?').get(l.produit_id);
      if (!p) throw new Error(`Produit ID ${l.produit_id} introuvable`);
      const total_ligne = l.prix_unitaire * l.quantite;
      sous_total += total_ligne;
      db.prepare('INSERT INTO lignes_achat (achat_id, produit_id, quantite, prix_unitaire, tva, total, conditionnement_id, nb_format) VALUES (?,?,?,?,?,?,?,?)')
        .run(achat.id, l.produit_id, l.quantite, l.prix_unitaire, 0, total_ligne, l.conditionnement_id || null, l.nb_format || null);
      const qte_avant = p.qte_actuelle;
      const qte_apres = qte_avant + l.quantite;
      const valeur_ancienne = (qte_avant > 0 && p.prix_achat > 0) ? qte_avant * p.prix_achat : 0;
      const valeur_nouvelle  = l.quantite * l.prix_unitaire;
      // Pas d'arrondi : sinon la valeur du stock (qte × prix_achat arrondi) ne retombe plus
      // exactement sur le total réellement payé dans l'achat (même principe que le prix
      // unitaire non arrondi ci-dessus) — l'écart se voyait dans "Valeur du stock" du tableau
      // de bord, différent de "Total des achats" alors qu'aucune vente n'avait eu lieu.
      const cmup = qte_apres > 0 ? (valeur_ancienne + valeur_nouvelle) / qte_apres : l.prix_unitaire;
      db.prepare('UPDATE produits SET qte_actuelle=?, prix_achat=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(qte_apres, cmup, l.produit_id);
      db.prepare('INSERT INTO mouvements_stock (produit_id, type, quantite, qte_avant, qte_apres, reference_doc, user_id) VALUES (?,?,?,?,?,?,?)')
        .run(l.produit_id, 'achat', l.quantite, qte_avant, qte_apres, achat.numero, req.user.id);
    }

    const nouveauTotal = sous_total + (achat.frais_livraison || 0);
    const ancienReste = Math.max(0, achat.total - (achat.montant_paye || 0));
    const nouveauReste = Math.max(0, nouveauTotal - (achat.montant_paye || 0));
    const deltaReste = nouveauReste - ancienReste;

    db.prepare('UPDATE achats SET sous_total=?, total=?, statut=? WHERE id=?')
      .run(sous_total, nouveauTotal, nouveauReste <= 0 ? 'recu' : 'partiel', achat.id);

    if (achat.fournisseur_id && deltaReste !== 0) {
      db.prepare('UPDATE fournisseurs SET solde = solde + ?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(deltaReste, achat.fournisseur_id);
    }

    return { id: achat.id, numero: achat.numero, total: nouveauTotal };
  });

  try { res.json(tx()); }
  catch (err) { res.status(400).json({ message: err.message }); }
}

// Suppression complète d'un achat erroné : on retire du stock exactement ce qu'il avait
// ajouté et on retire du solde fournisseur ce qu'il avait mis en dette. Bloqué si une partie
// du stock concerné a déjà été vendue/utilisée (sinon on romprait des ventes déjà faites).
// Le CMUP (prix_achat moyen pondéré) n'est PAS recalculé rétroactivement — imprécision mineure
// acceptée, cohérente avec le reste du logiciel qui ne défait pas non plus le CMUP ailleurs.
function remove(req, res) {
  const achat = db.prepare('SELECT * FROM achats WHERE id=?').get(req.params.id);
  if (!achat) return res.status(404).json({ message: 'Achat introuvable' });
  const lignes = db.prepare('SELECT * FROM lignes_achat WHERE achat_id=?').all(achat.id);

  const tx = db.transaction(() => {
    for (const l of lignes) {
      const p = db.prepare('SELECT qte_actuelle FROM produits WHERE id=?').get(l.produit_id);
      if (p && p.qte_actuelle < l.quantite) {
        throw new Error('Suppression impossible : une partie de ce stock a déjà été vendue ou utilisée ailleurs.');
      }
    }
    for (const l of lignes) {
      const p = db.prepare('SELECT qte_actuelle FROM produits WHERE id=?').get(l.produit_id);
      if (!p) continue;
      const qte_avant = p.qte_actuelle;
      const qte_apres = qte_avant - l.quantite;
      db.prepare('UPDATE produits SET qte_actuelle=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(qte_apres, l.produit_id);
      db.prepare('INSERT INTO mouvements_stock (produit_id, type, quantite, qte_avant, qte_apres, reference_doc, user_id) VALUES (?,?,?,?,?,?,?)')
        .run(l.produit_id, 'sortie', l.quantite, qte_avant, qte_apres, `Suppression ${achat.numero}`, req.user.id);
    }

    const reste = Math.max(0, achat.total - (achat.montant_paye || 0));
    if (achat.fournisseur_id && reste > 0) {
      db.prepare('UPDATE fournisseurs SET solde = solde - ?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(reste, achat.fournisseur_id);
    }

    db.prepare('DELETE FROM lignes_achat WHERE achat_id=?').run(achat.id);
    db.prepare('DELETE FROM achats WHERE id=?').run(achat.id);
  });

  try {
    tx();
    res.json({ message: 'Achat supprimé — stock et solde fournisseur remis à jour' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

module.exports = { getAll, getOne, create, update, remove, ajouterLignes, remplacerLignes, getStats, getMargeParProduit, genererNumero };
