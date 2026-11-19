import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { TruckIcon, Plus, Edit, Trash2, Eye } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useDraggable } from '../hooks/useDraggable';

const fmt = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0)) + ' FCFA';
const empty = { nom:'', telephone:'', email:'', adresse:'', rccm:'' };
const emptyPai = { montant:'', mode_paiement:'especes', note:'' };
const MODES = ['especes','mobile_money','carte','virement'];
const modeLabel = { especes:'Espèces', mobile_money:'Mobile Money', carte:'Carte', virement:'Virement' };

export default function Fournisseurs() {
  const [fournisseurs, setFournisseurs] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(empty);
  const [detail, setDetail] = useState(null);
  const modalDrag = useDraggable();
  const detailDrag = useDraggable();
  const [paiForm, setPaiForm] = useState(emptyPai);
  const [paiLoading, setPaiLoading] = useState(false);

  function load() { api.get('/fournisseurs').then(r => setFournisseurs(r.data)); }
  useEffect(() => { load(); }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      if (modal === 'add') { await api.post('/fournisseurs', form); toast.success('Fournisseur créé'); }
      else { await api.put(`/fournisseurs/${form.id}`, form); toast.success('Fournisseur mis à jour'); }
      setModal(null);
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Erreur'); }
  }

  async function handleDelete(id) {
    if (!confirm('Supprimer ce fournisseur ?')) return;
    await api.delete(`/fournisseurs/${id}`);
    toast.success('Fournisseur supprimé');
    load();
  }

  async function voirDetail(id) {
    const res = await api.get(`/fournisseurs/${id}`);
    setDetail(res.data);
    setPaiForm(emptyPai);
  }

  async function handleVersement(e) {
    e.preventDefault();
    if (!paiForm.montant || paiForm.montant <= 0) return toast.error('Montant invalide');
    setPaiLoading(true);
    try {
      await api.post(`/fournisseurs/${detail.id}/paiements`, paiForm);
      toast.success('Règlement enregistré');
      setPaiForm(emptyPai);
      const res = await api.get(`/fournisseurs/${detail.id}`);
      setDetail(res.data);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Erreur');
    } finally { setPaiLoading(false); }
  }

  const F = ({ label, value }) => <div><span className="text-gray-500 text-xs">{label}</span><p className="text-sm">{value || '-'}</p></div>;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2"><TruckIcon size={22}/> Fournisseurs</h1>
          <p className="page-sub">{fournisseurs.length} fournisseur{fournisseurs.length !== 1 ? 's' : ''} enregistré{fournisseurs.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => { setForm(empty); setModal('add'); }} className="btn-primary"><Plus size={16}/> Nouveau fournisseur</button>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Nom</th><th>Téléphone</th><th>Email</th><th>NCC</th><th>Solde dû</th><th>Actions</th></tr></thead>
          <tbody>
            {fournisseurs.map(f => (
              <tr key={f.id}>
                <td className="font-medium">{f.nom}</td>
                <td>{f.telephone || '-'}</td>
                <td>{f.email || '-'}</td>
                <td>{f.rccm || '-'}</td>
                <td className={f.solde > 0 ? 'text-red-600 font-semibold' : ''}>{fmt(f.solde)}</td>
                <td>
                  <div className="flex gap-2">
                    <button onClick={() => voirDetail(f.id)} className="text-gray-600 hover:bg-gray-50 p-1.5 rounded"><Eye size={15}/></button>
                    <button onClick={() => { setForm(f); setModal('edit'); }} className="text-blue-600 hover:bg-blue-50 p-1.5 rounded"><Edit size={15}/></button>
                    <button onClick={() => handleDelete(f.id)} className="text-red-500 hover:bg-red-50 p-1.5 rounded"><Trash2 size={15}/></button>
                  </div>
                </td>
              </tr>
            ))}
            {fournisseurs.length === 0 && <tr><td colSpan="6" className="text-center py-8 text-gray-400">Aucun fournisseur</td></tr>}
          </tbody>
        </table>
      </div>

      {modal && createPortal(
        <div className="fixed inset-0 z-50">
          <div className="bg-white rounded-2xl shadow-xl" style={{ position: "absolute", top: 16, left: "50%", transform: `translateX(-50%) translate(${modalDrag.offset.x}px, ${modalDrag.offset.y}px)`, width: "calc(100% - 32px)", maxWidth: 640, maxHeight: "calc(100vh - 32px)", overflowY: "auto" }}>
            <div onMouseDown={modalDrag.onMouseDown} className="flex items-center justify-between p-6 border-b cursor-move select-none">
              <h2 className="text-lg font-semibold">{modal === 'add' ? 'Nouveau fournisseur' : 'Modifier'}</h2>
              <button onClick={() => setModal(null)} className="text-gray-400 text-2xl">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-3">
              <div><label className="label">Nom *</label><input className="input" value={form.nom} onChange={e => setForm(f=>({...f,nom:e.target.value}))} required /></div>
              <div><label className="label">Téléphone</label><input className="input" value={form.telephone||''} onChange={e => setForm(f=>({...f,telephone:e.target.value}))} /></div>
              <div><label className="label">Email</label><input type="email" className="input" value={form.email||''} onChange={e => setForm(f=>({...f,email:e.target.value}))} /></div>
              <div><label className="label">Adresse</label><input className="input" value={form.adresse||''} onChange={e => setForm(f=>({...f,adresse:e.target.value}))} /></div>
              <div><label className="label">NCC</label><input className="input" value={form.rccm||''} onChange={e => setForm(f=>({...f,rccm:e.target.value}))} /></div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" className="btn-secondary" onClick={() => setModal(null)}>Annuler</button>
                <button type="submit" className="btn-primary">Enregistrer</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {detail && createPortal(
        <div className="fixed inset-0 z-50">
          <div className="bg-white rounded-2xl shadow-xl" style={{ position: "absolute", top: 16, left: "50%", transform: `translateX(-50%) translate(${detailDrag.offset.x}px, ${detailDrag.offset.y}px)`, width: "calc(100% - 32px)", maxWidth: 640, maxHeight: "calc(100vh - 32px)", overflowY: "auto" }}>
            <div onMouseDown={detailDrag.onMouseDown} className="flex items-center justify-between p-6 border-b cursor-move select-none">
              <h2 className="text-lg font-semibold">{detail.nom}</h2>
              <button onClick={() => setDetail(null)} className="text-gray-400 text-2xl">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <F label="Téléphone" value={detail.telephone} />
                <F label="Email" value={detail.email} />
                <F label="NCC" value={detail.rccm} />
                <F label="Adresse" value={detail.adresse} />
                <div><span className="text-gray-500 text-xs">Solde dû</span><p className="font-semibold text-red-600">{fmt(detail.solde)}</p></div>
              </div>
              <h3 className="font-semibold text-gray-700 pt-2">Derniers achats</h3>
              <div className="space-y-2">
                {detail.achats?.map(a => {
                  const reste = a.total - (a.montant_paye || 0);
                  return (
                    <div key={a.id} className="flex justify-between items-center py-2 border-b border-gray-100 text-sm">
                      <div><p className="font-mono text-xs text-gray-500">{a.numero}</p><p className="text-xs text-gray-400">{new Date(a.created_at).toLocaleDateString('fr-FR')}</p></div>
                      <div className="text-right">
                        <p className="font-semibold text-blue-700">{fmt(a.total)}</p>
                        {reste > 0 && <p className="text-xs text-orange-600">Reste : {fmt(reste)}</p>}
                      </div>
                    </div>
                  );
                })}
                {!detail.achats?.length && <p className="text-gray-400 text-sm">Aucun achat</p>}
              </div>

              {detail.solde > 0 && (
                <form onSubmit={handleVersement} className="border-t pt-4 space-y-3">
                  <p className="text-sm font-semibold text-gray-700">Enregistrer un règlement</p>
                  <div className="flex gap-2">
                    <input
                      type="number" step="100" required
                      value={paiForm.montant}
                      onChange={e => setPaiForm(p=>({...p, montant:e.target.value}))}
                      placeholder={`Max ${fmt(detail.solde)}`}
                      className="input flex-1"
                    />
                    <button type="button"
                      onClick={() => setPaiForm(p=>({...p, montant: detail.solde}))}
                      className="btn-secondary text-xs px-3 whitespace-nowrap">
                      Solder
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {MODES.map(m => (
                      <button key={m} type="button" onClick={() => setPaiForm(p=>({...p,mode_paiement:m}))}
                        className={`py-1.5 rounded-lg text-xs font-medium border transition-all ${paiForm.mode_paiement === m ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:border-blue-300'}`}>
                        {modeLabel[m]}
                      </button>
                    ))}
                  </div>
                  <input className="input text-sm" value={paiForm.note} onChange={e => setPaiForm(p=>({...p,note:e.target.value}))} placeholder="Note (optionnel)" />
                  <button type="submit" disabled={paiLoading} className="btn-primary w-full">
                    {paiLoading ? 'Enregistrement...' : 'Valider le règlement'}
                  </button>
                </form>
              )}

              {detail.paiements?.length > 0 && (
                <div className="border-t pt-4">
                  <p className="text-sm font-semibold text-gray-700 mb-2">Historique des règlements</p>
                  <div className="space-y-1">
                    {detail.paiements.map(p => (
                      <div key={p.id} className="flex justify-between items-center text-xs bg-gray-50 rounded-lg px-3 py-2">
                        <div>
                          <span className="font-medium text-gray-700">{fmt(p.montant)}</span>
                          <span className="text-gray-400 ml-2">{modeLabel[p.mode_paiement] || p.mode_paiement}</span>
                          {p.achat_numero && <span className="text-gray-400 ml-2">— {p.achat_numero}</span>}
                          {p.note && <span className="text-gray-400 ml-2">({p.note})</span>}
                        </div>
                        <span className="text-gray-400">{new Date(p.created_at).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'})}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}





