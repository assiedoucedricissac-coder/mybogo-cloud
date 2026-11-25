import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Produits from './pages/Produits';
import Stock from './pages/Stock';
import Caisse from './pages/Caisse';
import Ventes from './pages/Ventes';
import Achats from './pages/Achats';
import Clients from './pages/Clients';
import Fournisseurs from './pages/Fournisseurs';
import Rapports from './pages/Rapports';
import Utilisateurs from './pages/Utilisateurs';
import Facturation from './pages/Facturation';
import SuperAdmin from './pages/SuperAdmin';
import Inventaire from './pages/Inventaire';
import Sauvegarde from './pages/Sauvegarde';
import Parametres from './pages/Parametres';
import AdminPanel from './pages/AdminPanel';
import Location from './pages/Location';
import Restauration from './pages/Restauration';
import LandingPage from './pages/LandingPage';
import Subscribe from './pages/Subscribe';
import SubscribePending from './pages/SubscribePending';
import PaiementSuccess from './pages/PaiementSuccess';
import PaiementError from './pages/PaiementError';

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('[ErrorBoundary]', error, info?.componentStack); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100vh', background:'#1e3a5f', color:'white', gap:16, fontFamily:'Arial,sans-serif' }}>
          <div style={{ fontSize:48 }}>⚠️</div>
          <h2 style={{ margin:0, fontSize:22 }}>Une erreur est survenue</h2>
          <p style={{ color:'#90cdf4', margin:0, maxWidth:400, textAlign:'center' }}>{this.state.error.message}</p>
          <button onClick={() => window.location.reload()} style={{ marginTop:8, padding:'10px 28px', background:'#3b82f6', color:'white', border:'none', borderRadius:8, fontSize:15, cursor:'pointer' }}>
            Recharger l'application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function PrivateRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"/></div>;
  if (!user) return <Navigate to="/accueil" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      {/* Pages publiques — accessibles sans connexion */}
      <Route path="/accueil" element={<LandingPage />} />
      <Route path="/subscribe" element={<Subscribe />} />
      <Route path="/subscribe/pending" element={<SubscribePending />} />
      <Route path="/paiement/success" element={<PaiementSuccess />} />
      <Route path="/paiement/error" element={<PaiementError />} />
      <Route path="/admin" element={<AdminPanel />} />
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="produits"     element={<PrivateRoute roles={['admin','super_admin']}><Produits /></PrivateRoute>} />
        <Route path="stock"        element={<PrivateRoute roles={['admin','super_admin']}><Stock /></PrivateRoute>} />
        <Route path="caisse"       element={<Caisse />} />
        <Route path="ventes"       element={<Ventes />} />
        <Route path="facturation"  element={<Facturation />} />
        <Route path="achats"       element={<PrivateRoute roles={['admin','super_admin']}><Achats /></PrivateRoute>} />
        <Route path="clients"      element={<PrivateRoute roles={['admin','super_admin']}><Clients /></PrivateRoute>} />
        <Route path="fournisseurs" element={<PrivateRoute roles={['admin','super_admin']}><Fournisseurs /></PrivateRoute>} />
        <Route path="rapports"     element={<PrivateRoute roles={['admin','super_admin']}><Rapports /></PrivateRoute>} />
        <Route path="inventaire"   element={<PrivateRoute roles={['admin','super_admin']}><Inventaire /></PrivateRoute>} />
        <Route path="location"     element={<PrivateRoute roles={['admin','super_admin']}><Location /></PrivateRoute>} />
        <Route path="restauration" element={<PrivateRoute roles={['admin','super_admin','gestionnaire','caissier']}><Restauration /></PrivateRoute>} />
        <Route path="utilisateurs"element={<PrivateRoute roles={['admin','super_admin']}><Utilisateurs /></PrivateRoute>} />
        <Route path="super-admin" element={<PrivateRoute roles={['super_admin']}><SuperAdmin /></PrivateRoute>} />
        <Route path="sauvegarde" element={<PrivateRoute roles={['admin','super_admin']}><Sauvegarde /></PrivateRoute>} />
        <Route path="parametres" element={<PrivateRoute roles={['admin','super_admin']}><Parametres /></PrivateRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/accueil" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppRoutes />
        <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
      </AuthProvider>
    </ErrorBoundary>
  );
}
