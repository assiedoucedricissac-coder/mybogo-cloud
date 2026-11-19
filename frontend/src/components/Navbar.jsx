import React from 'react';
import { LogOut, Bell, Calendar, RefreshCw, Menu } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const JOURS = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const MOIS  = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];

export default function Navbar({ onMenuClick }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const now = new Date();
  const dateStr = `${JOURS[now.getDay()]} ${now.getDate()} ${MOIS[now.getMonth()]} ${now.getFullYear()}`;

  function handleLogout() { logout(); navigate('/login'); }

  const initiale = user?.prenom?.[0]?.toUpperCase() || '?';
  const roleColors = {
    admin: 'from-blue-500 to-blue-700',
    gestionnaire: 'from-violet-500 to-violet-700',
    caissier: 'from-emerald-500 to-emerald-700',
    magasinier: 'from-orange-500 to-orange-700',
    comptable: 'from-teal-500 to-teal-700',
    super_admin: 'from-amber-500 to-amber-700',
  };
  const roleGrad = roleColors[user?.role] || 'from-gray-500 to-gray-700';

  return (
    <header className="sticky top-0 z-10 px-4 lg:px-6 py-3 flex items-center justify-between gap-4"
      style={{ background:'rgba(240,244,248,.85)', backdropFilter:'blur(12px)', borderBottom:'1px solid rgba(0,0,0,.06)' }}>

      {/* Menu (mobile uniquement — la barre latérale est masquée en dessous de lg) */}
      <button onClick={onMenuClick} className="lg:hidden w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-gray-200 shadow-sm flex-shrink-0">
        <Menu size={18} className="text-gray-600"/>
      </button>

      {/* Date */}
      <div className="hidden sm:flex items-center gap-2 text-sm text-gray-500 font-medium">
        <Calendar size={14} className="text-blue-500"/>
        <span className="capitalize">{dateStr}</span>
      </div>

      {/* Droite */}
      <div className="flex items-center gap-2 ml-auto">
        {/* Actualiser — recharge la page en cas d'écran figé, sans avoir à réduire/fermer l'app */}
        <button onClick={() => window.location.reload()} title="Actualiser la page"
          className="relative w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-gray-200 shadow-sm hover:bg-gray-50 transition-colors">
          <RefreshCw size={16} className="text-gray-500"/>
        </button>

        {/* Notification (déco) */}
        <button className="relative w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-gray-200 shadow-sm hover:bg-gray-50 transition-colors">
          <Bell size={16} className="text-gray-500"/>
        </button>

        {/* Séparateur */}
        <div className="w-px h-6 bg-gray-200 mx-1"/>

        {/* User */}
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${roleGrad} flex items-center justify-center text-white font-bold text-sm shadow-md flex-shrink-0`}>
            {initiale}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800 leading-tight">{user?.prenom} {user?.nom}</p>
            <p className="text-xs text-gray-400 capitalize leading-tight">{user?.role?.replace('_',' ')}</p>
          </div>
        </div>

        {/* Déconnexion */}
        <button onClick={handleLogout}
          className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-red-600 bg-white hover:bg-red-50 border border-gray-200 hover:border-red-200 px-3 py-2 rounded-xl transition-all duration-200 shadow-sm ml-1">
          <LogOut size={14}/>
          <span>Sortir</span>
        </button>
      </div>
    </header>
  );
}
