import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Store, Mail, Lock, CheckCircle, ArrowLeft, CreditCard, Phone, Zap } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

const PLANS = [
  { id: 'mensuel',     label: 'Mensuel',     prix: 12500,  affiche: '12 500',  periode: 'mois' },
  { id: 'trimestriel', label: 'Trimestriel', prix: 35000,  affiche: '35 000',  periode: 'trimestre' },
  { id: 'annuel',      label: 'Annuel',      prix: 125000, affiche: '125 000', periode: 'an' },
];

const METHODES = [
  { id: 'wave',        label: 'Wave',        color: '#1A73E8' },
  { id: 'orange',      label: 'Orange Money', color: '#FF6600' },
  { id: 'mtn',         label: 'MTN MoMo',    color: '#FFCC00' },
  { id: 'moov',        label: 'Moov Money',  color: '#00A651' },
];

export default function Subscribe() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState('form'); // 'form' | 'payment'
  const [loading, setLoading] = useState(false);
  const [waveInfo, setWaveInfo] = useState(null);
  const [form, setForm] = useState({
    slug: '',
    nomBoutique: '',
    email: '',
    motDePasse: '',
    plan: searchParams.get('plan') || 'mensuel',
    methode: 'wave',
  });

  const planChoisi = PLANS.find(p => p.id === form.plan) || PLANS[0];

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  const slugValide = /^[a-z0-9-]+$/.test(form.slug) && form.slug.length >= 3;
  const emailValide = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);
  const mdpValide = form.motDePasse.length >= 6;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!slugValide) return toast.error('Le code boutique doit contenir au moins 3 caractères (lettres minuscules, chiffres, tirets)');
    if (!emailValide) return toast.error('Email invalide');
    if (!mdpValide) return toast.error('Le mot de passe doit contenir au moins 6 caractères');
    setLoading(true);
    try {
      const r = await api.post('/public/abonnement', {
        slug: form.slug,
        nomBoutique: form.nomBoutique,
        email: form.email,
        motDePasse: form.motDePasse,
        plan: form.plan,
        methode: form.methode,
      });
      if (r.data.redirect_url) {
        window.location.href = r.data.redirect_url;
        return;
      }
      setWaveInfo(r.data);
      setStep('payment');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Erreur lors de la création');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4" style={{ fontFamily: 'Segoe UI, Arial, sans-serif' }}>
      <div className="max-w-lg mx-auto">

        <div className="mb-6">
          <button onClick={() => navigate('/')} className="flex items-center gap-2 text-gray-500 hover:text-blue-600 text-sm mb-4 transition-colors">
            <ArrowLeft size={16} /> Retour à l'accueil
          </button>
          <h1 className="text-2xl font-black text-gray-900">Créer votre espace boutique</h1>
          <p className="text-gray-500 text-sm mt-1">Remplissez le formulaire puis payez pour activer votre accès</p>
        </div>

        {step === 'form' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">

            {/* Choix du plan */}
            <div className="mb-6">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Choisir un plan</label>
              <div className="grid grid-cols-3 gap-2">
                {PLANS.map(p => (
                  <button key={p.id} type="button" onClick={() => set('plan', p.id)}
                    className={`rounded-xl p-3 text-center border-2 transition-all ${form.plan === p.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}`}>
                    <p className="font-bold text-gray-900 text-sm">{p.label}</p>
                    <p className="text-blue-600 font-black text-base">{p.affiche}</p>
                    <p className="text-gray-400 text-xs">FCFA/{p.periode}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Méthode de paiement */}
            <div className="mb-6">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Méthode de paiement</label>
              <div className="grid grid-cols-2 gap-2">
                {METHODES.map(m => (
                  <button key={m.id} type="button" onClick={() => set('methode', m.id)}
                    className={`rounded-xl px-3 py-2 text-sm font-bold border-2 transition-all ${form.methode === m.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 hover:border-blue-300 text-gray-700'}`}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label flex items-center gap-1.5"><Store size={13} className="text-gray-400" /> Code boutique *</label>
                <input className={`input ${form.slug && !slugValide ? 'border-red-300' : ''}`}
                  placeholder="ex: mamaboutique (minuscules, chiffres, tirets)"
                  value={form.slug}
                  onChange={e => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  required
                />
                {form.slug && !slugValide && <p className="text-red-500 text-xs mt-1">Min. 3 caractères · lettres minuscules, chiffres et tirets uniquement</p>}
                {slugValide && <p className="text-green-600 text-xs mt-1">✓ Code disponible</p>}
              </div>

              <div>
                <label className="label flex items-center gap-1.5"><Store size={13} className="text-gray-400" /> Nom de la boutique *</label>
                <input className="input" placeholder="ex: MAMA BOUTIQUE" value={form.nomBoutique} onChange={e => set('nomBoutique', e.target.value)} required />
              </div>

              <div>
                <label className="label flex items-center gap-1.5"><Mail size={13} className="text-gray-400" /> Email administrateur *</label>
                <input className={`input ${form.email && !emailValide ? 'border-red-300' : ''}`}
                  type="email" placeholder="votre@email.com"
                  value={form.email} onChange={e => set('email', e.target.value)} required />
              </div>

              <div>
                <label className="label flex items-center gap-1.5"><Lock size={13} className="text-gray-400" /> Mot de passe *</label>
                <input className={`input ${form.motDePasse && !mdpValide ? 'border-red-300' : ''}`}
                  type="password" placeholder="Minimum 6 caractères"
                  value={form.motDePasse} onChange={e => set('motDePasse', e.target.value)} required />
                {form.motDePasse && !mdpValide && <p className="text-red-500 text-xs mt-1">Minimum 6 caractères</p>}
              </div>

              <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Plan {planChoisi.label}</span>
                  <span className="font-bold text-gray-900">{planChoisi.affiche} FCFA / {planChoisi.periode}</span>
                </div>
                <div className="flex items-center gap-2 mt-2 text-xs text-blue-600">
                  <Zap size={13} /> Paiement sécurisé via Jèko · {METHODES.find(m => m.id === form.methode)?.label}
                </div>
              </div>

              <button type="submit" disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-colors shadow">
                {loading ? 'Création en cours...' : <><CheckCircle size={18} /> Continuer vers le paiement</>}
              </button>
            </form>
          </div>
        )}

        {step === 'payment' && waveInfo && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Phone size={32} className="text-blue-600" />
            </div>
            <h2 className="text-xl font-black text-gray-900 mb-2">Effectuez le paiement Wave</h2>
            <p className="text-gray-500 text-sm mb-6">Votre boutique sera activée immédiatement après confirmation</p>

            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-6 border border-blue-100 mb-6 text-left space-y-4">
              <div className="flex justify-between items-center border-b border-blue-100 pb-3">
                <span className="text-gray-600 text-sm">Montant à envoyer</span>
                <span className="text-2xl font-black text-blue-700">{planChoisi.affiche} FCFA</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 text-sm">Numéro Wave</span>
                <span className="font-bold text-gray-900 text-lg">{waveInfo.wave_numero || 'XX XX XX XX XX'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 text-sm">Référence (obligatoire)</span>
                <span className="font-black text-blue-700 text-base">MYBOGO-{form.slug.toUpperCase()}</span>
              </div>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6 text-left">
              <p className="text-yellow-800 text-sm font-medium">Important</p>
              <p className="text-yellow-700 text-xs mt-1">Incluez la référence <strong>MYBOGO-{form.slug.toUpperCase()}</strong> dans le message de votre paiement Wave pour une activation rapide.</p>
            </div>

            <button
              onClick={() => navigate('/subscribe/pending')}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl transition-colors shadow flex items-center justify-center gap-2"
            >
              <CheckCircle size={18} /> J'ai effectué le paiement
            </button>
            <button onClick={() => setStep('form')} className="mt-3 text-sm text-gray-400 hover:text-gray-600 transition-colors">
              ← Modifier mes informations
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
