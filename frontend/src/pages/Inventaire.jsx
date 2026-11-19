import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ClipboardList, Plus, CheckCheck, XCircle, ChevronRight, Search,
  TrendingUp, TrendingDown, Minus, Eye, AlertCircle, Scan, Send,
  Download, FileSpreadsheet, BarChart3, RefreshCw, ThumbsDown, AlertTriangle, Clock
} from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const nf = n => new Intl.NumberFormat('fr-FR').format(Math.round(n ?? 0));
const fmt = d => new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' });
const fmtFull = d => new Date(d).toLocaleString('fr-FR', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });

const STATUT_CFG = {
  brouillon: { label:'En cours',  cls:'badge-blue',   icon: Clock },
  soumis:    { label:'À valider', cls:'badge-yellow',  icon: Send },
  valide:    { label:'Validé',    cls:'badge-green',   icon: CheckCheck },
  rejete:    { label:'Rejeté',    cls:'badge-red',     icon: ThumbsDown },
  annule:    { label:'Annulé',    cls:'badge-gray',    icon: XCircle },
};

const ALERTE_CFG = {
  rupture: { label:'Rupture',    cls:'bg-red-100 text-red-700' },
  faible:  { label:'Stock bas',  cls:'bg-orange-100 text-orange-700' },
  expire:  { label:'Périmé',     cls:'bg-purple-100 text-purple-700' },
  normal:  { label:'',           cls:'' },
};

/* ── Ligne produit ──────────────────────────────────────────────────────────── */
function LigneProduit({ ligne, disabled, onSave, highlighted, inputRef, rowRef }) {
  const [val, setVal] = useState(ligne.qte_comptee !== null && ligne.qte_comptee !== undefined ? String(ligne.qte_comptee) : '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setVal(ligne.qte_comptee !== null && ligne.qte_comptee !== undefined ? String(ligne.qte_comptee) : '');
  }, [ligne.qte_comptee]);

  const ecart = val !== '' ? parseInt(val) - ligne.qte_systeme : null;
  const al = ALERTE_CFG[ligne.alerte] || ALERTE_CFG.normal;
  const rowBg = highlighted ? 'bg-yellow-50 ring-2 ring-yellow-400' : val === '' ? '' : ecart === 0 ? 'bg-green-50' : ecart > 0 ? 'bg-blue-50' : 'bg-red-50';

  async function handleBlur() {
    if (val === '' && (ligne.qte_comptee === null || ligne.qte_comptee === undefined)) return;
    const parsed = val !== '' ? parseInt(val) : null;
    if (parsed === ligne.qte_comptee) return;
    setSaving(true);
    await onSave(ligne.id, parsed);
    setSaving(false);
  }

  async function handleKeyDown(e) {
    if (e.key === 'Enter') { e.target.blur(); }
  }

  return (
    <tr ref={rowRef} className={`border-b border-gray-100 transition-all ${rowBg}`}>
      <td className="px-3 py-2.5">
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-600 w-fit">{ligne.produit_code}</span>
          {ligne.code_barres && <span className="text-xs text-gray-400">{ligne.code_barres}</span>}
        </div>
      </td>
      <td className="px-3 py-2.5">
        <p className="font-medium text-sm text-gray-900">{ligne.produit_nom}</p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="text-xs text-gray-400">{ligne.categorie_nom || '—'}</span>
          {al.label && <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${al.cls}`}>{al.label}</span>}
        </div>
      </td>
      <td className="px-3 py-2.5 text-center">
        <span className="font-bold text-gray-700 text-base">{ligne.qte_systeme}</span>
        <span className="text-xs text-gray-400 block">{ligne.unite}</span>
      </td>
      <td className="px-2 py-2 text-center bg-blue-50/40">
        <div className="flex flex-col items-center gap-0.5">
          <input
            ref={inputRef}
            type="number" min="0"
            value={val}
            onChange={e => setVal(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            disabled={disabled || saving}
            placeholder="0"
            className={`w-24 text-center px-2 py-2 text-base font-bold border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors
              ${saving ? 'opacity-50' : ''}
              ${disabled ? 'border-gray-200 bg-gray-100 text-gray-500'
                : val !== '' ? (ecart === 0 ? 'border-green-400 bg-green-50 text-green-800' : ecart > 0 ? 'border-blue-400 bg-blue-50 text-blue-800' : 'border-red-400 bg-red-50 text-red-800')
                : 'border-blue-300 bg-white text-gray-900'}`}
          />
          {!disabled && val === '' && <span className="text-xs text-blue-500 font-medium">← saisir ici</span>}
          {saving && <span className="text-xs text-gray-400">enreg...</span>}
        </div>
      </td>
      <td className="px-3 py-2.5 text-center w-24">
        {ecart === null ? <span className="text-gray-300 text-sm">—</span>
          : ecart === 0 ? <span className="inline-flex items-center gap-1 text-green-600 text-sm font-bold"><Minus size={13}/>0</span>
          : ecart > 0 ? <span className="inline-flex items-center gap-1 text-blue-600 text-sm font-bold"><TrendingUp size={13}/>+{ecart}</span>
          : <span className="inline-flex items-center gap-1 text-red-500 text-sm font-bold"><TrendingDown size={13}/>{ecart}</span>}
      </td>
      <td className="px-3 py-2.5 text-center text-xs text-gray-500 w-28">
        {ecart !== null && ecart !== 0 ? `${ecart > 0 ? '+' : ''}${nf(ecart * (ligne.prix_achat || 0))} F` : '—'}
      </td>
    </tr>
  );
}

/* ── Page principale ────────────────────────────────────────────────────────── */
export default function Inventaire() {
  const { user } = useAuth();
  const canValidate = ['admin', 'gestionnaire', 'super_admin'].includes(user?.role);

  const [view, setView]           = useState('liste');
  const [inventaires, setInventaires] = useState([]);
  const [stats, setStats]         = useState(null);
  const [actif, setActif]         = useState(null);
  const [detail, setDetail]       = useState(null);
  const [categories, setCategories] = useState([]);

  // Filtres vue actif
  const [search, setSearch]       = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [ecartFilter, setEcartFilter] = useState('tous');

  // Scan mode
  const [scanMode, setScanMode]   = useState(false);
  const [scanVal, setScanVal]     = useState('');
  const [highlighted, setHighlighted] = useState(null);
  const scanInputRef              = useRef();
  const inputRefs                 = useRef({});
  const rowRefs                   = useRef({});

  const [loading, setLoading]     = useState(true);
  const [modal, setModal]         = useState(null);
  const [newForm, setNewForm]     = useState({ note:'', categorie_id:'' });
  const [rejetNote, setRejetNote] = useState('');

  /* ── Chargement ── */
  const reload = useCallback(async () => {
    const [invs, cats, st] = await Promise.all([
      api.get('/inventaires').then(r => r.data),
      api.get('/categories').then(r => r.data),
      api.get('/inventaires/stats').then(r => r.data).catch(() => null),
    ]);
    setInventaires(invs);
    setCategories(cats);
    setStats(st);
    const brouillon = invs.find(i => ['brouillon','soumis'].includes(i.statut));
    if (brouillon) {
      const full = await api.get(`/inventaires/${brouillon.id}`).then(r => r.data);
      setActif(full);
      setView('actif');
    } else if (view === 'actif') {
      setView('liste');
    }
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  /* ── Scan code-barres ── */
  useEffect(() => {
    if (scanMode && scanInputRef.current) scanInputRef.current.focus();
  }, [scanMode]);

  function handleScan(e) {
    if (e.key !== 'Enter') return;
    const code = scanVal.trim();
    if (!code || !actif) return;
    const ligne = actif.lignes.find(l =>
      l.produit_code?.toLowerCase() === code.toLowerCase() ||
      l.code_barres?.toLowerCase() === code.toLowerCase()
    );
    if (!ligne) { toast.error(`Code "${code}" non trouvé`); setScanVal(''); return; }
    setScanVal('');
    setHighlighted(ligne.id);
    // Scroll & focus
    rowRefs.current[ligne.id]?.scrollIntoView({ behavior:'smooth', block:'center' });
    setTimeout(() => {
      inputRefs.current[ligne.id]?.focus();
      setHighlighted(null);
    }, 600);
  }

  /* ── Créer inventaire ── */
  async function handleCreate(e) {
    e.preventDefault();
    try {
      const r = await api.post('/inventaires', { note:newForm.note, categorie_id:newForm.categorie_id||undefined });
      toast.success(`${r.data.reference} — ${r.data.total} produits`);
      setModal(null);
      setNewForm({ note:'', categorie_id:'' });
      const full = await api.get(`/inventaires/${r.data.id}`).then(res => res.data);
      setActif(full);
      setView('actif');
      reload();
    } catch (err) {
      if (err.response?.data?.id) {
        const full = await api.get(`/inventaires/${err.response.data.id}`).then(res => res.data);
        setActif(full); setView('actif');
        toast('Inventaire en cours repris', { icon:'ℹ️' });
      } else toast.error(err.response?.data?.message || 'Erreur');
    }
  }

  /* ── Sauvegarder une ligne ── */
  async function handleSaveLigne(ligneId, qte) {
    try {
      const r = await api.put(`/inventaires/${actif.id}/lignes/${ligneId}`, { qte_comptee: qte });
      setActif(prev => ({ ...prev, lignes: prev.lignes.map(l => l.id === ligneId ? { ...l, qte_comptee: qte, ecart: r.data.ecart } : l) }));
    } catch { toast.error('Erreur sauvegarde'); }
  }

  /* ── Actions inventaire ── */
  async function handleSoumettre() {
    try {
      await api.post(`/inventaires/${actif.id}/soumettre`);
      toast.success('Inventaire soumis pour validation');
      setModal(null);
      reload();
    } catch (err) { toast.error(err.response?.data?.message || 'Erreur'); }
  }

  async function handleValider() {
    try {
      const r = await api.post(`/inventaires/${actif?.id || detail?.id}/valider`);
      toast.success(`Validé — ${r.data.ajustements} ajustement(s) appliqué(s)`);
      setModal(null);
      setActif(null);
      setDetail(null);
      setView('liste');
      reload();
    } catch (err) { toast.error(err.response?.data?.message || 'Erreur'); }
  }

  async function handleRejeter(e) {
    e.preventDefault();
    try {
      await api.post(`/inventaires/${detail?.id}/rejeter`, { note_rejet: rejetNote });
      toast.success('Inventaire rejeté');
      setModal(null);
      setRejetNote('');
      openDetail(detail);
      reload();
    } catch (err) { toast.error(err.response?.data?.message || 'Erreur'); }
  }

  async function handleAnnuler() {
    if (!confirm('Annuler cet inventaire ? Les saisies seront perdues.')) return;
    try {
      await api.delete(`/inventaires/${actif.id}`);
      toast.success('Inventaire annulé');
      setActif(null); setView('liste'); reload();
    } catch (err) { toast.error(err.response?.data?.message || 'Erreur'); }
  }

  async function handleSynchroniser() {
    if (!confirm('Synchroniser les quantités physiques avec le stock actuel du système ?')) return;
    try {
      const res = await api.post(`/inventaires/${actif.id}/synchroniser`);
      toast.success(res.data.message || 'Synchronisé');
      const r = await api.get(`/inventaires/${actif.id}`);
      setActif(r.data);
    } catch (err) { toast.error(err.response?.data?.message || 'Erreur'); }
  }

  async function openDetail(inv) {
    const full = await api.get(`/inventaires/${inv.id}`).then(r => r.data);
    setDetail(full);
    setView('detail');
  }

  function downloadPDF(id) {
    const token = localStorage.getItem('token');
    const a = document.createElement('a');
    a.href = `/api/inventaires/${id}/pdf`;
    a.setAttribute('download', '');
    fetch(a.href, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob()).then(blob => {
        const url = URL.createObjectURL(blob);
        a.href = url; a.click(); URL.revokeObjectURL(url);
      });
  }

  function downloadExcel(id) {
    const token = localStorage.getItem('token');
    fetch(`/api/inventaires/${id}/excel`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob()).then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `inventaire-${id}.xlsx`;
        a.click(); URL.revokeObjectURL(url);
      });
  }

  /* ── Stats actif ── */
  const statsActif = actif ? (() => {
    const ls = actif.lignes;
    const comp = ls.filter(l => l.qte_comptee !== null);
    const surplus  = comp.filter(l => l.ecart > 0).reduce((s,l) => s + l.ecart * (l.prix_achat||0), 0);
    const manquant = comp.filter(l => l.ecart < 0).reduce((s,l) => s + Math.abs(l.ecart) * (l.prix_achat||0), 0);
    const alertes  = ls.filter(l => l.alerte !== 'normal').length;
    return { total:ls.length, comp:comp.length, ecart:comp.filter(l=>l.ecart!==0).length, surplus, manquant, alertes };
  })() : null;

  /* ── Filtrage lignes ── */
  const lignesFiltrees = actif?.lignes.filter(l => {
    const ms = !search || (l.produit_nom||'').toLowerCase().includes(search.toLowerCase()) || (l.produit_code||'').toLowerCase().includes(search.toLowerCase()) || (l.code_barres||'').toLowerCase().includes(search.toLowerCase());
    const mc = !catFilter || l.categorie_nom === catFilter;
    const me = ecartFilter === 'tous' ? true
      : ecartFilter === 'ecart' ? (l.qte_comptee !== null && l.ecart !== 0)
      : ecartFilter === 'ok'    ? (l.qte_comptee !== null && l.ecart === 0)
      : ecartFilter === 'alertes' ? l.alerte !== 'normal'
      : l.qte_comptee === null;
    return ms && mc && me;
  }) ?? [];

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent"/></div>;

  /* ════════════════════════════════════════════════════════════════════
     VUE DÉTAIL
  ════════════════════════════════════════════════════════════════════ */
  if (view === 'detail' && detail) {
    const sc = STATUT_CFG[detail.statut] || STATUT_CFG.brouillon;
    const avecEcart = detail.lignes.filter(l => l.ecart !== 0 && l.ecart !== null);
    const vSurplus  = detail.lignes.filter(l=>l.ecart>0).reduce((s,l)=>s+l.ecart*(l.prix_achat||0),0);
    const vManquant = detail.lignes.filter(l=>l.ecart<0).reduce((s,l)=>s+Math.abs(l.ecart)*(l.prix_achat||0),0);
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => setView('liste')} className="text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-xl text-sm font-semibold transition-colors">← Retour</button>
          <h1 className="text-xl font-bold text-gray-900">{detail.reference}</h1>
          <span className={`badge ${sc.cls}`}>{sc.label}</span>
          {detail.note_rejet && <span className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded border border-red-200">Motif rejet: {detail.note_rejet}</span>}
          <div className="ml-auto flex gap-2">
            <button onClick={() => downloadPDF(detail.id)} className="btn-secondary btn-sm flex items-center gap-1.5"><Download size={14}/> PDF</button>
            <button onClick={() => downloadExcel(detail.id)} className="btn-secondary btn-sm flex items-center gap-1.5"><FileSpreadsheet size={14}/> Excel</button>
            {canValidate && detail.statut === 'soumis' && (
              <>
                <button onClick={() => setModal('rejeter')} className="btn-danger btn-sm flex items-center gap-1.5"><ThumbsDown size={14}/> Rejeter</button>
                <button onClick={() => setModal('valider')} className="btn-success btn-sm flex items-center gap-1.5"><CheckCheck size={14}/> Valider</button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { l:'Produits listés',  v:detail.lignes.length,               c:'text-gray-800' },
            { l:'Comptés',          v:detail.lignes.filter(l=>l.qte_comptee!==null).length, c:'text-blue-700' },
            { l:'Avec écart',       v:avecEcart.length,                   c:'text-orange-600' },
            { l:'Surplus (valeur)', v:`+${nf(vSurplus)} F`,              c:'text-blue-600' },
            { l:'Manquant (val.)',  v:`-${nf(vManquant)} F`,             c:'text-red-600' },
            { l:'Saisi par',        v:detail.user_nom||'—',              c:'text-gray-700' },
            { l:'Date',             v:fmt(detail.created_at),            c:'text-gray-700' },
            { l:'Validé par',       v:detail.valide_par_nom||'—',        c:'text-green-700' },
          ].map(s => (
            <div key={s.l} className="card p-3 text-center">
              <p className={`text-lg font-bold ${s.c}`}>{s.v}</p>
              <p className="text-xs text-gray-500">{s.l}</p>
            </div>
          ))}
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Code</th><th>Produit</th><th>Famille</th><th className="text-center">Alerte</th><th className="text-center">Qté système</th><th className="text-center">Qté comptée</th><th className="text-center">Écart</th><th className="text-center">Valeur écart</th></tr></thead>
            <tbody>
              {detail.lignes.map(l => {
                const al = ALERTE_CFG[l.alerte] || ALERTE_CFG.normal;
                return (
                  <tr key={l.id} className={l.ecart!==0&&l.ecart!==null?(l.ecart>0?'bg-blue-50':'bg-red-50'):''}>
                    <td><span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{l.produit_code}</span></td>
                    <td className="font-medium">{l.produit_nom}</td>
                    <td className="text-gray-500">{l.categorie_nom||'—'}</td>
                    <td className="text-center">{al.label ? <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${al.cls}`}>{al.label}</span> : '—'}</td>
                    <td className="text-center font-bold">{l.qte_systeme}</td>
                    <td className="text-center font-bold">{l.qte_comptee??'—'}</td>
                    <td className="text-center">{l.ecart===null?'—':l.ecart===0?<span className="badge badge-green">=0</span>:l.ecart>0?<span className="badge badge-blue">+{l.ecart}</span>:<span className="badge badge-red">{l.ecart}</span>}</td>
                    <td className="text-center text-xs">{l.ecart!==null&&l.ecart!==0?`${l.ecart>0?'+':''}${nf(l.ecart*(l.prix_achat||0))} F`:'—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {modal === 'valider' && createPortal(
          <div className="fixed inset-0 z-50">
            <div className="bg-white rounded-2xl shadow-xl" style={{ position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", width: "calc(100% - 32px)", maxWidth: 640, maxHeight: "calc(100vh - 32px)", overflowY: "auto" }}>
              <div className="text-center">
                <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3"><CheckCheck size={28} className="text-green-600"/></div>
                <h2 className="text-lg font-bold">Valider l'inventaire ?</h2>
                <p className="text-sm text-gray-500 mt-1">{avecEcart.length} produit(s) avec écart seront ajustés. Cette action est irréversible.</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm text-center">
                <div className="bg-blue-50 rounded-lg p-3"><p className="font-bold text-blue-700">+{nf(vSurplus)} F</p><p className="text-blue-600 text-xs">Surplus</p></div>
                <div className="bg-red-50 rounded-lg p-3"><p className="font-bold text-red-700">-{nf(vManquant)} F</p><p className="text-red-600 text-xs">Manquant</p></div>
              </div>
              <div className="flex gap-3"><button className="btn-secondary flex-1" onClick={()=>setModal(null)}>Annuler</button><button className="btn-success flex-1" onClick={handleValider}><CheckCheck size={15}/> Confirmer</button></div>
            </div>
          </div>,
          document.body
        )}
        {modal === 'rejeter' && createPortal(
          <div className="fixed inset-0 z-50">
            <div className="bg-white rounded-2xl shadow-xl" style={{ position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", width: "calc(100% - 32px)", maxWidth: 640, maxHeight: "calc(100vh - 32px)", overflowY: "auto" }}>
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><ThumbsDown size={18} className="text-red-600"/> Rejeter l'inventaire</h2>
              <form onSubmit={handleRejeter} className="space-y-3">
                <div><label className="label">Motif du rejet</label><textarea className="input h-24 resize-none" value={rejetNote} onChange={e=>setRejetNote(e.target.value)} placeholder="Expliquer pourquoi l'inventaire est rejeté..." required/></div>
                <div className="flex gap-3 pt-1"><button type="button" className="btn-secondary flex-1" onClick={()=>setModal(null)}>Annuler</button><button type="submit" className="btn-danger flex-1">Rejeter</button></div>
              </form>
            </div>
          </div>,
          document.body
        )}
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════════════
     VUE INVENTAIRE ACTIF
  ════════════════════════════════════════════════════════════════════ */
  if (view === 'actif' && actif) {
    const sc = STATUT_CFG[actif.statut] || STATUT_CFG.brouillon;
    const pct = statsActif.total ? Math.round(statsActif.comp / statsActif.total * 100) : 0;
    const isEditable = actif.statut === 'brouillon' || (actif.statut === 'soumis' && canValidate);

    return (
      <div className="space-y-4 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="page-title flex items-center gap-2"><ClipboardList size={22} className="text-blue-600"/> Inventaire en cours</h1>
            <p className="text-sm text-gray-500 flex items-center gap-2">
              {actif.reference} · {fmtFull(actif.created_at)}
              <span className={`badge ${sc.cls}`}>{sc.label}</span>
              {statsActif.alertes > 0 && <span className="badge badge-red flex items-center gap-1"><AlertTriangle size={11}/>{statsActif.alertes} alertes</span>}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setView('liste')} className="btn-secondary btn-sm"><Clock size={15}/> Historique</button>
            {actif.statut === 'brouillon' && (
              <button onClick={handleAnnuler} className="btn-secondary btn-sm text-red-600 border-red-200 hover:bg-red-50"><XCircle size={15}/> Annuler</button>
            )}
            {actif.statut === 'brouillon' && (
              <button onClick={handleSynchroniser} className="btn-secondary btn-sm text-blue-600 border-blue-200 hover:bg-blue-50"><RefreshCw size={15}/> Synchroniser</button>
            )}
            <button onClick={() => downloadPDF(actif.id)} className="btn-secondary btn-sm"><Download size={14}/> PDF</button>
            <button onClick={() => downloadExcel(actif.id)} className="btn-secondary btn-sm"><FileSpreadsheet size={14}/> Excel</button>
            {actif.statut === 'brouillon' && !canValidate && (
              <button onClick={() => setModal('soumettre')} disabled={statsActif.comp === 0} className="btn-primary btn-sm disabled:opacity-40"><Send size={15}/> Soumettre</button>
            )}
            {(actif.statut === 'brouillon' && canValidate) && (
              <button onClick={() => setModal('valider')} disabled={statsActif.comp === 0} className="btn-success btn-sm disabled:opacity-40"><CheckCheck size={15}/> Valider</button>
            )}
            {actif.statut === 'soumis' && canValidate && (
              <>
                <button onClick={() => setModal('rejeter')} className="btn-danger btn-sm"><ThumbsDown size={15}/> Rejeter</button>
                <button onClick={() => setModal('valider')} className="btn-success btn-sm"><CheckCheck size={15}/> Valider</button>
              </>
            )}
          </div>
        </div>

        {/* Progression */}
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">{statsActif.comp} / {statsActif.total} produits comptés</span>
            <span className="text-sm font-bold text-blue-600">{pct}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-500" style={{ width:`${pct}%` }}/>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center pt-1">
            <div><p className="text-base font-bold text-orange-600">{statsActif.ecart}</p><p className="text-xs text-gray-500">Avec écart</p></div>
            <div><p className="text-base font-bold text-blue-600">+{nf(statsActif.surplus)} F</p><p className="text-xs text-gray-500">Surplus</p></div>
            <div><p className="text-base font-bold text-red-600">-{nf(statsActif.manquant)} F</p><p className="text-xs text-gray-500">Manquant</p></div>
            <div><p className="text-base font-bold text-purple-600">{statsActif.alertes}</p><p className="text-xs text-gray-500">Alertes</p></div>
          </div>
        </div>

        {/* Barre de filtres + scan */}
        <div className="space-y-2">
          <div className="flex gap-2 flex-wrap items-center">
            <div className="relative flex-1 min-w-48">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
              <input className="input pl-9 text-sm" placeholder="Rechercher code, nom..." value={search} onChange={e=>setSearch(e.target.value)}/>
            </div>
            <select className="input w-auto text-sm" value={catFilter} onChange={e=>setCatFilter(e.target.value)}>
              <option value="">Tous les rayons</option>
              {categories.map(c=><option key={c.id} value={c.nom}>{c.nom}</option>)}
            </select>
            <button onClick={()=>{setScanMode(s=>!s); setScanVal('');}} className={`btn-sm flex items-center gap-1.5 ${scanMode ? 'btn-primary' : 'btn-secondary'}`}>
              <Scan size={15}/> {scanMode ? 'Scan ON' : 'Mode scan'}
            </button>
          </div>
          {/* Mode scan */}
          {scanMode && (
            <div className="flex gap-2 items-center bg-yellow-50 border border-yellow-300 rounded-xl px-4 py-3">
              <Scan size={18} className="text-yellow-600 flex-shrink-0"/>
              <input
                ref={scanInputRef}
                className="flex-1 bg-transparent text-sm font-mono focus:outline-none"
                placeholder="Scanner ou taper le code-barres puis Entrée..."
                value={scanVal}
                onChange={e=>setScanVal(e.target.value)}
                onKeyDown={handleScan}
                autoFocus
              />
              {scanVal && <button className="text-gray-400 hover:text-gray-600" onClick={()=>setScanVal('')}><XCircle size={16}/></button>}
            </div>
          )}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit flex-wrap">
            {[['tous','Tous'],['ecart','Avec écart'],['ok','Sans écart'],['alertes','Alertes']].map(([v,l])=>(
              <button key={v} onClick={()=>setEcartFilter(v)} className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${ecartFilter===v?'bg-white shadow-sm text-blue-700':'text-gray-500 hover:text-gray-700'}`}>{l}</button>
            ))}
          </div>
        </div>

        {/* Table produits */}
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Désignation du produit</th>
                <th className="text-center">Stock système<br/><span className="font-normal text-gray-400 text-xs">(quantité en base)</span></th>
                <th className="text-center bg-blue-50">Quantité comptée physiquement<br/><span className="font-normal text-blue-500 text-xs">✏️ À renseigner ici</span></th>
                <th className="text-center">Écart<br/><span className="font-normal text-gray-400 text-xs">(compté − système)</span></th>
                <th className="text-center">Valeur de l'écart</th>
              </tr>
            </thead>
            <tbody>
              {lignesFiltrees.length === 0
                ? <tr><td colSpan="6" className="text-center py-10 text-gray-400">Aucun produit dans cette sélection</td></tr>
                : lignesFiltrees.map(l => (
                  <LigneProduit
                    key={l.id}
                    ligne={l}
                    disabled={!isEditable}
                    onSave={handleSaveLigne}
                    highlighted={highlighted === l.id}
                    inputRef={el => { if (el) inputRefs.current[l.id] = el; }}
                    rowRef={el => { if (el) rowRefs.current[l.id] = el; }}
                  />
                ))
              }
            </tbody>
          </table>
        </div>

        {/* Modals */}
        {modal === 'soumettre' && createPortal(
          <div className="fixed inset-0 z-50">
            <div className="bg-white rounded-2xl shadow-xl" style={{ position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", width: "calc(100% - 32px)", maxWidth: 640, maxHeight: "calc(100vh - 32px)", overflowY: "auto" }}>
              <div className="text-center">
                <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3"><Send size={28} className="text-blue-600"/></div>
                <h2 className="text-lg font-bold">Soumettre pour validation ?</h2>
                <p className="text-sm text-gray-500 mt-1">{statsActif.comp} produits comptés. L'admin pourra valider ou rejeter cet inventaire.</p>
              </div>
              <div className="flex gap-3"><button className="btn-secondary flex-1" onClick={()=>setModal(null)}>Annuler</button><button className="btn-primary flex-1" onClick={handleSoumettre}><Send size={15}/> Soumettre</button></div>
            </div>
          </div>,
          document.body
        )}
        {modal === 'valider' && createPortal(
          <div className="fixed inset-0 z-50">
            <div className="bg-white rounded-2xl shadow-xl" style={{ position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", width: "calc(100% - 32px)", maxWidth: 640, maxHeight: "calc(100vh - 32px)", overflowY: "auto" }}>
              <div className="text-center">
                <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3"><CheckCheck size={28} className="text-green-600"/></div>
                <h2 className="text-lg font-bold">Valider l'inventaire ?</h2>
                <p className="text-sm text-gray-500 mt-1">{statsActif.ecart} produit(s) avec écart. Stock mis à jour automatiquement.</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center text-sm">
                <div className="bg-blue-50 rounded-lg p-3"><p className="font-bold text-blue-700">+{nf(statsActif.surplus)} F</p><p className="text-blue-600 text-xs">Surplus</p></div>
                <div className="bg-red-50 rounded-lg p-3"><p className="font-bold text-red-700">-{nf(statsActif.manquant)} F</p><p className="text-red-600 text-xs">Manquant</p></div>
              </div>
              <div className="flex gap-3"><button className="btn-secondary flex-1" onClick={()=>setModal(null)}>Annuler</button><button className="btn-success flex-1" onClick={handleValider}><CheckCheck size={15}/> Confirmer</button></div>
            </div>
          </div>,
          document.body
        )}
        {modal === 'rejeter' && createPortal(
          <div className="fixed inset-0 z-50">
            <div className="bg-white rounded-2xl shadow-xl" style={{ position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", width: "calc(100% - 32px)", maxWidth: 640, maxHeight: "calc(100vh - 32px)", overflowY: "auto" }}>
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><ThumbsDown size={18} className="text-red-600"/> Rejeter l'inventaire</h2>
              <form onSubmit={async e => { e.preventDefault(); try { await api.post(`/inventaires/${actif.id}/rejeter`,{note_rejet:rejetNote}); toast.success('Inventaire rejeté'); setModal(null); setActif(null); setView('liste'); reload(); } catch(err) { toast.error(err.response?.data?.message||'Erreur'); }}} className="space-y-3">
                <div><label className="label">Motif du rejet</label><textarea className="input h-20 resize-none" value={rejetNote} onChange={e=>setRejetNote(e.target.value)} required/></div>
                <div className="flex gap-3"><button type="button" className="btn-secondary flex-1" onClick={()=>setModal(null)}>Annuler</button><button type="submit" className="btn-danger flex-1">Rejeter</button></div>
              </form>
            </div>
          </div>,
          document.body
        )}
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════════════
     VUE LISTE
  ════════════════════════════════════════════════════════════════════ */
  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2"><ClipboardList size={22}/> Inventaires</h1>
          <p className="page-sub">Comptage et régularisation du stock physique</p>
        </div>
        <div className="flex gap-2">
          <button onClick={reload} className="btn-secondary"><RefreshCw size={15}/></button>
          <button onClick={()=>setModal('nouveau')} className="btn-primary"><Plus size={16}/> Nouvel inventaire</button>
        </div>
      </div>

      {/* Stats globaux */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { l:'Total inventaires', v:stats.total,      c:'text-gray-800', bg:'bg-gray-50' },
            { l:'En cours',          v:stats.en_cours,   c:'text-blue-700', bg:'bg-blue-50' },
            { l:'À valider',         v:stats.a_valider,  c:'text-yellow-700', bg:'bg-yellow-50' },
            { l:'Validés',           v:stats.valides,    c:'text-green-700', bg:'bg-green-50' },
          ].map(s => (
            <div key={s.l} className={`card p-4 text-center ${s.bg} border-0`}>
              <p className={`text-3xl font-bold ${s.c}`}>{s.v}</p>
              <p className="text-xs text-gray-500 mt-1">{s.l}</p>
            </div>
          ))}
        </div>
      )}

      {/* Dernier inventaire validé */}
      {stats?.dernier && (
        <div className="card p-4 bg-green-50 border border-green-200">
          <p className="text-xs font-semibold text-green-700 mb-2 flex items-center gap-1"><BarChart3 size={13}/> DERNIER INVENTAIRE VALIDÉ</p>
          <div className="flex items-center gap-4 flex-wrap text-sm">
            <span className="font-bold text-green-800">{stats.dernier.reference}</span>
            <span className="text-green-700">{fmt(stats.dernier.valide_at)}</span>
            <span className="text-gray-600">{stats.dernier.total_lignes} produits</span>
            {stats.dernier.avec_ecart > 0 && <span className="text-orange-600 font-medium">{stats.dernier.avec_ecart} écarts</span>}
            {stats.dernier.valeur_surplus > 0 && <span className="text-blue-600">+{nf(stats.dernier.valeur_surplus)} F surplus</span>}
            {stats.dernier.valeur_manquant > 0 && <span className="text-red-600">-{nf(stats.dernier.valeur_manquant)} F manquant</span>}
          </div>
        </div>
      )}

      {/* Liste */}
      {inventaires.length === 0 ? (
        <div className="card text-center py-16">
          <ClipboardList size={40} className="text-gray-300 mx-auto mb-3"/>
          <p className="text-gray-500 font-medium">Aucun inventaire effectué</p>
          <button onClick={()=>setModal('nouveau')} className="btn-primary btn-sm mt-4 mx-auto"><Plus size={15}/> Commencer</button>
        </div>
      ) : (
        <div className="space-y-2">
          {inventaires.map(inv => {
            const sc = STATUT_CFG[inv.statut] || STATUT_CFG.brouillon;
            const pct = inv.total_lignes ? Math.round(inv.lignes_comptees/inv.total_lignes*100) : 0;
            const isActive = ['brouillon','soumis'].includes(inv.statut);
            return (
              <div key={inv.id}
                onClick={() => isActive ? (setActif(null), reload()) : openDetail(inv)}
                className={`card p-4 cursor-pointer hover:border-blue-300 transition-all flex items-center gap-4 ${inv.statut==='soumis'?'border-2 border-yellow-400 bg-yellow-50':isActive?'border-2 border-blue-400 bg-blue-50':''}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isActive?'bg-blue-100':inv.statut==='valide'?'bg-green-100':inv.statut==='rejete'?'bg-red-100':'bg-gray-100'}`}>
                  <ClipboardList size={20} className={isActive?'text-blue-600':inv.statut==='valide'?'text-green-600':inv.statut==='rejete'?'text-red-500':'text-gray-400'}/>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900">{inv.reference}</p>
                    <span className={`badge ${sc.cls}`}>{sc.label}</span>
                    {inv.lignes_ecart > 0 && <span className="badge badge-yellow">{inv.lignes_ecart} écart(s)</span>}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{fmtFull(inv.created_at)} · {inv.user_nom||'—'}</p>
                  {isActive && <div className="mt-2"><div className="w-full bg-gray-200 rounded-full h-1.5"><div className="bg-blue-500 h-1.5 rounded-full" style={{width:`${pct}%`}}/></div><p className="text-xs text-gray-500 mt-0.5">{inv.lignes_comptees}/{inv.total_lignes} comptés ({pct}%)</p></div>}
                </div>
                <div className="flex-shrink-0">
                  {isActive ? <span className="text-blue-600 text-sm font-medium flex items-center gap-1">Reprendre <ChevronRight size={15}/></span>
                    : <Eye size={18} className="text-gray-400"/>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal nouveau */}
      {modal === 'nouveau' && createPortal(
        <div className="fixed inset-0 z-50">
          <div className="bg-white rounded-2xl shadow-xl" style={{ position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", width: "calc(100% - 32px)", maxWidth: 640, maxHeight: "calc(100vh - 32px)", overflowY: "auto" }}>
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-lg font-semibold flex items-center gap-2"><ClipboardList size={20}/> Nouvel inventaire</h2>
              <button onClick={()=>setModal(null)} className="text-gray-400 text-2xl">&times;</button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="label">Périmètre</label>
                <select className="input" value={newForm.categorie_id} onChange={e=>setNewForm(f=>({...f,categorie_id:e.target.value}))}>
                  <option value="">Tous les produits actifs</option>
                  {categories.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Note (optionnel)</label>
                <input className="input" placeholder="Ex: Inventaire mensuel..." value={newForm.note} onChange={e=>setNewForm(f=>({...f,note:e.target.value}))}/>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
                <AlertCircle size={15} className="text-amber-600 flex-shrink-0 mt-0.5"/>
                <p className="text-xs text-amber-700">Les quantités système sont figées à l'instant de la création.</p>
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" className="btn-secondary" onClick={()=>setModal(null)}>Annuler</button>
                <button type="submit" className="btn-primary"><Plus size={15}/> Démarrer</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}





