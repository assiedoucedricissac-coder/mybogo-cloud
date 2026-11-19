const PDFDocument = require('pdfkit');
const { db } = require('../config/database');
const path = require('path');
const fs   = require('fs');

const uploadsDir = process.env.MYBOGO_UPLOADS_PATH || path.join(__dirname, '../../../uploads');

function getSociete() {
  try {
    const e = db.prepare('SELECT * FROM entreprise WHERE id = 1').get();
    if (e && e.nom) return {
      nom: e.nom, adresse: e.adresse || '', tel: e.telephone || '',
      email: e.email || '', nif: e.nif || '', rccm: e.rccm || '',
      logo: e.logo || null, cachet: e.cachet || null
    };
  } catch(_) {}
  return { nom: 'MON ENTREPRISE', adresse: '', tel: '', email: '', nif: '', rccm: '', logo: null, cachet: null };
}

function resolveUploadPath(urlPath) {
  if (!urlPath) return null;
  const filename = path.basename(urlPath);
  const fullPath = path.join(uploadsDir, filename);
  return fs.existsSync(fullPath) ? fullPath : null;
}

// Intl.NumberFormat('fr-FR') utilise une espace insécable fine (U+202F) comme séparateur
// de milliers : la police de base du PDF (Helvetica) ne l'a pas, elle l'affiche comme "/".
// On la remplace par une espace normale, sans risque pour l'affichage à l'écran.
const nf = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0)).replace(/[  ]/g, ' ');

const TYPE_CONFIG = {
  facture:  { prefix: 'FAC', label: 'FACTURE NORMALISÉE',              color: '#1e3a5f', textColor: 'white' },
  proforma: { prefix: 'PRO', label: 'FACTURE PROFORMA',                color: '#92400e', textColor: 'white' },
  avoir:    { prefix: 'AVO', label: 'AVOIR / NOTE DE CRÉDIT',          color: '#991b1b', textColor: 'white' },
  recu:     { prefix: 'REC', label: 'REÇU DE PAIEMENT',               color: '#14532d', textColor: 'white' },
};

function enLettres(n) {
  n = Math.round(n);
  if (n === 0) return 'Zéro franc CFA';
  const u = ['','un','deux','trois','quatre','cinq','six','sept','huit','neuf',
             'dix','onze','douze','treize','quatorze','quinze','seize',
             'dix-sept','dix-huit','dix-neuf'];
  const d = ['','dix','vingt','trente','quarante','cinquante',
             'soixante','soixante-dix','quatre-vingt','quatre-vingt-dix'];
  function b100(n) {
    if (n < 20) return u[n];
    const t = Math.floor(n/10), r = n%10;
    if (t===7) return r===0?'soixante-dix':'soixante-'+u[10+r];
    if (t===8) return r===0?'quatre-vingts':'quatre-vingt-'+u[r];
    if (t===9) return 'quatre-vingt-'+u[10+r];
    return d[t]+(r===1?'-et-un':r>0?'-'+u[r]:'');
  }
  function b1000(n) {
    if (n===0) return '';
    if (n<100) return b100(n);
    const h=Math.floor(n/100),r=n%100;
    const c=(h===1?'cent':u[h]+' cent')+(r>0?'':h>1?'s':'');
    return r>0?c+' '+b100(r):c;
  }
  let s='';
  if (n>=1000000){const m=Math.floor(n/1000000);s+=(m===1?'un million':b1000(m)+' millions')+' ';n%=1000000;}
  if (n>=1000){const k=Math.floor(n/1000);s+=(k===1?'mille':b1000(k)+' mille')+' ';n%=1000;}
  s+=b1000(n);
  s=s.trim();
  return s.charAt(0).toUpperCase()+s.slice(1)+' francs CFA';
}

function genererNumero(type) {
  const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.facture;
  const year = new Date().getFullYear();
  const code = `${cfg.prefix}-${year}`;
  const last = db.prepare(`SELECT numero FROM factures WHERE numero LIKE ? ORDER BY id DESC LIMIT 1`).get(`${code}-%`);
  const seq = last ? parseInt(last.numero.slice(-4)) + 1 : 1;
  return `${code}-${String(seq).padStart(4,'0')}`;
}

function calcLigne(l, regime) {
  const base = (parseFloat(l.prix_ht)||0) * (parseFloat(l.quantite)||0);
  const remisePct = (parseFloat(l.remise)||0) / 100;
  const remiseMt = parseFloat(l.remise_montant)||0;
  const net = Math.max(0, base * (1 - remisePct) - remiseMt);
  const tva = parseFloat(l.taux_tva)||0;
  if (regime==='exonere')    return { ht: net, tva: 0, ttc: net };
  if (regime==='ttc_inclus') { const ttc=net; const ht=ttc/(1+tva/100); return { ht, tva: ttc-ht, ttc }; }
  return { ht: net, tva: net*tva/100, ttc: net*(1+tva/100) };
}

// ── CRUD ──────────────────────────────────────────────────────────

function getAll(req, res) {
  const { type, statut, client_id, date_debut, date_fin } = req.query;
  let q = `SELECT f.*, c.nom as client_nom, u.nom as user_nom
            FROM factures f
            LEFT JOIN clients c ON f.client_id=c.id
            LEFT JOIN users u ON f.user_id=u.id
            WHERE 1=1`;
  const p = [];
  if (type)       { q += ` AND f.type=?`;                     p.push(type); }
  if (statut)     { q += ` AND f.statut=?`;                   p.push(statut); }
  if (client_id)  { q += ` AND f.client_id=?`;                p.push(client_id); }
  if (date_debut) { q += ` AND date(f.created_at) >= ?`;      p.push(date_debut); }
  if (date_fin)   { q += ` AND date(f.created_at) <= ?`;      p.push(date_fin); }
  q += ` ORDER BY f.created_at DESC LIMIT 300`;
  res.json(db.prepare(q).all(...p));
}

function getOne(req, res) {
  const f = db.prepare(`
    SELECT f.*, c.nom as client_nom, c.telephone as client_tel,
           c.adresse as client_adresse, c.numero_contribuable as client_nif,
           u.nom as user_nom
    FROM factures f
    LEFT JOIN clients c ON f.client_id=c.id
    LEFT JOIN users u ON f.user_id=u.id
    WHERE f.id=?
  `).get(req.params.id);
  if (!f) return res.status(404).json({ message: 'Facture introuvable' });
  const lignes = db.prepare(`
    SELECT lf.*, p.code as produit_code
    FROM lignes_facture lf
    LEFT JOIN produits p ON lf.produit_id=p.id
    WHERE lf.facture_id=?
  `).all(req.params.id);
  const paiements = db.prepare(`
    SELECT p.*, u.nom as user_nom FROM paiements_facture p
    LEFT JOIN users u ON p.user_id=u.id
    WHERE p.facture_id=? ORDER BY p.created_at DESC
  `).all(req.params.id);
  res.json({ ...f, lignes, paiements });
}

function ajouterPaiement(req, res) {
  const { montant, mode_paiement, note } = req.body;
  const f = db.prepare('SELECT * FROM factures WHERE id=?').get(req.params.id);
  if (!f) return res.status(404).json({ message: 'Facture introuvable' });
  const mt = parseFloat(montant);
  if (!mt || mt <= 0) return res.status(400).json({ message: 'Montant invalide' });
  if (f.statut === 'annulee') return res.status(400).json({ message: 'Document annulé' });

  const total = Number(f.total || 0);
  const dejaPay = Number(f.montant_paye || 0);
  const nouveauPaye = dejaPay + mt;
  const nouveauStatut = nouveauPaye >= total ? 'payee' : 'partielle';

  // Rattache ce règlement à la session de caisse active (si une caisse est ouverte),
  // pour que l'argent espèces reçu ici compte dans le total attendu à la clôture.
  const activeSession = db.prepare("SELECT id FROM sessions_caisse WHERE statut='ouvert' ORDER BY created_at DESC LIMIT 1").get();
  const session_id = activeSession?.id || null;

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO paiements_facture (facture_id, montant, mode_paiement, note, user_id, session_id)
      VALUES (?,?,?,?,?,?)
    `).run(f.id, mt, mode_paiement || 'especes', note || null, req.user.id, session_id);
    db.prepare(`UPDATE factures SET statut=?, montant_paye=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .run(nouveauStatut, nouveauPaye, f.id);
  });

  try {
    tx();
    res.json({
      message: 'Paiement enregistré',
      statut: nouveauStatut,
      montant_paye: nouveauPaye,
      reste: Math.max(0, total - nouveauPaye),
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
}

function create(req, res) {
  const { type='facture', client_id, lignes=[], remise=0, remise_montant=0,
          mode_paiement='especes', montant_paye, statut='emise', echeance, note, date_document } = req.body;
  if (!lignes.length) return res.status(400).json({ message: 'Au moins une ligne requise' });

  const numero = genererNumero(type);
  let sous_total=0;

  const rows = lignes.map(l => {
    const base = (parseFloat(l.prix_ht)||0) * (parseFloat(l.quantite)||0);
    const remisePct = (parseFloat(l.remise)||0) / 100;
    const remiseMt = parseFloat(l.remise_montant)||0;
    const net = Math.max(0, base * (1 - remisePct) - remiseMt);
    sous_total += net;
    return { ...l, montant_ht: net, montant_tva: 0, montant_ttc: net };
  });

  const remisePctMontant = sous_total * (parseFloat(remise)||0) / 100;
  const total = Math.max(0, sous_total - remisePctMontant - (parseFloat(remise_montant)||0));
  const paye  = (montant_paye !== undefined && montant_paye !== null && montant_paye !== '' && !isNaN(parseFloat(montant_paye)))
    ? parseFloat(montant_paye) : (statut==='payee'?total:0);
  // Date du document choisie manuellement (calendrier) — sinon horodatage actuel par défaut.
  const createdAt = date_document ? `${date_document} 12:00:00` : null;

  // Une "facture" (contrairement à une proforma/un devis) fait sortir des marchandises
  // réelles du magasin, payées ou à crédit — le stock doit donc bouger comme pour une vente
  // en Caisse. Un brouillon, lui, n'engage rien tant qu'il n'est pas émis. Vérifié AVANT la
  // transaction pour bloquer proprement si le stock est insuffisant (même message que Caisse).
  if (type === 'facture' && statut !== 'brouillon') {
    for (const row of rows) {
      if (!row.produit_id) continue;
      const qtePieces = (parseFloat(row.quantite) || 0) * (parseFloat(row.contenance) || 1);
      const prod = db.prepare('SELECT nom, qte_actuelle FROM produits WHERE id=?').get(row.produit_id);
      if (prod && prod.qte_actuelle < qtePieces) {
        return res.status(400).json({ message: `Stock insuffisant pour "${prod.nom}" (stock : ${prod.qte_actuelle}, demandé : ${qtePieces})` });
      }
    }
  }

  const tx = db.transaction(() => {
    const r = db.prepare(`
      INSERT INTO factures (numero,type,client_id,user_id,regime_tva,sous_total,remise,remise_montant,tva_total,
                            total,montant_paye,mode_paiement,statut,echeance,note${createdAt ? ',created_at' : ''})
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?${createdAt ? ',?' : ''})
    `).run(numero, type, client_id||null, req.user.id, 'exonere',
           sous_total, remise, parseFloat(remise_montant)||0, 0, total, paye, mode_paiement, statut, echeance||null, note||null,
           ...(createdAt ? [createdAt] : []));

    const fid = r.lastInsertRowid;
    for (const row of rows) {
      // Coût figé au moment de la facturation, pour que la marge reste calculable même si
      // le prix d'achat du produit change plus tard (même logique que lignes_vente.cout_achat) —
      // priorité au prix exact du conditionnement (Carton=12600, pas 48×263=12624 par arrondi),
      // recalcul depuis le prix unitaire seulement si ce format n'a pas son propre prix d'achat.
      let cout_achat = 0;
      if (row.produit_id) {
        const qte = parseFloat(row.quantite) || 0;
        const contenance = parseFloat(row.contenance) || 1;
        const uniteLibelle = row.unite_libelle || row.unite || 'unité';
        const cond = db.prepare('SELECT prix_achat FROM conditionnements WHERE produit_id=? AND libelle=? AND actif=1 LIMIT 1').get(row.produit_id, uniteLibelle);
        if (cond && cond.prix_achat > 0) {
          cout_achat = qte * cond.prix_achat;
        } else {
          const prod = db.prepare('SELECT prix_achat FROM produits WHERE id=?').get(row.produit_id);
          if (prod) cout_achat = qte * contenance * (prod.prix_achat || 0);
        }
      }
      db.prepare(`
        INSERT INTO lignes_facture (facture_id,produit_id,designation,quantite,unite,
                                    prix_ht,remise,remise_montant,taux_tva,montant_ht,montant_tva,montant_ttc,cout_achat)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(fid, row.produit_id||null, row.designation, row.quantite, row.unite||'pièce',
             row.prix_ht, row.remise||0, row.remise_montant||0, 0, row.montant_ht, 0, row.montant_ttc, cout_achat);

      // Sortie de stock — une facture émise (pas un brouillon/proforma) fait sortir les
      // marchandises réellement, que ce soit payé cash ou à crédit.
      if (type === 'facture' && statut !== 'brouillon' && row.produit_id) {
        const qtePieces = (parseFloat(row.quantite) || 0) * (parseFloat(row.contenance) || 1);
        const prodStock = db.prepare('SELECT qte_actuelle FROM produits WHERE id=?').get(row.produit_id);
        if (prodStock) {
          const qte_avant = prodStock.qte_actuelle;
          const qte_apres = qte_avant - qtePieces;
          db.prepare('UPDATE produits SET qte_actuelle=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(qte_apres, row.produit_id);
          db.prepare('INSERT INTO mouvements_stock (produit_id, type, quantite, qte_avant, qte_apres, reference_doc, user_id) VALUES (?,?,?,?,?,?,?)')
            .run(row.produit_id, 'vente', qtePieces, qte_avant, qte_apres, numero, req.user.id);
        }
      }
    }

    db.prepare(`INSERT INTO journal_activites (user_id,action,module,details) VALUES (?,?,?,?)`)
      .run(req.user.id, 'creation_facture', 'facturation', `${type} ${numero} - ${nf(total)} FCFA`);

    return { id: fid, numero, total };
  });

  try { res.status(201).json(tx()); }
  catch(err) { res.status(400).json({ message: err.message }); }
}

// Modification d'un document — réservée aux brouillons pour ne jamais toucher
// une facture déjà émise, payée ou soumise à la DGI.
function update(req, res) {
  const f = db.prepare('SELECT * FROM factures WHERE id=?').get(req.params.id);
  if (!f) return res.status(404).json({ message: 'Facture introuvable' });
  if (f.statut !== 'brouillon') return res.status(400).json({ message: 'Seul un brouillon peut être modifié' });

  const { type, client_id, lignes=[], remise=0, remise_montant=0,
          mode_paiement='especes', montant_paye, statut='emise', echeance, note, date_document } = req.body;
  if (!lignes.length) return res.status(400).json({ message: 'Au moins une ligne requise' });

  let sous_total=0;
  const rows = lignes.map(l => {
    const base = (parseFloat(l.prix_ht)||0) * (parseFloat(l.quantite)||0);
    const remisePct = (parseFloat(l.remise)||0) / 100;
    const remiseMt = parseFloat(l.remise_montant)||0;
    const net = Math.max(0, base * (1 - remisePct) - remiseMt);
    sous_total += net;
    return { ...l, montant_ht: net, montant_tva: 0, montant_ttc: net };
  });

  const remisePctMontant = sous_total * (parseFloat(remise)||0) / 100;
  const total = Math.max(0, sous_total - remisePctMontant - (parseFloat(remise_montant)||0));
  const paye  = (montant_paye !== undefined && montant_paye !== null && montant_paye !== '' && !isNaN(parseFloat(montant_paye)))
    ? parseFloat(montant_paye) : (statut==='payee'?total:0);
  const createdAt = date_document ? `${date_document} 12:00:00` : null;

  // f.statut est forcément 'brouillon' ici (contrôlé plus haut) — donc aucune sortie de stock
  // n'a encore eu lieu pour ce document. Si on le finalise maintenant (nouveau statut ≠
  // brouillon) sur un type "facture", c'est à cet instant que les marchandises sortent
  // réellement, avec la même vérification de stock disponible qu'à la création.
  const finalise = (type || f.type) === 'facture' && statut !== 'brouillon';
  if (finalise) {
    for (const row of rows) {
      if (!row.produit_id) continue;
      const qtePieces = (parseFloat(row.quantite) || 0) * (parseFloat(row.contenance) || 1);
      const prod = db.prepare('SELECT nom, qte_actuelle FROM produits WHERE id=?').get(row.produit_id);
      if (prod && prod.qte_actuelle < qtePieces) {
        return res.status(400).json({ message: `Stock insuffisant pour "${prod.nom}" (stock : ${prod.qte_actuelle}, demandé : ${qtePieces})` });
      }
    }
  }

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE factures SET type=?, client_id=?, sous_total=?, remise=?, remise_montant=?, total=?,
        montant_paye=?, mode_paiement=?, statut=?, echeance=?, note=?, updated_at=CURRENT_TIMESTAMP${createdAt ? ', created_at=?' : ''}
      WHERE id=?
    `).run(type || f.type, client_id||null, sous_total, remise, parseFloat(remise_montant)||0, total,
           paye, mode_paiement, statut, echeance||null, note||null, ...(createdAt ? [createdAt] : []), f.id);

    db.prepare('DELETE FROM lignes_facture WHERE facture_id=?').run(f.id);
    for (const row of rows) {
      let cout_achat = 0;
      if (row.produit_id) {
        const qte = parseFloat(row.quantite) || 0;
        const contenance = parseFloat(row.contenance) || 1;
        const uniteLibelle = row.unite_libelle || row.unite || 'unité';
        const cond = db.prepare('SELECT prix_achat FROM conditionnements WHERE produit_id=? AND libelle=? AND actif=1 LIMIT 1').get(row.produit_id, uniteLibelle);
        if (cond && cond.prix_achat > 0) {
          cout_achat = qte * cond.prix_achat;
        } else {
          const prod = db.prepare('SELECT prix_achat FROM produits WHERE id=?').get(row.produit_id);
          if (prod) cout_achat = qte * contenance * (prod.prix_achat || 0);
        }
      }
      db.prepare(`
        INSERT INTO lignes_facture (facture_id,produit_id,designation,quantite,unite,
                                    prix_ht,remise,remise_montant,taux_tva,montant_ht,montant_tva,montant_ttc,cout_achat)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(f.id, row.produit_id||null, row.designation, row.quantite, row.unite||'pièce',
             row.prix_ht, row.remise||0, row.remise_montant||0, 0, row.montant_ht, 0, row.montant_ttc, cout_achat);

      if (finalise && row.produit_id) {
        const qtePieces = (parseFloat(row.quantite) || 0) * (parseFloat(row.contenance) || 1);
        const prodStock = db.prepare('SELECT qte_actuelle FROM produits WHERE id=?').get(row.produit_id);
        if (prodStock) {
          const qte_avant = prodStock.qte_actuelle;
          const qte_apres = qte_avant - qtePieces;
          db.prepare('UPDATE produits SET qte_actuelle=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(qte_apres, row.produit_id);
          db.prepare('INSERT INTO mouvements_stock (produit_id, type, quantite, qte_avant, qte_apres, reference_doc, user_id) VALUES (?,?,?,?,?,?,?)')
            .run(row.produit_id, 'vente', qtePieces, qte_avant, qte_apres, f.numero, req.user.id);
        }
      }
    }

    db.prepare(`INSERT INTO journal_activites (user_id,action,module,details) VALUES (?,?,?,?)`)
      .run(req.user.id, 'modification_facture', 'facturation', `${f.numero} - ${nf(total)} FCFA`);

    return { id: f.id, numero: f.numero, total };
  });

  try { res.json(tx()); }
  catch(err) { res.status(400).json({ message: err.message }); }
}

function createFromVente(req, res) {
  const { type='facture' } = req.body;
  const vente = db.prepare(`
    SELECT v.*, c.nom as client_nom FROM ventes v LEFT JOIN clients c ON v.client_id=c.id WHERE v.id=?
  `).get(req.params.venteId);
  if (!vente) return res.status(404).json({ message: 'Vente introuvable' });

  const lignesVente = db.prepare(`
    SELECT l.*, p.nom as produit_nom, p.unite FROM lignes_vente l JOIN produits p ON l.produit_id=p.id WHERE l.vente_id=?
  `).all(req.params.venteId);

  const numero = genererNumero(type);

  const tx = db.transaction(() => {
    const r = db.prepare(`
      INSERT INTO factures (numero,type,vente_id,client_id,user_id,regime_tva,sous_total,remise,
                            tva_total,total,montant_paye,mode_paiement,statut)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(numero, type, vente.id, vente.client_id||null, req.user.id, 'normal',
           vente.sous_total, vente.remise, vente.tva_total, vente.total,
           vente.montant_paye, vente.mode_paiement, 'payee');

    const fid = r.lastInsertRowid;
    for (const l of lignesVente) {
      const ht = l.total / (1 + l.tva/100) * (1 + (vente.remise||0)/100);
      const tva = l.total - ht;
      db.prepare(`
        INSERT INTO lignes_facture (facture_id,produit_id,designation,quantite,unite,
                                    prix_ht,remise,taux_tva,montant_ht,montant_tva,montant_ttc)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
      `).run(fid, l.produit_id, l.produit_nom, l.quantite, l.unite||'pièce',
             l.prix_unitaire, l.remise||0, l.tva, l.total/(1+l.tva/100), l.total*l.tva/(100+l.tva), l.total);
    }
    return { id: fid, numero };
  });

  try { res.status(201).json(tx()); }
  catch(err) { res.status(400).json({ message: err.message }); }
}

function updateStatut(req, res) {
  const { statut, montant_paye } = req.body;
  const f = db.prepare('SELECT * FROM factures WHERE id=?').get(req.params.id);
  if (!f) return res.status(404).json({ message: 'Facture introuvable' });

  const newMontantPaye = montant_paye !== undefined && montant_paye !== null ? parseFloat(montant_paye) : Number(f.montant_paye || 0);
  const total = Number(f.total || 0);
  const reste = Math.max(0, total - newMontantPaye);
  let newStatut = statut || f.statut;
  if (newMontantPaye >= total) newStatut = 'payee';
  else if (newMontantPaye > 0) newStatut = 'partielle';
  else if (newStatut === 'payee') newStatut = 'emise';

  db.prepare(`UPDATE factures SET statut=?, montant_paye=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(newStatut, newMontantPaye, f.id);
  res.json({ message: 'Statut mis à jour', statut: newStatut, montant_paye: newMontantPaye, reste });
}

function convertirProforma(req, res) {
  const pro = db.prepare('SELECT * FROM factures WHERE id=? AND type=?').get(req.params.id, 'proforma');
  if (!pro) return res.status(404).json({ message: 'Proforma introuvable' });

  const numero = genererNumero('facture');
  const tx = db.transaction(() => {
    const r = db.prepare(`
      INSERT INTO factures (numero,type,client_id,user_id,regime_tva,sous_total,remise,remise_montant,
                            tva_total,total,mode_paiement,statut,note)
      SELECT ?,?,client_id,user_id,regime_tva,sous_total,remise,remise_montant,
             tva_total,total,mode_paiement,'emise',note
      FROM factures WHERE id=?
    `).run(numero, 'facture', pro.id);

    const newId = r.lastInsertRowid;
    const lignes = db.prepare('SELECT * FROM lignes_facture WHERE facture_id=?').all(pro.id);
    for (const l of lignes) {
      db.prepare(`
        INSERT INTO lignes_facture (facture_id,produit_id,designation,quantite,unite,
                                    prix_ht,remise,remise_montant,taux_tva,montant_ht,montant_tva,montant_ttc)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(newId, l.produit_id, l.designation, l.quantite, l.unite,
             l.prix_ht, l.remise, l.remise_montant || 0, l.taux_tva, l.montant_ht, l.montant_tva, l.montant_ttc);
    }
    db.prepare(`UPDATE factures SET statut='annulee', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(pro.id);
    return { id: newId, numero };
  });

  try { res.status(201).json(tx()); }
  catch(err) { res.status(400).json({ message: err.message }); }
}

// ── PDF ───────────────────────────────────────────────────────────

function genererPDF(req, res) {
  const f = db.prepare(`
    SELECT f.*, c.nom as client_nom, c.telephone as client_tel,
           c.adresse as client_adresse, c.numero_contribuable as client_nif,
           u.nom as user_nom,
           fr.numero as avoir_ref_numero
    FROM factures f
    LEFT JOIN clients c ON f.client_id=c.id
    LEFT JOIN users u ON f.user_id=u.id
    LEFT JOIN factures fr ON f.avoir_ref_id=fr.id
    WHERE f.id=?
  `).get(req.params.id);
  if (!f) return res.status(404).json({ message: 'Facture introuvable' });

  const lignes = db.prepare(`
    SELECT lf.*, p.code as produit_code FROM lignes_facture lf
    LEFT JOIN produits p ON lf.produit_id=p.id WHERE lf.facture_id=?
  `).all(req.params.id);

  const cfg = TYPE_CONFIG[f.type] || TYPE_CONFIG.facture;
  const S = getSociete();
  const ML=40, W=515;

  const doc = new PDFDocument({ size:'A4', margin:ML, info:{ Title: f.numero, Author: S.nom } });
  res.setHeader('Content-Type','application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${f.numero}.pdf"`);
  doc.pipe(res);

  // ── EN-TÊTE ─────────────────────────────────────────────
  doc.rect(0,0,595,115).fill(cfg.color);

  doc.fillColor('white').fontSize(20).font('Helvetica-Bold').text(S.nom, ML, 18);
  doc.fontSize(8.5).font('Helvetica')
     .text(S.adresse, ML, 46)
     .text(`Tél : ${S.tel}   |   Email : ${S.email}`, ML, 58)
     .text(`NIF : ${S.nif}   |   RCCM : ${S.rccm}`, ML, 70);

  doc.fontSize(f.type==='proforma'?13:16).font('Helvetica-Bold').fillColor('#fbbf24')
     .text(cfg.label, 280, 18, { width:275, align:'right' });

  if (f.type==='proforma') {
    doc.fontSize(9).fillColor('white').font('Helvetica')
       .text('DOCUMENT NON DÉFINITIF — NON VALABLE FISCALEMENT', 280, 40, { width:275, align:'right' });
  }
  if (f.type==='avoir' && f.avoir_ref_numero) {
    doc.fontSize(9).fillColor('white').font('Helvetica')
       .text(`Avoir sur facture N° ${f.avoir_ref_numero}`, 280, 40, { width:275, align:'right' });
  }

  doc.fontSize(9.5).font('Helvetica').fillColor('white')
     .text(`N°  ${f.numero}`, 280, f.type==='facture'?52:58, { width:275, align:'right' })
     .text(`Date : ${new Date(f.created_at).toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'})}`, 280, 72, { width:275, align:'right' });
  if (f.echeance) {
    doc.text(`Échéance : ${new Date(f.echeance).toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'})}`, 280, 85, { width:275, align:'right' });
  }

  // ── BLOC CLIENT ─────────────────────────────────────────
  let y=130;
  doc.fontSize(8).font('Helvetica-Bold').fillColor('#6b7280').text('FACTURÉ À :', ML, y);
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#111827')
     .text(f.client_nom || 'Client de passage', ML, y+13);
  doc.fontSize(8.5).font('Helvetica').fillColor('#6b7280');
  let cy=y+27;
  if (f.client_tel)     { doc.text(`Tél : ${f.client_tel}`, ML, cy); cy+=12; }
  if (f.client_adresse) { doc.text(f.client_adresse, ML, cy); cy+=12; }
  if (f.client_nif)     { doc.text(`NIF : ${f.client_nif}`, ML, cy); cy+=12; }

  // Boîte droite
  doc.roundedRect(345, y-4, 210, 72, 5).fill('#f3f4f6');
  const infoRows = [
    ['Type',              cfg.label.split('—')[0].trim()],
    ['Mode de règlement', f.mode_paiement.replace(/_/g,' ').toUpperCase()],
    ['Statut',            f.statut==='payee'?'SOLDÉ ✓':f.statut==='brouillon'?'BROUILLON':f.statut==='emise'?'ÉMISE':f.statut==='partielle'?'PARTIELLE':'ANNULÉE'],
  ];
  infoRows.forEach(([lbl,val],i)=>{
    doc.fontSize(7.5).font('Helvetica').fillColor('#9ca3af').text(lbl, 353, y+6+i*15);
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#111827').text(val, 440, y+6+i*15, {width:108,align:'right'});
  });

  // ── TABLEAU ──────────────────────────────────────────────
  y = Math.max(cy, y+76)+14;

  const cols = [
    { label:'Désignation',  x:ML,       w:220, align:'left'   },
    { label:'Qté',          x:ML+220,   w:40,  align:'center' },
    { label:'Unité',        x:ML+260,   w:50,  align:'center' },
    { label:'Prix unitaire',x:ML+310,   w:90,  align:'right'  },
    { label:'Remise',       x:ML+400,   w:45,  align:'center' },
    { label:'Total',        x:ML+445,   w:70,  align:'right'  },
  ];

  doc.rect(ML, y, W, 22).fill(cfg.color);
  doc.fontSize(7.5).font('Helvetica-Bold').fillColor('white');
  cols.forEach(c => doc.text(c.label, c.x+3, y+7, {width:c.w-6, align:c.align}));
  y+=22;

  lignes.forEach((l,i)=>{
    const rowH=19;
    doc.rect(ML,y,W,rowH).fill(i%2===0?'white':'#f9fafb');
    doc.moveTo(ML,y).lineTo(ML+W,y).strokeColor('#e5e7eb').lineWidth(0.4).stroke();
    doc.fontSize(8.5).font('Helvetica').fillColor('#111827');
    doc.text(l.designation,                  cols[0].x+3,y+5,{width:cols[0].w-6,align:'left'});
    doc.text(`${l.quantite}`,                cols[1].x+3,y+5,{width:cols[1].w-6,align:'center'});
    doc.text(l.unite||'pièce',               cols[2].x+3,y+5,{width:cols[2].w-6,align:'center'});
    doc.text(nf(l.prix_ht),                  cols[3].x+3,y+5,{width:cols[3].w-6,align:'right'});
    doc.text(l.remise>0?`${l.remise}%`:'-',  cols[4].x+3,y+5,{width:cols[4].w-6,align:'center'});
    doc.text(nf(l.montant_ttc),              cols[5].x+3,y+5,{width:cols[5].w-6,align:'right'});
    y+=rowH;
  });
  doc.moveTo(ML,y).lineTo(ML+W,y).strokeColor(cfg.color).lineWidth(1).stroke();

  // ── TOTAUX ───────────────────────────────────────────────
  y+=12;
  const tx2=ML+310, tw=205;
  function totLigne(lbl,val,gras=false,rouge=false) {
    doc.font(gras?'Helvetica-Bold':'Helvetica').fontSize(9).fillColor(rouge?'#dc2626':'#374151')
       .text(lbl, tx2, y, {width:115, align:'left'})
       .text(val+' FCFA', tx2+115, y, {width:tw-115, align:'right'});
    y+=16;
  }

  totLigne('Sous-total :', nf(f.sous_total));
  if (f.remise>0) totLigne(`Remise (${f.remise}%) :`, `-${nf(f.sous_total*f.remise/100)}`, false, true);

  doc.rect(tx2-4,y-2,tw+4,26).fill(cfg.color);
  doc.fontSize(11).font('Helvetica-Bold').fillColor('white')
     .text('TOTAL :', tx2, y+6, {width:115,align:'left'})
     .text(`${nf(f.total)} FCFA`, tx2+115, y+6, {width:tw-115,align:'right'});
  y+=34;

  if (f.montant_paye<f.total && f.type!=='recu') {
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#dc2626')
       .text(`Reste à payer : ${nf(f.total-f.montant_paye)} FCFA`, tx2, y, {width:tw,align:'right'});
    y+=14;
  }

  // Pour un reçu de règlement client : ce document est toujours "soldé" pour son propre
  // montant, mais le client peut avoir une dette restante sur d'AUTRES factures/ventes —
  // on l'affiche explicitement pour éviter toute confusion (cf. capture client Cedric).
  if (f.type==='recu' && f.client_id) {
    const detteFactures = db.prepare(`
      SELECT COALESCE(SUM(total - montant_paye),0) as d FROM factures
      WHERE client_id=? AND type='facture' AND statut IN ('emise','partielle')
    `).get(f.client_id).d;
    const clientRow = db.prepare('SELECT solde FROM clients WHERE id=?').get(f.client_id);
    const detteVentes = clientRow && clientRow.solde < 0 ? -clientRow.solde : 0;
    const detteTotale = detteFactures + detteVentes;
    if (detteTotale > 0.5) {
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#dc2626')
         .text(`Reste à payer sur le compte client : ${nf(detteTotale)} FCFA`, tx2, y, {width:tw,align:'right'});
      y+=14;
    } else {
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#15803d')
         .text(`Compte client soldé — plus rien dû`, tx2, y, {width:tw,align:'right'});
      y+=14;
    }
  }

  // ── MONTANT EN LETTRES ────────────────────────────────────
  y+=8;
  doc.roundedRect(ML,y,W,32,4).fill('#fef9c3');
  doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#92400e')
     .text('Arrêté la présente facture à la somme de :', ML+8, y+5);
  doc.font('Helvetica').fillColor('#78350f').text(enLettres(f.total), ML+8, y+17, {width:W-16});
  y+=42;

  if (f.note) {
    doc.fontSize(8.5).font('Helvetica').fillColor('#6b7280').text(`Note : ${f.note}`, ML, y);
    y+=18;
  }

  // ── CACHET ENTREPRISE ────────────────────────────────────
  const cachetPath = resolveUploadPath(S.cachet);
  // Plafonné pour laisser assez de marge au pied de page ci-dessous SUR LA MÊME PAGE :
  // avec footerY=760 et une page A4 (marge basse ≈802pt), un signY trop haut (proche de 800)
  // poussait le texte du pied de page hors de la zone imprimable — PDFKit le rejetait alors
  // sur une 2e page, gaspillant une feuille entière pour 2 lignes de texte.
  const signY = Math.min(y + 10, 680);
  // Zone signature à droite
  doc.fontSize(7.5).font('Helvetica').fillColor('#9ca3af')
     .text('Cachet et signature', ML + 310, signY, { width: 205, align: 'center' });
  doc.moveTo(ML + 315, signY + 10).lineTo(ML + 510, signY + 10).strokeColor('#d1d5db').lineWidth(0.5).stroke();
  if (cachetPath) {
    try {
      doc.image(cachetPath, ML + 350, signY + 14, { width: 130, height: 80, fit: [130, 80] });
    } catch(_) {}
  }

  // Tampon PAYÉ pour les reçus/factures payées
  if (f.type==='recu'||(f.statut==='payee'&&f.type==='facture')) {
    doc.save();
    doc.translate(150, signY + 50).rotate(-20);
    doc.roundedRect(-55,-20,110,40,8).strokeColor('#15803d').lineWidth(3).stroke();
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#15803d').text('SOLDÉ', -48, -10);
    doc.restore();
  }

  // ── PIED ─────────────────────────────────────────────────
  const footerY=760;
  doc.moveTo(ML,footerY).lineTo(ML+W,footerY).strokeColor('#d1d5db').lineWidth(0.5).stroke();
  doc.fontSize(7).font('Helvetica').fillColor('#9ca3af')
     .text(`${S.nom}  ·  NIF : ${S.nif}  ·  RCCM : ${S.rccm}  ·  ${S.adresse}`, ML, footerY+8, {width:W,align:'center'});
  if (f.type==='facture') {
    doc.text("Facture normalisée conforme aux dispositions fiscales en vigueur en République de Côte d'Ivoire", ML, footerY+20, {width:W,align:'center'});
  } else if (f.type==='proforma') {
    doc.text('Document proforma — Non valable comme facture fiscale — Offre valable 30 jours', ML, footerY+20, {width:W,align:'center'});
  } else if (f.type==='avoir') {
    doc.text('Document avoir / Note de crédit — À déduire des prochaines commandes', ML, footerY+20, {width:W,align:'center'});
  }

  doc.end();
}

module.exports = { getAll, getOne, create, update, createFromVente, updateStatut, ajouterPaiement, convertirProforma, genererPDF, genererNumero };
