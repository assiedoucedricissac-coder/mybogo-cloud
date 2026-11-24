import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';

// Centre de gestion des boutiques — indépendant du reste de l'application :
// pas de sidebar, pas de AuthContext (compte boutique), son propre jeton stocké à part.
const ADMIN_TOKEN_KEY = 'mybogo_admin_token';
const adminApi = axios.create({ baseURL: '/admin-api' });
adminApi.interceptors.request.use(cfg => {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

const STATUTS = {
  actif:    { label: 'Actif',     couleur: '#22c55e' },
  essai:    { label: 'Essai',     couleur: '#3b82f6' },
  expire:   { label: 'Expiré',    couleur: '#f59e0b' },
  suspendu: { label: 'Suspendu',  couleur: '#ef4444' },
  inconnu:  { label: 'Illisible', couleur: '#64748b' },
};
const fmtDate = d => (d ? new Date(d + 'T00:00:00').toLocaleDateString('fr-FR') : '—');
const fmtMontant = n => `${(n || 0).toLocaleString('fr-FR')} FCFA`;

const S = {
  page: { minHeight: '100vh', background: '#0f172a', color: '#e2e8f0', fontFamily: 'Segoe UI, Arial, sans-serif', padding: '24px 16px' },
  wrap: { maxWidth: 960, margin: '0 auto' },
  card: { background: '#1e293b', borderRadius: 14, padding: 20, boxShadow: '0 8px 24px rgba(0,0,0,.25)' },
  input: { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: 14, boxSizing: 'border-box' },
  label: { fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 },
  btn: { padding: '8px 14px', borderRadius: 8, border: 'none', background: '#3b82f6', color: 'white', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  btnGris: { padding: '8px 14px', borderRadius: 8, border: '1px solid #334155', background: 'transparent', color: '#cbd5e1', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  btnRouge: { padding: '8px 14px', borderRadius: 8, border: 'none', background: '#dc2626', color: 'white', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  btnVert: { padding: '8px 14px', borderRadius: 8, border: 'none', background: '#16a34a', color: 'white', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
};

function Badge({ statut }) {
  const s = STATUTS[statut] || STATUTS.inconnu;
  return <span style={{ background: s.couleur + '22', color: s.couleur, border: `1px solid ${s.couleur}55`, borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>{s.label}</span>;
}

function Stat({ label, valeur, couleur }) {
  return (
    <div style={{ ...S.card, padding: 14, flex: '1 1 130px', minWidth: 0 }}>
      <div style={{ fontSize: 12, color: '#94a3b8' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: couleur || '#e2e8f0', marginTop: 2, wordBreak: 'break-word' }}>{valeur}</div>
    </div>
  );
}

function CarteBoutique({ b, onAction }) {
  const [mode, setMode] = useState(null); // 'prolonger' | 'suspendre' | 'reactiver' | 'mdp'
  const [jours, setJours] = useState('30');
  const [mdp, setMdp] = useState('');
  const [busy, setBusy] = useState(false);

  async function valider(chemin, corps) {
    setBusy(true);
    const ok = await onAction(b.slug, chemin, corps);
    setBusy(false);
    if (ok) { setMode(null); setMdp(''); }
  }

  const suspendu = b.statut === 'suspendu';
  let echeance = '—';
  if (b.expiresAt) {
    if (suspendu) echeance = 'Accès bloqué';
    else if (b.joursRestants <= 0) echeance = `Expiré le ${fmtDate(b.expiresAt)}`;
    else echeance = `${b.joursRestants} jour${b.joursRestants > 1 ? 's' : ''} restant${b.joursRestants > 1 ? 's' : ''} (jusqu'au ${fmtDate(b.expiresAt)})`;
  }

  return (
    <div style={{ ...S.card, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 16, minWidth: 0, wordBreak: 'break-word' }}>{b.nom}</div>
        <Badge statut={b.statut} />
      </div>
      <div style={{ display: 'flex', gap: '4px 16px', flexWrap: 'wrap', marginTop: 6, fontSize: 13, color: '#94a3b8' }}>
        <span>Code : <code style={{ color: '#60a5fa', fontWeight: 700 }}>{b.slug}</code></span>
        <span style={{ wordBreak: 'break-all' }}>{b.email}</span>
        <span>Créée le {new Date(b.createdAt).toLocaleDateString('fr-FR')}</span>
      </div>
      <div style={{ marginTop: 8, fontSize: 13 }}>
        {echeance}
        {b.dernierPaiement && <span style={{ color: '#94a3b8' }}> · dernier paiement : {b.dernierPaiement.plan} ({fmtMontant(b.dernierPaiement.montant)})</span>}
      </div>

      {!mode && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <button style={S.btn} onClick={() => setMode('prolonger')}>Prolonger</button>
          {suspendu
            ? <button style={S.btnVert} onClick={() => setMode('reactiver')}>Réactiver</button>
            : <button style={S.btnGris} onClick={() => setMode('suspendre')}>Suspendre</button>}
          <button style={S.btnGris} onClick={() => setMode('mdp')}>Mot de passe</button>
        </div>
      )}

      {(mode === 'prolonger' || mode === 'reactiver') && (
        <div style={{ marginTop: 12 }}>
          <label style={S.label}>{mode === 'prolonger' ? 'Ajouter combien de jours ?' : 'Réactiver pour combien de jours ?'}</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {['15', '30', '90', '365'].map(j => (
              <button key={j} style={jours === j ? S.btn : S.btnGris} onClick={() => setJours(j)}>{j} j</button>
            ))}
            <input style={{ ...S.input, width: 90 }} type="number" min="1" value={jours} onChange={e => setJours(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button style={S.btnVert} disabled={busy} onClick={() => valider(mode, { jours: Number(jours) })}>{busy ? '…' : 'Valider'}</button>
            <button style={S.btnGris} onClick={() => setMode(null)}>Annuler</button>
          </div>
        </div>
      )}

      {mode === 'suspendre' && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 13, color: '#fca5a5', margin: '0 0 10px' }}>Le commerçant ne pourra plus utiliser l'application tant que vous ne l'aurez pas réactivée. Ses données sont conservées.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={S.btnRouge} disabled={busy} onClick={() => valider('suspendre', {})}>{busy ? '…' : 'Confirmer la suspension'}</button>
            <button style={S.btnGris} onClick={() => setMode(null)}>Annuler</button>
          </div>
        </div>
      )}

      {mode === 'mdp' && (
        <div style={{ marginTop: 12 }}>
          <label style={S.label}>Nouveau mot de passe de {b.email}</label>
          <input style={S.input} value={mdp} onChange={e => setMdp(e.target.value)} placeholder="6 caractères minimum" />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button style={S.btnVert} disabled={busy || mdp.length < 6} onClick={() => valider('mot-de-passe', { motDePasse: mdp })}>{busy ? '…' : 'Changer'}</button>
            <button style={S.btnGris} onClick={() => { setMode(null); setMdp(''); }}>Annuler</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminPanel() {
  const [token, setToken] = useState(() => { try { return localStorage.getItem(ADMIN_TOKEN_KEY) || ''; } catch { return ''; } });
  const [motDePasse, setMotDePasse] = useState('');
  const [erreurLogin, setErreurLogin] = useState('');
  const [data, setData] = useState({ stats: null, boutiques: [] });
  const [filtre, setFiltre] = useState('tous');
  const [recherche, setRecherche] = useState('');
  const [notice, setNotice] = useState(null); // { texte, erreur }
  const [formOuvert, setFormOuvert] = useState(false);
  const [form, setForm] = useState({ slug: '', nomBoutique: '', email: '', motDePasse: '', dureeJours: '15' });
  const [creation, setCreation] = useState(false);
  const [dernierResultat, setDernierResultat] = useState(null);
  const [testMail, setTestMail] = useState({ email: '', busy: false, resultat: null });

  async function tester(e) {
    e.preventDefault();
    setTestMail(t => ({ ...t, busy: true, resultat: null }));
    try {
      const r = await adminApi.post('/test-email', { email: testMail.email });
      setTestMail(t => ({ ...t, busy: false, resultat: r.data }));
    } catch (err) {
      setTestMail(t => ({ ...t, busy: false, resultat: { ok: false, message: err.response?.data?.message || 'Test impossible.' } }));
    }
  }

  useEffect(() => { if (token) charger(); }, [token]);

  function afficher(texte, erreur = false) {
    setNotice({ texte, erreur });
    setTimeout(() => setNotice(null), 4000);
  }

  async function charger() {
    try {
      const r = await adminApi.get('/boutiques');
      setData(r.data);
    } catch (e) {
      if (e.response?.status === 401 || e.response?.status === 403) deconnexion();
      else afficher('Chargement impossible.', true);
    }
  }

  async function connexion(e) {
    e.preventDefault();
    setErreurLogin('');
    try {
      const r = await adminApi.post('/login', { motDePasse });
      try { localStorage.setItem(ADMIN_TOKEN_KEY, r.data.token); } catch {}
      setToken(r.data.token);
      setMotDePasse('');
    } catch (e) {
      setErreurLogin(e.response?.data?.message || 'Erreur de connexion');
    }
  }

  function deconnexion() {
    try { localStorage.removeItem(ADMIN_TOKEN_KEY); } catch {}
    setToken('');
    setData({ stats: null, boutiques: [] });
  }

  async function action(slug, chemin, corps) {
    try {
      await adminApi.post(`/boutiques/${encodeURIComponent(slug)}/${chemin}`, corps);
      afficher('Modification enregistrée.');
      await charger();
      return true;
    } catch (e) {
      afficher(e.response?.data?.message || 'Action impossible.', true);
      return false;
    }
  }

  async function creerBoutique(e) {
    e.preventDefault();
    setCreation(true);
    setDernierResultat(null);
    try {
      const r = await adminApi.post('/boutiques', { ...form, dureeJours: Number(form.dureeJours), type: 'trial' });
      setDernierResultat(r.data);
      setForm({ slug: '', nomBoutique: '', email: '', motDePasse: '', dureeJours: '15' });
      charger();
    } catch (e) {
      afficher(e.response?.data?.message || 'Création impossible.', true);
    } finally {
      setCreation(false);
    }
  }

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return data.boutiques.filter(b =>
      (filtre === 'tous' || b.statut === filtre) &&
      (!q || [b.nom, b.slug, b.email].some(v => (v || '').toLowerCase().includes(q))));
  }, [data.boutiques, filtre, recherche]);

  if (!token) {
    return (
      <div style={S.page}>
        <div style={{ ...S.card, maxWidth: 380, margin: '15vh auto 0' }}>
          <h1 style={{ fontSize: 20, margin: '0 0 4px' }}>MYBOGO-STOCK — Administration</h1>
          <p style={{ color: '#94a3b8', fontSize: 13, margin: '0 0 20px' }}>Accès réservé au revendeur</p>
          <form onSubmit={connexion}>
            <label style={S.label}>Mot de passe</label>
            <input style={{ ...S.input, marginBottom: 12 }} type="password" value={motDePasse} onChange={e => setMotDePasse(e.target.value)} autoFocus />
            <button style={{ ...S.btn, width: '100%', padding: 11 }} type="submit">Se connecter</button>
            {erreurLogin && <p style={{ color: '#f87171', fontSize: 13, marginTop: 8 }}>{erreurLogin}</p>}
          </form>
        </div>
      </div>
    );
  }

  const st = data.stats;
  return (
    <div style={S.page}>
      <div style={S.wrap}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 22, margin: 0 }}>Centre de gestion</h1>
            <p style={{ color: '#94a3b8', fontSize: 13, margin: '2px 0 0' }}>Toutes les boutiques MYBOGO-STOCK</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={S.btnGris} onClick={charger}>Actualiser</button>
            <button style={S.btnGris} onClick={deconnexion}>Déconnexion</button>
          </div>
        </div>

        {notice && (
          <div style={{ background: notice.erreur ? '#7f1d1d' : '#14532d', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 14 }}>{notice.texte}</div>
        )}

        {st && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            <Stat label="Boutiques" valeur={st.total} />
            <Stat label="Actives (payées)" valeur={st.actif} couleur={STATUTS.actif.couleur} />
            <Stat label="En essai" valeur={st.essai} couleur={STATUTS.essai.couleur} />
            <Stat label="Expirées" valeur={st.expire} couleur={STATUTS.expire.couleur} />
            <Stat label="Suspendues" valeur={st.suspendu} couleur={STATUTS.suspendu.couleur} />
            <Stat label="Encaissé (abonnements)" valeur={fmtMontant(st.revenus)} />
          </div>
        )}

        <div style={{ ...S.card, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 15, margin: 0 }}>Nouvelle boutique</h2>
            <button style={S.btnGris} onClick={() => setFormOuvert(o => !o)}>{formOuvert ? 'Fermer' : 'Ouvrir'}</button>
          </div>
          {formOuvert && (
            <form onSubmit={creerBoutique} style={{ marginTop: 14, display: 'grid', gap: 10 }}>
              <div><label style={S.label}>Code boutique (lettres minuscules, chiffres, tirets)</label>
                <input style={S.input} value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase() }))} required /></div>
              <div><label style={S.label}>Nom de la boutique</label>
                <input style={S.input} value={form.nomBoutique} onChange={e => setForm(f => ({ ...f, nomBoutique: e.target.value }))} required /></div>
              <div><label style={S.label}>Email de l'administrateur (identifiant de connexion)</label>
                <input style={S.input} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required /></div>
              <div><label style={S.label}>Mot de passe initial</label>
                <input style={S.input} value={form.motDePasse} onChange={e => setForm(f => ({ ...f, motDePasse: e.target.value }))} required /></div>
              <div><label style={S.label}>Jours d'essai</label>
                <input style={S.input} type="number" min="1" value={form.dureeJours} onChange={e => setForm(f => ({ ...f, dureeJours: e.target.value }))} /></div>
              <button style={{ ...S.btn, padding: 11 }} type="submit" disabled={creation}>{creation ? 'Création…' : 'Créer la boutique'}</button>
            </form>
          )}
          {dernierResultat && (
            <div style={{ marginTop: 14, background: '#0f172a', border: '1px solid #16a34a', borderRadius: 10, padding: 14 }}>
              <p style={{ color: '#4ade80', fontWeight: 700, margin: '0 0 6px' }}>Boutique créée — à transmettre au client :</p>
              <p style={{ margin: '2px 0', fontSize: 13 }}>Code boutique : <code style={{ color: '#60a5fa', fontWeight: 700 }}>{dernierResultat.slug}</code></p>
              <p style={{ margin: '2px 0', fontSize: 13 }}>Email : <code>{dernierResultat.email}</code></p>
            </div>
          )}
        </div>

        <div style={{ ...S.card, marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, margin: '0 0 10px' }}>Tester l'envoi d'e-mails</h2>
          <form onSubmit={tester} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input style={{ ...S.input, flex: '1 1 220px', width: 'auto' }} type="email" placeholder="Votre adresse e-mail de test" value={testMail.email}
              onChange={e => setTestMail(t => ({ ...t, email: e.target.value }))} required />
            <button style={S.btn} type="submit" disabled={testMail.busy}>{testMail.busy ? 'Envoi…' : 'Envoyer un test'}</button>
          </form>
          {testMail.resultat && (
            <p style={{ margin: '10px 0 0', fontSize: 13, color: testMail.resultat.ok ? '#4ade80' : '#fca5a5', wordBreak: 'break-word' }}>{testMail.resultat.message}</p>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <input style={{ ...S.input, flex: '1 1 200px', width: 'auto' }} placeholder="Rechercher (nom, code, email)…" value={recherche} onChange={e => setRecherche(e.target.value)} />
          {['tous', 'actif', 'essai', 'expire', 'suspendu'].map(f => (
            <button key={f} style={filtre === f ? S.btn : S.btnGris} onClick={() => setFiltre(f)}>
              {f === 'tous' ? 'Toutes' : STATUTS[f].label}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          {visibles.length === 0 && <p style={{ color: '#64748b', fontSize: 14 }}>Aucune boutique à afficher.</p>}
          {visibles.map(b => <CarteBoutique key={b.slug} b={b} onAction={action} />)}
        </div>
      </div>
    </div>
  );
}
