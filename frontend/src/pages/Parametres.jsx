import React, { useState, useEffect, useRef } from 'react';
import { Settings, Building2, Save, CheckCircle, Camera, KeyRound, Lock } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

export default function Parametres() {
  const [form, setForm]         = useState({ nom:'', adresse:'', telephone:'', email:'', nif:'', rccm:'', slogan:'', logo:null, cachet:null });
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [logoPreview, setLogoPreview]     = useState(null);
  const [cachetPreview, setCachetPreview] = useState(null);
  const logoInputRef   = useRef(null);
  const cachetInputRef = useRef(null);
  const [machineId, setMachineId] = useState('');
  const [copiedMachineId, setCopiedMachineId] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [savingPin, setSavingPin] = useState(false);

  useEffect(() => {
    api.get('/superadmin/entreprise').then(r => setForm(r.data)).catch(() => {});
    api.get('/licence/machine-id').then(r => setMachineId(r.data.machineId)).catch(() => {});
  }, []);

  function copyMachineId() {
    if (!machineId) return;
    navigator.clipboard.writeText(machineId);
    setCopiedMachineId(true);
    setTimeout(() => setCopiedMachineId(false), 2500);
  }

  async function uploadImage(file, field, inputName, setPreview) {
    setPreview(URL.createObjectURL(file));
    try {
      const fd = new FormData();
      fd.append(inputName, file);
      const res = await api.post(`/superadmin/entreprise/${inputName}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setForm(f => ({ ...f, [field]: res.data[field] }));
      toast.success(field === 'logo' ? 'Logo enregistré' : 'Cachet enregistré');
    } catch { toast.error('Erreur upload'); }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/superadmin/entreprise', form);
      toast.success('Paramètres enregistrés');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  }

  async function handleSetPin(e) {
    e.preventDefault();
    if (!pinInput.trim()) return;
    setSavingPin(true);
    try {
      await api.put('/superadmin/entreprise', { ...form, historique_pin: pinInput.trim() });
      setForm(f => ({ ...f, historique_pin_actif: true }));
      setPinInput('');
      toast.success('Code PIN enregistré');
    } catch { toast.error('Erreur lors de l\'enregistrement du PIN'); }
    finally { setSavingPin(false); }
  }

  async function handleClearPin() {
    if (!window.confirm('Désactiver la protection par PIN sur Historique Vente et Historique Achat ?')) return;
    setSavingPin(true);
    try {
      await api.put('/superadmin/entreprise', { ...form, clear_historique_pin: true });
      setForm(f => ({ ...f, historique_pin_actif: false }));
      toast.success('Protection PIN désactivée');
    } catch { toast.error('Erreur lors de la désactivation'); }
    finally { setSavingPin(false); }
  }

  function ImageZone({ preview, stored, label, inputRef, onPick }) {
    return (
      <div className="flex items-center gap-4">
        <div
          onClick={() => inputRef.current?.click()}
          className="relative w-24 h-24 rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center cursor-pointer overflow-hidden hover:border-blue-400 transition-colors flex-shrink-0"
        >
          {(preview || stored)
            ? <img src={preview || stored} alt={label} className="w-full h-full object-contain p-1" />
            : <div className="flex flex-col items-center gap-1 text-gray-400"><Camera size={22}/><span className="text-xs">{label}</span></div>
          }
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-800">{label}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {label === 'Logo' ? 'En-tête des factures et tickets' : 'Bas des factures et documents'}
            <br/>PNG, JPG — max 5 Mo
          </p>
          <button type="button" onClick={() => inputRef.current?.click()} className="btn-secondary btn-sm mt-2">
            {(preview || stored) ? 'Changer' : 'Choisir'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl animate-fade-in">

      <div>
        <h1 className="page-title flex items-center gap-2"><Settings size={22}/> Paramètres</h1>
        <p className="page-sub">Configurez les informations de votre entreprise</p>
      </div>

      {/* Images */}
      <div className="card space-y-5">
        <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center shadow-md">
            <Camera size={20} className="text-white"/>
          </div>
          <div>
            <h2 className="font-bold text-gray-900">Logo & Cachet</h2>
            <p className="text-xs text-gray-400 mt-0.5">Visuels imprimés sur les factures et tickets</p>
          </div>
        </div>

        <ImageZone
          preview={logoPreview}
          stored={form.logo}
          label="Logo"
          inputRef={logoInputRef}
          onPick={() => logoInputRef.current?.click()}
        />
        <input ref={logoInputRef} type="file" accept="image/*" className="hidden"
          onChange={e => e.target.files[0] && uploadImage(e.target.files[0], 'logo', 'logo', setLogoPreview)} />

        <div className="border-t border-gray-100 pt-4">
          <ImageZone
            preview={cachetPreview}
            stored={form.cachet}
            label="Cachet / Tampon"
            inputRef={cachetInputRef}
            onPick={() => cachetInputRef.current?.click()}
          />
          <input ref={cachetInputRef} type="file" accept="image/*" className="hidden"
            onChange={e => e.target.files[0] && uploadImage(e.target.files[0], 'cachet', 'cachet', setCachetPreview)} />
        </div>
      </div>

      {/* Infos entreprise */}
      <div className="card">
        <div className="flex items-center gap-3 mb-6 pb-5 border-b border-gray-100">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-md">
            <Building2 size={20} className="text-white"/>
          </div>
          <div>
            <h2 className="font-bold text-gray-900">Informations de l'entreprise</h2>
            <p className="text-xs text-gray-400 mt-0.5">Ces informations s'affichent sur les tickets et les documents imprimés</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Nom de l'entreprise *</label>
            <input className="input" required value={form.nom}
              onChange={e => setForm(f => ({...f, nom: e.target.value}))}
              placeholder="Ex : MYBOGO SARL, Supermarché Central..." />
          </div>
          <div>
            <label className="label">Slogan / Enseigne</label>
            <input className="input" value={form.slogan || ''}
              onChange={e => setForm(f => ({...f, slogan: e.target.value}))}
              placeholder="Ex : Votre partenaire de confiance" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Téléphone</label>
              <input className="input" value={form.telephone}
                onChange={e => setForm(f => ({...f, telephone: e.target.value}))}
                placeholder="+225 07 00 00 00 00" />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" value={form.email}
                onChange={e => setForm(f => ({...f, email: e.target.value}))}
                placeholder="contact@monentreprise.com" />
            </div>
          </div>

          <div>
            <label className="label">Adresse</label>
            <input className="input" value={form.adresse}
              onChange={e => setForm(f => ({...f, adresse: e.target.value}))}
              placeholder="Ex : Abidjan, Cocody – Riviera 3" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">NIF</label>
              <input className="input" value={form.nif}
                onChange={e => setForm(f => ({...f, nif: e.target.value}))}
                placeholder="CI-ABJ-2024-B-XXXXX" />
            </div>
            <div>
              <label className="label">RCCM</label>
              <input className="input" value={form.rccm}
                onChange={e => setForm(f => ({...f, rccm: e.target.value}))}
                placeholder="CI-ABJ-2024-B-XXXXX" />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button type="submit" disabled={saving}
              className={`btn-primary gap-2 ${saved ? 'bg-green-600 hover:bg-green-700' : ''}`}
              style={saved ? { background: 'linear-gradient(135deg,#10b981,#059669)' } : {}}>
              {saved
                ? <><CheckCircle size={16}/> Enregistré</>
                : <><Save size={16}/> {saving ? 'Enregistrement…' : 'Enregistrer'}</>
              }
            </button>
          </div>
        </form>
      </div>

      {/* Code PIN protégeant Historique Vente et Historique Achat */}
      <div className="card max-w-2xl">
        <h2 className="text-lg font-semibold mb-2 flex items-center gap-2"><Lock size={18}/> Protection par code PIN</h2>
        <p className="text-sm text-gray-500 mb-4">
          Si un code est défini, il sera demandé à tout le monde (y compris vous) pour ouvrir <b>Ventes → Historique</b> et <b>Achats → Historique</b>.
          Laissez le champ vide pour ne pas changer un code déjà en place.
        </p>
        <div className={`flex items-center gap-2 mb-4 text-sm font-medium ${form.historique_pin_actif ? 'text-emerald-700' : 'text-gray-400'}`}>
          <span className={`w-2 h-2 rounded-full ${form.historique_pin_actif ? 'bg-emerald-500' : 'bg-gray-300'}`}/>
          {form.historique_pin_actif ? 'Protection activée' : 'Protection désactivée'}
        </div>
        <form onSubmit={handleSetPin} className="flex items-center gap-2">
          <input
            type="password"
            inputMode="numeric"
            className="input w-40"
            placeholder="Nouveau code PIN"
            value={pinInput}
            onChange={e => setPinInput(e.target.value)}
          />
          <button type="submit" disabled={savingPin || !pinInput.trim()} className="btn-primary btn-sm">
            {savingPin ? '...' : 'Enregistrer le PIN'}
          </button>
          {form.historique_pin_actif && (
            <button type="button" onClick={handleClearPin} disabled={savingPin} className="btn-secondary btn-sm">
              Désactiver la protection
            </button>
          )}
        </form>
      </div>

      {/* ID Machine — à communiquer au fournisseur du logiciel pour activer/verrouiller la licence */}
      <div className="card max-w-2xl">
        <h2 className="text-lg font-semibold mb-2 flex items-center gap-2"><KeyRound size={18}/> Identifiant de ce poste</h2>
        <p className="text-sm text-gray-500 mb-4">Communiquez ce code au fournisseur du logiciel (par téléphone, WhatsApp ou email) s'il vous demande de verrouiller votre licence sur cet ordinateur.</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 font-mono text-lg font-bold text-gray-800 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 select-all">
            {machineId || '…'}
          </code>
          <button type="button" onClick={copyMachineId} disabled={!machineId}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition disabled:opacity-40 ${copiedMachineId ? 'bg-green-500 text-white' : 'bg-gray-700 text-white hover:bg-gray-800'}`}>
            {copiedMachineId ? '✓ Copié' : 'Copier'}
          </button>
        </div>
      </div>

    </div>
  );
}
