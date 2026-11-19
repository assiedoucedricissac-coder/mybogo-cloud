import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Package, Warehouse, ShoppingCart, Receipt, TruckIcon, Users, UserCircle, BarChart3, ShoppingBag, FileText, Shield, ClipboardList, HardDrive, Settings, CalendarClock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const ADMIN = ['admin','super_admin'];
const ALL   = ['admin','super_admin','gestionnaire','caissier','magasinier','comptable'];

const nav = [
  { to: '/',            icon: LayoutDashboard, label: 'Tableau de bord',   roles: ALL },
  { to: '/caisse',      icon: ShoppingCart,    label: 'Caisse / Vente',    roles: ALL },
  { to: '/ventes',      icon: Receipt,         label: 'Historique ventes', roles: ALL },
  { to: '/facturation', icon: FileText,        label: 'Facturation',       roles: ALL },
  { to: '/produits',    icon: Package,         label: 'Produits',          roles: ADMIN },
  { to: '/stock',       icon: Warehouse,       label: 'Stock',             roles: ADMIN },
  { to: '/achats',      icon: ShoppingBag,     label: 'Achats',            roles: ADMIN },
  { to: '/inventaire',  icon: ClipboardList,   label: 'Inventaire',        roles: ADMIN },
  { to: '/location',    icon: CalendarClock,   label: 'Événementiel',      roles: ADMIN },
  { to: '/clients',     icon: Users,           label: 'Clients',           roles: ADMIN },
  { to: '/fournisseurs',icon: TruckIcon,       label: 'Fournisseurs',      roles: ADMIN },
  { to: '/rapports',    icon: BarChart3,       label: 'Rapports',          roles: ADMIN },
  { to: '/utilisateurs',icon: UserCircle,      label: 'Utilisateurs',      roles: ADMIN },
  { to: '/sauvegarde',  icon: HardDrive,       label: 'Sauvegarde',        roles: ADMIN },
  { to: '/parametres',  icon: Settings,        label: 'Paramètres',        roles: ADMIN },
  { to: '/super-admin', icon: Shield,          label: 'Super Admin',       roles: ['super_admin'] },
];

export default function Sidebar({ licenceDaysLeft, licenceExpired, licenceType, mobileOpen, onCloseMobile }) {
  const { user } = useAuth();
  const [societe, setSociete] = useState({ nom: '', slogan: '' });

  useEffect(() => {
    api.get('/config/societe').then(r => setSociete(r.data)).catch(() => {});
  }, []);

  const on = k => societe[k] !== 0; // un flag à 0 = désactivé, null/undefined/1 = actif

  const showTrialWarning = !licenceExpired && licenceType === 'trial' && licenceDaysLeft != null && licenceDaysLeft <= 10;

  const nomApp    = societe.nom    || 'Gestion Stock';
  const sloganApp = societe.slogan || 'Solution commerciale';

  const moduleActif = {
    '/caisse':      on('feat_module_caisse'),
    '/facturation': on('feat_module_facturation'),
    '/inventaire':  on('feat_module_inventaires'),
    '/location':    on('feat_module_location'),
    '/clients':     on('feat_module_clients'),
    '/rapports':    on('feat_rapports'),
    '/sauvegarde':  on('feat_module_sauvegarde'),
  };

  const visible = nav
    .filter(n => !n.roles || n.roles.includes(user?.role))
    .filter(n => moduleActif[n.to] !== false);

  return (
    <>
      {/* Fond assombri derrière le tiroir mobile — cliquer dessus le referme */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={onCloseMobile}/>
      )}
      <aside className={`w-64 flex-shrink-0 text-white flex flex-col h-screen fixed lg:static inset-y-0 left-0 z-40
        transform transition-transform duration-200 lg:translate-x-0
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ background: 'linear-gradient(180deg, #0f172a 0%, #1e3a8a 60%, #1e40af 100%)' }}>

      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-white/10">
        <div className="rounded-2xl p-1.5 shadow-lg" style={{ background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)' }}>
          <svg width="38" height="38" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 16 L20 3 L38 16 Z" fill="#60a5fa"/>
            <path d="M2 16 L20 3 L38 16" stroke="#bfdbfe" strokeWidth="1" strokeLinejoin="round"/>
            <rect x="3" y="16" width="34" height="22" rx="2" fill="#1e40af"/>
            <rect x="3" y="16" width="34" height="6" rx="1" fill="#2563eb"/>
            <line x1="8" y1="16" x2="8" y2="22" stroke="#bfdbfe" strokeWidth="1.2" opacity="0.5"/>
            <line x1="14" y1="16" x2="14" y2="22" stroke="#bfdbfe" strokeWidth="1.2" opacity="0.5"/>
            <line x1="20" y1="16" x2="20" y2="22" stroke="#bfdbfe" strokeWidth="1.2" opacity="0.5"/>
            <line x1="26" y1="16" x2="26" y2="22" stroke="#bfdbfe" strokeWidth="1.2" opacity="0.5"/>
            <line x1="32" y1="16" x2="32" y2="22" stroke="#bfdbfe" strokeWidth="1.2" opacity="0.5"/>
            <rect x="4" y="23" width="10" height="10" rx="1" fill="#1e3a8a"/>
            <line x1="4" y1="27.5" x2="14" y2="27.5" stroke="#3b82f6" strokeWidth="0.8"/>
            <rect x="5" y="23.5" width="2.5" height="3.5" rx="0.5" fill="#7dd3fc"/>
            <rect x="8.5" y="23.5" width="2.5" height="3.5" rx="0.5" fill="#86efac"/>
            <rect x="5" y="28" width="2.5" height="4.5" rx="0.5" fill="#fde68a"/>
            <rect x="8.5" y="28" width="2.5" height="4.5" rx="0.5" fill="#f9a8d4"/>
            <rect x="15" y="26" width="10" height="12" rx="1" fill="#93c5fd" opacity="0.15"/>
            <line x1="20" y1="26" x2="20" y2="38" stroke="#93c5fd" strokeWidth="0.7" opacity="0.4"/>
            <circle cx="17.5" cy="32" r="0.8" fill="#93c5fd" opacity="0.6"/>
            <circle cx="22.5" cy="32" r="0.8" fill="#93c5fd" opacity="0.6"/>
            <rect x="26" y="23" width="10" height="10" rx="1" fill="#1e3a8a"/>
            <line x1="26" y1="27.5" x2="36" y2="27.5" stroke="#3b82f6" strokeWidth="0.8"/>
            <rect x="27" y="23.5" width="2.5" height="3.5" rx="0.5" fill="#fca5a5"/>
            <rect x="30.5" y="23.5" width="2.5" height="3.5" rx="0.5" fill="#c4b5fd"/>
            <rect x="27" y="28" width="2.5" height="4.5" rx="0.5" fill="#a5f3fc"/>
            <rect x="30.5" y="28" width="2.5" height="4.5" rx="0.5" fill="#fed7aa"/>
            <circle cx="20" cy="8" r="2" fill="#fbbf24"/>
            <circle cx="20" cy="8" r="1" fill="#fef3c7"/>
          </svg>
        </div>
        <div>
          <div className="text-base font-black tracking-wide leading-none text-white uppercase truncate max-w-[140px]">{nomApp}</div>
          <div className="text-blue-300 text-[9px] tracking-widest uppercase mt-1 font-medium truncate max-w-[140px]">{sloganApp}</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 overflow-y-auto space-y-0.5 px-2">
        {visible.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={onCloseMobile}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150 ${
                isActive
                  ? 'bg-white/15 text-white font-semibold shadow-sm backdrop-blur-sm border border-white/10'
                  : 'text-blue-200 hover:bg-white/8 hover:text-white'
              }`
            }
          >
            <item.icon size={17} className="flex-shrink-0"/>
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Alerte licence essai */}
      {showTrialWarning && (
        <div className={`mx-2 mb-2 rounded-xl px-3 py-2 text-xs font-medium ${licenceDaysLeft <= 3 ? 'bg-red-500/20 text-red-200 border border-red-400/30' : 'bg-amber-500/20 text-amber-200 border border-amber-400/30'}`}>
          ⚠️ Évaluation : {licenceDaysLeft} jour{licenceDaysLeft > 1 ? 's' : ''} restant{licenceDaysLeft > 1 ? 's' : ''}
        </div>
      )}

      {/* User info */}
      <div className="p-3 mx-2 mb-3 rounded-2xl border border-white/10 bg-white/5 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-blue-500/30 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            {user?.prenom?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="min-w-0">
            <div className="text-white font-semibold truncate text-sm">{user?.prenom} {user?.nom}</div>
            <div className={`text-xs capitalize flex items-center gap-1 ${user?.role === 'super_admin' ? 'text-yellow-300 font-semibold' : 'text-blue-300'}`}>
              {user?.role === 'super_admin' && <Shield size={10} />}
              {user?.role}
            </div>
          </div>
        </div>
      </div>
      </aside>
    </>
  );
}
