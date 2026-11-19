import React, { useState, useEffect } from 'react';
import axios from 'axios';

// Panneau d'administration des boutiques (SaaS) — indépendant du reste de l'application :
// pas de sidebar, pas de AuthContext (compte tenant), son propre jeton stocké à part.
const ADMIN_TOKEN_KEY = 'mybogo_admin_token';
const adminApi = axios.create({ baseURL: '/admin-api' });
adminApi.interceptors.request.use(cfg => {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

export default function AdminPanel() {
  const [token, setToken] = useState(localStorage.getItem(ADMIN_TOKEN_KEY) || '');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreurLogin, setErreurLogin] = useState('');
  const [boutiques, setBoutiques] = useState([]);
  const [chargement, setChargement] = useState(false);
  const [dernierResultat, setDernierResultat] = useState(null);
  const [erreurCreation, setErreurCreation] = useState('');
  const [form, setForm] = useState({ slug: '', nomBoutique: '', email: '', motDePasse: '' });

  useEffect(() => { if (token) chargerBoutiques(); }, [token]);

  async function chargerBoutiques() {
    try {
      const r = await adminApi.get('/boutiques');
      setBoutiques(r.data);
    } catch (e) {
      if (e.response?.status === 401 || e.response?.status === 403) deconnexion();
    }
  }

  async function connexion(e) {
    e.preventDefault();
    setErreurLogin('');
    try {
      const r = await adminApi.post('/login', { motDePasse });
      localStorage.setItem(ADMIN_TOKEN_KEY, r.data.token);
      setToken(r.data.token);
      setMotDePasse('');
    } catch (e) {
      setErreurLogin(e.response?.data?.message || 'Erreur de connexion');
    }
  }

  function deconnexion() {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    setToken('');
    setBoutiques([]);
  }

  async function creerBoutique(e) {
    e.preventDefault();
    setErreurCreation('');
    setDernierResultat(null);
    setChargement(true);
    try {
      const r = await adminApi.post('/boutiques', form);
      setDernierResultat({ ...r.data, adresse: `${form.slug}.${window.location.host}` });
      setForm({ slug: '', nomBoutique: '', email: '', motDePasse: '' });
      chargerBoutiques();
    } catch (e) {
      setErreurCreation(e.response?.data?.message || 'Erreur lors de la création');
    } finally {
      setChargement(false);
    }
  }

  const styles = {
    page: { minHeight: '100vh', background: '#0f172a', color: '#e2e8f0', fontFamily: 'Segoe UI, Arial, sans-serif', padding: '32px 16px' },
    card: { maxWidth: 640, margin: '0 auto', background: '#1e293b', borderRadius: 16, padding: 28, boxShadow: '0 8px 24px rgba(0,0,0,.3)' },
    input: { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', marginBottom: 12, fontSize: 14, boxSizing: 'border-box' },
    label: { fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 },
    button: { width: '100%', padding: '11px', borderRadius: 8, border: 'none', background: '#3b82f6', color: 'white', fontWeight: 'bold', fontSize: 14, cursor: 'pointer' },
    err: { color: '#f87171', fontSize: 13, marginTop: 8 },
    h1: { fontSize: 20, marginBottom: 4 },
    sub: { color: '#94a3b8', fontSize: 13, marginBottom: 20 },
  };

  if (!token) {
    return (
      <div style={styles.page}>
        <div style={{ ...styles.card, maxWidth: 380, marginTop: '15vh' }}>
          <h1 style={styles.h1}>MYBOGO-STOCK — Administration</h1>
          <p style={styles.sub}>Accès réservé au revendeur</p>
          <form onSubmit={connexion}>
            <label style={styles.label}>Mot de passe</label>
            <input style={styles.input} type="password" value={motDePasse} onChange={e => setMotDePasse(e.target.value)} autoFocus />
            <button style={styles.button} type="submit">Se connecter</button>
            {erreurLogin && <p style={styles.err}>{erreurLogin}</p>}
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={styles.h1}>Boutiques MYBOGO-STOCK</h1>
            <p style={styles.sub}>{boutiques.length} boutique{boutiques.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={deconnexion} style={{ ...styles.button, width: 'auto', padding: '8px 16px', background: '#334155', fontSize: 12 }}>Déconnexion</button>
        </div>

        <h2 style={{ fontSize: 15, marginTop: 24, marginBottom: 12 }}>Nouvelle boutique</h2>
        <form onSubmit={creerBoutique}>
          <label style={styles.label}>Identifiant (sous-domaine — lettres minuscules, chiffres, tirets)</label>
          <input style={styles.input} value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase() }))} placeholder="ex: eljireh" required />
          <label style={styles.label}>Nom de la boutique</label>
          <input style={styles.input} value={form.nomBoutique} onChange={e => setForm(f => ({ ...f, nomBoutique: e.target.value }))} placeholder="ex: EL-JIREH" required />
          <label style={styles.label}>Email de l'administrateur (identifiant de connexion)</label>
          <input style={styles.input} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
          <label style={styles.label}>Mot de passe initial</label>
          <input style={styles.input} value={form.motDePasse} onChange={e => setForm(f => ({ ...f, motDePasse: e.target.value }))} required />
          <button style={styles.button} type="submit" disabled={chargement}>{chargement ? 'Création…' : 'Créer la boutique'}</button>
          {erreurCreation && <p style={styles.err}>{erreurCreation}</p>}
        </form>

        {dernierResultat && (
          <div style={{ marginTop: 20, background: '#0f172a', border: '1px solid #16a34a', borderRadius: 10, padding: 16 }}>
            <p style={{ color: '#4ade80', fontWeight: 'bold', marginTop: 0 }}>✅ Boutique créée — à transmettre au client :</p>
            <p style={{ margin: '6px 0 2px', fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>Code boutique (à saisir sur la page de connexion)</p>
            <p style={{ margin: '0 0 10px', fontSize: 18, fontWeight: 'bold', color: '#60a5fa', letterSpacing: 2 }}>{dernierResultat.slug}</p>
            <p style={{ margin: '4px 0', fontSize: 13 }}>Email : <code>{dernierResultat.email}</code></p>
            <p style={{ margin: '4px 0', fontSize: 11, color: '#64748b' }}>Accès sous-domaine (si DNS configuré) : <code>https://{dernierResultat.adresse}</code></p>
          </div>
        )}

        <h2 style={{ fontSize: 15, marginTop: 28, marginBottom: 12 }}>Boutiques existantes</h2>
        {boutiques.length === 0 ? (
          <p style={{ color: '#64748b', fontSize: 13 }}>Aucune boutique pour l'instant.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {boutiques.map(b => (
              <div key={b.slug} style={{ background: '#0f172a', borderRadius: 8, padding: '12px 14px', fontSize: 13 }}>
                <div style={{ fontWeight: 'bold', fontSize: 15 }}>{b.nom}</div>
                <div style={{ marginTop: 4, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <span>Code : <code style={{ color: '#60a5fa', fontSize: 14, fontWeight: 'bold' }}>{b.slug}</code></span>
                  <span style={{ color: '#94a3b8' }}>{b.email}</span>
                  <span style={{ color: '#64748b', fontSize: 11 }}>{new Date(b.createdAt).toLocaleDateString('fr-FR')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
