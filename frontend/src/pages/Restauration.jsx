import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { UtensilsCrossed, Plus, Minus, X, Save, Trash2, Edit, ChefHat, Receipt, LayoutGrid, BookOpen, TrendingUp, Clock, Banknote } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const CATEGORIES = ['Entrées', 'Plats', 'Grillades', 'Accompagnements', 'Desserts', 'Boissons', 'Autre'];
const TYPES = { sur_place: 'Sur place', emporter: 'À emporter', livraison: 'Livraison' };
const STATUTS = {
  en_attente:     { label: 'En attente',     color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  en_preparation: { label: 'En préparation', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  pret:           { label: 'Prêt',           color: 'bg-green-100 text-green-700 border-green-200' },
  servi:          { label: 'Servi',          color: 'bg-purple-100 text-purple-700 border-purple-200' },
  paye:           { label: 'Payé',           color: 'bg-gray-100 text-gray-600 border-gray-200' },
  annule:         { label: 'Annulé',         color: 'bg-red-100 text-red-600 border-red-200' },
};
const SUIVANT = { en_attente: ['en_preparation', 'Lancer'], en_preparation: ['pret', 'Prêt'], pret: ['servi', 'Servi'] };

const fmt = n => Number(n || 0).toLocaleString('fr-FR');
const heure = d => d ? new Date(d.replace(' ', 'T') + 'Z').toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';

function Modal({ titre, onClose, children, large }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3" onClick={onClose}>
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${large ? 'max-w-4xl' : 'max-w-md'} max-h-[92vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b sticky top-0 bg-white z-10">
          <h3 className="font-bold text-gray-900">{titre}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

const Badge = ({ s }) => <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${STATUTS[s]?.color}`}>{STATUTS[s]?.label}</span>;

export default function Restauration() {
  const { hasRole } = useAuth();
  const gestion = hasRole('admin', 'gestionnaire');
  const [tab, setTab] = useState('commandes');
  const [stats, setStats] = useState({});
  const [plats, setPlats] = useState([]);
  const [tables, setTables] = useState([]);
  const [commandes, setCommandes] = useState([]);
  const [cuisine, setCuisine] = useState([]);
  const [filtre, setFiltre] = useState('ouvertes');
  const [modal, setModal] = useState(null);
  const [erreurModule, setErreurModule] = useState(false);

  const charger = useCallback(() => {
    const params = filtre === 'ouvertes' ? { ouvertes: 1 } : filtre ? { statut: filtre } : {};
    api.get('/restauration/commandes', { params }).then(r => setCommandes(r.data)).catch(e => { if (e.response?.status === 403) setErreurModule(true); });
    api.get('/restauration/commandes', { params: { ouvertes: 1 } }).then(r => setCuisine(r.data.filter(c => c.statut === 'en_attente' || c.statut === 'en_preparation'))).catch(() => {});
    api.get('/restauration/plats').then(r => setPlats(r.data)).catch(() => {});
    api.get('/restauration/tables').then(r => setTables(r.data)).catch(() => {});
    if (gestion) api.get('/restauration/stats').then(r => setStats(r.data)).catch(() => {});
  }, [filtre, gestion]);

  useEffect(() => { charger(); const t = setInterval(charger, 15000); return () => clearInterval(t); }, [charger]);

  async function statut(id, s) {
    try { await api.put(`/restauration/commandes/${id}/statut`, { statut: s }); charger(); }
    catch (e) { toast.error(e.response?.data?.message || 'Erreur'); }
  }

  if (erreurModule) {
    return <div className="card text-center py-12 text-gray-500">Le module Restauration n'est pas activé pour cette boutique.</div>;
  }

  const tabs = [['commandes', 'Commandes', Receipt], ['cuisine', 'Cuisine', ChefHat], ['salle', 'Salle', LayoutGrid]];
  if (gestion) tabs.push(['carte', 'Carte', BookOpen]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center"><UtensilsCrossed size={22} className="text-orange-600" /></div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Restauration</h1>
            <p className="text-sm text-gray-500">Carte, salle, cuisine et encaissement</p>
          </div>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => setModal({ type: 'commande' })}><Plus size={16} /> Nouvelle commande</button>
      </div>

      {gestion && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            ['Commandes du jour', stats.commandes_jour || 0, Receipt, 'text-blue-600', 'bg-blue-50'],
            ['CA du jour (FCFA)', fmt(stats.ca_jour), Banknote, 'text-green-600', 'bg-green-50'],
            ['En cuisine', stats.en_cuisine || 0, ChefHat, 'text-orange-600', 'bg-orange-50'],
            ['CA du mois (FCFA)', fmt(stats.ca_mois), TrendingUp, 'text-purple-600', 'bg-purple-50'],
          ].map(([l, v, Ic, c, bg]) => (
            <div key={l} className="card flex items-center gap-3 py-3">
              <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center flex-shrink-0`}><Ic size={20} className={c} /></div>
              <div><p className="text-xs text-gray-500 font-medium">{l}</p><p className="font-bold text-gray-900 text-lg leading-tight">{v}</p></div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {tabs.map(([k, l, Ic]) => (
          <button key={k} onClick={() => setTab(k)} className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap ${tab === k ? 'border-orange-600 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            <Ic size={16} /> {l}{k === 'cuisine' && cuisine.length > 0 && <span className="bg-orange-500 text-white text-[10px] rounded-full px-1.5">{cuisine.length}</span>}
          </button>
        ))}
      </div>

      {tab === 'commandes' && (
        <div className="space-y-3">
          <div className="flex gap-1 flex-wrap">
            {[['ouvertes', 'En cours'], ['paye', 'Payées'], ['annule', 'Annulées'], ['', 'Toutes']].map(([v, l]) => (
              <button key={v} onClick={() => setFiltre(v)} className={`px-3 py-1 rounded-full text-xs font-medium ${filtre === v ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{l}</button>
            ))}
          </div>
          {commandes.length === 0 ? (
            <div className="card text-center py-12 text-gray-400"><Receipt size={40} className="mx-auto mb-3 text-gray-300" /><p className="font-medium">Aucune commande</p></div>
          ) : (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
              {commandes.map(c => (
                <div key={c.id} className="card space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-gray-900">{c.type === 'sur_place' ? (c.table_nom || 'Table') : TYPES[c.type]}</p>
                      <p className="text-xs text-gray-500">{c.numero} · {heure(c.created_at)}{c.client_nom ? ` · ${c.client_nom}` : ''}</p>
                    </div>
                    <Badge s={c.statut} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">{TYPES[c.type]} · {c.nb_lignes} ligne(s)</span>
                    <span className="font-bold text-gray-900">{fmt(c.total)} FCFA</span>
                  </div>
                  <div className="flex gap-2 flex-wrap pt-1">
                    <button className="btn-secondary btn-sm" onClick={() => setModal({ type: 'detail', id: c.id })}>Détail</button>
                    {SUIVANT[c.statut] && <button className="btn-primary btn-sm" onClick={() => statut(c.id, SUIVANT[c.statut][0])}>{SUIVANT[c.statut][1]}</button>}
                    {['en_attente', 'en_preparation', 'pret', 'servi'].includes(c.statut) && (
                      <button className="btn-primary btn-sm" style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)' }} onClick={() => setModal({ type: 'encaisser', id: c.id })}>Encaisser</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'cuisine' && (
        cuisine.length === 0 ? (
          <div className="card text-center py-12 text-gray-400"><ChefHat size={40} className="mx-auto mb-3 text-gray-300" /><p className="font-medium">Rien à préparer</p></div>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {[...cuisine].reverse().map(c => (
              <div key={c.id} className={`card border-2 ${c.statut === 'en_attente' ? 'border-yellow-300' : 'border-blue-300'}`}>
                <div className="flex justify-between items-center mb-2">
                  <p className="font-bold text-lg">{c.type === 'sur_place' ? c.table_nom : TYPES[c.type]}</p>
                  <span className="text-xs text-gray-500 flex items-center gap-1"><Clock size={12} /> {heure(c.created_at)}</span>
                </div>
                <ul className="space-y-1 mb-3">
                  {(c.lignes || []).map((l, i) => (
                    <li key={i} className="text-sm"><span className="font-bold">{l.quantite}×</span> {l.nom}{l.note && <span className="block text-xs text-orange-600 ml-5">↳ {l.note}</span>}</li>
                  ))}
                </ul>
                {c.notes && <p className="text-xs bg-yellow-50 rounded-lg p-2 mb-2">📝 {c.notes}</p>}
                <button className="btn-primary w-full" onClick={() => statut(c.id, SUIVANT[c.statut][0])}>{c.statut === 'en_attente' ? 'Commencer la préparation' : 'Marquer prêt'}</button>
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'salle' && (
        <div className="space-y-3">
          {gestion && <button className="btn-secondary btn-sm flex items-center gap-1" onClick={() => setModal({ type: 'table', data: { nom: '', capacite: 4, zone: 'Salle' } })}><Plus size={14} /> Ajouter une table</button>}
          {tables.length === 0 ? (
            <div className="card text-center py-12 text-gray-400"><LayoutGrid size={40} className="mx-auto mb-3 text-gray-300" /><p className="font-medium">Aucune table</p>{gestion && <p className="text-sm mt-1">Ajoutez les tables de votre salle.</p>}</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {tables.map(t => (
                <div key={t.id} className={`card text-center cursor-pointer border-2 ${t.commande_ouverte_id ? 'border-red-300 bg-red-50' : 'border-green-300 bg-green-50'}`}
                  onClick={() => t.commande_ouverte_id ? setModal({ type: 'detail', id: t.commande_ouverte_id }) : setModal({ type: 'commande', table_id: t.id })}>
                  <p className="font-bold text-gray-900">{t.nom}</p>
                  <p className="text-xs text-gray-500">{t.zone} · {t.capacite} pl.</p>
                  <p className={`text-xs font-semibold mt-1 ${t.commande_ouverte_id ? 'text-red-600' : 'text-green-600'}`}>{t.commande_ouverte_id ? 'Occupée' : 'Libre'}</p>
                  {gestion && !t.commande_ouverte_id && (
                    <div className="flex justify-center gap-2 mt-2" onClick={e => e.stopPropagation()}>
                      <button className="text-gray-400 hover:text-blue-600" onClick={() => setModal({ type: 'table', data: t })}><Edit size={14} /></button>
                      <button className="text-gray-400 hover:text-red-600" onClick={async () => { try { await api.delete(`/restauration/tables/${t.id}`); charger(); } catch (e) { toast.error(e.response?.data?.message || 'Erreur'); } }}><Trash2 size={14} /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'carte' && gestion && (
        <div className="space-y-3">
          <button className="btn-secondary btn-sm flex items-center gap-1" onClick={() => setModal({ type: 'plat', data: { nom: '', categorie: 'Plats', description: '', prix: '', disponible: 1 } })}><Plus size={14} /> Ajouter un plat</button>
          {plats.length === 0 ? (
            <div className="card text-center py-12 text-gray-400"><BookOpen size={40} className="mx-auto mb-3 text-gray-300" /><p className="font-medium">Votre carte est vide</p><p className="text-sm mt-1">Ajoutez vos plats et boissons avec leur prix.</p></div>
          ) : (
            CATEGORIES.concat(plats.map(p => p.categorie)).filter((c, i, a) => a.indexOf(c) === i && plats.some(p => p.categorie === c)).map(cat => (
              <div key={cat} className="card">
                <h3 className="font-bold text-gray-800 mb-2">{cat}</h3>
                <div className="divide-y">
                  {plats.filter(p => p.categorie === cat).map(p => (
                    <div key={p.id} className="flex items-center justify-between py-2 gap-2">
                      <div className="min-w-0"><p className={`font-medium ${p.disponible ? '' : 'text-gray-400 line-through'}`}>{p.nom}</p>{p.description && <p className="text-xs text-gray-500 truncate">{p.description}</p>}</div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="font-bold">{fmt(p.prix)}</span>
                        <button className="text-gray-400 hover:text-blue-600" onClick={() => setModal({ type: 'plat', data: p })}><Edit size={15} /></button>
                        <button className="text-gray-400 hover:text-red-600" onClick={async () => { await api.delete(`/restauration/plats/${p.id}`); charger(); }}><Trash2 size={15} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {modal?.type === 'plat' && <PlatModal data={modal.data} onClose={() => setModal(null)} onSaved={() => { setModal(null); charger(); }} />}
      {modal?.type === 'table' && <TableModal data={modal.data} onClose={() => setModal(null)} onSaved={() => { setModal(null); charger(); }} />}
      {modal?.type === 'commande' && <CommandeModal plats={plats} tables={tables} tableId={modal.table_id} onClose={() => setModal(null)} onSaved={() => { setModal(null); charger(); }} />}
      {modal?.type === 'detail' && <DetailModal id={modal.id} plats={plats} onClose={() => setModal(null)} onChanged={charger} onEncaisser={() => setModal({ type: 'encaisser', id: modal.id })} />}
      {modal?.type === 'encaisser' && <EncaisserModal id={modal.id} onClose={() => setModal(null)} onSaved={() => { setModal(null); charger(); }} />}
    </div>
  );
}

function PlatModal({ data, onClose, onSaved }) {
  const [f, setF] = useState(data);
  const [saving, setSaving] = useState(false);
  async function save(e) {
    e.preventDefault(); setSaving(true);
    try {
      if (f.id) await api.put(`/restauration/plats/${f.id}`, f); else await api.post('/restauration/plats', f);
      toast.success('Carte mise à jour'); onSaved();
    } catch (err) { toast.error(err.response?.data?.message || 'Erreur'); setSaving(false); }
  }
  return (
    <Modal titre={f.id ? 'Modifier le plat' : 'Nouveau plat'} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <div><label className="label">Nom</label><input className="input" required value={f.nom} onChange={e => setF({ ...f, nom: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Catégorie</label><select className="input" value={f.categorie} onChange={e => setF({ ...f, categorie: e.target.value })}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
          <div><label className="label">Prix (FCFA)</label><input className="input" type="number" min="0" required value={f.prix} onChange={e => setF({ ...f, prix: e.target.value })} /></div>
        </div>
        <div><label className="label">Description</label><input className="input" value={f.description || ''} onChange={e => setF({ ...f, description: e.target.value })} /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.disponible} onChange={e => setF({ ...f, disponible: e.target.checked ? 1 : 0 })} /> Disponible aujourd'hui</label>
        <button className="btn-primary w-full flex items-center justify-center gap-2" disabled={saving}><Save size={16} /> Enregistrer</button>
      </form>
    </Modal>
  );
}

function TableModal({ data, onClose, onSaved }) {
  const [f, setF] = useState(data);
  async function save(e) {
    e.preventDefault();
    try {
      if (f.id) await api.put(`/restauration/tables/${f.id}`, f); else await api.post('/restauration/tables', f);
      onSaved();
    } catch (err) { toast.error(err.response?.data?.message || 'Erreur'); }
  }
  return (
    <Modal titre={f.id ? 'Modifier la table' : 'Nouvelle table'} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <div><label className="label">Nom (ex : Table 1)</label><input className="input" required value={f.nom} onChange={e => setF({ ...f, nom: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Places</label><input className="input" type="number" min="1" value={f.capacite} onChange={e => setF({ ...f, capacite: e.target.value })} /></div>
          <div><label className="label">Zone</label><input className="input" value={f.zone} onChange={e => setF({ ...f, zone: e.target.value })} placeholder="Salle, Terrasse…" /></div>
        </div>
        <button className="btn-primary w-full">Enregistrer</button>
      </form>
    </Modal>
  );
}

// Sélecteur de plats partagé par « nouvelle commande » et « ajouter à une commande ».
function Panier({ plats, panier, setPanier }) {
  const [cat, setCat] = useState('');
  const cats = useMemo(() => [...new Set(plats.map(p => p.categorie))], [plats]);
  const visibles = plats.filter(p => !cat || p.categorie === cat);
  const qte = id => panier.find(l => l.plat_id === id)?.quantite || 0;
  function change(p, d) {
    setPanier(prev => {
      const ex = prev.find(l => l.plat_id === p.id);
      if (!ex) return d > 0 ? [...prev, { plat_id: p.id, nom: p.nom, prix: p.prix, quantite: 1, note: '' }] : prev;
      const q = ex.quantite + d;
      return q <= 0 ? prev.filter(l => l.plat_id !== p.id) : prev.map(l => l.plat_id === p.id ? { ...l, quantite: q } : l);
    });
  }
  const total = panier.reduce((s, l) => s + l.quantite * l.prix, 0);
  return (
    <div className="grid md:grid-cols-5 gap-4">
      <div className="md:col-span-3 space-y-2">
        <div className="flex gap-1 flex-wrap">
          <button type="button" onClick={() => setCat('')} className={`px-2.5 py-1 rounded-full text-xs ${!cat ? 'bg-orange-600 text-white' : 'bg-gray-100'}`}>Tout</button>
          {cats.map(c => <button type="button" key={c} onClick={() => setCat(c)} className={`px-2.5 py-1 rounded-full text-xs ${cat === c ? 'bg-orange-600 text-white' : 'bg-gray-100'}`}>{c}</button>)}
        </div>
        {plats.length === 0 && <p className="text-sm text-gray-400 py-6 text-center">La carte est vide. Ajoutez des plats dans l'onglet « Carte ».</p>}
        <div className="grid grid-cols-2 gap-2 max-h-80 overflow-y-auto">
          {visibles.map(p => (
            <button type="button" key={p.id} disabled={!p.disponible} onClick={() => change(p, 1)}
              className={`text-left border rounded-xl p-2.5 transition ${p.disponible ? 'hover:border-orange-400 hover:bg-orange-50' : 'opacity-40'} ${qte(p.id) ? 'border-orange-400 bg-orange-50' : ''}`}>
              <p className="text-sm font-semibold leading-tight">{p.nom}</p>
              <p className="text-xs text-gray-500">{fmt(p.prix)} FCFA{!p.disponible && ' · indisponible'}</p>
              {qte(p.id) > 0 && <span className="text-xs font-bold text-orange-600">× {qte(p.id)}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="md:col-span-2 border rounded-xl p-3 space-y-2 h-fit">
        <p className="font-bold text-sm">Commande</p>
        {panier.length === 0 && <p className="text-xs text-gray-400">Touchez un plat pour l'ajouter.</p>}
        {panier.map(l => (
          <div key={l.plat_id} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{l.nom}</span>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button type="button" className="w-6 h-6 rounded bg-gray-100 flex items-center justify-center" onClick={() => change({ id: l.plat_id }, -1)}><Minus size={12} /></button>
                <span className="w-5 text-center font-bold">{l.quantite}</span>
                <button type="button" className="w-6 h-6 rounded bg-gray-100 flex items-center justify-center" onClick={() => change({ id: l.plat_id }, 1)}><Plus size={12} /></button>
              </div>
            </div>
            <input className="input py-1 text-xs" placeholder="Note (sans piment, bien cuit…)" value={l.note} onChange={e => setPanier(prev => prev.map(x => x.plat_id === l.plat_id ? { ...x, note: e.target.value } : x))} />
          </div>
        ))}
        <div className="flex justify-between border-t pt-2 font-bold"><span>Total</span><span>{fmt(total)} FCFA</span></div>
      </div>
    </div>
  );
}

function CommandeModal({ plats, tables, tableId, onClose, onSaved }) {
  const [f, setF] = useState({ type: tableId ? 'sur_place' : 'sur_place', table_id: tableId || '', client_nom: '', client_telephone: '', adresse_livraison: '', notes: '' });
  const [panier, setPanier] = useState([]);
  const [saving, setSaving] = useState(false);
  async function envoyer() {
    setSaving(true);
    try {
      await api.post('/restauration/commandes', { ...f, lignes: panier.map(l => ({ plat_id: l.plat_id, quantite: l.quantite, note: l.note })) });
      toast.success('Commande envoyée en cuisine'); onSaved();
    } catch (err) { toast.error(err.response?.data?.message || 'Erreur'); setSaving(false); }
  }
  return (
    <Modal titre="Nouvelle commande" onClose={onClose} large>
      <div className="space-y-4">
        <div className="flex gap-1">
          {Object.entries(TYPES).map(([k, l]) => <button type="button" key={k} onClick={() => setF({ ...f, type: k })} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${f.type === k ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-600'}`}>{l}</button>)}
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          {f.type === 'sur_place' && (
            <div><label className="label">Table</label>
              <select className="input" value={f.table_id} onChange={e => setF({ ...f, table_id: e.target.value })}>
                <option value="">— Choisir —</option>
                {tables.map(t => <option key={t.id} value={t.id}>{t.nom}{t.commande_ouverte_id ? ' (occupée)' : ''}</option>)}
              </select>
              {tables.length === 0 && <p className="text-xs text-orange-600 mt-1">Créez d'abord vos tables (onglet Salle).</p>}
            </div>
          )}
          <div><label className="label">Client (facultatif)</label><input className="input" value={f.client_nom} onChange={e => setF({ ...f, client_nom: e.target.value })} /></div>
          {f.type !== 'sur_place' && <div><label className="label">Téléphone</label><input className="input" value={f.client_telephone} onChange={e => setF({ ...f, client_telephone: e.target.value })} /></div>}
          {f.type === 'livraison' && <div className="sm:col-span-3"><label className="label">Adresse de livraison</label><input className="input" value={f.adresse_livraison} onChange={e => setF({ ...f, adresse_livraison: e.target.value })} /></div>}
        </div>
        <Panier plats={plats} panier={panier} setPanier={setPanier} />
        <div><label className="label">Remarque pour la cuisine</label><input className="input" value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></div>
        <button className="btn-primary w-full flex items-center justify-center gap-2" disabled={saving || panier.length === 0} onClick={envoyer}><ChefHat size={16} /> Envoyer en cuisine</button>
      </div>
    </Modal>
  );
}

function DetailModal({ id, plats, onClose, onChanged, onEncaisser }) {
  const [c, setC] = useState(null);
  const [ajout, setAjout] = useState(false);
  const [panier, setPanier] = useState([]);
  const charger = useCallback(() => api.get(`/restauration/commandes/${id}`).then(r => setC(r.data)).catch(() => onClose()), [id]);
  useEffect(() => { charger(); }, [charger]);
  if (!c) return null;
  const ouverte = ['en_attente', 'en_preparation', 'pret', 'servi'].includes(c.statut);
  async function ajouter() {
    try {
      await api.post(`/restauration/commandes/${id}/lignes`, { lignes: panier.map(l => ({ plat_id: l.plat_id, quantite: l.quantite, note: l.note })) });
      toast.success('Plats ajoutés'); setAjout(false); setPanier([]); charger(); onChanged();
    } catch (err) { toast.error(err.response?.data?.message || 'Erreur'); }
  }
  async function annuler() {
    try { await api.put(`/restauration/commandes/${id}/statut`, { statut: 'annule' }); onChanged(); onClose(); }
    catch (err) { toast.error(err.response?.data?.message || 'Erreur'); }
  }
  return (
    <Modal titre={`${c.numero} — ${c.type === 'sur_place' ? c.table_nom : TYPES[c.type]}`} onClose={onClose} large={ajout}>
      <div className="space-y-3">
        <div className="flex items-center justify-between"><Badge s={c.statut} /><span className="text-xs text-gray-500">{TYPES[c.type]}{c.client_nom ? ` · ${c.client_nom}` : ''}{c.client_telephone ? ` · ${c.client_telephone}` : ''}</span></div>
        {c.adresse_livraison && <p className="text-sm">📍 {c.adresse_livraison}</p>}
        <div className="divide-y border rounded-xl">
          {c.lignes.map(l => (
            <div key={l.id} className="flex justify-between px-3 py-2 text-sm"><span>{l.quantite}× {l.nom}{l.note && <em className="block text-xs text-orange-600">{l.note}</em>}</span><span>{fmt(l.quantite * l.prix_unitaire)}</span></div>
          ))}
        </div>
        {c.remise > 0 && <div className="flex justify-between text-sm text-gray-500"><span>Remise</span><span>− {fmt(c.remise)}</span></div>}
        <div className="flex justify-between font-bold text-lg"><span>Total</span><span>{fmt(c.total)} FCFA</span></div>
        {c.statut === 'paye' && <p className="text-sm text-green-700">Payé en {c.mode_paiement?.replace('_', ' ')} — reçu {fmt(c.montant_paye)} FCFA</p>}
        {ouverte && !ajout && (
          <div className="flex gap-2 flex-wrap">
            <button className="btn-secondary btn-sm" onClick={() => setAjout(true)}>+ Ajouter des plats</button>
            <button className="btn-primary btn-sm" style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)' }} onClick={onEncaisser}>Encaisser</button>
            <button className="btn-danger btn-sm" onClick={annuler}>Annuler la commande</button>
          </div>
        )}
        {ajout && (
          <div className="space-y-3 border-t pt-3">
            <Panier plats={plats} panier={panier} setPanier={setPanier} />
            <div className="flex gap-2"><button className="btn-primary" disabled={!panier.length} onClick={ajouter}>Envoyer en cuisine</button><button className="btn-secondary" onClick={() => { setAjout(false); setPanier([]); }}>Retour</button></div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function EncaisserModal({ id, onClose, onSaved }) {
  const [c, setC] = useState(null);
  const [mode, setMode] = useState('especes');
  const [recu, setRecu] = useState('');
  const [remise, setRemise] = useState('');
  useEffect(() => { api.get(`/restauration/commandes/${id}`).then(r => { setC(r.data); setRemise(r.data.remise || ''); }); }, [id]);
  if (!c) return null;
  const rem = Math.min(Math.max(Number(remise) || 0, 0), c.sous_total);
  const total = c.sous_total - rem;
  const monnaie = mode === 'especes' && recu !== '' ? Number(recu) - total : 0;
  async function valider() {
    try {
      await api.post(`/restauration/commandes/${id}/encaisser`, { mode_paiement: mode, remise: rem, montant_paye: mode === 'especes' && recu !== '' ? Number(recu) : total });
      toast.success('Commande encaissée'); onSaved();
    } catch (err) { toast.error(err.response?.data?.message || 'Erreur'); }
  }
  return (
    <Modal titre={`Encaisser ${c.numero}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="flex justify-between text-sm"><span>Sous-total</span><span>{fmt(c.sous_total)} FCFA</span></div>
        <div><label className="label">Remise (FCFA)</label><input className="input" type="number" min="0" value={remise} onChange={e => setRemise(e.target.value)} /></div>
        <div className="flex justify-between font-bold text-xl"><span>À payer</span><span>{fmt(total)} FCFA</span></div>
        <div className="flex gap-1">
          {[['especes', 'Espèces'], ['mobile_money', 'Mobile Money'], ['carte', 'Carte']].map(([k, l]) => <button key={k} onClick={() => setMode(k)} className={`flex-1 px-2 py-2 rounded-lg text-sm font-medium ${mode === k ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-600'}`}>{l}</button>)}
        </div>
        {mode === 'especes' && (
          <div><label className="label">Montant reçu</label><input className="input" type="number" min="0" value={recu} onChange={e => setRecu(e.target.value)} placeholder={String(total)} />
            {recu !== '' && <p className={`text-sm mt-1 font-semibold ${monnaie >= 0 ? 'text-green-700' : 'text-red-600'}`}>{monnaie >= 0 ? `Monnaie à rendre : ${fmt(monnaie)} FCFA` : 'Montant insuffisant'}</p>}
          </div>
        )}
        <button className="btn-primary w-full" disabled={mode === 'especes' && recu !== '' && monnaie < 0} onClick={valider}>Valider le paiement</button>
      </div>
    </Modal>
  );
}
