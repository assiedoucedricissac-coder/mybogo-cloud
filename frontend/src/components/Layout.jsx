import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Key, AlertTriangle, LogOut } from 'lucide-react';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate  = useNavigate();
  const [licence, setLicence]     = useState(null);
  const [licKey, setLicKey]       = useState('');
  const [activating, setActivating] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    api.get('/licence/status').then(r => setLicence(r.data)).catch(() => {});
  }, []);

  async function handleActivate(e) {
    e.preventDefault();
    if (!licKey.trim()) return;
    setActivating(true);
    try {
      const res = await api.post('/licence/activate', { key: licKey });
      toast.success(res.data.message);
      setLicKey('');
      const upd = await api.get('/licence/status');
      setLicence(upd.data);
    } catch(err) {
      toast.error(err.response?.data?.message || 'Clé invalide');
    } finally { setActivating(false); }
  }

  const expired = licence?.expired;
  const canActivate = ['super_admin','admin'].includes(user?.role);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background:'#f0f4f8' }}>
      <Sidebar licenceDaysLeft={licence?.days_left} licenceExpired={expired} licenceType={licence?.type}
        mobileOpen={mobileMenuOpen} onCloseMobile={() => setMobileMenuOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Navbar onMenuClick={() => setMobileMenuOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 animate-fade-in">
          <Outlet />
        </main>
      </div>

      {/* Écran de blocage si licence expirée */}
      {expired && (
        <div className="fixed inset-0 z-[9999] bg-gray-900/95 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 space-y-6 text-center">
            <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mx-auto">
              <AlertTriangle size={40} className="text-red-500"/>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Licence expirée</h1>
              <p className="text-gray-500 mt-2 text-sm">
                La période d'utilisation de ce logiciel est terminée.
                {canActivate
                  ? ' Entrez une clé de licence pour continuer.'
                  : ' Veuillez contacter votre administrateur pour renouveler la licence.'}
              </p>
            </div>

            {canActivate ? (
              <form onSubmit={handleActivate} className="text-left space-y-3">
                <label className="block text-sm font-medium text-gray-700">Clé de licence</label>
                <textarea
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  rows={3}
                  value={licKey}
                  onChange={e => setLicKey(e.target.value)}
                  placeholder="Collez la clé de licence ici..."
                  required
                />
                <button
                  type="submit"
                  disabled={activating || !licKey.trim()}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition flex items-center justify-center gap-2"
                >
                  <Key size={16}/> {activating ? 'Activation…' : 'Activer la licence'}
                </button>
              </form>
            ) : (
              <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600">
                Contactez le fournisseur du logiciel pour obtenir une clé de renouvellement.
              </div>
            )}

            <button
              onClick={handleLogout}
              className="mt-2 w-full flex items-center justify-center gap-2 text-sm text-gray-400 hover:text-gray-600 transition"
            >
              <LogOut size={14}/> Se déconnecter
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
