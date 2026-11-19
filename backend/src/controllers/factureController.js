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

const nf = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0));

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
    const t = Math.floor(n / 10), r = n % 10;
    if (t === 7) return r === 0 ? 'soixante-dix' : 'soixante-' + u[10 + r];
    if (t === 8) return r === 0 ? 'quatre-vingts' : 'quatre-vingt-' + u[r];
    if (t === 9) return 'quatre-vingt-' + u[10 + r];
    return d[t] + (r === 1 ? '-et-un' : r > 0 ? '-' + u[r] : '');
  }
  function b1000(n) {
    if (n === 0) return '';
    if (n < 100) return b100(n);
    const h = Math.floor(n / 100), r = n % 100;
    const cent = (h === 1 ? 'cent' : u[h] + ' cent') + (r > 0 ? '' : h > 1 ? 's' : '');
    return r > 0 ? cent + ' ' + b100(r) : cent;
  }
  let s = '';
  if (n >= 1000000) { const m = Math.floor(n / 1000000); s += (m === 1 ? 'un million' : b1000(m) + ' millions') + ' '; n %= 1000000; }
  if (n >= 1000)    { const k = Math.floor(n / 1000);    s += (k === 1 ? 'mille' : b1000(k) + ' mille') + ' '; n %= 1000; }
  s += b1000(n);
  s = s.trim();
  return s.charAt(0).toUpperCase() + s.slice(1) + ' francs CFA';
}

function genererPDF(req, res) {
  const vente = db.prepare(`
    SELECT v.*, c.nom as client_nom, c.telephone as client_tel,
           c.adresse as client_adresse, c.numero_contribuable as client_nif,
           u.nom as caissier
    FROM ventes v
    LEFT JOIN clients c ON v.client_id = c.id
    LEFT JOIN users u ON v.user_id = u.id
    WHERE v.id = ?
  `).get(req.params.id);

  if (!vente) return res.status(404).json({ message: 'Vente introuvable' });

  const lignes = db.prepare(`
    SELECT l.*, p.nom as produit_nom, p.code, p.unite
    FROM lignes_vente l
    JOIN produits p ON l.produit_id = p.id
    WHERE l.vente_id = ?
  `).all(req.params.id);

  const S = getSociete();
  const doc = new PDFDocument({
    size: 'A4', margin: 40,
    info: { Title: `Facture ${vente.numero}`, Author: S.nom }
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="facture-${vente.numero}.pdf"`);
  doc.pipe(res);

  const ML = 40;
  const W  = 515;

  // ── EN-TÊTE ────────────────────────────────────────────────────
  doc.rect(0, 0, 595, 115).fill('#1e3a5f');

  doc.fillColor('white').fontSize(22).font('Helvetica-Bold')
     .text(S.nom, ML, 18);
  doc.fontSize(8.5).font('Helvetica')
     .text(S.adresse, ML, 46)
     .text(`Tél : ${S.tel}   |   Email : ${S.email}`, ML, 58)
     .text(`NIF : ${S.nif}   |   RCCM : ${S.rccm}`, ML, 70);

  doc.fontSize(17).font('Helvetica-Bold').fillColor('#fbbf24')
     .text('FACTURE NORMALISÉE', 310, 20, { width: 245, align: 'right' });
  doc.fontSize(9.5).font('Helvetica').fillColor('white')
     .text(`N°  ${vente.numero}`, 310, 48, { width: 245, align: 'right' })
     .text(`Date : ${new Date(vente.created_at).toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' })}`, 310, 63, { width: 245, align: 'right' });

  // ── BLOC CLIENT ────────────────────────────────────────────────
  let y = 130;

  doc.fontSize(8).font('Helvetica-Bold').fillColor('#6b7280').text('FACTURÉ À :', ML, y);
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#111827')
     .text(vente.client_nom || 'Client de passage', ML, y + 13);
  doc.fontSize(8.5).font('Helvetica').fillColor('#6b7280');
  let cy = y + 27;
  if (vente.client_tel)     { doc.text(`Tél : ${vente.client_tel}`, ML, cy); cy += 12; }
  if (vente.client_adresse) { doc.text(vente.client_adresse, ML, cy); cy += 12; }
  if (vente.client_nif)     { doc.text(`NIF client : ${vente.client_nif}`, ML, cy); cy += 12; }

  // Boîte résumé droite
  doc.roundedRect(345, y - 4, 210, 72, 5).fill('#f3f4f6');
  const infoRows = [
    ['Mode de règlement', vente.mode_paiement.replace(/_/g,' ').toUpperCase()],
    ['Caissier',          vente.caissier],
    ['Statut',            vente.statut === 'payee' ? 'SOLDÉE ✓' : vente.statut === 'partielle' ? 'PARTIELLE' : 'ANNULÉE'],
    ['Montant payé',      `${nf(vente.montant_paye)} FCFA`],
  ];
  infoRows.forEach(([lbl, val], i) => {
    doc.fontSize(8).font('Helvetica').fillColor('#9ca3af').text(lbl, 353, y + 6 + i * 15);
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#111827').text(val, 440, y + 6 + i * 15, { width: 108, align: 'right' });
  });

  // ── EN-TÊTE TABLEAU ────────────────────────────────────────────
  y = Math.max(cy, y + 76) + 14;

  const cols = [
    { label: 'Désignation',     x: ML,        w: 230, align: 'left'   },
    { label: 'Qté',             x: ML + 230,  w:  50, align: 'center' },
    { label: 'Prix unitaire',   x: ML + 280,  w: 100, align: 'right'  },
    { label: 'Total (FCFA)',    x: ML + 380,  w: 135, align: 'right'  },
  ];

  doc.rect(ML, y, W, 22).fill('#1e3a5f');
  doc.fontSize(8).font('Helvetica-Bold').fillColor('white');
  cols.forEach(c => doc.text(c.label, c.x + 3, y + 7, { width: c.w - 6, align: c.align }));
  y += 22;

  // ── LIGNES ─────────────────────────────────────────────────────
  lignes.forEach((l, i) => {
    const ht  = l.prix_unitaire * l.quantite * (1 - (l.remise || 0) / 100);
    const rowH = 19;

    doc.rect(ML, y, W, rowH).fill(i % 2 === 0 ? 'white' : '#f9fafb');
    doc.moveTo(ML, y).lineTo(ML + W, y).strokeColor('#e5e7eb').lineWidth(0.4).stroke();

    const total_ligne = l.prix_unitaire * l.quantite * (1 - (l.remise || 0) / 100);
    doc.fontSize(8.5).font('Helvetica').fillColor('#111827');
    const nom = l.produit_nom + (l.remise > 0 ? `  (remise ${l.remise}%)` : '');
    doc.text(nom,                                cols[0].x + 3, y + 5, { width: cols[0].w - 6, align: 'left' });
    doc.text(`${l.quantite} ${l.unite || ''}`,  cols[1].x + 3, y + 5, { width: cols[1].w - 6, align: 'center' });
    doc.text(nf(l.prix_unitaire),               cols[2].x + 3, y + 5, { width: cols[2].w - 6, align: 'right' });
    doc.text(nf(total_ligne),                   cols[3].x + 3, y + 5, { width: cols[3].w - 6, align: 'right' });
    y += rowH;
  });

  doc.moveTo(ML, y).lineTo(ML + W, y).strokeColor('#1e3a5f').lineWidth(1).stroke();

  // ── TOTAUX ─────────────────────────────────────────────────────
  y += 14;
  const tx = ML + 310;
  const tw = 205;

  function ligneTotal(label, montant, gras = false, rouge = false) {
    doc.font(gras ? 'Helvetica-Bold' : 'Helvetica')
       .fontSize(9).fillColor(rouge ? '#dc2626' : '#374151')
       .text(label, tx, y, { width: 120, align: 'left' })
       .text(montant + ' FCFA', tx + 120, y, { width: tw - 120, align: 'right' });
    y += 16;
  }

  ligneTotal('Sous-total :', nf(vente.sous_total));
  if (vente.remise > 0) {
    const rm = vente.sous_total * vente.remise / 100;
    ligneTotal(`Remise (${vente.remise}%) :`, `-${nf(rm)}`, false, true);
  }

  doc.rect(tx - 4, y - 2, tw + 4, 26).fill('#1e3a5f');
  doc.fontSize(11).font('Helvetica-Bold').fillColor('white')
     .text('TOTAL :', tx, y + 6, { width: 120, align: 'left' })
     .text(`${nf(vente.total)} FCFA`, tx + 120, y + 6, { width: tw - 120, align: 'right' });
  y += 34;

  if (vente.monnaie > 0) {
    doc.fontSize(8).font('Helvetica').fillColor('#6b7280')
       .text(`Monnaie rendue : ${nf(vente.monnaie)} FCFA`, tx, y, { width: tw, align: 'right' });
    y += 14;
  }

  if (vente.montant_paye < vente.total) {
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#dc2626')
       .text(`Reste à payer : ${nf(vente.total - vente.montant_paye)} FCFA`, tx, y, { width: tw, align: 'right' });
    y += 14;
  }

  // ── MONTANT EN LETTRES ─────────────────────────────────────────
  y += 6;
  doc.roundedRect(ML, y, W, 32, 4).fill('#fef9c3');
  doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#92400e')
     .text('Arrêté la présente facture à la somme de :', ML + 8, y + 5);
  doc.font('Helvetica').fillColor('#78350f')
     .text(enLettres(vente.total), ML + 8, y + 17, { width: W - 16 });
  y += 42;

  if (vente.note) {
    doc.fontSize(8.5).font('Helvetica').fillColor('#6b7280')
       .text(`Note : ${vente.note}`, ML, y);
    y += 18;
  }

  // ── CACHET ENTREPRISE ──────────────────────────────────────────
  const cachetPath = resolveUploadPath(S.cachet);
  // Plafonné pour laisser assez de marge au pied de page ci-dessous SUR LA MÊME PAGE
  // (voir facturationController.js pour le détail du bug corrigé ici).
  const signY = Math.min(y + 10, 680);
  doc.fontSize(7.5).font('Helvetica').fillColor('#9ca3af')
     .text('Cachet et signature', ML + 310, signY, { width: 205, align: 'center' });
  doc.moveTo(ML + 315, signY + 10).lineTo(ML + 510, signY + 10).strokeColor('#d1d5db').lineWidth(0.5).stroke();
  if (cachetPath) {
    try {
      doc.image(cachetPath, ML + 350, signY + 14, { width: 130, height: 80, fit: [130, 80] });
    } catch(_) {}
  }

  // ── PIED DE PAGE ───────────────────────────────────────────────
  const footerY = 760;
  doc.moveTo(ML, footerY).lineTo(ML + W, footerY).strokeColor('#d1d5db').lineWidth(0.5).stroke();
  doc.fontSize(7).font('Helvetica').fillColor('#9ca3af')
     .text(`${S.nom}  ·  NIF : ${S.nif}  ·  RCCM : ${S.rccm}  ·  ${S.adresse}`,
           ML, footerY + 8, { width: W, align: 'center' })
     .text("Facture normalisée conforme aux dispositions fiscales en vigueur en République de Côte d'Ivoire",
           ML, footerY + 20, { width: W, align: 'center' });

  doc.end();
}

module.exports = { genererPDF };
