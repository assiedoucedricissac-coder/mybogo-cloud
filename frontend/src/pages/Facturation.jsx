import React, { useState, useEffect, useCallback } from 'react';
import { FileText, Plus, Eye, Download, RefreshCw, X, Trash2, Search, Send, ShieldCheck, AlertTriangle, Clock, Edit } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useDraggable } from '../hooks/useDraggable';

// ── Constantes ────────────────────────────────────────────────────

const TYPES = [
  { value:'facture',  label:'Facture',  color:'bg-blue-100 text-blue-800',   ring:'ring-blue-500'  },
  { value:'proforma', label:'Proforma', color:'bg-amber-100 text-amber-800',  ring:'ring-amber-500' },
  { value:'avoir',    label:'Avoir',    color:'bg-red-100 text-red-800',      ring:'ring-red-500'   },
  { value:'recu',     label:'Reçu',     color:'bg-green-100 text-green-800',  ring:'ring-green-500' },
];

const STATUTS = {
  brouillon: 'bg-gray-100 text-gray-700',
  emise:     'bg-blue-100 text-blue-700',
  payee:     'bg-green-100 text-green-700',
  partielle: 'bg-yellow-100 text-yellow-700',
  annulee:   'bg-red-100 text-red-700',
};
const STATUT_LABELS = {
  brouillon:'Brouillon', emise:'Émise', payee:'Soldée', partielle:'Partielle', annulee:'Annulée'
};

const MODES = ['especes','mobile_money','carte','virement','cheque','credit'];

const emptyLigne = {
  produit_id:'', designation:'', quantite:1, unite:'pièce', prix_ht:'', remise:0,
  remise_montant:0, taux_tva:0, contenance:1, unite_libelle:'unité', conditionnement_id:''
};

const todayStr = () => new Date().toISOString().slice(0,10);

const emptyForm = {
  type:'facture', client_id:'', regime_tva:'exonere', remise:0, remise_montant:0,
  mode_paiement:'especes', montant_paye:'', statut:'emise', echeance:'', note:'',
  date_document: todayStr(),
  lignes:[{ ...emptyLigne }],
};

function calcLigne(l) {
  const base = (parseFloat(l.prix_ht)||0) * (parseFloat(l.quantite)||0);
  const remisePct = (parseFloat(l.remise)||0) / 100;
  const remiseMt = parseFloat(l.remise_montant)||0;
  const net = Math.max(0, base * (1 - remisePct) - remiseMt);
  return { ht: net, ttc: net };
}

function calcTotaux(lignes, remise, remiseMontant) {
  let ht = 0;
  lignes.forEach(l => { ht += calcLigne(l).ht; });
  const remisePctMt = ht * (parseFloat(remise)||0) / 100;
  const remiseMt = parseFloat(remiseMontant)||0;
  return { ht, remisePctMt, remiseMt, total: Math.max(0, ht - remisePctMt - remiseMt) };
}

const nf = n => new Intl.NumberFormat('fr-FR').format(Math.round(n||0));

// ── Composants ────────────────────────────────────────────────────

function Badge({ type }) {
  const cfg = TYPES.find(t=>t.value===type) || TYPES[0];
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>;
}

function Modal({ title, onClose, children, wide=false }) {
  const { offset, onMouseDown } = useDraggable();
  return (
    <div className="fixed inset-0 z-50">
      <div className="bg-white rounded-2xl shadow-xl" style={{ position:'absolute', top:16, left:'50%', transform:`translateX(-50%) translate(${offset.x}px, ${offset.y}px)`, width:'calc(100% - 32px)', maxWidth: wide ? 1024 : 640, maxHeight:'calc(100vh - 32px)', overflowY:'auto' }}>
        <div onMouseDown={onMouseDown} className="flex items-center justify-between p-5 border-b sticky top-0 bg-white rounded-t-2xl z-10 cursor-move select-none">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────

// ── Badge DGI ─────────────────────────────────────────────────────
function DGIBadge({ statut }) {
  if (!statut || statut === 'non_soumis') return null;
  const cfg = {
    valide:     { icon: ShieldCheck,    cls: 'text-green-600 bg-green-50',  label: 'DGI ✓' },
    soumis:     { icon: Clock,          cls: 'text-blue-600 bg-blue-50',    label: 'DGI...' },
    en_attente: { icon: Clock,          cls: 'text-gray-500 bg-gray-50',    label: 'DGI?' },
    rejete:     { icon: AlertTriangle,  cls: 'text-red-600 bg-red-50',      label: 'DGI ✗' },
  }[statut] || { icon: Clock, cls: 'text-gray-400', label: statut };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded ${cfg.cls}`}>
      <Icon size={10}/>{cfg.label}
    </span>
  );
}

export default function Facturation() {
  const { hasRole } = useAuth();
  const [factures, setFactures]   = useState([]);
  const [clients, setClients]     = useState([]);
  const [produits, setProduits]   = useState([]);
  const [conditionnements, setConditionnements] = useState({});
  const [loading, setLoading]     = useState(true);
  const [modal, setModal]         = useState(null);   // 'create' | 'detail' | 'statut'
  const [selected, setSelected]   = useState(null);
  const [form, setForm]           = useState(emptyForm);
  const [editingId, setEditingId] = useState(null); // id du brouillon en cours de modification, sinon null (création)
  const [filtres, setFiltres]     = useState({ type:'', statut:'', search:'' });
  const [dgiMap, setDgiMap]       = useState({});   // facture_id → statut DGI
  const [paiForm, setPaiForm]     = useState({ montant:'', mode_paiement:'especes', note:'' });
  const [paiLoading, setPaiLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = {};
    if (filtres.type)   params.type   = filtres.type;
    if (filtres.statut) params.statut = filtres.statut;
    const [f, c, p, condsRes] = await Promise.all([
      api.get('/facturation', { params }),
      api.get('/clients'),
      api.get('/produits'),
      api.get('/conditionnements').catch(()=>({ data: [] })),
    ]);
    setFactures(f.data);
    setClients(c.data);
    setProduits(p.data);
    const condMap = {};
    (condsRes?.data || []).forEach(cond => {
      if (!condMap[String(cond.produit_id)]) condMap[String(cond.produit_id)] = [];
      condMap[String(cond.produit_id)].push(cond);
    });
    setConditionnements(condMap);

    // Charger le statut DGI de chaque facture normalisée
    if (hasRole('admin','gestionnaire','comptable')) {
      const factures_norm = f.data.filter(x=>x.type==='facture');
      const subs = await api.get('/dgi/historique').catch(()=>({ data:[] }));
      const map = {};
      subs.data.forEach(s => { map[s.facture_id] = s.statut; });
      setDgiMap(map);
    }
    setLoading(false);
  }, [filtres.type, filtres.statut]);

  useEffect(()=>{ load(); },[load]);

  // ── Création de format à la volée (Carton/½/¼) ───────────
  const [condForm, setCondForm] = useState(null); // { index, n, prix }

  function ouvrirCondForm(i) { setCondForm({ index: i, n:'', prix:'' }); }
  function fermerCondForm()  { setCondForm(null); }

  async function genererFormatsLigne() {
    if (!condForm) return;
    const { index: i, n: nStr, prix: prixStr } = condForm;
    const produitId = form.lignes[i].produit_id;
    if (!produitId) return;
    const n = parseInt(nStr) || 0;
    const prixCarton = parseFloat(prixStr) || 0;
    if (n < 2)        { toast.error("Entrez le nombre d'unités par carton (ex: 24 ou 48)"); return; }
    if (prixCarton<=0){ toast.error('Entrez le prix de vente du carton'); return; }

    const quart = Math.max(1, Math.round(n/4));
    const demi  = Math.max(1, Math.round(n/2));
    const formats = [
      { libelle:'¼ Carton', contenance:quart, prix_vente:Math.round(prixCarton/4), ordre:1 },
      { libelle:'½ Carton', contenance:demi,  prix_vente:Math.round(prixCarton/2), ordre:2 },
      { libelle:'Carton',   contenance:n,     prix_vente:prixCarton,               ordre:3 },
    ];
    try {
      const created = [];
      for (const fmt of formats) {
        const res = await api.post('/conditionnements', { produit_id: produitId, ...fmt });
        created.push({ id: res.data.id, produit_id: produitId, ...fmt });
      }
      setConditionnements(prev => ({ ...prev, [String(produitId)]: created }));
      const carton = created.find(c=>c.libelle==='Carton');
      setForm(f => {
        const lignes = [...f.lignes];
        lignes[i] = {
          ...lignes[i],
          conditionnement_id: String(carton.id),
          prix_ht: carton.prix_vente,
          unite: carton.libelle,
          unite_libelle: carton.libelle,
          contenance: carton.contenance,
        };
        return { ...f, lignes };
      });
      toast.success('Formats créés (¼, ½, Carton)');
      setCondForm(null);
    } catch(err) { toast.error(err.response?.data?.message||'Erreur'); }
  }

  // ── Lignes helpers ──────────────────────────────────────
  function setLigne(i, field, val) {
    setForm(f => {
      const lignes = [...f.lignes];
      lignes[i] = { ...lignes[i], [field]: val };

      if (field==='produit_id' && val) {
        const p = produits.find(item=>String(item.id)===String(val));
        if (p) {
          lignes[i].designation = p.nom;
          lignes[i].prix_ht = p.prix_vente || p.prix_achat || '';
          lignes[i].unite = p.unite || 'pièce';
          lignes[i].unite_libelle = p.unite || 'unité';
          lignes[i].contenance = 1;
          lignes[i].conditionnement_id = '';
          lignes[i].taux_tva = 0;
          lignes[i].remise = 0;
          lignes[i].remise_montant = 0;
        }
      }

      if (field==='conditionnement_id') {
        if (!val) {
          const p = produits.find(item=>String(item.id)===String(lignes[i].produit_id));
          if (p) {
            lignes[i].prix_ht = p.prix_vente || p.prix_achat || '';
            lignes[i].unite = p.unite || 'pièce';
            lignes[i].unite_libelle = p.unite || 'unité';
            lignes[i].contenance = 1;
          }
        } else {
          const cond = (conditionnements[String(lignes[i].produit_id)] || []).find(item=>String(item.id)===String(val));
          if (cond) {
            lignes[i].prix_ht = cond.prix_vente;
            lignes[i].unite = cond.libelle || 'pièce';
            lignes[i].unite_libelle = cond.libelle || 'unité';
            lignes[i].contenance = cond.contenance || 1;
          }
        }
      }

      return { ...f, lignes };
    });
  }

  function addLigne()    { setForm(f=>({...f, lignes:[...f.lignes, {...emptyLigne}]})); }
  function removeLigne(i){ setForm(f=>({...f, lignes:f.lignes.filter((_,idx)=>idx!==i)})); }

  // ── Soumission ──────────────────────────────────────────
  async function handleSubmit(e, statut='emise') {
    e.preventDefault();
    const payload = { ...form, statut };
    if (payload.type === 'recu') {
      // Un reçu n'a qu'une seule ligne : le montant encaissé.
      const montant = parseFloat(payload.lignes[0]?.prix_ht);
      if (!montant || montant <= 0) { toast.error('Entrez le montant reçu'); return; }
      payload.lignes = [{ ...payload.lignes[0], designation: (payload.lignes[0]?.designation||'').trim() || 'Règlement reçu', quantite: 1 }];
    } else if (!payload.lignes.some(l=>l.designation.trim())) {
      toast.error('Au moins une ligne avec une désignation'); return;
    }
    const validLignes = payload.lignes.filter(l=>l.designation.trim()&&parseFloat(l.prix_ht)>0);
    if (!validLignes.length) { toast.error('Vérifiez les prix des lignes'); return; }
    try {
      if (editingId) {
        await api.put(`/facturation/${editingId}`, { ...payload, lignes: validLignes });
        toast.success(statut === 'brouillon' ? 'Brouillon mis à jour' : 'Document émis');
      } else {
        await api.post('/facturation', { ...payload, lignes: validLignes });
        toast.success('Document créé');
      }
      setModal(null);
      setEditingId(null);
      load();
    } catch(err) { toast.error(err.response?.data?.message||'Erreur'); }
  }

  // Reprend un brouillon dans le formulaire pour le modifier puis l'émettre.
  function modifierBrouillon(f) {
    setForm({
      type: f.type, client_id: f.client_id ? String(f.client_id) : '', regime_tva: f.regime_tva || 'exonere',
      remise: f.remise || 0, remise_montant: f.remise_montant || 0,
      mode_paiement: f.mode_paiement || 'especes', montant_paye: f.montant_paye || '',
      statut: f.statut, echeance: f.echeance || '', note: f.note || '',
      date_document: (f.created_at || '').slice(0,10) || todayStr(),
      lignes: (f.lignes || []).map(l => ({
        produit_id: l.produit_id ? String(l.produit_id) : '', designation: l.designation,
        quantite: l.quantite, unite: l.unite || 'pièce', prix_ht: l.prix_ht,
        remise: l.remise || 0, remise_montant: l.remise_montant || 0, taux_tva: 0,
        contenance: 1, unite_libelle: l.unite || 'unité', conditionnement_id: '',
      })),
    });
    setEditingId(f.id);
    setModal('create');
  }

  async function voirDetail(id) {
    const res = await api.get(`/facturation/${id}`);
    setSelected(res.data);
    setPaiForm({ montant:'', mode_paiement:'especes', note:'' });
    setModal('detail');
  }

  async function telechargerPDF(id) {
    try {
      const res = await api.get(`/facturation/${id}/pdf`, { responseType:'blob', timeout: 30000 });
      const url = URL.createObjectURL(new Blob([res.data], { type:'application/pdf' }));
      window.open(url, '_blank');
    } catch { toast.error('Erreur génération PDF'); }
  }

  async function enregistrerPaiement(e) {
    e.preventDefault();
    if (!selected) return;
    const montant = parseFloat(paiForm.montant);
    if (!montant || montant <= 0) { toast.error('Montant invalide'); return; }
    setPaiLoading(true);
    try {
      await api.post(`/facturation/${selected.id}/paiement`, paiForm);
      toast.success('Paiement enregistré');
      setPaiForm({ montant:'', mode_paiement:'especes', note:'' });
      const res = await api.get(`/facturation/${selected.id}`);
      setSelected(res.data);
      load();
    } catch(err) { toast.error(err.response?.data?.message||'Erreur'); }
    finally { setPaiLoading(false); }
  }

  async function convertirProforma(id) {
    if (!confirm('Convertir ce proforma en facture définitive ?')) return;
    try {
      const res = await api.post(`/facturation/${id}/convertir`);
      toast.success(`Facture ${res.data.numero} créée`);
      setModal(null);
      load();
    } catch(err) { toast.error(err.response?.data?.message||'Erreur'); }
  }

  // ── DGI ─────────────────────────────────────────────────
  const [dgiLoading, setDgiLoading] = useState(false);

  async function soumettreAuDGI(id) {
    setDgiLoading(true);
    try {
      const res = await api.post(`/dgi/soumettre/${id}`);
      const mode = res.data.mode === 'mock' ? ' [SIMULATION]' : '';
      toast.success(`DGI${mode} : ${res.data.dgi_numero}`);
      setDgiMap(m => ({ ...m, [id]: res.data.statut }));
      if (selected?.id === id) setSelected(s => ({ ...s, _dgi: res.data }));
      load();
    } catch(err) {
      toast.error(err.response?.data?.message || 'Erreur soumission DGI');
    } finally { setDgiLoading(false); }
  }

  const totaux = calcTotaux(form.lignes, form.remise, form.remise_montant);
  const typeConfig = TYPES.find(t=>t.value===form.type)||TYPES[0];

  // Filtre local sur la recherche
  const affichees = factures.filter(f => {
    if (!filtres.search) return true;
    const s = filtres.search.toLowerCase();
    return f.numero.toLowerCase().includes(s) || (f.client_nom||'').toLowerCase().includes(s);
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FileText size={24}/> Facturation
        </h1>
        <button onClick={()=>{ setForm(emptyForm); setEditingId(null); setModal('create'); }} className="btn-primary btn-sm">
          <Plus size={16}/> Nouveau document
        </button>
      </div>


      {/* Filtres */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
          <input className="input pl-9" placeholder="Rechercher N°, client..." value={filtres.search}
            onChange={e=>setFiltres(f=>({...f, search:e.target.value}))}/>
        </div>
        <select className="input w-36" value={filtres.type} onChange={e=>setFiltres(f=>({...f,type:e.target.value}))}>
          <option value="">Tous types</option>
          {TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select className="input w-36" value={filtres.statut} onChange={e=>setFiltres(f=>({...f,statut:e.target.value}))}>
          <option value="">Tous statuts</option>
          {Object.entries(STATUT_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {/* Stats rapides */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {TYPES.map(t=>{
          const docs = factures.filter(f=>f.type===t.value);
          const total = docs.reduce((s,f)=>s+(f.statut!=='annulee'?f.total:0),0);
          return (
            <div key={t.value} className="card py-3 px-4">
              <div className="flex items-center justify-between">
                <Badge type={t.value}/>
                <span className="text-lg font-bold text-gray-800">{docs.length}</span>
              </div>
              <div className="mt-1 text-xs text-gray-500">{nf(total)} FCFA</div>
            </div>
          );
        })}
      </div>

      {/* Table */}
      <div className="table-wrap">
        <table className="table">
          <thead><tr>
            <th>N° Document</th><th>Type</th><th>Date</th><th>Client</th>
            <th>Total</th><th>Statut</th><th>DGI</th><th>Actions</th>
          </tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="7" className="text-center py-12 text-gray-400">Chargement...</td></tr>
            ) : affichees.length===0 ? (
              <tr><td colSpan="7" className="text-center py-12 text-gray-400">Aucun document</td></tr>
            ) : affichees.map(f=>(
              <tr key={f.id}>
                <td><span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{f.numero}</span></td>
                <td><Badge type={f.type}/></td>
                <td className="text-xs">{new Date(f.created_at).toLocaleDateString('fr-FR')}</td>
                <td>{f.client_nom||'Passage'}</td>
                <td className="font-semibold text-blue-700">{nf(f.total)} FCFA</td>
                <td>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUTS[f.statut]||'bg-gray-100'}`}>
                    {STATUT_LABELS[f.statut]||f.statut}
                  </span>
                </td>
                <td>
                  {f.type==='facture'
                    ? <DGIBadge statut={dgiMap[f.id]||'non_soumis'}/>
                    : <span className="text-xs text-gray-300">—</span>
                  }
                </td>
                <td>
                  <div className="flex gap-1.5">
                    <button onClick={()=>voirDetail(f.id)} className="text-blue-600 hover:bg-blue-50 p-1.5 rounded" title="Détail"><Eye size={14}/></button>
                    <button onClick={()=>telechargerPDF(f.id)} className="text-green-600 hover:bg-green-50 p-1.5 rounded" title="PDF"><Download size={14}/></button>
                    {f.type==='proforma' && f.statut!=='annulee' && hasRole('admin','gestionnaire') && (
                      <button onClick={()=>convertirProforma(f.id)} className="text-amber-600 hover:bg-amber-50 p-1.5 rounded" title="Convertir en facture"><RefreshCw size={14}/></button>
                    )}
                    {f.type==='facture' && f.statut!=='annulee' && !dgiMap[f.id] && hasRole('admin','gestionnaire') && (
                      <button onClick={()=>soumettreAuDGI(f.id)} disabled={dgiLoading}
                        className="text-indigo-600 hover:bg-indigo-50 p-1.5 rounded disabled:opacity-40" title="Soumettre à la DGI">
                        <Send size={14}/>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">{affichees.length} document(s)</p>

      {/* ── MODAL CRÉATION ──────────────────────────────────────── */}
      {modal==='create' && (
        <Modal title={editingId ? 'Modifier le brouillon' : 'Nouveau document'} onClose={()=>{ setModal(null); setEditingId(null); }} wide>
          <form onSubmit={(e)=>handleSubmit(e,'emise')} className="space-y-5">

            {/* 1. Type de document */}
            <div>
              <label className="label mb-2">Type de document</label>
              <div className="grid grid-cols-4 gap-2">
                {TYPES.map(t=>(
                  <button key={t.value} type="button"
                    onClick={()=>setForm(f=>({...f,type:t.value}))}
                    className={`py-2 px-3 rounded-xl border-2 text-sm font-medium transition-all
                      ${form.type===t.value ? `border-current ${t.color} ring-2 ${t.ring}` : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                    {t.label}
                  </button>
                ))}
              </div>
              {form.type==='proforma' && (
                <p className="text-xs text-amber-600 mt-1">⚠ Document non définitif — ne génère pas d'écriture fiscale</p>
              )}
              {form.type==='avoir' && (
                <p className="text-xs text-red-600 mt-1">Note de crédit à émettre en compensation d'une facture existante</p>
              )}
            </div>

            {/* 3. Client + infos */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="label">Client</label>
                <select className="input" value={form.client_id} onChange={e=>setForm(f=>({...f,client_id:e.target.value}))}>
                  <option value="">Client de passage</option>
                  {clients.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Mode de règlement</label>
                <select className="input" value={form.mode_paiement} onChange={e=>setForm(f=>({...f,mode_paiement:e.target.value}))}>
                  {MODES.map(m=><option key={m} value={m}>{m.replace(/_/g,' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Date du document</label>
                <input type="date" className="input" value={form.date_document} onChange={e=>setForm(f=>({...f,date_document:e.target.value}))}/>
              </div>
              <div>
                <label className="label">
                  {form.type==='proforma'?'Date d\'échéance / validité':'Date d\'échéance paiement'}
                </label>
                <input type="date" className="input" value={form.echeance} onChange={e=>setForm(f=>({...f,echeance:e.target.value}))}/>
              </div>
            </div>

            {/* 4. Lignes — un Reçu est juste la preuve d'un montant encaissé, pas une liste d'articles */}
            {form.type==='recu' ? (
              <div className="border border-green-200 rounded-xl p-4 space-y-3 bg-green-50/40">
                <label className="label">Montant du reçu</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-0.5">Montant reçu (FCFA) *</label>
                    <input type="number" min="0" step="1" className="input text-lg font-bold text-green-700"
                      value={form.lignes[0]?.prix_ht ?? ''}
                      onChange={e=>{ setLigne(0,'prix_ht',e.target.value); setLigne(0,'quantite',1); }}
                      placeholder="0" required/>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-0.5">Motif (optionnel)</label>
                    <input className="input" value={form.lignes[0]?.designation ?? ''}
                      onChange={e=>setLigne(0,'designation', e.target.value)}
                      placeholder="Règlement reçu"/>
                  </div>
                </div>
              </div>
            ) : (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label">Lignes articles / prestations</label>
                <button type="button" onClick={addLigne} className="btn-secondary btn-sm text-xs">
                  <Plus size={13}/> Ajouter ligne
                </button>
              </div>

              <div className="space-y-2">
                {form.lignes.map((l,i)=>{
                  const { ttc } = calcLigne(l);
                  const conds = conditionnements[String(l.produit_id)] || [];
                  return (
                    <div key={i} className="border border-gray-200 rounded-xl p-3 space-y-2.5">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <select className="input text-xs py-1.5"
                            value={l.produit_id}
                            onChange={e=>setLigne(i,'produit_id',e.target.value)}>
                            <option value="">— Texte libre —</option>
                            {produits.map(p=><option key={p.id} value={p.id}>{p.nom}</option>)}
                          </select>
                          <input className="input text-xs py-1.5" placeholder="Désignation *"
                            value={l.designation} required
                            onChange={e=>setLigne(i,'designation',e.target.value)}/>
                        </div>
                        {form.lignes.length>1 && (
                          <button type="button" onClick={()=>removeLigne(i)}
                            className="text-red-400 hover:text-red-600 p-1.5 shrink-0"><Trash2 size={14}/></button>
                        )}
                      </div>

                      {l.produit_id && (
                        <div className="flex flex-wrap gap-1.5">
                          <button type="button" onClick={()=>setLigne(i,'conditionnement_id','')}
                            className={`text-xs font-medium px-2.5 py-1 rounded-lg border-2 transition-all
                              ${!l.conditionnement_id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                            Unité
                          </button>
                          {conds.map(cond=>(
                            <button type="button" key={cond.id} onClick={()=>setLigne(i,'conditionnement_id',cond.id)}
                              className={`text-xs font-medium px-2.5 py-1 rounded-lg border-2 transition-all
                                ${String(l.conditionnement_id)===String(cond.id) ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                              {cond.libelle} ({cond.contenance}u)
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
                        <div>
                          <label className="text-[10px] text-gray-400 block mb-0.5">Qté</label>
                          <input type="text" inputMode="decimal" className="input text-xs py-1 text-center"
                            value={l.quantite} onChange={e=>setLigne(i,'quantite',e.target.value)}/>
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-400 block mb-0.5">Prix unitaire</label>
                          <input type="number" min="0" step="1" className="input text-xs py-1 text-right"
                            value={l.prix_ht} required
                            onChange={e=>setLigne(i,'prix_ht',e.target.value)}/>
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-400 block mb-0.5">Rem. %</label>
                          <input type="number" min="0" max="100" className="input text-xs py-1 text-center"
                            value={l.remise} onChange={e=>setLigne(i,'remise',e.target.value)}/>
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-400 block mb-0.5">Remise (FCFA)</label>
                          <input type="number" min="0" step="1" className="input text-xs py-1 text-center"
                            value={l.remise_montant} onChange={e=>setLigne(i,'remise_montant',e.target.value)}/>
                        </div>
                        <div className="text-right">
                          <label className="text-[10px] text-gray-400 block mb-0.5">Total</label>
                          <div className="font-semibold text-blue-700 text-sm py-1">{nf(ttc)} FCFA</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            )}

            {/* 5. Totaux en temps réel */}
            <div className="flex flex-col sm:flex-row gap-4 items-start">
              {/* Remise + note */}
              <div className="flex-1 space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="label">Remise globale (%)</label>
                    <input type="number" min="0" max="100" className="input"
                      value={form.remise} onChange={e=>setForm(f=>({...f,remise:e.target.value}))}/>
                  </div>
                  <div>
                    <label className="label">Remise globale (FCFA)</label>
                    <input type="number" min="0" className="input"
                      value={form.remise_montant} onChange={e=>setForm(f=>({...f,remise_montant:e.target.value}))}/>
                  </div>
                  <div>
                    <label className="label">Montant payé (FCFA)</label>
                    <input type="number" min="0" className="input"
                      placeholder={`Total: ${nf(totaux.total)}`}
                      value={form.montant_paye}
                      onChange={e=>setForm(f=>({...f,montant_paye:e.target.value}))}/>
                  </div>
                </div>
                <div>
                  <label className="label">Note / observations</label>
                  <textarea className="input" rows={2} value={form.note}
                    onChange={e=>setForm(f=>({...f,note:e.target.value}))}/>
                </div>
              </div>

              {/* Récap totaux */}
              <div className="w-full sm:w-64 bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Sous-total</span>
                  <span>{nf(totaux.ht)} FCFA</span>
                </div>
                {totaux.remisePctMt > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Remise ({form.remise}%)</span>
                    <span>-{nf(totaux.remisePctMt)} FCFA</span>
                  </div>
                )}
                {totaux.remiseMt > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Remise globale</span>
                    <span>-{nf(totaux.remiseMt)} FCFA</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base border-t pt-2 text-blue-700">
                  <span>TOTAL</span>
                  <span>{nf(totaux.total)} FCFA</span>
                </div>
                {parseFloat(form.montant_paye) > 0 && parseFloat(form.montant_paye) < totaux.total && (
                  <div className="flex justify-between text-red-600 text-xs">
                    <span>Reste à payer</span>
                    <span>{nf(totaux.total - parseFloat(form.montant_paye))} FCFA</span>
                  </div>
                )}
              </div>
            </div>

            {/* 6. Boutons */}
            <div className="flex justify-end gap-3 pt-2 border-t">
              <button type="button" className="btn-secondary" onClick={()=>{ setModal(null); setEditingId(null); }}>Annuler</button>
              <button type="submit" onClick={e=>{ e.preventDefault(); handleSubmit(e,'brouillon'); }}
                className="btn-secondary">Enregistrer en brouillon</button>
              <button type="submit" className={`btn-primary ${typeConfig.color.replace('bg-','bg-').replace('text-','text-')}`}>
                Émettre {form.type==='facture'?'la facture':form.type==='proforma'?'le proforma':form.type==='avoir'?'l\'avoir':'le reçu'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── MODAL DÉTAIL ────────────────────────────────────────── */}
      {modal==='detail' && selected && (
        <Modal title={`${selected.numero}`} onClose={()=>setModal(null)} wide>
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <Badge type={selected.type}/>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUTS[selected.statut]||'bg-gray-100'}`}>
                {STATUT_LABELS[selected.statut]||selected.statut}
              </span>
              <span className="text-xs text-gray-400">
                {new Date(selected.created_at).toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'})}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-400 text-xs">Client</p>
                <p className="font-medium">{selected.client_nom||'Client de passage'}</p>
              </div>
            </div>

            <div className="table-wrap">
              <table className="table text-xs">
                <thead><tr><th>Désignation</th><th>Qté</th><th>Prix unitaire</th><th>Total</th></tr></thead>
                <tbody>
                  {selected.lignes?.map(l=>(
                    <tr key={l.id}>
                      <td>
                        {l.designation}
                        {(l.remise>0||l.remise_montant>0) && (
                          <span className="text-red-500 ml-1">
                            {l.remise>0 ? `(-${l.remise}%)` : ''}
                            {l.remise>0 && l.remise_montant>0 ? ' + ' : ''}
                            {l.remise_montant>0 ? `(-${nf(l.remise_montant)} FCFA)` : ''}
                          </span>
                        )}
                      </td>
                      <td>{l.quantite} {l.unite_libelle || l.unite}</td>
                      <td>{nf(l.prix_ht)}</td>
                      <td className="font-semibold">{nf(l.montant_ttc)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end">
              <div className="w-60 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Sous-total</span><span>{nf(selected.sous_total)} FCFA</span></div>
                {selected.remise>0&&<div className="flex justify-between text-red-600"><span>Remise {selected.remise}%</span><span>-{nf(selected.sous_total*selected.remise/100)} FCFA</span></div>}
                {selected.remise_montant>0&&<div className="flex justify-between text-red-600"><span>Remise globale</span><span>-{nf(selected.remise_montant)} FCFA</span></div>}
                <div className="flex justify-between font-bold border-t pt-1 text-blue-700"><span>TOTAL</span><span>{nf(selected.total)} FCFA</span></div>
                {selected.montant_paye<selected.total&&selected.type!=='recu'&&(
                  <div className="flex justify-between text-red-600 text-xs font-semibold"><span>Reste à payer</span><span>{nf(selected.total-selected.montant_paye)} FCFA</span></div>
                )}
              </div>
            </div>

            {/* Règlements */}
            {['emise','partielle'].includes(selected.statut) && hasRole('admin','gestionnaire','comptable','caissier') && (
              <div className="border-t pt-3 space-y-3">
                <p className="text-sm font-semibold text-gray-700">Enregistrer un règlement</p>
                <form onSubmit={enregistrerPaiement} className="flex flex-wrap items-end gap-2">
                  <div>
                    <label className="text-xs text-gray-500 block mb-0.5">Montant (FCFA)</label>
                    <input type="number" min="1" className="input w-32" placeholder={`Max ${nf(selected.total-selected.montant_paye)}`}
                      value={paiForm.montant} onChange={e=>setPaiForm(f=>({...f,montant:e.target.value}))}/>
                  </div>
                  <button type="button" onClick={()=>setPaiForm(f=>({...f, montant: selected.total-selected.montant_paye}))}
                    className="btn-secondary btn-sm text-xs">Solder</button>
                  <select className="input w-36" value={paiForm.mode_paiement} onChange={e=>setPaiForm(f=>({...f,mode_paiement:e.target.value}))}>
                    {MODES.filter(m=>m!=='credit').map(m=><option key={m} value={m}>{m.replace(/_/g,' ')}</option>)}
                  </select>
                  <input className="input flex-1 min-w-32" placeholder="Note (optionnel)"
                    value={paiForm.note} onChange={e=>setPaiForm(f=>({...f,note:e.target.value}))}/>
                  <button type="submit" disabled={paiLoading} className="btn-primary btn-sm disabled:opacity-40">
                    {paiLoading ? 'Enregistrement...' : 'Enregistrer'}
                  </button>
                </form>
              </div>
            )}

            {selected.paiements?.length > 0 && (
              <div className="border-t pt-3">
                <p className="text-sm font-semibold text-gray-700 mb-2">Historique des règlements</p>
                <div className="space-y-1">
                  {selected.paiements.map(p=>(
                    <div key={p.id} className="flex justify-between items-center text-xs bg-gray-50 rounded-lg px-3 py-2">
                      <div>
                        <span className="font-medium text-gray-700">{nf(p.montant)} FCFA</span>
                        <span className="text-gray-400 ml-2">{p.mode_paiement.replace(/_/g,' ')}</span>
                        {p.note && <span className="text-gray-400 ml-2">— {p.note}</span>}
                      </div>
                      <span className="text-gray-400">{new Date(p.created_at).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selected.note && <p className="text-sm text-gray-500 border-t pt-3">Note : {selected.note}</p>}

            {/* Bloc DGI */}
            {selected.type==='facture' && (
              <div className={`rounded-xl p-4 border text-sm space-y-2 ${
                dgiMap[selected.id]==='valide' ? 'bg-green-50 border-green-200' :
                dgiMap[selected.id]==='rejete' ? 'bg-red-50 border-red-200'    :
                'bg-gray-50 border-gray-200'}`}>
                <div className="flex items-center gap-2 font-semibold text-gray-700">
                  <ShieldCheck size={15}/>
                  DGI — Déclaration fiscale
                  {dgiMap[selected.id] && <DGIBadge statut={dgiMap[selected.id]}/>}
                </div>
                {selected._dgi ? (
                  <div className="space-y-1 text-xs text-gray-600">
                    <p>N° DGI : <strong className="text-gray-900 font-mono">{selected._dgi.dgi_numero}</strong></p>
                    {selected._dgi.mode==='mock' && <p className="text-amber-600">⚠ Simulation — pas de soumission réelle à la DGI</p>}
                    <p className="text-gray-400 break-all">QR : {selected._dgi.qr_data}</p>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">
                    {dgiMap[selected.id]==='valide' ? 'Facture validée par la DGI.' : 'Facture non encore soumise à la DGI.'}
                  </p>
                )}
                {(!dgiMap[selected.id] || dgiMap[selected.id]==='rejete') && hasRole('admin','gestionnaire') && (
                  <button onClick={()=>soumettreAuDGI(selected.id)} disabled={dgiLoading}
                    className="btn-primary btn-sm gap-2 disabled:opacity-40">
                    <Send size={13}/> {dgiLoading ? 'Soumission...' : 'Soumettre à la DGI'}
                  </button>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-3 border-t">
              {selected.statut==='brouillon' && (
                <button onClick={()=>{ modifierBrouillon(selected); }} className="btn-primary gap-2">
                  <Edit size={15}/> Modifier et émettre
                </button>
              )}
              <button onClick={()=>telechargerPDF(selected.id)} className="btn-secondary gap-2 flex-1 justify-center">
                <Download size={15}/> Télécharger PDF
              </button>
              {selected.type==='proforma' && selected.statut!=='annulee' && hasRole('admin','gestionnaire') && (
                <button onClick={()=>convertirProforma(selected.id)} className="btn-secondary gap-2">
                  <RefreshCw size={15}/> → Convertir en facture
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}


