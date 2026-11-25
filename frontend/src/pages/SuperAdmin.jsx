import React, { useState, useEffect, useRef } from 'react';
import { Shield, Building2, Users, Key, Save, Plus, Edit, Trash2, FlaskConical, Camera, CheckCircle, AlertTriangle, Clock, UserCog, SlidersHorizontal } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

const ROLES_CLIENT = ['admin', 'gestionnaire', 'caissier', 'magasinier', 'comptable'];
const emptyUser = { nom: '', prenom: '', email: '', mot_de_passe: '', role: 'admin', actif: 1 };

export default function SuperAdmin() {
  const [tab, setTab] = useState('entreprise');
  const [seeding, setSeeding] = useState(false);
  const [entreprise, setEntreprise] = useState({ nom: '', adresse: '', telephone: '', email: '', nif: '', rccm: '', slogan: '', logo: null });
  const [logoPreview, setLogoPreview] = useState(null);
  const [cachetPreview, setCachetPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const logoInputRef = useRef(null);
  const cachetInputRef = useRef(null);
  const [users, setUsers] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyUser);
  const [mdpForm, setMdpForm] = useState({ id: null, nouveau_mdp: '' });
  const [licence, setLicence] = useState(null);
  const [licKey, setLicKey]   = useState('');
  const [activating, setActivating] = useState(false);
  const [genForm, setGenForm] = useState({ client: '', type: 'full', days: 365, machine_id: '' });
  const [monMachineId, setMonMachineId] = useState('');
  const [copiedMachineId, setCopiedMachineId] = useState(false);
  const [compte, setCompte] = useState({ nom: '', prenom: '', email: '', ancien_mdp: '', nouveau_mdp: '', confirm_mdp: '' });
  const [savingCompte, setSavingCompte] = useState(false);
  const [genResult, setGenResult] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [savingFeat, setSavingFeat] = useState(false);

  useEffect(() => {
    api.get('/superadmin/entreprise').then(r => setEntreprise(r.data)).catch(() => {});
    api.get('/users').then(r => setUsers(r.data)).catch(() => {});
    api.get('/licence/status').then(r => setLicence(r.data)).catch(() => {});
    api.get('/licence/machine-id').then(r => setMonMachineId(r.data.machineId)).catch(() => {});
    api.get('/auth/me').then(r => setCompte(c => ({ ...c, nom: r.data.nom, prenom: r.data.prenom, email: r.data.email }))).catch(() => {});
  }, []);

  // Fonctionnalités activables/désactivables par client (ex: un magasin simple n'a pas besoin
  // de vente mélange, de facture sans vente en caisse, etc.) — même code pour tout le monde,
  // juste des interrupteurs, pas besoin de maintenir un autre build séparé.
  function toggleFeat(key) {
    setEntreprise(e => ({ ...e, [key]: e[key] ? 0 : 1 }));
  }
  async function saveFonctionnalites() {
    setSavingFeat(true);
    try {
      await api.put('/superadmin/fonctionnalites', {
        feat_vente_melange: entreprise.feat_vente_melange,
        feat_facturation_sans_vente: entreprise.feat_facturation_sans_vente,
        feat_modifier_prix_caisse: entreprise.feat_modifier_prix_caisse,
        feat_vente_conditionnement: entreprise.feat_vente_conditionnement,
        feat_vente_credit: entreprise.feat_vente_credit,
        feat_multi_tickets: entreprise.feat_multi_tickets,
        feat_achats_correction: entreprise.feat_achats_correction,
        feat_rapports: entreprise.feat_rapports,
        feat_module_inventaires: entreprise.feat_module_inventaires,
        feat_module_facturation: entreprise.feat_module_facturation,
        feat_module_caisse: entreprise.feat_module_caisse,
        feat_module_clients: entreprise.feat_module_clients,
        feat_module_dgi: entreprise.feat_module_dgi,
        feat_module_sauvegarde: entreprise.feat_module_sauvegarde,
        feat_module_location: entreprise.feat_module_location,
        feat_module_restauration: entreprise.feat_module_restauration,
      });
      toast.success('Fonctionnalités mises à jour');
    } catch (err) { toast.error(err.response?.data?.message || 'Erreur'); }
    finally { setSavingFeat(false); }
  }

  async function handleSaveCompte(e) {
    e.preventDefault();
    if (compte.nouveau_mdp && compte.nouveau_mdp !== compte.confirm_mdp)
      return toast.error('Les mots de passe ne correspondent pas');
    setSavingCompte(true);
    try {
      await api.put('/superadmin/compte', {
        nom:        compte.nom,
        prenom:     compte.prenom,
        email:      compte.email,
        ancien_mdp: compte.ancien_mdp || undefined,
        nouveau_mdp: compte.nouveau_mdp || undefined,
      });
      toast.success('Compte mis à jour');
      setCompte(c => ({ ...c, ancien_mdp: '', nouveau_mdp: '', confirm_mdp: '' }));
    } catch(err) { toast.error(err.response?.data?.message || 'Erreur'); }
    finally { setSavingCompte(false); }
  }

  async function handleGenerateLicence(e) {
    e.preventDefault();
    setGenerating(true);
    setGenResult(null);
    try {
      const res = await api.post('/licence/generate', genForm);
      setGenResult(res.data);
      setCopied(false);
    } catch(err) { toast.error(err.response?.data?.message || 'Erreur'); }
    finally { setGenerating(false); }
  }

  function copyKey() {
    if (!genResult) return;
    navigator.clipboard.writeText(genResult.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  function copyMachineId() {
    if (!monMachineId) return;
    navigator.clipboard.writeText(monMachineId);
    setCopiedMachineId(true);
    setTimeout(() => setCopiedMachineId(false), 2500);
  }

  async function handleActivateLicence(e) {
    e.preventDefault();
    if (!licKey.trim()) return;
    setActivating(true);
    try {
      const res = await api.post('/licence/activate', { key: licKey });
      toast.success(res.data.message);
      setLicKey('');
      api.get('/licence/status').then(r => setLicence(r.data));
    } catch(err) { toast.error(err.response?.data?.message || 'Clé invalide'); }
    finally { setActivating(false); }
  }

  async function handleSeedDemo() {
    if (!confirm('Créer les données de démonstration (rayons + articles électronique) ? Les anciens articles DEMO seront remplacés.')) return;
    setSeeding(true);
    try {
      const r = await api.post('/superadmin/seed-demo');
      toast.success(r.data.message);
    } catch (err) { toast.error(err.response?.data?.message || 'Erreur'); }
    setSeeding(false);
  }

  async function handleLogoChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setLogoPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('logo', file);
      const res = await api.post('/superadmin/entreprise/logo', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setEntreprise(s => ({ ...s, logo: res.data.logo }));
      toast.success('Logo enregistré');
    } catch { toast.error('Erreur upload logo'); }
    setUploading(false);
  }

  async function handleCachetChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setCachetPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('cachet', file);
      const res = await api.post('/superadmin/entreprise/cachet', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setEntreprise(s => ({ ...s, cachet: res.data.cachet }));
      toast.success('Cachet enregistré');
    } catch { toast.error('Erreur upload cachet'); }
    setUploading(false);
  }

  async function saveEntreprise(e) {
    e.preventDefault();
    try {
      await api.put('/superadmin/entreprise', entreprise);
      toast.success('Informations entreprise enregistrées');
    } catch { toast.error('Erreur lors de la sauvegarde'); }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      if (modal === 'add') { await api.post('/users', form); toast.success('Compte créé'); }
      else { await api.put(`/users/${form.id}`, form); toast.success('Compte mis à jour'); }
      setModal(null);
      api.get('/users').then(r => setUsers(r.data));
    } catch (err) { toast.error(err.response?.data?.message || 'Erreur'); }
  }

  async function handleResetMdp(e) {
    e.preventDefault();
    try {
      await api.put(`/users/${mdpForm.id}/password`, { nouveau_mdp: mdpForm.nouveau_mdp });
      toast.success('Mot de passe modifié');
      setModal(null);
    } catch { toast.error('Erreur'); }
  }

  async function handleDelete(id) {
    if (!confirm('Désactiver ce compte ?')) return;
    try {
      await api.delete(`/users/${id}`);
      toast.success('Compte désactivé');
      api.get('/users').then(r => setUsers(r.data));
    } catch (err) { toast.error(err.response?.data?.message || 'Erreur'); }
  }

  const roleColors = { admin: 'badge-red', gestionnaire: 'badge-blue', caissier: 'badge-green', magasinier: 'badge-yellow', comptable: 'badge-gray', super_admin: 'badge-red' };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
          <Shield size={22} className="text-red-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Super Administration</h1>
          <p className="text-sm text-gray-500">Espace réservé au gestionnaire de la solution</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 overflow-x-auto scrollbar-hide">
        <button onClick={() => setTab('entreprise')} className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'entreprise' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          <Building2 size={16} /> Entreprise cliente
        </button>
        <button onClick={() => setTab('comptes')} className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'comptes' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          <Users size={16} /> Comptes utilisateurs
        </button>
        <button onClick={() => setTab('demo')} className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'demo' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          <FlaskConical size={16} /> Données de démo
        </button>
        <button onClick={() => setTab('options')} className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'options' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          <SlidersHorizontal size={16} /> Options
        </button>
        <button onClick={() => setTab('compte')} className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'compte' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          <UserCog size={16} /> Mon compte
        </button>
        <button onClick={() => setTab('licence')} className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'licence' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          <Key size={16} /> Licence
          {licence && licence.type !== 'full' && <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full font-bold ${licence.expired ? 'bg-red-100 text-red-600' : licence.days_left <= 7 ? 'bg-orange-100 text-orange-600' : 'bg-yellow-100 text-yellow-700'}`}>{licence.expired ? 'Expirée' : `${licence.days_left}j`}</span>}
        </button>
      </div>

      {/* ── ENTREPRISE ── */}
      {tab === 'entreprise' && (
        <div className="card max-w-2xl">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Building2 size={18} /> Informations de l'entreprise</h2>
          <p className="text-sm text-gray-500 mb-4">Ces informations apparaissent sur toutes les factures et documents générés par l'application.</p>
          <form onSubmit={saveEntreprise} className="space-y-4">
            {/* Logo */}
            <div className="flex items-center gap-5">
              <div
                className="relative w-24 h-24 rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center cursor-pointer overflow-hidden hover:border-blue-400 transition-colors"
                onClick={() => logoInputRef.current?.click()}
              >
                {(logoPreview || entreprise.logo) ? (
                  <img src={logoPreview || entreprise.logo} alt="Logo" className="w-full h-full object-contain p-1" />
                ) : (
                  <div className="flex flex-col items-center gap-1 text-gray-400">
                    <Camera size={24} />
                    <span className="text-xs text-center leading-tight">Logo</span>
                  </div>
                )}
                {uploading && <div className="absolute inset-0 bg-white/70 flex items-center justify-center text-xs text-blue-600">...</div>}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">Logo de l'entreprise</p>
                <p className="text-xs text-gray-400 mt-0.5">Apparaît sur les factures et tickets<br/>JPG, PNG — max 5 Mo</p>
                <button type="button" onClick={() => logoInputRef.current?.click()} className="btn-secondary btn-sm mt-2">Choisir un logo</button>
              </div>
              <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
            </div>

            {/* Cachet */}
            <div className="flex items-center gap-5">
              <div
                className="relative w-24 h-24 rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center cursor-pointer overflow-hidden hover:border-blue-400 transition-colors"
                onClick={() => cachetInputRef.current?.click()}
              >
                {(cachetPreview || entreprise.cachet) ? (
                  <img src={cachetPreview || entreprise.cachet} alt="Cachet" className="w-full h-full object-contain p-1" />
                ) : (
                  <div className="flex flex-col items-center gap-1 text-gray-400">
                    <Camera size={24} />
                    <span className="text-xs text-center leading-tight">Cachet</span>
                  </div>
                )}
                {uploading && <div className="absolute inset-0 bg-white/70 flex items-center justify-center text-xs text-blue-600">...</div>}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">Cachet / Tampon du magasin</p>
                <p className="text-xs text-gray-400 mt-0.5">Apparaît en bas des factures et reçus<br/>PNG avec fond transparent recommandé</p>
                <button type="button" onClick={() => cachetInputRef.current?.click()} className="btn-secondary btn-sm mt-2">Choisir le cachet</button>
              </div>
              <input ref={cachetInputRef} type="file" accept="image/*" className="hidden" onChange={handleCachetChange} />
            </div>

            <div>
              <label className="label">Nom de l'entreprise *</label>
              <input className="input" value={entreprise.nom} onChange={e => setEntreprise(s => ({ ...s, nom: e.target.value }))} required placeholder="Ex: DJIBRIL & FRÈRES SARL" />
            </div>
            <div>
              <label className="label">Slogan / Enseigne</label>
              <input className="input" value={entreprise.slogan || ''} onChange={e => setEntreprise(s => ({ ...s, slogan: e.target.value }))} placeholder="Ex: Votre partenaire de confiance" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Téléphone</label>
                <input className="input" value={entreprise.telephone} onChange={e => setEntreprise(s => ({ ...s, telephone: e.target.value }))} placeholder="+225 07 00 00 00 00" />
              </div>
              <div>
                <label className="label">Email</label>
                <input type="email" className="input" value={entreprise.email} onChange={e => setEntreprise(s => ({ ...s, email: e.target.value }))} placeholder="contact@entreprise.ci" />
              </div>
            </div>
            <div>
              <label className="label">Adresse</label>
              <input className="input" value={entreprise.adresse} onChange={e => setEntreprise(s => ({ ...s, adresse: e.target.value }))} placeholder="Abidjan, Cocody..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">NIF</label>
                <input className="input" value={entreprise.nif} onChange={e => setEntreprise(s => ({ ...s, nif: e.target.value }))} placeholder="CI-ABJ-2024-B-XXXXX" />
              </div>
              <div>
                <label className="label">RCCM</label>
                <input className="input" value={entreprise.rccm} onChange={e => setEntreprise(s => ({ ...s, rccm: e.target.value }))} placeholder="CI-ABJ-2024-B-XXXXX" />
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button type="submit" className="btn-primary flex items-center gap-2"><Save size={16} /> Enregistrer</button>
            </div>
          </form>
        </div>
      )}

      {/* ── COMPTES ── */}
      {tab === 'comptes' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Gérez tous les comptes de ce poste. Créez le compte admin pour le client.</p>
            <button onClick={() => { setForm(emptyUser); setModal('add'); }} className="btn-primary btn-sm flex items-center gap-2">
              <Plus size={16} /> Nouveau compte
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {users.map(u => (
              <div key={u.id} className={`card flex items-start gap-3 ${u.role === 'super_admin' ? 'border-2 border-red-200 bg-red-50' : ''}`}>
                <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${u.role === 'super_admin' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                  {u.role === 'super_admin' ? <Shield size={16} /> : (u.prenom?.[0] || '') + (u.nom?.[0] || '')}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm">{u.prenom} {u.nom}</p>
                  <p className="text-xs text-gray-400 truncate">{u.email}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className={`badge ${roleColors[u.role] || 'badge-gray'}`}>{u.role}</span>
                    <span className={`badge ${u.actif ? 'badge-green' : 'badge-red'}`}>{u.actif ? 'Actif' : 'Inactif'}</span>
                  </div>
                </div>
                {u.role !== 'super_admin' && (
                  <div className="flex flex-col gap-1">
                    <button onClick={() => { setForm({ ...u, mot_de_passe: '' }); setModal('edit'); }} className="text-blue-600 hover:bg-blue-50 p-1.5 rounded"><Edit size={13} /></button>
                    <button onClick={() => { setMdpForm({ id: u.id, nouveau_mdp: '' }); setModal('mdp'); }} className="text-yellow-600 hover:bg-yellow-50 p-1.5 rounded"><Key size={13} /></button>
                    <button onClick={() => handleDelete(u.id)} className="text-red-500 hover:bg-red-50 p-1.5 rounded"><Trash2 size={13} /></button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── DÉMO ── */}
      {tab === 'demo' && (
        <div className="card max-w-xl">
          <h2 className="text-lg font-semibold mb-2 flex items-center gap-2"><FlaskConical size={18} /> Données de démonstration</h2>
          <p className="text-sm text-gray-500 mb-6">Génère un jeu de données complet pour un magasin électronique/informatique : <strong>12 rayons</strong> et <strong>50 articles</strong> avec stocks, prix d'achat et de vente.</p>
          <div className="grid grid-cols-2 gap-3 mb-6 text-center text-sm">
            {[['12','Rayons'],['50','Articles'],['Laptops, PC, Phones','Catégories'],['Stocks réels','Quantités']].map(([v,l]) => (
              <div key={l} className="bg-blue-50 rounded-xl p-3">
                <p className="font-bold text-blue-700">{v}</p>
                <p className="text-blue-600 text-xs">{l}</p>
              </div>
            ))}
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700 mb-4">
            ⚠️ Les anciens articles avec le préfixe DEMO- seront supprimés et recréés. Tes données clients et ventes ne sont pas touchées.
          </div>
          <button onClick={handleSeedDemo} disabled={seeding} className="btn-primary w-full justify-center disabled:opacity-50">
            {seeding ? 'Création en cours...' : <><FlaskConical size={16} /> Créer les données de démo</>}
          </button>
        </div>
      )}

      {/* ── OPTIONS ── */}
      {tab === 'options' && (
        <div className="card max-w-2xl space-y-6">
          <div>
            <h2 className="text-lg font-semibold mb-1 flex items-center gap-2"><SlidersHorizontal size={18} /> Options du logiciel</h2>
            <p className="text-sm text-gray-500">Configure exactement ce dont ce client a besoin — les modules désactivés disparaissent du menu et leurs URLs sont bloquées.</p>
          </div>

          {/* ── Groupe 1 : Modules ── */}
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <span className="flex-1 h-px bg-gray-100"></span> Modules <span className="flex-1 h-px bg-gray-100"></span>
            </h3>
            <div className="space-y-2">
              {[
                ['feat_module_caisse',      '🛒 Caisse / Point de vente',   'Module de vente, tickets de caisse, sessions, multi-tickets'],
                ['feat_module_facturation', '🧾 Facturation',               'Factures, proformas, avoirs, reçus clients'],
                ['feat_module_clients',     '👥 Clients & Créances',        'Fiche client, suivi des crédits et paiements clients'],
                ['feat_module_inventaires', '📋 Inventaires physiques',     'Comptage physique du stock, ajustements, rapports d\'inventaire'],
                ['feat_module_location',   '🎪 Événementiel / Location',   'Gestion de la location de matériel événementiel (chaises, vaisselle, bâches...)'],
                ['feat_module_restauration','🍽️ Restauration',              'Carte, tables, commandes sur place / à emporter / livraison, cuisine et encaissement'],
                ['feat_rapports',           '📊 Rapports & Statistiques',   'Rapports de ventes, marge, remises, mouvements de stock'],
                ['feat_module_dgi',         '🏛️ DGI / Facturation normalisée','Soumission électronique aux impôts (Côte d\'Ivoire)'],
                ['feat_module_sauvegarde',  '💾 Sauvegarde & Restauration', 'Téléchargement et restauration de la base de données'],
              ].map(([key, label, desc]) => (
                <div key={key} className="flex items-center justify-between gap-4 border border-gray-100 rounded-xl p-3 bg-gray-50/60">
                  <div>
                    <p className="font-medium text-gray-800 text-sm">{label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
                  </div>
                  <button type="button" onClick={() => toggleFeat(key)}
                    className={`shrink-0 w-12 h-7 rounded-full transition-colors relative ${entreprise[key] || entreprise[key] === undefined ? 'bg-blue-500' : 'bg-gray-300'}`}>
                    <span className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-all ${entreprise[key] || entreprise[key] === undefined ? 'left-6' : 'left-1'}`}/>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* ── Groupe 2 : Fonctionnalités avancées ── */}
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <span className="flex-1 h-px bg-gray-100"></span> Fonctionnalités avancées <span className="flex-1 h-px bg-gray-100"></span>
            </h3>
            <div className="space-y-2">
              {[
                ['feat_vente_melange',           'Vente Mélange',                   'Bouton "Mélange" dans la Caisse pour vendre un assortiment de produits'],
                ['feat_facturation_sans_vente',  'Facture directe (Caisse)',         'Créer une facture/proforma/avoir/reçu depuis la Caisse sans passer par une vente'],
                ['feat_modifier_prix_caisse',    'Modifier le prix en Caisse',       'Changer le prix ou la remise d\'un article directement dans le panier'],
                ['feat_vente_conditionnement',   'Vente par conditionnement',        'Choix du format (carton, ½, ¼...) à l\'ajout d\'un produit en Caisse'],
                ['feat_vente_credit',            'Vente à crédit',                  'Option "Crédit" comme mode de règlement en Caisse et dans les documents'],
                ['feat_multi_tickets',           'Multi-tickets (Caisse)',           'Onglets #1/#2/#3 pour gérer plusieurs paniers en attente en même temps'],
                ['feat_achats_correction',       'Correction des achats',            'Boutons "Corriger les articles" et "Supprimer" sur un achat déjà enregistré'],
              ].map(([key, label, desc]) => (
                <div key={key} className="flex items-center justify-between gap-4 border border-gray-200 rounded-xl p-3">
                  <div>
                    <p className="font-medium text-gray-800 text-sm">{label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
                  </div>
                  <button type="button" onClick={() => toggleFeat(key)}
                    className={`shrink-0 w-12 h-7 rounded-full transition-colors relative ${entreprise[key] ? 'bg-green-500' : 'bg-gray-300'}`}>
                    <span className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-all ${entreprise[key] ? 'left-6' : 'left-1'}`}/>
                  </button>
                </div>
              ))}
            </div>
          </div>

          <button onClick={saveFonctionnalites} disabled={savingFeat} className="btn-primary w-full justify-center disabled:opacity-50">
            {savingFeat ? 'Enregistrement...' : <><Save size={16} /> Enregistrer les options</>}
          </button>
        </div>
      )}

      {/* ── MON COMPTE ── */}
      {tab === 'compte' && (
        <div className="card max-w-xl space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-md">
              <UserCog size={20} className="text-white"/>
            </div>
            <div>
              <h2 className="font-bold text-gray-900">Mon compte Super Admin</h2>
              <p className="text-xs text-gray-400 mt-0.5">Modifiez vos informations de connexion</p>
            </div>
          </div>

          <form onSubmit={handleSaveCompte} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Prénom</label>
                <input className="input" value={compte.prenom}
                  onChange={e => setCompte(c => ({ ...c, prenom: e.target.value }))} />
              </div>
              <div>
                <label className="label">Nom</label>
                <input className="input" value={compte.nom}
                  onChange={e => setCompte(c => ({ ...c, nom: e.target.value }))} required />
              </div>
            </div>
            <div>
              <label className="label">Email de connexion</label>
              <input type="email" className="input" value={compte.email}
                onChange={e => setCompte(c => ({ ...c, email: e.target.value }))} required />
            </div>

            <div className="border-t border-gray-100 pt-4">
              <p className="text-sm font-semibold text-gray-700 mb-3">Changer le mot de passe <span className="text-gray-400 font-normal">(facultatif)</span></p>
              <div className="space-y-3">
                <div>
                  <label className="label">Ancien mot de passe</label>
                  <input type="password" className="input" value={compte.ancien_mdp}
                    onChange={e => setCompte(c => ({ ...c, ancien_mdp: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Nouveau mot de passe</label>
                  <input type="password" className="input" value={compte.nouveau_mdp}
                    onChange={e => setCompte(c => ({ ...c, nouveau_mdp: e.target.value }))} minLength={6} />
                </div>
                <div>
                  <label className="label">Confirmer le nouveau mot de passe</label>
                  <input type="password" className="input" value={compte.confirm_mdp}
                    onChange={e => setCompte(c => ({ ...c, confirm_mdp: e.target.value }))} />
                </div>
              </div>
            </div>

            <button type="submit" disabled={savingCompte} className="btn-primary w-full justify-center gap-2">
              <Save size={16}/> {savingCompte ? 'Enregistrement…' : 'Enregistrer les modifications'}
            </button>
          </form>
        </div>
      )}

      {/* ── LICENCE ── */}
      {tab === 'licence' && (
        <div className="flex flex-col gap-5 max-w-2xl">

          {/* Statut */}
          {licence && (
            <div className={`card flex items-center gap-4 py-4 border-2 ${
              licence.expired         ? 'border-red-200 bg-red-50'     :
              licence.type === 'full' ? 'border-green-200 bg-green-50' :
              licence.days_left <= 7  ? 'border-orange-200 bg-orange-50' :
                                        'border-yellow-200 bg-yellow-50'}`}>
              {licence.expired         ? <AlertTriangle size={32} className="text-red-500 flex-shrink-0"/> :
               licence.type === 'full' ? <CheckCircle   size={32} className="text-green-500 flex-shrink-0"/> :
                                         <Clock         size={32} className="text-yellow-600 flex-shrink-0"/>}
              <div>
                <p className="font-bold text-gray-900 text-base">
                  {licence.expired         ? 'Licence expirée'         :
                   licence.type === 'full' ? 'Licence complète active' :
                   `Évaluation — ${licence.days_left} jour${licence.days_left > 1 ? 's' : ''} restant${licence.days_left > 1 ? 's' : ''}`}
                </p>
                <p className="text-sm text-gray-500 mt-0.5">
                  {licence.type === 'full' && licence.client ? `Client : ${licence.client} · ` : ''}
                  Expire le {new Date(licence.expires_at).toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' })}
                </p>
              </div>
            </div>
          )}

          {/* ID Machine de CE poste — à communiquer au fournisseur pour verrouiller sa licence ici */}
          <div className="card bg-gray-50 border border-gray-200">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">ID de ce poste</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono text-lg font-bold text-gray-800 bg-white border border-gray-200 rounded-xl px-3 py-2 select-all">
                {monMachineId || '…'}
              </code>
              <button type="button" onClick={copyMachineId} disabled={!monMachineId}
                className={`px-4 py-2 rounded-xl text-sm font-bold transition disabled:opacity-40 ${copiedMachineId ? 'bg-green-500 text-white' : 'bg-gray-700 text-white hover:bg-gray-800'}`}>
                {copiedMachineId ? '✓ Copié' : 'Copier'}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">Envoyez ce code par WhatsApp/email au fournisseur du logiciel s'il doit générer une licence verrouillée sur ce poste précis.</p>
          </div>

          {/* Générateur */}
          <div className="card space-y-4">
            <h3 className="font-bold text-gray-800 flex items-center gap-2 text-base"><Key size={17}/> Générer une clé pour un client</h3>
            <form onSubmit={handleGenerateLicence} className="space-y-3">
              <div>
                <label className="label">Nom du client</label>
                <input className="input" placeholder="Ex: Cartouches Express SARL"
                  value={genForm.client} onChange={e => setGenForm(f => ({ ...f, client: e.target.value }))} required />
              </div>
              <div>
                <label className="label">ID Machine du client <span className="text-gray-400 font-normal text-xs">(optionnel — verrouille la clé sur ce poste précis)</span></label>
                <input className="input font-mono" placeholder="Ex: A1B2-C3D4-E5F6 (reçu par WhatsApp/email du client)"
                  value={genForm.machine_id} onChange={e => setGenForm(f => ({ ...f, machine_id: e.target.value }))} />
                <p className="text-xs text-gray-400 mt-1">Laissez vide pour une clé utilisable sur n'importe quel poste (moins sûr).</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Type</label>
                  <select className="input" value={genForm.type} onChange={e => setGenForm(f => ({ ...f, type: e.target.value }))}>
                    <option value="full">Licence complète</option>
                    <option value="trial">Évaluation</option>
                  </select>
                </div>
                <div>
                  <label className="label">Durée</label>
                  <select className="input" value={genForm.days} onChange={e => setGenForm(f => ({ ...f, days: parseInt(e.target.value) }))}>
                    <option value={30}>30 jours (1 mois)</option>
                    <option value={90}>90 jours (3 mois)</option>
                    <option value={180}>180 jours (6 mois)</option>
                    <option value={365}>1 an</option>
                    <option value={730}>2 ans</option>
                    <option value={36159}>Permanent</option>
                  </select>
                </div>
              </div>
              <button type="submit" disabled={generating || !genForm.client.trim()} className="btn-primary w-full justify-center gap-2">
                <Key size={16}/> {generating ? 'Génération…' : 'Générer la clé'}
              </button>
            </form>

            {/* Résultat — toujours visible juste sous le bouton */}
            {genResult ? (
              <div className="bg-indigo-50 border-2 border-indigo-300 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-sm font-bold text-indigo-800">
                    ✓ Clé pour <span>{genResult.client}</span> — expire le {new Date(genResult.expiresAt).toLocaleDateString('fr-FR')}
                  </p>
                  <button onClick={copyKey}
                    className={`px-4 py-1.5 rounded-xl text-sm font-bold transition ${copied ? 'bg-green-500 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                    {copied ? '✓ Copié !' : 'Copier'}
                  </button>
                </div>
                <textarea readOnly rows={3}
                  className="w-full font-mono text-xs bg-white border border-indigo-200 rounded-xl p-3 text-gray-800 select-all resize-none focus:outline-none"
                  value={genResult.key} onClick={e => e.target.select()}/>
                <p className="text-xs text-indigo-600">Cliquez dans le champ ci-dessus pour tout sélectionner, puis copiez et envoyez au client.</p>
                <p className={`text-xs font-semibold ${genResult.machineId ? 'text-green-700' : 'text-orange-600'}`}>
                  {genResult.machineId
                    ? `🔒 Verrouillée sur le poste ${genResult.machineId} — inutilisable ailleurs`
                    : '⚠ Non verrouillée — utilisable sur n\'importe quel poste'}
                </p>
              </div>
            ) : (
              <div className="border-2 border-dashed border-gray-200 rounded-2xl p-4 text-center text-sm text-gray-400">
                La clé générée apparaîtra ici
              </div>
            )}
          </div>

          {/* Activation */}
          <div className="card space-y-3">
            <h3 className="font-bold text-gray-800 flex items-center gap-2 text-base"><Key size={17}/> Activer une licence sur cette installation</h3>
            <form onSubmit={handleActivateLicence} className="space-y-3">
              <textarea className="input font-mono text-xs resize-none" rows={3}
                value={licKey} onChange={e => setLicKey(e.target.value)}
                placeholder="Collez ici la clé de licence..." required />
              <button type="submit" disabled={activating || !licKey.trim()} className="btn-primary w-full justify-center gap-2">
                <Key size={16}/> {activating ? 'Activation…' : 'Activer la licence'}
              </button>
            </form>
          </div>

        </div>
      )}

      {/* Modal ajout/édition */}
      {(modal === 'add' || modal === 'edit') && (
        <div className="fixed inset-0 z-50">
          <div className="bg-white rounded-2xl shadow-xl" style={{ position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", width: "calc(100% - 32px)", maxWidth: 640, maxHeight: "calc(100vh - 32px)", overflowY: "auto" }}>
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-lg font-semibold">{modal === 'add' ? 'Nouveau compte' : 'Modifier le compte'}</h2>
              <button onClick={() => setModal(null)} className="text-gray-400 text-2xl">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Prénom</label><input className="input" value={form.prenom} onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))} /></div>
                <div><label className="label">Nom *</label><input className="input" value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} required /></div>
              </div>
              <div><label className="label">Email *</label><input type="email" className="input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required /></div>
              {modal === 'add' && <div><label className="label">Mot de passe *</label><input type="password" className="input" value={form.mot_de_passe} onChange={e => setForm(f => ({ ...f, mot_de_passe: e.target.value }))} required minLength={6} /></div>}
              <div>
                <label className="label">Rôle *</label>
                <select className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                  {ROLES_CLIENT.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              {modal === 'edit' && (
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="actif_sa" checked={!!form.actif} onChange={e => setForm(f => ({ ...f, actif: e.target.checked ? 1 : 0 }))} />
                  <label htmlFor="actif_sa" className="text-sm">Compte actif</label>
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" className="btn-secondary" onClick={() => setModal(null)}>Annuler</button>
                <button type="submit" className="btn-primary">Enregistrer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal mot de passe */}
      {modal === 'mdp' && (
        <div className="fixed inset-0 z-50">
          <div className="bg-white rounded-2xl shadow-xl" style={{ position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", width: "calc(100% - 32px)", maxWidth: 640, maxHeight: "calc(100vh - 32px)", overflowY: "auto" }}>
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-lg font-semibold">Changer le mot de passe</h2>
              <button onClick={() => setModal(null)} className="text-gray-400 text-2xl">&times;</button>
            </div>
            <form onSubmit={handleResetMdp} className="p-6 space-y-4">
              <div><label className="label">Nouveau mot de passe</label><input type="password" className="input" value={mdpForm.nouveau_mdp} onChange={e => setMdpForm(f => ({ ...f, nouveau_mdp: e.target.value }))} required minLength={6} /></div>
              <div className="flex justify-end gap-3">
                <button type="button" className="btn-secondary" onClick={() => setModal(null)}>Annuler</button>
                <button type="submit" className="btn-primary">Modifier</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}





