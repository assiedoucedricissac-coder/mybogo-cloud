import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Globe, CheckCircle, Package, ShoppingCart, FileText, Users, BarChart3, CalendarClock, Shield, ArrowRight } from 'lucide-react';

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

const FEATURES = [
  { icon: ShoppingCart, title: 'Caisse / Vente',     desc: 'Enregistrez vos ventes rapidement avec plusieurs modes de paiement (espèces, mobile money, crédit).' },
  { icon: Package,      title: 'Gestion du stock',   desc: 'Suivez vos entrées et sorties de stock en temps réel. Alertes rupture automatiques.' },
  { icon: FileText,     title: 'Facturation',         desc: 'Créez des factures, proformas, avoirs et reçus professionnels en quelques secondes.' },
  { icon: Users,        title: 'Clients & Créances',  desc: 'Gérez vos clients, suivez les ventes à crédit et les remboursements.' },
  { icon: BarChart3,    title: 'Rapports & Stats',    desc: 'Visualisez vos ventes, marges et mouvements de stock par période.' },
  { icon: CalendarClock,title: 'Événementiel',        desc: 'Gérez la location de matériel pour mariages, cérémonies et événements.' },
];

const PLANS = [
  { id: 'mensuel',      label: 'Mensuel',      prix: '5 000',  fcfa: 5000,  periode: 'mois',      badge: null,         color: 'border-gray-200' },
  { id: 'trimestriel',  label: 'Trimestriel',  prix: '13 500', fcfa: 13500, periode: 'trimestre', badge: 'Populaire',  color: 'border-blue-500 ring-2 ring-blue-500' },
  { id: 'annuel',       label: 'Annuel',        prix: '50 000', fcfa: 50000, periode: 'an',        badge: 'Meilleur prix', color: 'border-gray-200' },
];

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: 'Segoe UI, Arial, sans-serif' }}>

      {/* NAV */}
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AppLogo size={36} />
            <span className="font-black text-gray-900 text-lg tracking-wide uppercase">MYBOGO-STOCK</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/login')} className="text-gray-600 hover:text-blue-600 font-medium text-sm px-4 py-2 rounded-lg hover:bg-blue-50 transition-colors">
              Se connecter
            </button>
            <button onClick={() => navigate('/subscribe')} className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm px-5 py-2 rounded-xl transition-colors shadow">
              Commencer
            </button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 50%, #1e40af 100%)' }} className="text-white py-24 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="flex justify-center mb-8">
            <div className="rounded-3xl p-4 shadow-2xl" style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)' }}>
              <AppLogo size={80} />
            </div>
          </div>
          <h1 className="text-5xl font-black tracking-wide uppercase mb-4">MYBOGO-STOCK</h1>
          <p className="text-xl text-blue-200 mb-3">La solution de gestion commerciale pour votre boutique</p>
          <p className="text-blue-300 text-sm mb-10 max-w-xl mx-auto">
            Gérez vos ventes, votre stock, vos clients et votre facturation depuis un seul outil simple et puissant.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => window.open('/api/public/download', '_blank')}
              className="flex items-center justify-center gap-2 bg-white text-blue-700 font-bold px-8 py-4 rounded-2xl shadow-xl hover:bg-blue-50 transition-all text-base"
            >
              <Download size={20} /> Télécharger pour PC (.exe)
            </button>
            <button
              onClick={() => navigate('/subscribe')}
              className="flex items-center justify-center gap-2 border-2 border-white text-white font-bold px-8 py-4 rounded-2xl hover:bg-white/10 transition-all text-base"
            >
              <Globe size={20} /> Essayer en ligne <ArrowRight size={18} />
            </button>
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-6 text-blue-200 text-sm">
            {['Données 100% sécurisées', 'Sans engagement', 'Support inclus'].map(t => (
              <span key={t} className="flex items-center gap-1.5"><CheckCircle size={14} className="text-green-400" /> {t}</span>
            ))}
          </div>
        </div>
      </section>

      {/* FONCTIONNALITÉS */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-black text-center text-gray-900 mb-3">Tout ce dont votre boutique a besoin</h2>
          <p className="text-center text-gray-500 mb-12">Un seul logiciel pour tout gérer — simple, rapide et fiable</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mb-4">
                  <Icon size={24} className="text-blue-600" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TÉLÉCHARGEMENT */}
      <section className="py-16 px-4 bg-white">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-black text-gray-900 mb-3">Version Desktop</h2>
          <p className="text-gray-500 mb-8">Installez MYBOGO-STOCK directement sur votre PC Windows. Fonctionne même sans connexion internet.</p>
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-3xl p-8 border border-blue-100">
            <AppLogo size={56} />
            <p className="font-bold text-gray-900 mt-4 mb-1">MYBOGO-STOCK Desktop</p>
            <p className="text-sm text-gray-500 mb-6">Application Windows · Installation rapide · Données locales</p>
            <button
              onClick={() => window.open('/api/public/download', '_blank')}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-8 py-4 rounded-2xl shadow-lg transition-colors"
            >
              <Download size={20} /> Télécharger MYBOGO-STOCK Desktop (.exe)
            </button>
            <p className="text-xs text-gray-400 mt-4">Compatible Windows 10 / 11</p>
          </div>
        </div>
      </section>

      {/* PLANS */}
      <section id="tarifs" className="py-20 px-4 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-black text-center text-gray-900 mb-3">Tarifs simples et transparents</h2>
          <p className="text-center text-gray-500 mb-12">Payez via Wave · Accès immédiat · Sans engagement</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PLANS.map(plan => (
              <div key={plan.id} className={`bg-white rounded-2xl p-6 border-2 ${plan.color} relative shadow-sm`}>
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-bold px-4 py-1 rounded-full whitespace-nowrap">
                    {plan.badge}
                  </div>
                )}
                <h3 className="font-bold text-gray-900 text-lg mb-1">{plan.label}</h3>
                <div className="mb-4">
                  <span className="text-3xl font-black text-gray-900">{plan.prix}</span>
                  <span className="text-gray-500 text-sm ml-1">FCFA / {plan.periode}</span>
                </div>
                <ul className="space-y-2 mb-6 text-sm text-gray-600">
                  {['Toutes les fonctionnalités', 'Multi-utilisateurs', 'Sauvegarde automatique', 'Support inclus'].map(f => (
                    <li key={f} className="flex items-center gap-2"><CheckCircle size={14} className="text-green-500 flex-shrink-0" /> {f}</li>
                  ))}
                </ul>
                <button
                  onClick={() => navigate(`/subscribe?plan=${plan.id}`)}
                  className={`w-full py-3 rounded-xl font-bold text-sm transition-colors ${plan.badge === 'Populaire' ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-100 hover:bg-blue-50 text-gray-800 hover:text-blue-700'}`}
                >
                  Choisir ce plan
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: 'linear-gradient(135deg, #1e3a8a, #1e40af)' }} className="py-16 px-4 text-white text-center">
        <div className="max-w-2xl mx-auto">
          <Shield size={40} className="mx-auto mb-4 text-blue-300" />
          <h2 className="text-2xl font-black mb-3">Prêt à moderniser votre gestion ?</h2>
          <p className="text-blue-200 mb-8">Rejoignez des centaines de commerçants qui font confiance à MYBOGO-STOCK</p>
          <button
            onClick={() => navigate('/subscribe')}
            className="inline-flex items-center gap-2 bg-white text-blue-700 font-black px-10 py-4 rounded-2xl shadow-xl hover:bg-blue-50 transition-colors text-base"
          >
            Démarrer maintenant <ArrowRight size={18} />
          </button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-gray-900 text-gray-400 py-10 px-4">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AppLogo size={32} />
            <span className="font-bold text-white text-sm uppercase tracking-wide">MYBOGO-STOCK</span>
          </div>
          <p className="text-sm">© {new Date().getFullYear()} MYBOGO-STOCK · Tous droits réservés</p>
          <button onClick={() => navigate('/login')} className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
            Se connecter →
          </button>
        </div>
      </footer>
    </div>
  );
}
