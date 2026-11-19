import React, { useState, useEffect, useRef } from 'react';
import { CalendarClock, Plus, Search, Package, Users, TrendingUp, AlertCircle, X, Save, Trash2, Edit, CheckCircle } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

const CATEGORIES = ['Vaisselle', 'Couverts', 'Mobilier', 'Décoration', 'Bâches & Nappes', 'Matériel sono', 'Autre'];
const UNITES = ['pièce', 'lot', 'set', 'carton', 'mètre'];

const STATUTS = {
  reserve:  { label: 'Réservé',  color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  en_cours: { label: 'En cours', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  retourne: { label: 'Retourné', color: 'bg-green-100 text-green-700 border-green-200' },
  annule:   { label: 'Annulé',   color: 'bg-gray-100 text-gray-500 border-gray-200' },
};

const fmt = n => Number(n || 0).toLocaleString('fr-FR');
const fmtDate = d => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const emptyArticle = { nom: '', categorie: 'Vaisselle', description: '', stock_total: 0, prix_location: 0, unite: 'pièce' };
const emptyContrat = { client_nom: '', client_telephone: '', event_nom: '', event_lieu: '', date_debut: '', date_fin: '', acompte: 0, notes: '', lignes: [] };

function useDraggable() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const d = useRef({ on: false, sx: 0, sy: 0, px: 0, py: 0 });
  const onMouseDown = e => {
    if (e.target.closest('button,input,select,textarea,a')) return;
    d.current = { on: true, sx: e.clientX, sy: e.clientY, px: pos.x, py: pos.y };
    e.preventDefault();
  };
  useEffect(() => {
    const move = e => { if (!d.current.on) return; setPos({ x: d.current.px + e.clientX - d.current.sx, y: d.current.py + e.clientY - d.current.sy }); };
    const up   = () => { d.current.on = false; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, []);
  return { pos, onMouseDown, reset: () => setPos({ x: 0, y: 0 }) };
}

export default function Location() {
  const [tab, setTab] = useState('contrats');
  const [stats, setStats] = useState({ actifs: 0, retours_dus: 0, total: 0, ca_mois: 0 });
  const [contrats, setContrats] = useState([]);
  const [articles, setArticles] = useState([]);
  const [filtreStatut, setFiltreStatut] = useState('');
  const [filtreQ, setFiltreQ] = useState('');
  const [modal, setModal] = useState(null);
  const dragContrat = useDraggable();
  const dragArticle = useDraggable();
  const dragRetour  = useDraggable();
  const dragDetail  = useDraggable();
  const [contratForm, setContratForm] = useState(emptyContrat);
  const [articleForm, setArticleForm] = useState(emptyArticle);
  const [articleEdit, setArticleEdit] = useState(null);
  const [contratSelect, setContratSelect] = useState(null);
  const [retourLignes, setRetourLignes] = useState([]);
  const [saving, setSaving] = useState(false);
  const [searchArticle, setSearchArticle] = useState('');

  function reload() {
    api.get('/location/stats').then(r => setStats(r.data)).catch(() => {});
    api.get('/location/articles').then(r => setArticles(r.data)).catch(() => {});
  }
  function reloadContrats() {
    const params = {};
    if (filtreStatut) params.statut = filtreStatut;
    if (filtreQ) params.q = filtreQ;
    api.get('/location/contrats', { params }).then(r => setContrats(r.data)).catch(() => {});
  }

  useEffect(() => { reload(); }, []);
  useEffect(() => { reloadContrats(); }, [filtreStatut, filtreQ]);

  async function handleSaveArticle(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (articleEdit) {
        await api.put(`/location/articles/${articleEdit}`, articleForm);
        toast.success('Article mis à jour');
      } else {
        await api.post('/location/articles', articleForm);
        toast.success('Article créé');
      }
      reload();
      setModal(null);
    } catch (err) { toast.error(err.response?.data?.message || 'Erreur'); }
    finally { setSaving(false); }
  }

  async function handleDeleteArticle(id) {
    if (!confirm('Archiver cet article ?')) return;
    try { await api.delete(`/location/articles/${id}`); reload(); toast.success('Article archivé'); }
    catch (err) { toast.error(err.response?.data?.message || 'Erreur'); }
  }

  function addArticleToContrat(article) {
    const existing = contratForm.lignes.find(l => l.article_id === article.id);
    if (existing) {
      setContratForm(f => ({ ...f, lignes: f.lignes.map(l => l.article_id === article.id ? { ...l, quantite: l.quantite + 1 } : l) }));
    } else {
      setContratForm(f => ({ ...f, lignes: [...f.lignes, { article_id: article.id, article_nom: article.nom, quantite: 1, prix_unitaire: article.prix_location }] }));
    }
  }

  function removeFromContrat(idx) {
    setContratForm(f => ({ ...f, lignes: f.lignes.filter((_, i) => i !== idx) }));
  }

  const totalContrat = contratForm.lignes.reduce((s, l) => s + (Number(l.prix_unitaire) * Number(l.quantite)), 0);

  async function handleSaveContrat(e) {
    e.preventDefault();
    if (contratForm.lignes.length === 0) return toast.error('Ajoutez au moins un article');
    setSaving(true);
    try {
      await api.post('/location/contrats', contratForm);
      toast.success('Contrat créé');
      reload(); reloadContrats();
      setModal(null);
      setContratForm(emptyContrat);
    } catch (err) { toast.error(err.response?.data?.message || 'Erreur'); }
    finally { setSaving(false); }
  }

  async function openRetour(contrat) {
    try {
      const r = await api.get(`/location/contrats/${contrat.id}`);
      setContratSelect(r.data);
      setRetourLignes(r.data.lignes.map(l => ({ ligne_id: l.id, article_nom: l.article_nom, quantite: l.quantite, quantite_rendue: l.quantite_rendue || l.quantite, quantite_manquante: l.quantite_manquante || 0 })));
      setModal('retour');
    } catch { toast.error('Erreur chargement contrat'); }
  }

  async function openDetail(contrat) {
    try {
      const r = await api.get(`/location/contrats/${contrat.id}`);
      setContratSelect(r.data);
      setModal('detail');
    } catch { toast.error('Erreur chargement contrat'); }
  }

  async function handleRetour(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/location/contrats/${contratSelect.id}/retour`, { retours: retourLignes });
      toast.success('Retour enregistré');
      reload(); reloadContrats();
      setModal(null);
    } catch (err) { toast.error(err.response?.data?.message || 'Erreur'); }
    finally { setSaving(false); }
  }

  async function changerStatut(id, statut) {
    try {
      const c = contrats.find(x => x.id === id);
      await api.put(`/location/contrats/${id}`, { ...c, statut });
      toast.success('Statut mis à jour');
      reloadContrats(); reload();
    } catch { toast.error('Erreur'); }
  }

  const articlesFiltered = articles.filter(a => !searchArticle || a.nom.toLowerCase().includes(searchArticle.toLowerCase()) || a.categorie.toLowerCase().includes(searchArticle.toLowerCase()));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
          <CalendarClock size={22} className="text-purple-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Location Événementielle</h1>
          <p className="text-sm text-gray-500">Gérez la location de votre matériel pour vos événements</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Contrats actifs',    value: stats.actifs,                      icon: CalendarClock, color: 'text-blue-600',   bg: 'bg-blue-50' },
          { label: 'Retours en attente', value: stats.retours_dus,                 icon: AlertCircle,   color: 'text-orange-600', bg: 'bg-orange-50' },
          { label: 'Total contrats',     value: stats.total,                       icon: Users,         color: 'text-gray-600',   bg: 'bg-gray-100' },
          { label: 'CA ce mois (FCFA)',  value: fmt(stats.ca_mois),                icon: TrendingUp,    color: 'text-green-600',  bg: 'bg-green-50' },
        ].map(s => (
          <div key={s.label} className="card flex items-center gap-3 py-3">
            <div className={`w-10 h-10 ${s.bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
              <s.icon size={20} className={s.color} />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">{s.label}</p>
              <p className="font-bold text-gray-900 text-lg leading-tight">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <button onClick={() => setTab('contrats')} className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'contrats' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          <CalendarClock size={16} /> Contrats / Réservations
        </button>
        <button onClick={() => setTab('articles')} className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'articles' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          <Package size={16} /> Articles du catalogue
        </button>
      </div>

      {/* ── TAB CONTRATS ── */}
      {tab === 'contrats' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <div className="flex gap-1 flex-wrap">
              {[['', 'Tous'], ['reserve', 'Réservés'], ['en_cours', 'En cours'], ['retourne', 'Retournés'], ['annule', 'Annulés']].map(([v, l]) => (
                <button key={v} onClick={() => setFiltreStatut(v)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filtreStatut === v ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {l}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input className="input pl-8 py-1.5 text-sm" placeholder="Rechercher..." value={filtreQ} onChange={e => setFiltreQ(e.target.value)} style={{ minWidth: 180 }} />
              </div>
              <button onClick={() => { setContratForm(emptyContrat); setModal('contrat'); }} className="btn-primary btn-sm flex items-center gap-2 whitespace-nowrap">
                <Plus size={15} /> Nouveau contrat
              </button>
            </div>
          </div>

          {contrats.length === 0 ? (
            <div className="card text-center py-12 text-gray-400">
              <CalendarClock size={40} className="mx-auto mb-3 text-gray-300" />
              <p className="font-medium">Aucun contrat trouvé</p>
              <p className="text-sm mt-1">Créez votre premier contrat de location</p>
            </div>
          ) : (
            <div className="space-y-2">
              {contrats.map(c => (
                <div key={c.id} className="card flex flex-col sm:flex-row sm:items-center gap-3 hover:shadow-md transition-shadow cursor-pointer" onClick={() => openDetail(c)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-gray-400 font-semibold">{c.numero}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUTS[c.statut]?.color}`}>{STATUTS[c.statut]?.label}</span>
                      {c.statut !== 'retourne' && c.statut !== 'annule' && new Date(c.date_fin) < new Date() && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-200 font-semibold">En retard</span>
                      )}
                    </div>
                    <p className="font-semibold text-gray-900 mt-0.5">{c.client_nom} {c.client_telephone && <span className="text-gray-400 font-normal text-sm">· {c.client_telephone}</span>}</p>
                    {c.event_nom && <p className="text-sm text-gray-500">📍 {c.event_nom}{c.event_lieu ? ` — ${c.event_lieu}` : ''}</p>}
                    <p className="text-xs text-gray-400 mt-0.5">{fmtDate(c.date_debut)} → {fmtDate(c.date_fin)} · {c.nb_articles} article{c.nb_articles > 1 ? 's' : ''}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <p className="font-bold text-gray-900">{fmt(c.montant_total)} <span className="text-xs font-normal text-gray-400">FCFA</span></p>
                    {c.acompte > 0 && <p className="text-xs text-green-600">Acompte : {fmt(c.acompte)} FCFA</p>}
                    <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                      {c.statut === 'reserve' && (
                        <button onClick={() => changerStatut(c.id, 'en_cours')} className="text-xs px-2 py-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 font-medium transition-colors">
                          Démarrer
                        </button>
                      )}
                      {(c.statut === 'reserve' || c.statut === 'en_cours') && (
                        <button onClick={() => openRetour(c)} className="text-xs px-2 py-1 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 font-medium transition-colors">
                          Retour
                        </button>
                      )}
                      {c.statut !== 'annule' && c.statut !== 'retourne' && (
                        <button onClick={() => changerStatut(c.id, 'annule')} className="text-xs px-2 py-1 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 font-medium transition-colors">
                          Annuler
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB ARTICLES ── */}
      {tab === 'articles' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => { setArticleForm(emptyArticle); setArticleEdit(null); setModal('article'); }} className="btn-primary btn-sm flex items-center gap-2">
              <Plus size={15} /> Nouvel article
            </button>
          </div>
          {articles.length === 0 ? (
            <div className="card text-center py-12 text-gray-400">
              <Package size={40} className="mx-auto mb-3 text-gray-300" />
              <p className="font-medium">Catalogue vide</p>
              <p className="text-sm mt-1">Ajoutez vos articles de location (chaises, assiettes, bâches...)</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {articles.map(a => {
                const dispo = Math.max(0, (a.stock_total || 0) - (a.stock_en_location || 0));
                return (
                  <div key={a.id} className="card space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-gray-900 text-sm leading-tight">{a.nom}</p>
                        <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full font-medium">{a.categorie}</span>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => { setArticleForm({ nom: a.nom, categorie: a.categorie, description: a.description || '', stock_total: a.stock_total, prix_location: a.prix_location, unite: a.unite }); setArticleEdit(a.id); setModal('article'); }}
                          className="text-blue-600 hover:bg-blue-50 p-1.5 rounded"><Edit size={13} /></button>
                        <button onClick={() => handleDeleteArticle(a.id)} className="text-red-500 hover:bg-red-50 p-1.5 rounded"><Trash2 size={13} /></button>
                      </div>
                    </div>
                    {a.description && <p className="text-xs text-gray-400">{a.description}</p>}
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-gray-100">
                      <div className="text-xs space-y-0.5">
                        <p className="text-gray-500">Stock total : <span className="font-semibold text-gray-800">{a.stock_total} {a.unite}</span></p>
                        <p className="text-gray-500">Disponible : <span className={`font-semibold ${dispo === 0 ? 'text-red-600' : 'text-green-600'}`}>{dispo} {a.unite}</span></p>
                        {a.stock_en_location > 0 && <p className="text-blue-500 font-medium">En location : {a.stock_en_location}</p>}
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-gray-900 text-base">{fmt(a.prix_location)}</p>
                        <p className="text-xs text-gray-400">FCFA / event</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── MODAL NOUVEAU CONTRAT ── */}
      {modal === 'contrat' && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto">
          <div style={{ transform: `translate(${dragContrat.pos.x}px,${dragContrat.pos.y}px)` }} className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-4">
            <div onMouseDown={dragContrat.onMouseDown} style={{ cursor: 'grab' }} className="flex items-center justify-between p-5 border-b select-none">
              <h2 className="text-lg font-bold text-gray-900">Nouveau contrat de location</h2>
              <button onClick={() => { setModal(null); dragContrat.reset(); }} className="text-gray-400 hover:text-gray-600 p-1"><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveContrat} className="p-5 space-y-5">
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Client</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 sm:col-span-1">
                    <label className="label">Nom du client *</label>
                    <input className="input" required value={contratForm.client_nom} onChange={e => setContratForm(f => ({ ...f, client_nom: e.target.value }))} placeholder="Ex: Koné Aminata" />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="label">Téléphone</label>
                    <input className="input" value={contratForm.client_telephone} onChange={e => setContratForm(f => ({ ...f, client_telephone: e.target.value }))} placeholder="+225 07 00 00 00 00" />
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Événement</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 sm:col-span-1">
                    <label className="label">Nom de l'événement</label>
                    <input className="input" value={contratForm.event_nom} onChange={e => setContratForm(f => ({ ...f, event_nom: e.target.value }))} placeholder="Ex: Mariage, Baptême..." />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="label">Lieu</label>
                    <input className="input" value={contratForm.event_lieu} onChange={e => setContratForm(f => ({ ...f, event_lieu: e.target.value }))} placeholder="Ex: Cocody, Abidjan" />
                  </div>
                  <div>
                    <label className="label">Date de sortie *</label>
                    <input type="date" className="input" required value={contratForm.date_debut} onChange={e => setContratForm(f => ({ ...f, date_debut: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Date de retour prévu *</label>
                    <input type="date" className="input" required value={contratForm.date_fin} onChange={e => setContratForm(f => ({ ...f, date_fin: e.target.value }))} />
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Articles à louer</p>
                <div className="relative mb-2">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input className="input pl-8 text-sm" placeholder="Rechercher un article..." value={searchArticle} onChange={e => setSearchArticle(e.target.value)} />
                </div>
                <div className="max-h-36 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100">
                  {articlesFiltered.length === 0 && <p className="text-sm text-gray-400 p-3 text-center">Aucun article dans le catalogue</p>}
                  {articlesFiltered.map(a => {
                    const dispo = Math.max(0, (a.stock_total || 0) - (a.stock_en_location || 0));
                    return (
                      <button key={a.id} type="button" onClick={() => addArticleToContrat(a)}
                        className="w-full text-left px-3 py-2 flex items-center justify-between hover:bg-purple-50 transition-colors">
                        <div>
                          <span className="font-medium text-sm text-gray-800">{a.nom}</span>
                          <span className="text-xs text-gray-400 ml-2">{a.categorie}</span>
                        </div>
                        <div className="text-right flex-shrink-0 ml-4">
                          <span className="text-sm font-bold text-purple-600">{fmt(a.prix_location)} FCFA</span>
                          <span className={`text-xs ml-2 ${dispo === 0 ? 'text-red-500' : 'text-gray-400'}`}>dispo: {dispo}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {contratForm.lignes.length > 0 && (
                  <div className="mt-3 border border-purple-200 rounded-xl overflow-hidden">
                    <div className="bg-purple-50 px-3 py-1.5 text-xs font-bold text-purple-700 uppercase tracking-wide">Articles sélectionnés</div>
                    {contratForm.lignes.map((l, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2 border-t border-purple-100">
                        <span className="flex-1 text-sm font-medium text-gray-800">{l.article_nom}</span>
                        <input type="number" min={1} className="w-16 text-center border border-gray-200 rounded-lg px-2 py-1 text-sm font-semibold"
                          value={l.quantite} onChange={e => setContratForm(f => ({ ...f, lignes: f.lignes.map((x, j) => j === i ? { ...x, quantite: Math.max(1, parseInt(e.target.value) || 1) } : x) }))} />
                        <input type="number" min={0} className="w-24 text-right border border-gray-200 rounded-lg px-2 py-1 text-sm"
                          value={l.prix_unitaire} onChange={e => setContratForm(f => ({ ...f, lignes: f.lignes.map((x, j) => j === i ? { ...x, prix_unitaire: parseFloat(e.target.value) || 0 } : x) }))} />
                        <span className="text-xs text-gray-400 w-8">FCFA</span>
                        <button type="button" onClick={() => removeFromContrat(i)} className="text-red-400 hover:text-red-600 p-1"><X size={14} /></button>
                      </div>
                    ))}
                    <div className="px-3 py-2 bg-gray-50 border-t border-purple-100 flex justify-end">
                      <span className="font-bold text-gray-900">Total : {fmt(totalContrat)} FCFA</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Acompte versé (FCFA)</label>
                  <input type="number" min={0} className="input" value={contratForm.acompte} onChange={e => setContratForm(f => ({ ...f, acompte: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label className="label">Reste à payer</label>
                  <div className="input bg-gray-50 font-semibold text-gray-700">{fmt(Math.max(0, totalContrat - contratForm.acompte))} FCFA</div>
                </div>
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea className="input resize-none" rows={2} value={contratForm.notes} onChange={e => setContratForm(f => ({ ...f, notes: e.target.value }))} placeholder="Remarques, conditions particulières..." />
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t">
                <button type="button" className="btn-secondary" onClick={() => setModal(null)}>Annuler</button>
                <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
                  <Save size={16} /> {saving ? 'Enregistrement…' : 'Créer le contrat'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL ARTICLE ── */}
      {modal === 'article' && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div style={{ transform: `translate(${dragArticle.pos.x}px,${dragArticle.pos.y}px)` }} className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div onMouseDown={dragArticle.onMouseDown} style={{ cursor: 'grab' }} className="flex items-center justify-between p-5 border-b select-none">
              <h2 className="text-lg font-bold">{articleEdit ? "Modifier l'article" : 'Nouvel article'}</h2>
              <button onClick={() => { setModal(null); dragArticle.reset(); }} className="text-gray-400 hover:text-gray-600 p-1"><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveArticle} className="p-5 space-y-3">
              <div>
                <label className="label">Nom de l'article *</label>
                <input className="input" required value={articleForm.nom} onChange={e => setArticleForm(f => ({ ...f, nom: e.target.value }))} placeholder="Ex: Chaise Napoléon, Assiette plate..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Catégorie</label>
                  <select className="input" value={articleForm.categorie} onChange={e => setArticleForm(f => ({ ...f, categorie: e.target.value }))}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Unité</label>
                  <select className="input" value={articleForm.unite} onChange={e => setArticleForm(f => ({ ...f, unite: e.target.value }))}>
                    {UNITES.map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Stock total</label>
                  <input type="number" min={0} className="input" value={articleForm.stock_total} onChange={e => setArticleForm(f => ({ ...f, stock_total: parseInt(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label className="label">Prix location (FCFA)</label>
                  <input type="number" min={0} className="input" value={articleForm.prix_location} onChange={e => setArticleForm(f => ({ ...f, prix_location: parseFloat(e.target.value) || 0 }))} />
                </div>
              </div>
              <div>
                <label className="label">Description</label>
                <input className="input" value={articleForm.description} onChange={e => setArticleForm(f => ({ ...f, description: e.target.value }))} placeholder="Optionnel" />
              </div>
              <div className="flex justify-end gap-3 pt-2 border-t">
                <button type="button" className="btn-secondary" onClick={() => setModal(null)}>Annuler</button>
                <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
                  <Save size={16} /> {saving ? '…' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL RETOUR ── */}
      {modal === 'retour' && contratSelect && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div style={{ transform: `translate(${dragRetour.pos.x}px,${dragRetour.pos.y}px)` }} className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div onMouseDown={dragRetour.onMouseDown} style={{ cursor: 'grab' }} className="flex items-center justify-between p-5 border-b select-none">
              <div>
                <h2 className="text-lg font-bold">Enregistrer le retour</h2>
                <p className="text-sm text-gray-500">{contratSelect.client_nom} · {contratSelect.numero}</p>
              </div>
              <button onClick={() => { setModal(null); dragRetour.reset(); }} className="text-gray-400 hover:text-gray-600 p-1"><X size={20} /></button>
            </div>
            <form onSubmit={handleRetour} className="p-5 space-y-4">
              <div className="space-y-3">
                {retourLignes.map((l, i) => (
                  <div key={l.ligne_id} className="border border-gray-200 rounded-xl p-3 space-y-2">
                    <p className="font-semibold text-gray-800 text-sm">{l.article_nom} <span className="text-gray-400 font-normal">(sorti : {l.quantite})</span></p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-500 font-medium block mb-1">Quantité rendue</label>
                        <input type="number" min={0} max={l.quantite} className="input text-sm py-1.5"
                          value={l.quantite_rendue}
                          onChange={e => setRetourLignes(ls => ls.map((x, j) => j === i ? { ...x, quantite_rendue: Math.min(l.quantite, parseInt(e.target.value) || 0) } : x))} />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 font-medium block mb-1">Manquant / Cassé</label>
                        <input type="number" min={0} max={l.quantite} className="input text-sm py-1.5"
                          value={l.quantite_manquante}
                          onChange={e => setRetourLignes(ls => ls.map((x, j) => j === i ? { ...x, quantite_manquante: parseInt(e.target.value) || 0 } : x))} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-3 pt-2 border-t">
                <button type="button" className="btn-secondary" onClick={() => setModal(null)}>Annuler</button>
                <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
                  <CheckCircle size={16} /> {saving ? '…' : 'Confirmer le retour'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL DETAIL ── */}
      {modal === 'detail' && contratSelect && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div style={{ transform: `translate(${dragDetail.pos.x}px,${dragDetail.pos.y}px)` }} className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div onMouseDown={dragDetail.onMouseDown} style={{ cursor: 'grab' }} className="flex items-center justify-between p-5 border-b sticky top-0 bg-white z-10 select-none">
              <div>
                <h2 className="text-lg font-bold">Contrat {contratSelect.numero}</h2>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUTS[contratSelect.statut]?.color}`}>{STATUTS[contratSelect.statut]?.label}</span>
              </div>
              <button onClick={() => { setModal(null); dragDetail.reset(); }} className="text-gray-400 hover:text-gray-600 p-1"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-400 font-medium">Client</p>
                  <p className="font-semibold text-gray-900">{contratSelect.client_nom}</p>
                  {contratSelect.client_telephone && <p className="text-gray-500">{contratSelect.client_telephone}</p>}
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium">Événement</p>
                  <p className="font-semibold text-gray-900">{contratSelect.event_nom || '—'}</p>
                  <p className="text-gray-500">{contratSelect.event_lieu || ''}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium">Sortie</p>
                  <p className="font-semibold">{fmtDate(contratSelect.date_debut)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium">Retour prévu</p>
                  <p className="font-semibold">{fmtDate(contratSelect.date_fin)}</p>
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Articles</p>
                <div className="space-y-2">
                  {(contratSelect.lignes || []).map(l => (
                    <div key={l.id} className="flex items-center justify-between gap-3 text-sm border border-gray-100 rounded-xl px-3 py-2">
                      <div>
                        <p className="font-medium text-gray-800">{l.article_nom}</p>
                        <p className="text-xs text-gray-400">{l.categorie}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-semibold">× {l.quantite}</p>
                        <p className="text-xs text-gray-400">{fmt(l.prix_unitaire)} FCFA/u</p>
                        {l.quantite_rendue > 0 && <p className="text-xs text-green-600">Rendu: {l.quantite_rendue}</p>}
                        {l.quantite_manquante > 0 && <p className="text-xs text-red-500">Manquant: {l.quantite_manquante}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t pt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-400 font-medium">Montant total</p>
                  <p className="font-bold text-lg text-gray-900">{fmt(contratSelect.montant_total)} FCFA</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium">Acompte versé</p>
                  <p className="font-bold text-green-600">{fmt(contratSelect.acompte)} FCFA</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-gray-400 font-medium">Reste à payer</p>
                  <p className="font-bold text-orange-600 text-base">{fmt(Math.max(0, contratSelect.montant_total - contratSelect.acompte))} FCFA</p>
                </div>
              </div>

              {contratSelect.notes && <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-600">{contratSelect.notes}</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
