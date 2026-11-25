import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { LogIn, Eye, EyeOff, Store, ArrowLeft } from 'lucide-react';
import api from '../services/api';

function AppLogo({ size = 72 }) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 16 L20 3 L38 16 Z" fill="#60a5fa"/>
      <path d="M2 16 L20 3 L38 16" stroke="#bfdbfe" strokeWidth="1" strokeLinejoin="round"/>
      <rect x="3" y="16" width="34" height="22" rx="2" fill="#1e40af"/>
      <rect x="3" y="16" width="34" height="6" rx="1" fill="#2563eb"/>
      <line x1="8"  y1="16" x2="8"  y2="22" stroke="#bfdbfe" strokeWidth="1.2" opacity="0.5"/>
      <line x1="14" y1="16" x2="14" y2="22" stroke="#bfdbfe" strokeWidth="1.2" opacity="0.5"/>
      <line x1="20" y1="16" x2="20" y2="22" stroke="#bfdbfe" strokeWidth="1.2" opacity="0.5"/>
      <line x1="26" y1="16" x2="26" y2="22" stroke="#bfdbfe" strokeWidth="1.2" opacity="0.5"/>
      <line x1="32" y1="16" x2="32" y2="22" stroke="#bfdbfe" strokeWidth="1.2" opacity="0.5"/>
      <rect x="4"   y="23" width="10" height="10" rx="1" fill="#1e3a8a"/>
      <line x1="4"  y1="27.5" x2="14" y2="27.5" stroke="#3b82f6" strokeWidth="0.8"/>
      <rect x="5"   y="23.5" width="2.5" height="3.5" rx="0.5" fill="#7dd3fc"/>
      <rect x="8.5" y="23.5" width="2.5" height="3.5" rx="0.5" fill="#86efac"/>
      <rect x="5"   y="28"   width="2.5" height="4.5" rx="0.5" fill="#fde68a"/>
      <rect x="8.5" y="28"   width="2.5" height="4.5" rx="0.5" fill="#f9a8d4"/>
      <rect x="15"  y="26"   width="10" height="12"  rx="1"   fill="#93c5fd" opacity="0.15"/>
      <line x1="20" y1="26" x2="20" y2="38" stroke="#93c5fd" strokeWidth="0.7" opacity="0.4"/>
      <circle cx="17.5" cy="32" r="0.8" fill="#93c5fd" opacity="0.6"/>
      <circle cx="22.5" cy="32" r="0.8" fill="#93c5fd" opacity="0.6"/>
      <rect x="26"  y="23"   width="10" height="10" rx="1" fill="#1e3a8a"/>
      <line x1="26" y1="27.5" x2="36" y2="27.5" stroke="#3b82f6" strokeWidth="0.8"/>
      <rect x="27"  y="23.5" width="2.5" height="3.5" rx="0.5" fill="#fca5a5"/>
      <rect x="30.5" y="23.5" width="2.5" height="3.5" rx="0.5" fill="#c4b5fd"/>
      <rect x="27"  y="28"   width="2.5" height="4.5" rx="0.5" fill="#a5f3fc"/>
      <rect x="30.5" y="28"  width="2.5" height="4.5" rx="0.5" fill="#fed7aa"/>
      <circle cx="20" cy="8" r="2"   fill="#fbbf24"/>
      <circle cx="20" cy="8" r="0.9" fill="#fef3c7"/>
    </svg>
  );
}

export default function Login() {
  const [form, setForm]         = useState({ email: '', mot_de_passe: '', boutique: localStorage.getItem('boutique') || '' });
  const [loading, setLoading]   = useState(false);
  const [showPwd, setShowPwd]   = useState(false);
  const [societe, setSociete]   = useState({ nom: '', slogan: '' });
  const { login }  = useAuth();
  const navigate   = useNavigate();

  function fetchSociete(boutiqueCode) {
    const headers = boutiqueCode ? { 'X-Boutique': boutiqueCode } : {};
    api.get('/public/config', { headers }).then(r => setSociete(r.data)).catch(() => {});
  }

  useEffect(() => { fetchSociete(form.boutique); }, []);

  const nomApp    = societe.nom    || 'Gestion Stock';
  const sloganApp = societe.slogan || 'Votre solution de gestion commerciale';

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await login(form.email, form.mot_de_passe, form.boutique);
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Connexion échouée');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 50%, #1e40af 100%)' }}>

      {/* Panneau gauche décoratif */}
      <div className="hidden lg:flex flex-col justify-center items-center flex-1 p-12 text-white">
        <AppLogo size={120}/>
        <h1 className="text-4xl font-black tracking-wide mt-6 text-white uppercase">{nomApp}</h1>
        <p className="text-blue-300 text-sm tracking-widest uppercase mt-2">{sloganApp}</p>
        <div className="mt-10 space-y-3 text-sm text-blue-200 max-w-xs">
          {['Gestion des ventes en temps réel', 'Suivi du stock automatique', 'Rapports et marges détaillées', 'Sauvegarde automatique des données'].map(f => (
            <div key={f} className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0"/>
              {f}
            </div>
          ))}
        </div>
      </div>

      {/* Formulaire */}
      <div className="flex flex-col justify-center items-center w-full lg:w-auto lg:min-w-[420px] p-6">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8">

          {/* Logo mobile */}
          <div className="flex lg:hidden flex-col items-center mb-6">
            <div className="rounded-3xl p-3 shadow-xl mb-3" style={{ background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)' }}>
              <AppLogo size={56}/>
            </div>
            <h1 className="text-2xl font-black text-gray-900 uppercase">{nomApp}</h1>
            <p className="text-gray-400 text-xs mt-1">{sloganApp}</p>
          </div>

          {/* Logo desktop */}
          <div className="hidden lg:flex flex-col items-center mb-8">
            <div className="rounded-3xl p-3 shadow-xl mb-3" style={{ background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)' }}>
              <AppLogo size={64}/>
            </div>
          </div>

          <button onClick={() => navigate('/accueil')} className="flex items-center gap-1.5 text-gray-400 hover:text-blue-600 text-xs mb-5 transition-colors">
            <ArrowLeft size={13} /> Retour à l'accueil
          </button>

          <h2 className="text-xl font-bold text-gray-900 mb-1">Bienvenue</h2>
          <p className="text-gray-400 text-sm mb-6">Connectez-vous à votre espace</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                autoCapitalize="none" autoCorrect="off" spellCheck={false}
                className="input"
                placeholder="votre@email.com"
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value.trim() }))}
                required autoFocus
              />
            </div>
            <div>
              <label className="label">Mot de passe</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  className="input pr-10"
                  placeholder="••••••••"
                  value={form.mot_de_passe}
                  onChange={e => setForm(p => ({ ...p, mot_de_passe: e.target.value }))}
                  required
                />
                <button type="button" tabIndex={-1}
                  onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPwd ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
            </div>
            {/* Code boutique — facultatif : le gérant est retrouvé automatiquement par son e-mail */}
            <div className="opacity-70">
              <label className="label flex items-center gap-1.5 text-gray-500">
                <Store size={13} className="text-gray-400"/> Code boutique <span className="font-normal text-gray-400">(facultatif)</span>
              </label>
              <input
                type="text"
                autoCapitalize="none" autoCorrect="off" spellCheck={false}
                className="input bg-gray-50 text-gray-500"
                placeholder="Détecté automatiquement"
                value={form.boutique}
                onChange={e => setForm(p => ({ ...p, boutique: e.target.value.toLowerCase().trim() }))}
                onBlur={e => fetchSociete(e.target.value.trim())}
              />
              <p className="text-[11px] text-gray-400 mt-1">Utile seulement pour les employés ajoutés par le gérant.</p>
            </div>
            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 text-white font-bold py-3 rounded-xl transition-all duration-200 shadow-lg disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)' }}>
              <LogIn size={18}/>
              {loading ? 'Connexion…' : 'Se connecter'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
