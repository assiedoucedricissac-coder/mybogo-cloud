const { db } = require('../config/database');
const PDFDocument = require('pdfkit');
const XLSX = require('xlsx');

const nf = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0));

function getSociete() {
  try { const e = db.prepare('SELECT * FROM entreprise WHERE id=1').get(); if (e && e.nom) return e; } catch(_) {}
  return { nom:'MON ENTREPRISE', adresse:'', telephone:'', nif:'', rccm:'' };
}

// ── LISTE ────────────────────────────────────────────────────────────────────
function getAll(req, res) {
  const rows = db.prepare(`
    SELECT i.*, u.nom as user_nom, sp.nom as soumis_par_nom, vp.nom as valide_par_nom,
      (SELECT COUNT(*) FROM lignes_inventaire WHERE inventaire_id=i.id) as total_lignes,
      (SELECT COUNT(*) FROM lignes_inventaire WHERE inventaire_id=i.id AND qte_comptee IS NOT NULL) as lignes_comptees,
      (SELECT COUNT(*) FROM lignes_inventaire WHERE inventaire_id=i.id AND ecart!=0 AND ecart IS NOT NULL) as lignes_ecart,
      (SELECT COALESCE(SUM(ABS(l.ecart)*p.prix_achat),0) FROM lignes_inventaire l JOIN produits p ON l.produit_id=p.id WHERE l.inventaire_id=i.id AND l.ecart IS NOT NULL) as valeur_ecart_total
    FROM inventaires i
    LEFT JOIN users u ON i.user_id=u.id
    LEFT JOIN users sp ON i.soumis_par=sp.id
    LEFT JOIN users vp ON i.valide_par=vp.id
    ORDER BY i.created_at DESC LIMIT 100
  `).all();
  res.json(rows);
}

// ── STATS GLOBAUX ─────────────────────────────────────────────────────────────
function getStats(req, res) {
  const total    = db.prepare("SELECT COUNT(*) as c FROM inventaires").get().c;
  const valides  = db.prepare("SELECT COUNT(*) as c FROM inventaires WHERE statut='valide'").get().c;
  const en_cours = db.prepare("SELECT COUNT(*) as c FROM inventaires WHERE statut IN ('brouillon','soumis')").get().c;
  const a_valider= db.prepare("SELECT COUNT(*) as c FROM inventaires WHERE statut='soumis'").get().c;
  const dernier  = db.prepare(`
    SELECT i.reference, i.created_at, i.valide_at,
      COUNT(l.id) as total_lignes,
      SUM(CASE WHEN l.ecart=0 OR l.ecart IS NULL THEN 0 ELSE 1 END) as avec_ecart,
      COALESCE(SUM(CASE WHEN l.ecart>0 THEN l.ecart*p.prix_achat ELSE 0 END),0) as valeur_surplus,
      COALESCE(SUM(CASE WHEN l.ecart<0 THEN ABS(l.ecart)*p.prix_achat ELSE 0 END),0) as valeur_manquant
    FROM inventaires i
    LEFT JOIN lignes_inventaire l ON l.inventaire_id=i.id
    LEFT JOIN produits p ON l.produit_id=p.id
    WHERE i.statut='valide'
    GROUP BY i.id ORDER BY i.valide_at DESC LIMIT 1
  `).get();
  res.json({ total, valides, en_cours, a_valider, dernier });
}

// ── DETAIL ────────────────────────────────────────────────────────────────────
function getOne(req, res) {
  const inv = db.prepare(`
    SELECT i.*, u.nom as user_nom, sp.nom as soumis_par_nom, vp.nom as valide_par_nom
    FROM inventaires i LEFT JOIN users u ON i.user_id=u.id
    LEFT JOIN users sp ON i.soumis_par=sp.id LEFT JOIN users vp ON i.valide_par=vp.id
    WHERE i.id=?
  `).get(req.params.id);
  if (!inv) return res.status(404).json({ message: 'Inventaire introuvable' });

  // Auto-ajouter les produits actifs manquants si l'inventaire est encore modifiable
  if (['brouillon', 'soumis'].includes(inv.statut)) {
    const manquants = db.prepare(`
      SELECT id, qte_actuelle FROM produits
      WHERE actif = 1
      AND id NOT IN (SELECT produit_id FROM lignes_inventaire WHERE inventaire_id = ?)
    `).all(req.params.id);
    if (manquants.length > 0) {
      const stmt = db.prepare('INSERT INTO lignes_inventaire (inventaire_id,produit_id,qte_systeme,qte_comptee,ecart) VALUES (?,?,?,NULL,NULL)');
      for (const p of manquants) stmt.run(req.params.id, p.id, p.qte_actuelle);
    }
  }

  const lignes = db.prepare(`
    SELECT l.id, l.inventaire_id, l.produit_id, l.qte_comptee, l.ecart,
           l.qte_systeme,
           p.nom as produit_nom, p.code as produit_code, p.code_barres,
           p.unite, p.prix_achat, p.date_expiration,
           c.nom as categorie_nom,
           CASE WHEN p.qte_actuelle=0 THEN 'rupture'
                WHEN p.qte_actuelle<=p.qte_min THEN 'faible'
                WHEN p.date_expiration IS NOT NULL AND date(p.date_expiration)<=date('now') THEN 'expire'
                ELSE 'normal' END as alerte
    FROM lignes_inventaire l
    JOIN produits p ON l.produit_id=p.id
    LEFT JOIN categories c ON p.categorie_id=c.id
    WHERE l.inventaire_id=? ORDER BY p.nom
  `).all(req.params.id);
  res.json({ ...inv, lignes });
}

// ── CRÉER ─────────────────────────────────────────────────────────────────────
function create(req, res) {
  const { note, categorie_id } = req.body;
  const ongoing = db.prepare("SELECT id,reference FROM inventaires WHERE statut IN ('brouillon','soumis')").get();
  if (ongoing) return res.status(400).json({ message: 'Un inventaire est déjà en cours', id: ongoing.id });
  const produits = categorie_id
    ? db.prepare('SELECT id,qte_actuelle FROM produits WHERE actif=1 AND categorie_id=? ORDER BY nom').all(categorie_id)
    : db.prepare('SELECT id,qte_actuelle FROM produits WHERE actif=1 ORDER BY nom').all();
  if (!produits.length) return res.status(400).json({ message: 'Aucun produit actif' });
  const d = new Date();
  const ref = `INV-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${String(Date.now()).slice(-4)}`;
  const tx = db.transaction(() => {
    const r = db.prepare('INSERT INTO inventaires (reference,note,user_id) VALUES (?,?,?)').run(ref, note||null, req.user.id);
    const id = r.lastInsertRowid;
    const stmt = db.prepare('INSERT INTO lignes_inventaire (inventaire_id,produit_id,qte_systeme,qte_comptee,ecart) VALUES (?,?,?,NULL,NULL)');
    for (const p of produits) stmt.run(id, p.id, p.qte_actuelle);
    return { id, reference: ref, total: produits.length };
  });
  try { res.status(201).json(tx()); } catch(e) { res.status(500).json({ message: e.message }); }
}

// ── MISE À JOUR LIGNE ──────────────────────────────────────────────────────────
function updateLigne(req, res) {
  const { qte_comptee } = req.body;
  const ligne = db.prepare(`SELECT l.*,i.statut FROM lignes_inventaire l JOIN inventaires i ON l.inventaire_id=i.id WHERE l.id=? AND l.inventaire_id=?`).get(req.params.ligneId, req.params.id);
  if (!ligne) return res.status(404).json({ message: 'Ligne introuvable' });
  if (!['brouillon','soumis'].includes(ligne.statut)) return res.status(400).json({ message: 'Inventaire déjà traité' });
  const qte = qte_comptee !== null && qte_comptee !== undefined ? parseInt(qte_comptee) : null;
  const ecart = qte !== null ? qte - ligne.qte_systeme : null;
  db.prepare('UPDATE lignes_inventaire SET qte_comptee=?,ecart=? WHERE id=?').run(qte, ecart, ligne.id);
  res.json({ ecart });
}

// ── SOUMETTRE (magasinier → admin) ─────────────────────────────────────────────
function soumettre(req, res) {
  const inv = db.prepare("SELECT * FROM inventaires WHERE id=? AND statut='brouillon'").get(req.params.id);
  if (!inv) return res.status(404).json({ message: 'Inventaire introuvable ou déjà soumis' });
  const comptees = db.prepare('SELECT COUNT(*) as c FROM lignes_inventaire WHERE inventaire_id=? AND qte_comptee IS NOT NULL').get(req.params.id).c;
  if (!comptees) return res.status(400).json({ message: 'Aucune quantité saisie' });
  db.prepare("UPDATE inventaires SET statut='soumis',soumis_at=CURRENT_TIMESTAMP,soumis_par=? WHERE id=?").run(req.user.id, req.params.id);
  db.prepare('INSERT INTO journal_activites (user_id,action,module,details) VALUES (?,?,?,?)').run(req.user.id,'soumission_inventaire','inventaire',`${inv.reference} soumis`);
  res.json({ message: 'Inventaire soumis pour validation' });
}

// ── VALIDER ───────────────────────────────────────────────────────────────────
function valider(req, res) {
  const inv = db.prepare("SELECT * FROM inventaires WHERE id=? AND statut IN ('brouillon','soumis')").get(req.params.id);
  if (!inv) return res.status(404).json({ message: 'Inventaire introuvable ou déjà traité' });
  const lignes = db.prepare('SELECT * FROM lignes_inventaire WHERE inventaire_id=? AND qte_comptee IS NOT NULL').all(req.params.id);
  if (!lignes.length) return res.status(400).json({ message: 'Aucune quantité saisie' });
  const tx = db.transaction(() => {
    let ajustements = 0;
    for (const l of lignes) {
      if (l.ecart !== null && l.ecart !== 0) {
        const p = db.prepare('SELECT qte_actuelle FROM produits WHERE id=?').get(l.produit_id);
        db.prepare('UPDATE produits SET qte_actuelle=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(l.qte_comptee, l.produit_id);
        db.prepare('INSERT INTO mouvements_stock (produit_id,type,quantite,qte_avant,qte_apres,reference_doc,motif,user_id) VALUES (?,?,?,?,?,?,?,?)').run(l.produit_id,'ajustement',Math.abs(l.ecart),p.qte_actuelle,l.qte_comptee,inv.reference,`Inventaire ${inv.reference}`,req.user.id);
        ajustements++;
      }
    }
    db.prepare("UPDATE inventaires SET statut='valide',valide_at=CURRENT_TIMESTAMP,valide_par=? WHERE id=?").run(req.user.id, inv.id);
    db.prepare('INSERT INTO journal_activites (user_id,action,module,details) VALUES (?,?,?,?)').run(req.user.id,'validation_inventaire','inventaire',`${inv.reference} — ${ajustements} ajust.`);
    return { ajustements, comptees: lignes.length };
  });
  try { res.json(tx()); } catch(e) { res.status(500).json({ message: e.message }); }
}

// ── REJETER ────────────────────────────────────────────────────────────────────
function rejeter(req, res) {
  const { note_rejet } = req.body;
  const inv = db.prepare("SELECT * FROM inventaires WHERE id=? AND statut='soumis'").get(req.params.id);
  if (!inv) return res.status(404).json({ message: 'Inventaire non soumis' });
  db.prepare("UPDATE inventaires SET statut='rejete',note_rejet=? WHERE id=?").run(note_rejet||'', req.params.id);
  db.prepare('INSERT INTO journal_activites (user_id,action,module,details) VALUES (?,?,?,?)').run(req.user.id,'rejet_inventaire','inventaire',`${inv.reference} rejeté`);
  res.json({ message: 'Inventaire rejeté' });
}

// ── ANNULER ────────────────────────────────────────────────────────────────────
function annuler(req, res) {
  const inv = db.prepare("SELECT id FROM inventaires WHERE id=? AND statut IN ('brouillon','rejete')").get(req.params.id);
  if (!inv) return res.status(404).json({ message: 'Inventaire introuvable ou non annulable' });
  db.prepare("UPDATE inventaires SET statut='annule' WHERE id=?").run(req.params.id);
  res.json({ message: 'Inventaire annulé' });
}

// ── SYNCHRONISER (remet qte_comptee = qte_actuelle + ajoute produits manquants) ─
function synchroniser(req, res) {
  const inv = db.prepare("SELECT id FROM inventaires WHERE id=? AND statut='brouillon'").get(req.params.id);
  if (!inv) return res.status(404).json({ message: 'Inventaire introuvable ou non modifiable' });
  const tx = db.transaction(() => {
    // Mettre à jour les lignes existantes
    db.prepare(`
      UPDATE lignes_inventaire
      SET qte_systeme = (SELECT qte_actuelle FROM produits WHERE id = lignes_inventaire.produit_id),
          qte_comptee = (SELECT qte_actuelle FROM produits WHERE id = lignes_inventaire.produit_id),
          ecart = 0
      WHERE inventaire_id = ?
    `).run(req.params.id);
    // Ajouter les produits actifs qui ne sont pas encore dans l'inventaire
    const manquants = db.prepare(`
      SELECT id, qte_actuelle FROM produits
      WHERE actif = 1
      AND id NOT IN (SELECT produit_id FROM lignes_inventaire WHERE inventaire_id = ?)
    `).all(req.params.id);
    const stmt = db.prepare('INSERT INTO lignes_inventaire (inventaire_id,produit_id,qte_systeme,qte_comptee,ecart) VALUES (?,?,?,?,0)');
    for (const p of manquants) stmt.run(req.params.id, p.id, p.qte_actuelle, p.qte_actuelle);
    return { ajoutes: manquants.length };
  });
  const r = tx();
  res.json({ message: `Synchronisé — ${r.ajoutes} nouveau(x) produit(s) ajouté(s)` });
}

// ── EXPORT PDF ────────────────────────────────────────────────────────────────
function exportPDF(req, res) {
  const inv = db.prepare(`SELECT i.*,u.nom as user_nom,vp.nom as valide_par_nom FROM inventaires i LEFT JOIN users u ON i.user_id=u.id LEFT JOIN users vp ON i.valide_par=vp.id WHERE i.id=?`).get(req.params.id);
  if (!inv) return res.status(404).json({ message: 'Inventaire introuvable' });
  const lignes = db.prepare(`SELECT l.*,p.nom as produit_nom,p.code as produit_code,p.prix_achat,c.nom as categorie_nom FROM lignes_inventaire l JOIN produits p ON l.produit_id=p.id LEFT JOIN categories c ON p.categorie_id=c.id WHERE l.inventaire_id=? ORDER BY p.nom`).all(req.params.id);
  const soc = getSociete();
  const avecEcart = lignes.filter(l => l.ecart !== 0 && l.ecart !== null);
  const surplus = lignes.filter(l => l.ecart > 0).reduce((s,l) => s+l.ecart*l.prix_achat, 0);
  const manquant = lignes.filter(l => l.ecart < 0).reduce((s,l) => s+Math.abs(l.ecart)*l.prix_achat, 0);

  const dateInv = new Date(inv.created_at);
  const moisNom = dateInv.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const pdfFilename = `Rapport inventaire du mois de ${moisNom}.pdf`;

  const doc = new PDFDocument({ size:'A4', margin:40, layout:'landscape' });
  res.setHeader('Content-Type','application/pdf');
  res.setHeader('Content-Disposition',`attachment; filename="${pdfFilename}"`);
  doc.pipe(res);

  // En-tête
  doc.rect(0,0,842,80).fill('#1e3a5f');
  doc.fillColor('white').fontSize(16).font('Helvetica-Bold').text(soc.nom, 40, 18);
  doc.fontSize(9).font('Helvetica').text(`${soc.adresse}  ·  Tél: ${soc.telephone}  ·  NIF: ${soc.nif}`, 40, 40);
  doc.fontSize(18).font('Helvetica-Bold').fillColor('#fbbf24').text('RAPPORT D\'INVENTAIRE', 420, 18, {width:382,align:'right'});
  doc.fontSize(10).font('Helvetica').fillColor('white').text(`Référence: ${inv.reference}`, 420, 46, {width:382,align:'right'});
  doc.text(`Date: ${new Date(inv.created_at).toLocaleDateString('fr-FR')}`, 420, 58, {width:382,align:'right'});

  // Résumé
  let y = 100;
  doc.fillColor('#1e3a5f').fontSize(10).font('Helvetica-Bold').text('RÉSUMÉ', 40, y);
  y += 14;
  const boxes = [
    ['Produits listés', lignes.length, '#e0e7ff','#3730a3'],
    ['Comptés', lignes.filter(l=>l.qte_comptee!==null).length, '#dcfce7','#166534'],
    ['Avec écart', avecEcart.length, '#fef3c7','#92400e'],
    ['Valeur surplus', `+${nf(surplus)} FCFA`, '#dbeafe','#1e40af'],
    ['Valeur manquant', `-${nf(manquant)} FCFA`, '#fee2e2','#991b1b'],
    ['Saisi par', inv.user_nom||'—', '#f3f4f6','#374151'],
  ];
  let bx = 40;
  for (const [label,val,bg,col] of boxes) {
    doc.rect(bx, y, 120, 48).fill(bg);
    doc.fillColor(col).fontSize(15).font('Helvetica-Bold').text(String(val), bx+4, y+6, {width:112,align:'center'});
    doc.fillColor('#6b7280').fontSize(8).font('Helvetica').text(label, bx+4, y+28, {width:112,align:'center'});
    bx += 127;
  }
  y += 62;

  // Table
  doc.fillColor('#1e3a5f').fontSize(10).font('Helvetica-Bold').text('DÉTAIL DES PRODUITS', 40, y);
  y += 14;
  const cols = [['Code',55],['Produit',200],['Catégorie',110],['Qté système',70],['Qté comptée',70],['Écart',55],['Valeur écart',90]];
  // Header
  let cx = 40;
  doc.rect(40, y, 762, 18).fill('#1e3a5f');
  doc.fillColor('white').fontSize(8).font('Helvetica-Bold');
  for (const [label,w] of cols) { doc.text(label, cx+2, y+5, {width:w-4}); cx += w; }
  y += 18;

  doc.fontSize(8).font('Helvetica');
  for (const l of lignes) {
    if (y > 520) { doc.addPage({layout:'landscape'}); y = 40; }
    const ecartVal = l.ecart !== null ? l.ecart * (l.prix_achat||0) : 0;
    const rowBg = l.ecart === null ? '#f9fafb' : l.ecart === 0 ? '#f0fdf4' : l.ecart > 0 ? '#eff6ff' : '#fef2f2';
    doc.rect(40, y, 762, 16).fill(rowBg);
    cx = 40;
    doc.fillColor('#374151');
    const cells = [l.produit_code, l.produit_nom, l.categorie_nom||'—', String(l.qte_systeme), l.qte_comptee!==null?String(l.qte_comptee):'—', l.ecart!==null?(l.ecart>0?`+${l.ecart}`:String(l.ecart)):'—', l.ecart!==null&&l.ecart!==0?`${l.ecart>0?'+':''}${nf(ecartVal)} F`:'—'];
    for (let i=0; i<cols.length; i++) {
      if (i===5) doc.fillColor(l.ecart===0?'#166534':l.ecart>0?'#1e40af':l.ecart<0?'#991b1b':'#374151');
      doc.text(cells[i], cx+2, y+4, {width:cols[i][1]-4, ellipsis:true});
      doc.fillColor('#374151');
      cx += cols[i][1];
    }
    y += 16;
  }

  // Pied de page
  y += 10;
  if (inv.statut === 'valide') {
    doc.fontSize(9).fillColor('#166534').text(`✓ Inventaire validé le ${new Date(inv.valide_at).toLocaleDateString('fr-FR')} par ${inv.valide_par_nom||'—'}`, 40, y);
  }
  doc.end();
}

// ── EXPORT EXCEL ───────────────────────────────────────────────────────────────
function exportExcel(req, res) {
  const inv = db.prepare(`SELECT i.*,u.nom as user_nom FROM inventaires i LEFT JOIN users u ON i.user_id=u.id WHERE i.id=?`).get(req.params.id);
  if (!inv) return res.status(404).json({ message: 'Inventaire introuvable' });
  const lignes = db.prepare(`SELECT l.*,p.nom as produit_nom,p.code as produit_code,p.prix_achat,p.prix_vente,c.nom as categorie_nom FROM lignes_inventaire l JOIN produits p ON l.produit_id=p.id LEFT JOIN categories c ON p.categorie_id=c.id WHERE l.inventaire_id=? ORDER BY p.nom`).all(req.params.id);

  const data = [
    [`INVENTAIRE ${inv.reference}`, '', '', '', '', '', ''],
    [`Date: ${new Date(inv.created_at).toLocaleDateString('fr-FR')}`, '', `Saisi par: ${inv.user_nom||'—'}`, '', `Statut: ${inv.statut}`, '', ''],
    [],
    ['Code', 'Produit', 'Catégorie', 'Qté système', 'Qté comptée', 'Écart', 'Valeur écart (FCFA)'],
    ...lignes.map(l => [
      l.produit_code, l.produit_nom, l.categorie_nom||'', l.qte_systeme,
      l.qte_comptee !== null ? l.qte_comptee : '',
      l.ecart !== null ? l.ecart : '',
      l.ecart !== null && l.ecart !== 0 ? Math.round(Math.abs(l.ecart) * (l.prix_achat||0)) : 0,
    ]),
    [],
    ['TOTAUX', '', '',
      lignes.reduce((s,l) => s+l.qte_systeme, 0),
      lignes.filter(l=>l.qte_comptee!==null).reduce((s,l) => s+l.qte_comptee, 0),
      lignes.filter(l=>l.ecart!==null).reduce((s,l) => s+(l.ecart||0), 0),
      lignes.filter(l=>l.ecart!==null&&l.ecart!==0).reduce((s,l) => s+Math.round(Math.abs(l.ecart)*(l.prix_achat||0)), 0),
    ],
  ];

  const dateInv2 = new Date(inv.created_at);
  const moisNom2 = dateInv2.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const xlsFilename = `Rapport inventaire du mois de ${moisNom2}.xlsx`;

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{wch:12},{wch:35},{wch:20},{wch:14},{wch:14},{wch:10},{wch:18}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Inventaire');
  const buf = XLSX.write(wb, { type:'buffer', bookType:'xlsx' });
  res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition',`attachment; filename="${xlsFilename}"`);
  res.send(buf);
}

module.exports = { getAll, getOne, getStats, create, updateLigne, soumettre, valider, rejeter, annuler, synchroniser, exportPDF, exportExcel };
