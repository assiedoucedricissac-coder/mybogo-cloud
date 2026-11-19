import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Warehouse, ArrowUpDown, TrendingUp, TrendingDown, Wallet, PackageSearch, Calendar } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useDraggable } from '../hooks/useDraggable';

const fmt = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0)) + ' FCFA';

function Modal({ title, onClose, children }) {
  const { offset, onMouseDown } = useDraggable();
  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="bg-white rounded-2xl shadow-xl" style={{ position: "absolute", top: 16, left: "50%", transform: `translateX(-50%) translate(${offset.x}px, ${offset.y}px)`, width: "calc(100% - 32px)", maxWidth: 640, maxHeight: "calc(100vh - 32px)", overflowY: "auto" }}>
        <div onMouseDown={onMouseDown} className="flex items-center justify-between p-6 border-b cursor-move select-none">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>,
    document.body
  );
}

export default function Stock() {
  const [produits, setProduits] = useState([]);
  const [mouvements, setMouvements] = useState([]);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('stock');
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [condMap, setCondMap] = useState({});
  const [ajustForm, setAjustForm] = useState({ type: 'entree', quantite: 1, motif: '', conditionnement_id: '' });

  // Tableau de bord achats/ventes/marge — déplacé depuis "Achats" pour tout centraliser ici,
  // au même endroit que l'état du stock qui sert à calculer les projections potentielles.
  const [stats, setStats] = useState({ total_achats: 0, total_ventes: 0, marge: 0, valeur_stock_achat: 0 });
  const [periode, setPeriode] = useState('tout');
  const [datePersonnalisee, setDatePersonnalisee] = useState({ debut: '', fin: '' });

  function loadStats(p = periode, custom = datePersonnalisee) {
    const params = { periode: p };
    if (p === 'personnalise' && custom.debut && custom.fin) {
      params.date_debut = custom.debut;
      params.date_fin = custom.fin;
    }
    api.get('/achats/stats', { params }).then(r => setStats(r.data)).catch(() => {});
  }

  function changerPeriode(p) {
    setPeriode(p);
    if (p !== 'personnalise') loadStats(p);
  }

  function changerDatePersonnalisee(champ, valeur) {
    const next = { ...datePersonnalisee, [champ]: valeur };
    setDatePersonnalisee(next);
    if (next.debut && next.fin) loadStats('personnalise', next);
  }

  const loadProduits = useCallback(() => {
    api.get('/produits', { params: search ? { search } : {} }).then(r => setProduits(r.data));
  }, [search]);

  const loadMouvements = useCallback(() => {
    api.get('/rapports/mouvements').then(r => setMouvements(r.data));
  }, []);

  useEffect(() => { loadProduits(); }, [loadProduits]);
  useEffect(() => { if (tab === 'mouvements') loadMouvements(); }, [tab, loadMouvements]);
  useEffect(() => {
    loadStats();
    api.get('/conditionnements').then(r => {
      const map = {};
      r.data.forEach(c => { if (!map[c.produit_id]) map[c.produit_id] = []; map[c.produit_id].push(c); });
      setCondMap(map);
    }).catch(() => {});
  }, []);

  function openAjust(p) { setSelected(p); setAjustForm({ type: 'entree', quantite: 1, motif: '', conditionnement_id: '' }); setModal('ajust'); }

  // Contenance du format choisi (1 = pièce/unité de base)
  const contenanceChoisie = (() => {
    if (!ajustForm.conditionnement_id) return 1;
    const cond = (condMap[selected?.id] || []).find(c => String(c.id) === String(ajustForm.conditionnement_id));
    return cond ? cond.contenance : 1;
  })();
  const quantiteReelle = (parseInt(ajustForm.quantite) || 0) * contenanceChoisie;

  async function handleAjust(e) {
    e.preventDefault();
    try {
      await api.post(`/produits/${selected.id}/stock`, {
        type: ajustForm.type,
        quantite: quantiteReelle,
        motif: ajustForm.motif,
      });
      toast.success('Stock ajusté');
      setModal(null);
      loadProduits();
      loadStats();
    } catch (err) { toast.error(err.response?.data?.message || 'Erreur'); }
  }

  const pFiltered = produits.filter(p => !search || p.nom.toLowerCase().includes(search.toLowerCase()) || p.code.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="page-title flex items-center gap-2"><Warehouse size={22}/> Gestion du stock</h1>
        <p className="page-sub">{produits.length} produit{produits.length !== 1 ? 's' : ''} en catalogue</p>
      </div>

      {/* Tableau de bord achats/ventes/marge */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Historique</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          {[['jour','Aujourd\'hui'],['semaine','Semaine'],['mois','Mois'],['tout','Tout']].map(([key,label]) => (
            <button key={key} onClick={() => changerPeriode(key)}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${periode === key ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-500 hover:border-blue-300'}`}>
              {label}
            </button>
          ))}
          <button onClick={() => changerPeriode('personnalise')}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${periode === 'personnalise' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-500 hover:border-blue-300'}`}>
            <Calendar size={13}/> Personnalisé
          </button>
        </div>
      </div>
      {periode === 'personnalise' && (
        <div className="flex items-center gap-2 flex-wrap bg-white border border-gray-200 rounded-lg px-3 py-2 -mt-1">
          <span className="text-xs text-gray-500">Du</span>
          <input type="date" className="input py-1 text-xs w-auto" value={datePersonnalisee.debut}
            onChange={e => changerDatePersonnalisee('debut', e.target.value)}/>
          <span className="text-xs text-gray-500">au</span>
          <input type="date" className="input py-1 text-xs w-auto" value={datePersonnalisee.fin}
            onChange={e => changerDatePersonnalisee('fin', e.target.value)}/>
          {(!datePersonnalisee.debut || !datePersonnalisee.fin) && (
            <span className="text-xs text-gray-400">Choisissez les deux dates</span>
          )}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card py-3 px-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Coût des ventes</span>
            <TrendingDown size={16} className="text-red-500"/>
          </div>
          <div className="mt-1 text-lg font-bold text-red-600">{fmt(stats.total_achats)}</div>
        </div>
        <div className="card py-3 px-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Total des ventes</span>
            <TrendingUp size={16} className="text-green-500"/>
          </div>
          <div className="mt-1 text-lg font-bold text-green-600">{fmt(stats.total_ventes)}</div>
        </div>
        <div className="card py-3 px-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Marge</span>
            <Wallet size={16} className="text-blue-500"/>
          </div>
          <div className="mt-1 text-lg font-bold text-blue-700">{fmt(stats.marge)}</div>
        </div>
      </div>

      {/* Stock actuel : combien vaut la marchandise encore en magasin, au prix d'achat */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Stock actuel</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="card py-3 px-4 border-2 border-dashed border-gray-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">Valeur du stock (achat)</span>
              <PackageSearch size={16} className="text-gray-400"/>
            </div>
            <div className="mt-1 text-lg font-bold text-gray-700">{fmt(stats.valeur_stock_achat)}</div>
          </div>
        </div>
      </div>

      <div className="flex gap-1 bg-white rounded-2xl p-1 border border-gray-100 w-fit shadow-sm">
        {['stock', 'mouvements'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${tab === t ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
            {t === 'stock' ? 'État du stock' : 'Mouvements'}
          </button>
        ))}
      </div>

      {tab === 'stock' && (
        <>
          <input className="input max-w-sm" placeholder="Rechercher un produit..." value={search} onChange={e => setSearch(e.target.value)}/>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Code</th><th>Produit</th><th>Famille</th><th>Qté actuelle</th><th>Qté min</th><th>Statut</th><th>Actions</th></tr></thead>
              <tbody>
                {pFiltered.map(p => {
                  const s = p.qte_actuelle === 0 ? 'badge-red' : p.qte_actuelle <= p.qte_min ? 'badge-yellow' : 'badge-green';
                  const label = p.qte_actuelle === 0 ? 'Rupture' : p.qte_actuelle <= p.qte_min ? 'Stock faible' : 'Normal';
                  return (
                    <tr key={p.id}>
                      <td><span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{p.code}</span></td>
                      <td className="font-medium">{p.nom}</td>
                      <td>{p.categorie_nom || '-'}</td>
                      <td className="font-bold text-lg">{p.qte_actuelle} <span className="text-xs text-gray-400 font-normal">{p.unite}</span></td>
                      <td className="text-gray-500">{p.qte_min}</td>
                      <td><span className={`badge ${s}`}>{label}</span></td>
                      <td>
                        <button onClick={() => openAjust(p)} className="btn-secondary btn-sm">
                          <ArrowUpDown size={14} /> Ajuster
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'mouvements' && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Date</th><th>Produit</th><th>Type</th><th>Quantité</th><th>Avant</th><th>Après</th><th>Motif</th><th>Utilisateur</th></tr></thead>
            <tbody>
              {mouvements.map(m => (
                <tr key={m.id}>
                  <td className="text-xs">{new Date(m.created_at).toLocaleString('fr-FR')}</td>
                  <td>{m.produit_nom}</td>
                  <td>
                    {(() => {
                      const cfg = {
                        vente:         { label: 'Vente',         cls: 'badge-green'  },
                        entree:        { label: 'Entrée',        cls: 'badge-green'  },
                        achat:         { label: 'Achat',         cls: 'badge-green'  },
                        retour_client: { label: 'Retour client', cls: 'badge-green'  },
                        sortie:        { label: 'Sortie',        cls: 'badge-yellow' },
                        ajustement:    { label: 'Ajustement',    cls: 'badge-blue'   },
                        casse:         { label: 'Casse/Perte',   cls: 'badge-red'    },
                      };
                      const c = cfg[m.type] || { label: m.type, cls: 'badge-blue' };
                      return <span className={`badge ${c.cls}`}>{c.label}</span>;
                    })()}
                  </td>
                  <td className={`font-bold ${['entree','achat','retour_client','vente'].includes(m.type) ? 'text-green-600' : 'text-red-600'}`}>
                    {['entree','achat','retour_client','vente'].includes(m.type) ? '+' : '-'}{m.quantite}
                  </td>
                  <td>{m.qte_avant}</td>
                  <td>{m.qte_apres}</td>
                  <td className="text-gray-500 text-xs">{m.motif || m.reference_doc || '-'}</td>
                  <td className="text-xs">{m.user_nom || '-'}</td>
                </tr>
              ))}
              {mouvements.length === 0 && <tr><td colSpan="8" className="text-center py-8 text-gray-400">Aucun mouvement</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {modal === 'ajust' && selected && (
        <Modal title={`Ajuster le stock — ${selected.nom}`} onClose={() => setModal(null)}>
          <form onSubmit={handleAjust} className="space-y-4">
            <div className="bg-blue-50 rounded-lg p-3 text-sm">
              Stock actuel : <strong>{selected.qte_actuelle} {selected.unite}</strong>
            </div>
            <div>
              <label className="label">Type de mouvement</label>
              <div className="grid grid-cols-2 gap-2">
                {[['entree','Entrée +'], ['sortie','Sortie -'], ['ajustement','Ajustement'], ['casse','Casse/Perte']].map(([v, l]) => (
                  <label key={v} className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer text-sm ${ajustForm.type === v ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                    <input type="radio" name="type" value={v} checked={ajustForm.type === v} onChange={e => setAjustForm(f => ({...f, type: e.target.value}))} className="sr-only" />
                    {l}
                  </label>
                ))}
              </div>
            </div>
            {(condMap[selected.id] || []).length > 0 && (
              <div>
                <label className="label">Format saisi</label>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => setAjustForm(f => ({...f, conditionnement_id: ''}))}
                    className={`text-xs font-medium px-2.5 py-1.5 rounded-lg border-2 transition-all
                      ${!ajustForm.conditionnement_id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                    Pièce (1u)
                  </button>
                  {condMap[selected.id].map(cond => (
                    <button type="button" key={cond.id} onClick={() => setAjustForm(f => ({...f, conditionnement_id: cond.id}))}
                      className={`text-xs font-medium px-2.5 py-1.5 rounded-lg border-2 transition-all
                        ${String(ajustForm.conditionnement_id) === String(cond.id) ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                      {cond.libelle} ({cond.contenance}u)
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="label">Quantité {contenanceChoisie > 1 && <span className="text-gray-400 font-normal text-xs">(en {condMap[selected.id]?.find(c => String(c.id) === String(ajustForm.conditionnement_id))?.libelle?.toLowerCase()})</span>}</label>
              <input type="number" min="1" className="input" value={ajustForm.quantite} onChange={e => setAjustForm(f => ({...f, quantite: +e.target.value}))} required />
              {contenanceChoisie > 1 && (
                <p className="text-xs text-blue-600 mt-1 font-medium">
                  = {quantiteReelle} {selected.unite}{quantiteReelle > 1 ? 's' : ''} au total
                </p>
              )}
            </div>
            <div>
              <label className="label">Motif</label>
              <input className="input" placeholder="Raison du mouvement..." value={ajustForm.motif} onChange={e => setAjustForm(f => ({...f, motif: e.target.value}))} />
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" className="btn-secondary" onClick={() => setModal(null)}>Annuler</button>
              <button type="submit" className="btn-primary">Confirmer</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
