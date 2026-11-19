import React, { useState, useEffect } from 'react';
import { BarChart3, Tag, Printer, TrendingUp, Wallet } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Area, AreaChart, ComposedChart, PieChart, Pie, Cell, Legend } from 'recharts';
import api from '../services/api';

const fmt  = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0)) + ' FCFA';
const fmtN = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0));

function dateFR(d) {
  return new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' });
}

async function printBulletinRemises(remises, filtres) {
  let societe = {};
  try { societe = (await api.get('/config/societe')).data; } catch {}

  const r   = remises.resume;
  const pctVentes         = r.nb_ventes_total > 0 ? ((r.nb_avec_remise / r.nb_ventes_total) * 100).toFixed(1) : 0;
  const remiseMoyParVente = r.nb_avec_remise  > 0 ? r.total_remises / r.nb_avec_remise : 0;
  const pctCA             = (r.total_remises + r.ca_total) > 0
    ? ((r.total_remises / (r.total_remises + r.ca_total)) * 100).toFixed(2)
    : 0;

  const lignesHTML = remises.detail.map((v, i) => `
    <tr style="background:${i % 2 === 0 ? '#fff' : '#f9fafb'}">
      <td style="padding:7px 10px;font-family:monospace;font-size:11px;color:#374151">${v.numero}</td>
      <td style="padding:7px 10px;font-size:11px;color:#6b7280">${new Date(v.created_at).toLocaleDateString('fr-FR')}</td>
      <td style="padding:7px 10px;font-size:11px">${v.client_nom || 'Client de passage'}</td>
      <td style="padding:7px 10px;font-size:11px;color:#6b7280">${v.user_nom || ''}</td>
      <td style="padding:7px 10px;font-size:11px;text-align:right">${fmtN(v.avant_remise)} FCFA</td>
      <td style="padding:7px 10px;font-size:12px;text-align:right;font-weight:700;color:#dc2626">− ${fmtN(v.montant_remise)} FCFA</td>
      <td style="padding:7px 10px;text-align:center">
        <span style="background:#fee2e2;color:#b91c1c;font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px">
          ${(v.pct_remise || 0).toFixed(1)} %
        </span>
      </td>
      <td style="padding:7px 10px;font-size:11px;text-align:right;font-weight:600;color:#1d4ed8">${fmtN(v.total)} FCFA</td>
    </tr>`).join('');

  const evolutionHTML = remises.evolution.length > 0 ? `
    <table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:11px">
      <thead>
        <tr style="background:#f3f4f6">
          <th style="padding:6px 10px;text-align:left;color:#6b7280;font-weight:600">Période</th>
          <th style="padding:6px 10px;text-align:center;color:#6b7280;font-weight:600">Nb ventes</th>
          <th style="padding:6px 10px;text-align:right;color:#dc2626;font-weight:600">Remises</th>
          <th style="padding:6px 10px;text-align:right;color:#1d4ed8;font-weight:600">Ventes réalisées</th>
        </tr>
      </thead>
      <tbody>
        ${remises.evolution.map((e, i) => `
          <tr style="background:${i % 2 === 0 ? '#fff' : '#f9fafb'}">
            <td style="padding:5px 10px;font-family:monospace">${e.periode}</td>
            <td style="padding:5px 10px;text-align:center">${e.nb_ventes}</td>
            <td style="padding:5px 10px;text-align:right;color:#dc2626;font-weight:600">− ${fmtN(e.montant_remise)} FCFA</td>
            <td style="padding:5px 10px;text-align:right;color:#1d4ed8">${fmtN(e.ca)} FCFA</td>
          </tr>`).join('')}
      </tbody>
    </table>` : '<p style="color:#9ca3af;font-style:italic">Aucune donnée sur cette période</p>';

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <title>Bulletin des Remises</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, sans-serif; color:#111; background:#fff; padding:20px; }
    @media print {
      body { padding:0; }
      .no-print { display:none !important; }
      @page { margin:15mm; size:A4; }
    }
    table { border-collapse:collapse; width:100%; }
    th { font-weight:600; }
  </style>
</head>
<body>

<!-- Bouton impression -->
<div class="no-print" style="text-align:right;margin-bottom:16px">
  <button onclick="window.print()" style="background:#1d4ed8;color:#fff;border:none;padding:10px 22px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer">
    🖨️ Imprimer / Enregistrer PDF
  </button>
</div>

<!-- En-tête entreprise -->
<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1d4ed8;padding-bottom:16px;margin-bottom:20px">
  <div>
    <div style="font-size:20px;font-weight:800;color:#1d4ed8;text-transform:uppercase;letter-spacing:1px">${societe.nom || 'Mon Entreprise'}</div>
    ${societe.adresse ? `<div style="font-size:12px;color:#6b7280;margin-top:3px">${societe.adresse}</div>` : ''}
    ${societe.telephone ? `<div style="font-size:12px;color:#6b7280">Tél : ${societe.telephone}</div>` : ''}
    ${societe.nif ? `<div style="font-size:11px;color:#9ca3af">NIF : ${societe.nif}</div>` : ''}
    ${societe.rccm ? `<div style="font-size:11px;color:#9ca3af">RCCM : ${societe.rccm}</div>` : ''}
  </div>
  <div style="text-align:right">
    <div style="font-size:11px;color:#9ca3af">Édité le</div>
    <div style="font-size:13px;font-weight:600;color:#374151">${new Date().toLocaleDateString('fr-FR', {day:'2-digit',month:'long',year:'numeric'})}</div>
    <div style="font-size:11px;color:#9ca3af;margin-top:2px">${new Date().toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'})}</div>
  </div>
</div>

<!-- Titre -->
<div style="text-align:center;margin-bottom:20px">
  <div style="display:inline-block;background:#fef2f2;border:2px solid #fecaca;padding:10px 28px;border-radius:10px">
    <div style="font-size:18px;font-weight:800;color:#dc2626;text-transform:uppercase;letter-spacing:1px">Bulletin des Remises Accordées</div>
    <div style="font-size:13px;color:#6b7280;margin-top:4px">
      Période du <strong>${dateFR(filtres.debut)}</strong> au <strong>${dateFR(filtres.fin)}</strong>
    </div>
  </div>
</div>

<!-- Résumé chiffres clés -->
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">
  <div style="border:1.5px solid #fecaca;border-radius:10px;padding:14px;text-align:center;background:#fff5f5">
    <div style="font-size:11px;color:#9ca3af;margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px">Total remises</div>
    <div style="font-size:18px;font-weight:800;color:#dc2626">${fmtN(r.total_remises)}</div>
    <div style="font-size:10px;color:#dc2626">FCFA</div>
  </div>
  <div style="border:1.5px solid #fed7aa;border-radius:10px;padding:14px;text-align:center;background:#fffbf5">
    <div style="font-size:11px;color:#9ca3af;margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px">Ventes remisées</div>
    <div style="font-size:18px;font-weight:800;color:#ea580c">${r.nb_avec_remise} <span style="font-size:13px;font-weight:400;color:#9ca3af">/ ${r.nb_ventes_total}</span></div>
    <div style="font-size:10px;color:#ea580c">${pctVentes} % des ventes</div>
  </div>
  <div style="border:1.5px solid #d1fae5;border-radius:10px;padding:14px;text-align:center;background:#f0fdf4">
    <div style="font-size:11px;color:#9ca3af;margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px">Remise moy/vente</div>
    <div style="font-size:18px;font-weight:800;color:#059669">${fmtN(remiseMoyParVente)}</div>
    <div style="font-size:10px;color:#059669">FCFA</div>
  </div>
  <div style="border:1.5px solid #ddd6fe;border-radius:10px;padding:14px;text-align:center;background:#faf5ff">
    <div style="font-size:11px;color:#9ca3af;margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px">% remise moyen</div>
    <div style="font-size:18px;font-weight:800;color:#7c3aed">${(r.pct_moyen || 0).toFixed(2)}</div>
    <div style="font-size:10px;color:#7c3aed">%</div>
  </div>
</div>

<!-- Alerte impact ventes -->
${r.ca_total > 0 ? `
<div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:10px;padding:12px 16px;margin-bottom:20px;display:flex;align-items:center;gap:10px">
  <span style="font-size:20px">⚠️</span>
  <span style="font-size:12px;color:#92400e">
    Les remises accordées représentent <strong>${pctCA} %</strong> du chiffre d'affaires brut —
    soit un manque à gagner de <strong>${fmtN(r.total_remises)} FCFA</strong> sur la période.
    Ventes nettes encaissées : <strong>${fmtN(r.ca_total)} FCFA</strong>.
  </span>
</div>` : ''}

<!-- Récapitulatif par période -->
<div style="margin-bottom:20px">
  <div style="font-size:13px;font-weight:700;color:#374151;border-left:4px solid #1d4ed8;padding-left:10px;margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px">
    Récapitulatif par période
  </div>
  ${evolutionHTML}
</div>

<!-- Détail des ventes -->
<div style="margin-bottom:24px">
  <div style="font-size:13px;font-weight:700;color:#374151;border-left:4px solid #dc2626;padding-left:10px;margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px">
    Détail des ventes remisées (${remises.detail.length})
  </div>
  <table style="width:100%;border-collapse:collapse;border:1.5px solid #e5e7eb;border-radius:8px;overflow:hidden">
    <thead>
      <tr style="background:#1d4ed8;color:#fff">
        <th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:600">N° Vente</th>
        <th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:600">Date</th>
        <th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:600">Client</th>
        <th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:600">Caissier</th>
        <th style="padding:8px 10px;text-align:right;font-size:11px;font-weight:600">Avant remise</th>
        <th style="padding:8px 10px;text-align:right;font-size:11px;font-weight:600">Remise</th>
        <th style="padding:8px 10px;text-align:center;font-size:11px;font-weight:600">%</th>
        <th style="padding:8px 10px;text-align:right;font-size:11px;font-weight:600">Total payé</th>
      </tr>
    </thead>
    <tbody>${lignesHTML || '<tr><td colspan="8" style="text-align:center;padding:20px;color:#9ca3af;font-style:italic">Aucune remise sur cette période</td></tr>'}</tbody>
    <tfoot>
      <tr style="background:#1e3a8a;color:#fff;font-weight:700">
        <td colspan="4" style="padding:9px 10px;font-size:12px">TOTAL GÉNÉRAL</td>
        <td style="padding:9px 10px;text-align:right;font-size:12px">${fmtN(r.total_remises + r.ca_total)} FCFA</td>
        <td style="padding:9px 10px;text-align:right;font-size:13px;color:#fca5a5">− ${fmtN(r.total_remises)} FCFA</td>
        <td></td>
        <td style="padding:9px 10px;text-align:right;font-size:13px">${fmtN(r.ca_total)} FCFA</td>
      </tr>
    </tfoot>
  </table>
</div>

<!-- Pied de page -->
<div style="border-top:1px solid #e5e7eb;padding-top:14px;margin-top:10px;display:flex;justify-content:space-between;align-items:flex-end">
  <div style="font-size:10px;color:#9ca3af">
    Document généré le ${new Date().toLocaleString('fr-FR')}
  </div>
  <div style="text-align:center">
    <div style="font-size:10px;color:#6b7280;margin-bottom:30px">Signature / Cachet</div>
    <div style="width:160px;border-top:1px solid #374151;font-size:10px;color:#6b7280;padding-top:4px">Le Responsable</div>
  </div>
</div>

</body>
</html>`;

  const w = window.open('', '_blank', 'width=1100,height=800');
  w.document.write(html);
  w.document.close();
}

const getFirstOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; };
const getToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

export default function Rapports() {
  const [tab, setTab] = useState('ventes');
  const [filtres, setFiltres] = useState({ debut: getFirstOfMonth(), fin: getToday(), grouper: 'jour' });
  const [ventes, setVentes] = useState([]);
  const [produits, setProduits] = useState([]);
  const [inventaire, setInventaire] = useState(null);
  const [benefices, setBenefices] = useState([]);
  const [remises, setRemises] = useState(null);
  const [marge,   setMarge]   = useState(null);
  const [paiements, setPaiements] = useState(null);
  const [retraits, setRetraits] = useState({ retraits: [], total: 0 });
  const [retraitForm, setRetraitForm] = useState({ montant: '', motif: '' });
  const [showRetrait, setShowRetrait] = useState(false);
  const [societe, setSociete] = useState(null);

  // Le menu masque déjà ce lien si désactivé, mais on bloque aussi l'accès direct par URL.
  useEffect(() => {
    api.get('/config/societe').then(r => setSociete(r.data)).catch(() => setSociete({}));
  }, []);

  useEffect(() => {
    const p = { debut: filtres.debut, fin: filtres.fin };
    if (tab === 'ventes')    api.get('/rapports/ventes', { params: { ...p, grouper: filtres.grouper } }).then(r => setVentes(r.data));
    if (tab === 'produits')  api.get('/rapports/produits', { params: p }).then(r => setProduits(r.data));
    if (tab === 'inventaire') api.get('/rapports/inventaire').then(r => setInventaire(r.data));
    if (tab === 'benefices') api.get('/rapports/benefices', { params: p }).then(r => setBenefices(r.data));
    if (tab === 'remises')   api.get('/rapports/remises', { params: { ...p, grouper: filtres.grouper } }).then(r => setRemises(r.data));
    if (tab === 'marge') {
      api.get('/rapports/marge', { params: { ...p, grouper: filtres.grouper } }).then(r => setMarge(r.data));
      api.get('/retraits', { params: p }).then(r => setRetraits(r.data));
    }
    if (tab === 'paiements') api.get('/rapports/paiements', { params: p }).then(r => setPaiements(r.data));
  }, [tab, filtres]);

  async function handleRetrait(e) {
    e.preventDefault();
    if (!retraitForm.montant || parseFloat(retraitForm.montant) <= 0) return;
    try {
      await api.post('/retraits', { montant: parseFloat(retraitForm.montant), motif: retraitForm.motif });
      const p = { debut: filtres.debut, fin: filtres.fin };
      api.get('/retraits', { params: p }).then(r => setRetraits(r.data));
      setRetraitForm({ montant: '', motif: '' });
      setShowRetrait(false);
    } catch (err) { alert(err.response?.data?.message || 'Erreur'); }
  }

  const F = ({ label, val, cls }) => (
    <div className="card text-center">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${cls||'text-gray-900'}`}>{val}</p>
    </div>
  );

  if (societe && societe.feat_rapports === 0) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <div className="card max-w-md text-center">
          <BarChart3 size={36} className="mx-auto text-gray-300 mb-3" />
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Rapports non disponible</h2>
          <p className="text-sm text-gray-500">Cette fonctionnalité n'est pas activée pour votre compte. Contactez le fournisseur du logiciel si vous en avez besoin.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="page-title flex items-center gap-2"><BarChart3 size={22}/> Rapports & Statistiques</h1>
        <p className="page-sub">Analyses détaillées de votre activité commerciale</p>
      </div>

      <div className="flex gap-1 bg-white rounded-2xl p-1 border border-gray-100 shadow-sm flex-wrap">
        {[['ventes','Ventes'],['produits','Produits vendus'],['inventaire','Inventaire'],['benefices','Bénéfices'],['marge','Marge'],['remises','Remises'],['paiements','Paiements']].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${tab===k?'bg-blue-600 text-white shadow-md':'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
            {l}
          </button>
        ))}
      </div>

      {tab !== 'inventaire' && (
        <div className="flex flex-wrap gap-3">
          <div><label className="label text-xs">Du</label><input type="date" className="input w-auto text-sm" value={filtres.debut} onChange={e => setFiltres(f=>({...f,debut:e.target.value}))} /></div>
          <div><label className="label text-xs">Au</label><input type="date" className="input w-auto text-sm" value={filtres.fin} onChange={e => setFiltres(f=>({...f,fin:e.target.value}))} /></div>
          {(tab === 'ventes' || tab === 'remises' || tab === 'marge') && (
            <div><label className="label text-xs">Grouper par</label>
              <select className="input text-sm" value={filtres.grouper} onChange={e => setFiltres(f=>({...f,grouper:e.target.value}))}>
                <option value="jour">Jour</option><option value="mois">Mois</option>
              </select>
            </div>
          )}
        </div>
      )}

      {tab === 'ventes' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <F label="Nb. ventes" val={ventes.reduce((s,v)=>s+v.nb_ventes,0)} />
            <F label="Chiffre d'affaires total" val={fmt(ventes.reduce((s,v)=>s+v.ca,0))} cls="text-blue-700" />
            <F label="Ventes moyennes / période" val={fmt(ventes.length ? ventes.reduce((s,v)=>s+v.ca,0)/ventes.length : 0)} />
          </div>
          <div className="card">
            <h2 className="font-semibold mb-4 text-gray-800">Évolution du chiffre d'affaires</h2>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={ventes}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                <XAxis dataKey="periode" tick={{fontSize:10}}/>
                <YAxis tick={{fontSize:10}} tickFormatter={v=>(v/1000)+'k'}/>
                <Tooltip formatter={v=>[fmt(v),'Ventes']}/>
                <Bar dataKey="ca" fill="#2563eb" radius={[4,4,0,0]} name="Ventes"/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {tab === 'produits' && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Code</th><th>Produit</th><th>Famille</th><th>Qté vendue</th><th>Ventes générées</th><th>Prix moyen</th></tr></thead>
            <tbody>
              {produits.map((p,i) => <tr key={i}><td className="font-mono text-xs">{p.code}</td><td className="font-medium">{p.nom}</td><td>{p.categorie||'-'}</td><td className="font-bold">{p.qte_vendue}</td><td className="text-blue-700 font-semibold">{fmt(p.ca)}</td><td>{fmt(p.prix_moyen)}</td></tr>)}
              {produits.length===0&&<tr><td colSpan="6" className="text-center py-8 text-gray-400">Aucune donnée</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'inventaire' && inventaire && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <F label="Nb. produits actifs" val={inventaire.produits.length}/>
            <F label="Valeur totale du stock" val={fmt(inventaire.total_valeur)} cls="text-blue-700"/>
            <F label="Produits en rupture" val={inventaire.produits.filter(p=>p.qte_actuelle===0).length} cls="text-red-600"/>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Code</th><th>Produit</th><th>Famille</th><th>Qté</th><th>Prix achat</th><th>Prix vente</th><th>Valeur stock</th><th>Statut</th></tr></thead>
              <tbody>
                {inventaire.produits.map((p,i) => {
                  const s = p.qte_actuelle===0?'badge-red':p.qte_actuelle<=p.qte_min?'badge-yellow':'badge-green';
                  return <tr key={i}><td className="font-mono text-xs">{p.code}</td><td>{p.nom}</td><td>{p.categorie||'-'}</td><td className="font-bold">{p.qte_actuelle}</td><td>{fmt(p.prix_achat)}</td><td className="text-blue-700">{fmt(p.prix_vente)}</td><td className="font-semibold">{fmt(p.valeur_stock)}</td><td><span className={`badge ${s}`}>{p.qte_actuelle===0?'Rupture':p.qte_actuelle<=p.qte_min?'Faible':'OK'}</span></td></tr>;
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'benefices' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <F label="Chiffre d'affaires total" val={fmt(benefices.reduce((s,b)=>s+b.ca,0))} cls="text-blue-700"/>
            <F label="Coût total" val={fmt(benefices.reduce((s,b)=>s+b.cout,0))}/>
            <F label="Bénéfice net" val={fmt(benefices.reduce((s,b)=>s+b.benefice,0))} cls="text-green-600"/>
          </div>
          <div className="card">
            <h2 className="font-semibold mb-4 text-gray-800">Ventes vs Coût d'achat vs Bénéfice</h2>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={benefices}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                <XAxis dataKey="date" tick={{fontSize:10}} tickFormatter={d=>d.slice(5)}/>
                <YAxis tick={{fontSize:10}} tickFormatter={v=>(v/1000)+'k'}/>
                <Tooltip formatter={v=>[fmt(v)]}/>
                <Bar dataKey="ca" fill="#2563eb" name="Ventes" radius={[4,4,0,0]}/>
                <Bar dataKey="cout" fill="#f97316" name="Coût" radius={[4,4,0,0]}/>
                <Bar dataKey="benefice" fill="#16a34a" name="Bénéfice" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
      {tab === 'marge' && marge && (() => {
        const r = marge.resume;
        const maxCumul = marge.evolution.length > 0 ? marge.evolution[marge.evolution.length - 1].marge_cumul : 0;
        return (
          <>
            {/* Cartes résumé */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="card text-center">
                <p className="text-xs text-gray-500 mb-1">Marge brute totale</p>
                <p className="text-xl font-bold text-green-600">{fmt(r.total_marge)}</p>
              </div>
              <div className="card text-center">
                <p className="text-xs text-gray-500 mb-1">Taux de marge</p>
                <p className="text-xl font-bold text-teal-600">{r.taux_marge.toFixed(1)} %</p>
                <p className="text-xs text-gray-400">sur les ventes</p>
              </div>
              <div className="card text-center">
                <p className="text-xs text-gray-500 mb-1">Coût d'achat</p>
                <p className="text-xl font-bold text-orange-500">{fmt(r.total_cout)}</p>
              </div>
              <div className="card text-center">
                <p className="text-xs text-gray-500 mb-1">Ventes encaissées</p>
                <p className="text-xl font-bold text-blue-600">{fmt(r.total_ca)}</p>
              </div>
              <div className="card text-center">
                <p className="text-xs text-gray-500 mb-1">Surplus vs catalogue</p>
                <p className={`text-xl font-bold ${r.total_surplus >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {r.total_surplus >= 0 ? '+' : ''}{fmt(r.total_surplus)}
                </p>
                <p className="text-xs text-gray-400">prix caisse vs prix catalogue</p>
              </div>
            </div>

            {/* Message marge courante */}
            <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-100 rounded-xl">
              <TrendingUp size={20} className="text-green-600 flex-shrink-0"/>
              <p className="text-sm text-green-800">
                Sur la période, pour <strong>{fmt(r.total_ca)}</strong> de ventes,
                la marge brute cumulée est de <strong>{fmt(r.total_marge)}</strong>
                — soit <strong>{r.taux_marge.toFixed(1)}%</strong> du chiffre d'affaires.
                Coût d'achat : <strong>{fmt(r.total_cout)}</strong>.
              </p>
            </div>

            {/* Graphique marge cumulée progressive */}
            {marge.evolution.length > 0 && (
              <div className="card">
                <h2 className="font-semibold mb-1 text-gray-800 flex items-center gap-2">
                  <TrendingUp size={16} className="text-green-500"/> Marge cumulée au fil du temps
                </h2>
                <p className="text-xs text-gray-400 mb-4">La courbe verte montre l'accumulation progressive de votre marge — elle monte à chaque vente</p>
                <ResponsiveContainer width="100%" height={260}>
                  <ComposedChart data={marge.evolution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                    <XAxis dataKey="periode" tick={{fontSize:10}} tickFormatter={d => filtres.grouper==='mois' ? d : d.slice(5)}/>
                    <YAxis yAxisId="bar" tick={{fontSize:10}} tickFormatter={v=>(v/1000)+'k'} orientation="left"/>
                    <YAxis yAxisId="line" tick={{fontSize:10}} tickFormatter={v=>(v/1000)+'k'} orientation="right"/>
                    <Tooltip formatter={(v, n) => [fmt(v), n === 'marge' ? 'Marge du jour' : n === 'marge_cumul' ? 'Marge cumulée' : n]}/>
                    <Bar yAxisId="bar" dataKey="marge" fill="#bbf7d0" radius={[4,4,0,0]} name="marge"/>
                    <Line yAxisId="line" type="monotone" dataKey="marge_cumul" stroke="#16a34a" strokeWidth={2.5} dot={false} name="marge_cumul"/>
                  </ComposedChart>
                </ResponsiveContainer>
                <div className="flex items-center gap-6 mt-2 text-xs text-gray-500 justify-center">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-200 inline-block"/>&nbsp;Marge par période</span>
                  <span className="flex items-center gap-1"><span className="w-5 h-0.5 bg-green-600 inline-block"/>&nbsp;Marge cumulée (courbe)</span>
                </div>
              </div>
            )}

            {/* Tableau par période */}
            {marge.evolution.length > 0 && (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Période</th>
                      <th>Nb ventes</th>
                      <th>Ventes</th>
                      <th>Coût d'achat</th>
                      <th className="text-green-700">Marge période</th>
                      <th>Taux</th>
                      <th className="text-green-800">Marge cumulée ↗</th>
                    </tr>
                  </thead>
                  <tbody>
                    {marge.evolution.map((e, i) => {
                      const taux = e.ca > 0 ? (e.marge / e.ca * 100).toFixed(1) : 0;
                      const pctCumul = maxCumul > 0 ? (e.marge_cumul / maxCumul * 100) : 0;
                      return (
                        <tr key={i}>
                          <td className="font-mono text-xs">{e.periode}</td>
                          <td className="text-center">{e.nb_ventes}</td>
                          <td>{fmt(e.ca)}</td>
                          <td className="text-orange-600">{fmt(e.cout)}</td>
                          <td className="font-semibold text-green-600">{fmt(e.marge)}</td>
                          <td>
                            <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${taux >= 20 ? 'bg-green-100 text-green-700' : taux >= 10 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                              {taux}%
                            </span>
                          </td>
                          <td>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-gray-100 rounded-full min-w-16">
                                <div className="h-2 bg-green-500 rounded-full" style={{width:`${pctCumul}%`}}/>
                              </div>
                              <span className="text-xs font-bold text-green-700 whitespace-nowrap">{fmt(e.marge_cumul)}</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-green-50 font-semibold">
                      <td colSpan="2" className="text-right text-gray-600">Total</td>
                      <td className="text-blue-700">{fmt(r.total_ca)}</td>
                      <td className="text-orange-600">{fmt(r.total_cout)}</td>
                      <td className="text-green-700">{fmt(r.total_marge)}</td>
                      <td><span className="inline-block bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">{r.taux_marge.toFixed(1)}%</span></td>
                      <td className="text-green-800 font-bold">{fmt(r.total_marge)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* Top produits par marge */}
            <div className="card">
              <h2 className="font-semibold mb-4 text-gray-800 flex items-center gap-2">
                <TrendingUp size={16} className="text-green-500"/> Produits les plus rentables
              </h2>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Produit</th>
                      <th>Qté vendue</th>
                      <th>Ventes</th>
                      <th className="text-green-700">Marge générée</th>
                      <th>Taux marge</th>
                      <th>Surplus vs catalogue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {marge.top_produits.map((p, i) => {
                      const medal = i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-gray-100 text-gray-600' : i === 2 ? 'bg-orange-100 text-orange-600' : 'bg-blue-50 text-blue-500';
                      return (
                        <tr key={i}>
                          <td><span className={`inline-flex w-6 h-6 rounded-lg items-center justify-center text-xs font-bold ${medal}`}>{i+1}</span></td>
                          <td className="font-medium">{p.nom}</td>
                          <td className="text-center">{p.qte}</td>
                          <td>{fmt(p.ca)}</td>
                          <td className="font-bold text-green-600">{fmt(p.marge)}</td>
                          <td>
                            <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${p.taux_marge >= 25 ? 'bg-green-100 text-green-700' : p.taux_marge >= 10 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-600'}`}>
                              {p.taux_marge}%
                            </span>
                          </td>
                          <td className={`font-semibold ${p.surplus > 0 ? 'text-emerald-600' : p.surplus < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                            {p.surplus > 0 ? '+' : ''}{fmt(p.surplus)}
                          </td>
                        </tr>
                      );
                    })}
                    {marge.top_produits.length === 0 && (
                      <tr><td colSpan="7" className="text-center py-8 text-gray-400">Aucune vente sur cette période</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Surplus par vendeur */}
            {marge.top_vendeurs && marge.top_vendeurs.some(v => v.nb_lignes > 0) && (
              <div className="card">
                <h2 className="font-semibold mb-1 text-gray-800 flex items-center gap-2">
                  <TrendingUp size={16} className="text-emerald-500"/> Surplus par vendeur
                </h2>
                <p className="text-xs text-gray-400 mb-4">Écart cumulé entre le prix encaissé en caisse et le prix catalogue, par vendeur — positif si vendu au-dessus du catalogue, négatif si remisé/bradé</p>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Vendeur</th>
                        <th>Lignes vendues</th>
                        <th>Surplus cumulé</th>
                      </tr>
                    </thead>
                    <tbody>
                      {marge.top_vendeurs.map((v, i) => (
                        <tr key={i}>
                          <td className="font-medium">{v.prenom || v.nom ? `${v.prenom || ''} ${v.nom || ''}`.trim() : 'Inconnu'}</td>
                          <td className="text-center">{v.nb_lignes}</td>
                          <td className={`font-bold ${v.surplus > 0 ? 'text-emerald-600' : v.surplus < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                            {v.surplus > 0 ? '+' : ''}{fmt(v.surplus)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {/* ── Retrait caisse ── */}
            {(() => {
              const disponible = r.total_marge - retraits.total;
              return (
                <div className="card border-2 border-green-200">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="font-semibold text-gray-800">💰 Que puis-je retirer de la caisse ?</h2>
                      <p className="text-xs text-gray-400 mt-0.5">Uniquement la marge — le coût d'achat reste pour renouveler le stock</p>
                    </div>
                    <button onClick={() => setShowRetrait(v => !v)} className="btn-primary btn-sm">+ Enregistrer un retrait</button>
                  </div>

                  {showRetrait && (
                    <form onSubmit={handleRetrait} className="flex gap-2 mb-4 p-3 bg-blue-50 rounded-xl">
                      <input type="number" min="1" required className="input w-36 text-sm" placeholder="Montant FCFA" value={retraitForm.montant} onChange={e => setRetraitForm(f => ({...f, montant: e.target.value}))} autoFocus/>
                      <input className="input flex-1 text-sm" placeholder="Motif (ex: loyer, salaire...)" value={retraitForm.motif} onChange={e => setRetraitForm(f => ({...f, motif: e.target.value}))}/>
                      <button type="submit" className="btn-primary btn-sm">Valider</button>
                      <button type="button" onClick={() => setShowRetrait(false)} className="btn-secondary btn-sm">×</button>
                    </form>
                  )}

                  {/* Résumé */}
                  <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm mb-4">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Marge brute sur la période</span>
                      <span className="font-bold text-green-600">{fmt(r.total_marge)} FCFA</span>
                    </div>
                    <div className="flex justify-between border-t pt-2">
                      <span className="text-gray-500">Total déjà retiré</span>
                      <span className="font-bold text-orange-500">− {fmt(retraits.total)} FCFA</span>
                    </div>
                    <div className={`flex justify-between border-t pt-3 text-base font-bold ${disponible >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      <span>Disponible à retirer</span>
                      <span>{fmt(Math.max(0, disponible))} FCFA</span>
                    </div>
                    {disponible < 0 && <p className="text-xs text-red-500">⚠️ Les retraits dépassent la marge sur cette période</p>}
                  </div>

                  {/* Historique retraits */}
                  {retraits.retraits.length > 0 && (
                    <div className="table-wrap">
                      <table className="table text-sm">
                        <thead><tr><th>Date</th><th>Motif</th><th>Montant</th><th>Par</th></tr></thead>
                        <tbody>
                          {retraits.retraits.map(rt => (
                            <tr key={rt.id}>
                              <td className="text-xs text-gray-500">{new Date(rt.created_at).toLocaleDateString('fr-FR')}</td>
                              <td>{rt.motif || '—'}</td>
                              <td className="font-semibold text-orange-600">{fmt(rt.montant)} FCFA</td>
                              <td className="text-xs text-gray-400">{rt.user_nom || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })()}
          </>
        );
      })()}

      {tab === 'remises' && remises && (() => {
        const r = remises.resume;
        const pctVentes = r.nb_ventes_total > 0 ? ((r.nb_avec_remise / r.nb_ventes_total) * 100).toFixed(1) : 0;
        const remiseMoyParVente = r.nb_avec_remise > 0 ? r.total_remises / r.nb_avec_remise : 0;
        return (
          <>
            {/* Bouton bulletin */}
            <div className="flex justify-end">
              <button
                onClick={() => printBulletinRemises(remises, filtres)}
                className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white font-semibold px-5 py-2.5 rounded-xl shadow-sm transition-colors text-sm"
              >
                <Printer size={16}/> Imprimer le bulletin
              </button>
            </div>

            {/* Cartes résumé */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="card text-center">
                <p className="text-xs text-gray-500 mb-1">Total remises accordées</p>
                <p className="text-xl font-bold text-red-600">{fmt(r.total_remises)}</p>
              </div>
              <div className="card text-center">
                <p className="text-xs text-gray-500 mb-1">Ventes avec remise</p>
                <p className="text-xl font-bold text-orange-600">{r.nb_avec_remise} <span className="text-sm font-normal text-gray-400">/ {r.nb_ventes_total}</span></p>
                <p className="text-xs text-gray-400">{pctVentes}% des ventes</p>
              </div>
              <div className="card text-center">
                <p className="text-xs text-gray-500 mb-1">Remise moyenne / vente</p>
                <p className="text-xl font-bold text-gray-700">{fmt(remiseMoyParVente)}</p>
              </div>
              <div className="card text-center">
                <p className="text-xs text-gray-500 mb-1">% remise moyen</p>
                <p className="text-xl font-bold text-gray-700">{(r.pct_moyen || 0).toFixed(2)} %</p>
              </div>
            </div>

            {/* Impact sur le CA */}
            {r.ca_total > 0 && (
              <div className="card flex items-center gap-4 bg-amber-50 border border-amber-100">
                <Tag size={20} className="text-amber-500 flex-shrink-0"/>
                <p className="text-sm text-amber-800">
                  Les remises représentent <strong>{((r.total_remises / (r.total_remises + r.ca_total)) * 100).toFixed(2)} %</strong> du chiffre d'affaires brut —
                  soit <strong>{fmt(r.total_remises)}</strong> de manque à gagner sur la période.
                </p>
              </div>
            )}

            {/* Graphique évolution */}
            {remises.evolution.length > 0 && (
              <div className="card">
                <h2 className="font-semibold mb-4 text-gray-800">Évolution des remises accordées</h2>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={remises.evolution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                    <XAxis dataKey="periode" tick={{fontSize:10}} tickFormatter={d => filtres.grouper === 'mois' ? d : d.slice(5)}/>
                    <YAxis tick={{fontSize:10}} tickFormatter={v => (v/1000)+'k'}/>
                    <Tooltip formatter={v => [fmt(v), 'Remises']}/>
                    <Bar dataKey="montant_remise" fill="#ef4444" radius={[4,4,0,0]} name="Montant remise"/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Détail des ventes avec remise */}
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>N° Vente</th>
                    <th>Date</th>
                    <th>Client</th>
                    <th>Caissier</th>
                    <th>Avant remise</th>
                    <th className="text-red-600">Remise accordée</th>
                    <th>% remise</th>
                    <th>Total payé</th>
                  </tr>
                </thead>
                <tbody>
                  {remises.detail.map((v, i) => (
                    <tr key={i}>
                      <td className="font-mono text-xs">{v.numero}</td>
                      <td className="text-xs text-gray-500">{new Date(v.created_at).toLocaleDateString('fr-FR')}</td>
                      <td>{v.client_nom || <span className="text-gray-400">Passage</span>}</td>
                      <td className="text-xs">{v.user_nom}</td>
                      <td>{fmt(v.avant_remise)}</td>
                      <td className="font-bold text-red-600">− {fmt(v.montant_remise)}</td>
                      <td>
                        <span className="inline-block bg-red-100 text-red-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                          {(v.pct_remise || 0).toFixed(1)} %
                        </span>
                      </td>
                      <td className="font-semibold text-blue-700">{fmt(v.total)}</td>
                    </tr>
                  ))}
                  {remises.detail.length === 0 && (
                    <tr><td colSpan="8" className="text-center py-8 text-gray-400">Aucune remise accordée sur cette période</td></tr>
                  )}
                </tbody>
                {remises.detail.length > 0 && (
                  <tfoot>
                    <tr className="bg-gray-50 font-semibold">
                      <td colSpan="5" className="text-right text-gray-600">Total</td>
                      <td className="text-red-600">− {fmt(r.total_remises)}</td>
                      <td/>
                      <td className="text-blue-700">{fmt(r.ca_total)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </>
        );
      })()}

      {tab === 'paiements' && paiements && (() => {
        const COULEURS = { especes:'#16a34a', mobile_money:'#ea580c', carte:'#2563eb', virement:'#0d9488', mixte:'#7c3aed' };
        const encaisses = paiements.resume.filter(m => m.mode !== 'credit');
        const credit = paiements.resume.find(m => m.mode === 'credit');
        const nbVentesEncaissees = encaisses.reduce((s,m) => s + m.nb_ventes, 0);
        return (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="card text-center">
                <p className="text-xs text-gray-500 mb-1">Total encaissé</p>
                <p className="text-xl font-bold text-green-600">{fmt(paiements.total_encaisse)}</p>
                <p className="text-xs text-gray-400">{nbVentesEncaissees} vente{nbVentesEncaissees!==1?'s':''}</p>
              </div>
              <div className="card text-center">
                <p className="text-xs text-gray-500 mb-1">En attente (crédit)</p>
                <p className="text-xl font-bold text-gray-500">{fmt(paiements.total_credit)}</p>
                <p className="text-xs text-gray-400">{credit?.nb_ventes || 0} vente{(credit?.nb_ventes||0)!==1?'s':''} — pas encore reçu</p>
              </div>
              <div className="card text-center">
                <p className="text-xs text-gray-500 mb-1">Mode le plus utilisé</p>
                <p className="text-xl font-bold text-blue-700">{encaisses[0]?.label || '—'}</p>
                <p className="text-xs text-gray-400">{encaisses[0] ? `${encaisses[0].pct}% de l'encaissé` : ''}</p>
              </div>
            </div>

            {encaisses.length > 0 && (
              <div className="card">
                <h2 className="font-semibold mb-4 text-gray-800 flex items-center gap-2">
                  <Wallet size={16} className="text-green-500"/> Répartition de l'encaissé par mode de paiement
                </h2>
                <div className="flex flex-col md:flex-row items-center gap-6">
                  <ResponsiveContainer width="100%" height={240} className="md:max-w-xs">
                    <PieChart>
                      <Pie data={encaisses} dataKey="montant" nameKey="label" innerRadius={55} outerRadius={90} paddingAngle={2}>
                        {encaisses.map((m,i) => <Cell key={i} fill={COULEURS[m.mode] || '#94a3b8'}/>)}
                      </Pie>
                      <Tooltip formatter={(v,n,p) => [fmt(v), p.payload.label]}/>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 w-full">
                    <table className="table">
                      <thead><tr><th>Mode</th><th className="text-center">Nb ventes</th><th>Montant</th><th className="text-center">%</th></tr></thead>
                      <tbody>
                        {encaisses.map((m,i) => (
                          <tr key={i}>
                            <td className="font-medium flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{background: COULEURS[m.mode] || '#94a3b8'}}/>
                              {m.label}
                            </td>
                            <td className="text-center">{m.nb_ventes}</td>
                            <td className="font-semibold text-gray-800">{fmt(m.montant)}</td>
                            <td className="text-center">
                              <span className="inline-block bg-gray-100 text-gray-700 text-xs font-bold px-2 py-0.5 rounded-full">{m.pct}%</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-green-50 font-semibold">
                          <td>Total encaissé</td>
                          <td className="text-center">{nbVentesEncaissees}</td>
                          <td className="text-green-700">{fmt(paiements.total_encaisse)}</td>
                          <td className="text-center">100%</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {credit && credit.montant > 0 && (
              <div className="flex items-center gap-3 p-4 bg-gray-50 border border-gray-200 rounded-xl">
                <Wallet size={20} className="text-gray-500 flex-shrink-0"/>
                <p className="text-sm text-gray-600">
                  <strong>{fmt(credit.montant)}</strong> supplémentaires vendus à crédit ({credit.nb_ventes} vente{credit.nb_ventes!==1?'s':''}) —
                  cet argent n'est pas encore physiquement ou électroniquement reçu, il n'est donc pas compté dans la répartition ci-dessus.
                </p>
              </div>
            )}

            {paiements.resume.length === 0 && (
              <div className="card text-center py-16">
                <Wallet size={40} className="text-gray-300 mx-auto mb-3"/>
                <p className="text-gray-500 font-medium">Aucune vente sur cette période</p>
              </div>
            )}
          </>
        );
      })()}

    </div>
  );
}
