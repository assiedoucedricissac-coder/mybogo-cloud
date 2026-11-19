import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { UserCircle, Plus, Edit, Trash2, Key } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const ROLES = ['admin','gestionnaire','caissier','magasinier','comptable'];
const empty = { nom:'', prenom:'', email:'', mot_de_passe:'', role:'caissier', actif:1 };

export default function Utilisateurs() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(empty);
  const [mdpForm, setMdpForm] = useState({ id:null, nouveau_mdp:'' });

  function load() { api.get('/users').then(r => setUsers(r.data.filter(u => u.role !== 'super_admin'))); }
  useEffect(() => { load(); }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      if (modal === 'add') { await api.post('/users', form); toast.success('Utilisateur créé'); }
      else { await api.put(`/users/${form.id}`, form); toast.success('Utilisateur mis à jour'); }
      setModal(null);
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Erreur'); }
  }

  async function handleDelete(id) {
    if (!confirm('Désactiver cet utilisateur ?')) return;
    await api.delete(`/users/${id}`);
    toast.success('Utilisateur désactivé');
    load();
  }

  async function handleResetMdp(e) {
    e.preventDefault();
    await api.put(`/users/${mdpForm.id}/password`, { nouveau_mdp: mdpForm.nouveau_mdp });
    toast.success('Mot de passe réinitialisé');
    setModal(null);
  }

  const roleColors = { admin:'badge-red', gestionnaire:'badge-blue', caissier:'badge-green', magasinier:'badge-yellow', comptable:'badge-gray' };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2"><UserCircle size={22}/> Utilisateurs</h1>
          <p className="page-sub">{users.length} compte{users.length !== 1 ? 's' : ''} actif{users.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => { setForm(empty); setModal('add'); }} className="btn-primary"><Plus size={16}/> Nouvel utilisateur</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {users.map(u => (
          <div key={u.id} className="card flex items-start gap-4">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center font-bold text-blue-700">
              {u.prenom?.[0]}{u.nom?.[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900">{u.prenom} {u.nom}</p>
              <p className="text-xs text-gray-400 truncate">{u.email}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className={`badge ${roleColors[u.role]||'badge-gray'}`}>{u.role}</span>
                <span className={`badge ${u.actif ? 'badge-green' : 'badge-red'}`}>{u.actif ? 'Actif' : 'Inactif'}</span>
              </div>
              {u.derniere_connexion && <p className="text-xs text-gray-400 mt-1">Dernière co.: {new Date(u.derniere_connexion).toLocaleDateString('fr-FR')}</p>}
            </div>
            <div className="flex flex-col gap-1">
              <button onClick={() => { setForm({...u, mot_de_passe:''}); setModal('edit'); }} className="text-blue-600 hover:bg-blue-50 p-1.5 rounded"><Edit size={14}/></button>
              <button onClick={() => { setMdpForm({id:u.id, nouveau_mdp:''}); setModal('mdp'); }} className="text-yellow-600 hover:bg-yellow-50 p-1.5 rounded"><Key size={14}/></button>
              <button onClick={() => handleDelete(u.id)} className="text-red-500 hover:bg-red-50 p-1.5 rounded"><Trash2 size={14}/></button>
            </div>
          </div>
        ))}
      </div>

      {(modal === 'add' || modal === 'edit') && createPortal(
        <div className="fixed inset-0 z-50">
          <div className="bg-white rounded-2xl shadow-xl" style={{ position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", width: "calc(100% - 32px)", maxWidth: 640, maxHeight: "calc(100vh - 32px)", overflowY: "auto" }}>
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-lg font-semibold">{modal === 'add' ? 'Nouvel utilisateur' : 'Modifier'}</h2>
              <button onClick={() => setModal(null)} className="text-gray-400 text-2xl">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Prénom</label><input className="input" value={form.prenom} onChange={e => setForm(f=>({...f,prenom:e.target.value}))} /></div>
                <div><label className="label">Nom *</label><input className="input" value={form.nom} onChange={e => setForm(f=>({...f,nom:e.target.value}))} required /></div>
              </div>
              <div><label className="label">Email *</label><input type="email" className="input" value={form.email} onChange={e => setForm(f=>({...f,email:e.target.value}))} required /></div>
              {modal === 'add' && <div><label className="label">Mot de passe *</label><input type="password" className="input" value={form.mot_de_passe} onChange={e => setForm(f=>({...f,mot_de_passe:e.target.value}))} required minLength={6} /></div>}
              <div>
                <label className="label">Rôle *</label>
                <select className="input" value={form.role} onChange={e => setForm(f=>({...f,role:e.target.value}))}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              {modal === 'edit' && (
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="actif_u" checked={!!form.actif} onChange={e => setForm(f=>({...f,actif:e.target.checked?1:0}))} />
                  <label htmlFor="actif_u" className="text-sm">Utilisateur actif</label>
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" className="btn-secondary" onClick={() => setModal(null)}>Annuler</button>
                <button type="submit" className="btn-primary">Enregistrer</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {modal === 'mdp' && createPortal(
        <div className="fixed inset-0 z-50">
          <div className="bg-white rounded-2xl shadow-xl" style={{ position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", width: "calc(100% - 32px)", maxWidth: 640, maxHeight: "calc(100vh - 32px)", overflowY: "auto" }}>
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-lg font-semibold">Réinitialiser le mot de passe</h2>
              <button onClick={() => setModal(null)} className="text-gray-400 text-2xl">&times;</button>
            </div>
            <form onSubmit={handleResetMdp} className="p-6 space-y-4">
              <div><label className="label">Nouveau mot de passe</label><input type="password" className="input" value={mdpForm.nouveau_mdp} onChange={e => setMdpForm(f=>({...f,nouveau_mdp:e.target.value}))} required minLength={6} /></div>
              <div className="flex justify-end gap-3">
                <button type="button" className="btn-secondary" onClick={() => setModal(null)}>Annuler</button>
                <button type="submit" className="btn-primary">Réinitialiser</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}





