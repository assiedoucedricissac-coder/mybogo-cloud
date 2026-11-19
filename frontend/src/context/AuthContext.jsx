import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
  });
  const [boutique, setBoutique] = useState(() => localStorage.getItem('boutique') || '');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      api.get('/auth/me').then(res => { setUser(res.data); localStorage.setItem('user', JSON.stringify(res.data)); }).catch(() => logout()).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  async function login(email, mot_de_passe, boutiqueCode = '') {
    // Envoyer le code boutique dans le header dès la requête login
    // pour que le middleware route vers la bonne base AVANT l'auth.
    const headers = {};
    if (boutiqueCode) headers['X-Boutique'] = boutiqueCode.trim().toLowerCase();
    const res = await api.post('/auth/login', { email, mot_de_passe }, { headers });
    localStorage.setItem('token', res.data.token);
    localStorage.setItem('user', JSON.stringify(res.data.user));
    if (boutiqueCode) {
      localStorage.setItem('boutique', boutiqueCode.trim().toLowerCase());
      setBoutique(boutiqueCode.trim().toLowerCase());
    } else {
      localStorage.removeItem('boutique');
      setBoutique('');
    }
    setUser(res.data.user);
    return res.data;
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('boutique');
    setUser(null);
    setBoutique('');
  }

  function hasRole(...roles) {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    return roles.includes(user.role);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasRole, boutique }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
