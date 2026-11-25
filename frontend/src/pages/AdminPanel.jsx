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
  actif:    { label: 'Active',    couleur: '#22c55e' },
  essai:    { label: 'Essai',     couleur: '#3b82f6' },
  expire:   { label: 'Expirée',   couleur: '#f59e0b' },
  suspendu: { label: 'Suspendue', couleur: '#ef4444' },
  inconnu:  { label: 'Illisible', couleur: '#64748b' },
};
const ROLES = { admin: 'Administrateur', gestionnaire: 'Gestionnaire', caissier: 'Caissier', magasinier: 'Magasinier', comptable: 'Comptable' };
const fmtDate = d => (d ? new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('fr-FR') : '—');
const fmtDateHeure = d => (d ? new Date(d.replace(' ', 'T') + (d.includes('Z') ? '' : 'Z')).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : 'Jamais');
const fmtMontant = n => `${Math.round(n || 0).toLocaleString('fr-FR')} FCFA`;

const S = {
  page: { minHeight: '100vh', background: '#0f172a', color: '#e2e8f0', fontFamily: 'Segoe UI, Arial, sans-serif', padding: '24px 16px' },
  wrap: { maxWidth: 1100, margin: '0 auto' },
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
  return <span style={{ background: s.couleur + '22', color: s.couleur, border: `1px solid ${s.couleur}55`, borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>{s.label}</span>;
}

function Stat({ label, valeur, couleur }) {
  return (
    <div style={{ ...S.card, padding: 14, flex: '1 1 130px', minWidth: 0 }}>
      <div style={{ fontSize: 12, color: '#94a3b8' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: couleur || '#e2e8f0', marginTop: 2, wordBreak: 'break-word' }}>{valeur}</div>
    </div>
  );
}

function Mini({ label, valeur, couleur }) {
  return (
    <div style={{ background: '#0f172a', borderRadius: 10, padding: '8px 4px', textAlign: 'center', minWidth: 0 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: couleur || '#e2e8f0', wordBreak: 'break-word' }}>{valeur}</div>
      <div style={{ fontSize: 10, color: '#94a3b8' }}>{label}</div>
    </div>
  );
}

function licenceTexte(b) {
  if (!b.expiresAt) return { valeur: '—', label: 'Licence', couleur: '#e2e8f0' };
  if (b.statut === 'suspendu') return { valeur: 'Bloquée', label: 'Suspendue', couleur: STATUTS.suspendu.couleur };
  if (b.joursRestants <= 0) return { valeur: fmtDate(b.expiresAt), label: 'Expirée', couleur: STATUTS.expire.couleur };
  return {
    valeur: `${b.joursRestants} j`,
    label: `jusqu'au ${fmtDate(b.expiresAt)}`,
    couleur: b.joursRestants <= 5 ? STATUTS.expire.couleur : '#e2e8f0',
  };
}

function messageAcces(b, mdp) {
  const lien = `${window.location.origin}/login`;
  return [
    `Bonjour,`,
    ``,
    `Votre espace de gestion MYBOGO-STOCK est prêt ! 🎉`,
    ``,
    `🏪 Boutique : ${b.nom}`,
    `🔗 Lien de connexion : ${lien}`,
    `🏷️ Code boutique : ${b.slug}`,
    `👤 Email : ${b.email}`,
    `🔑 Mot de passe : ${mdp || '[mot de passe]'}`,
    ``,
    `En cas de problème, contactez-nous.`,
    `Bonne utilisation !`,
  ].join('\n');
}

function CarteBoutique({ b, onOuvrir, onAcceder }) {
  const [msgOuvert, setMsgOuvert] = useState(false);
  const [mdp, setMdp] = useState('');
  const [copie, setCopie] = useState(false);
  const lic = licenceTexte(b);
  const message = messageAcces(b, mdp);

  async function copier() {
    try { await navigator.clipboard.writeText(message); setCopie(true); setTimeout(() => setCopie(false), 2000); } catch {}
  }

  return (
    <div style={{ ...S.card, padding: 0, overflow: 'hidden', minWidth: 0 }}>
      <button onClick={() => onOuvrir(b.slug)} style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%', boxSizing: 'border-box', padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start', marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: '#1d4ed8', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, flexShrink: 0 }}>
              {(b.nom || '?')[0].toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15, wordBreak: 'break-word' }}>{b.nom}</div>
              <div style={{ fontSize: 12, color: '#60a5fa', fontFamily: 'monospace' }}>{b.slug}</div>
              <div style={{ fontSize: 12, color: '#94a3b8', wordBreak: 'break-all' }}>{b.email}</div>
              {b.telephone && <div style={{ fontSize: 12, color: '#94a3b8' }}>{b.telephone}</div>}
            </div>
          </div>
          <Badge statut={b.statut} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <Mini label="Utilisateurs" valeur={b.nbUtilisateurs ?? '—'} />
          <Mini label="Ventes" valeur={b.nbVentes ?? '—'} />
          <Mini label={lic.label} valeur={lic.valeur} couleur={lic.couleur} />
        </div>
      </button>

      <div style={{ display: 'flex', borderTop: '1px solid #334155' }}>
        <button onClick={() => onAcceder(b.slug)} style={{ flex: 1, padding: '10px 0', background: 'transparent', border: 'none', borderRight: '1px solid #334155', color: '#34d399', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Accéder</button>
        <button onClick={() => setMsgOuvert(o => !o)} style={{ flex: 1, padding: '10px 0', background: 'transparent', border: 'none', color: '#60a5fa', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>{msgOuvert ? 'Masquer' : 'Message'}</button>
      </div>

      {msgOuvert && (
        <div style={{ padding: 14, borderTop: '1px dashed #334155' }}>
          <label style={S.label}>Mot de passe à indiquer au client</label>
          <input style={S.input} value={mdp} onChange={e => setMdp(e.target.value)} placeholder="Saisir le mot de passe…" />
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 12, background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: 10, margin: '10px 0', maxHeight: 220, overflowY: 'auto' }}>{message}</pre>
          <button style={S.btn} onClick={copier}>{copie ? 'Copié ✓' : 'Copier le message'}</button>
        </div>
      )}
    </div>
  );
}

function OngletLicence({ b, onAction, onDate }) {
  const [mode, setMode] = useState(null);
  const [jours, setJours] = useState('30');
  const [date, setDate] = useState(b.expiresAt || '');
  const [busy, setBusy] = useState(false);
  const suspendu = b.statut === 'suspendu';

  async function valider(chemin, corps) {
    setBusy(true);
    const ok = await onAction(b.slug, chemin, corps);
    setBusy(false);
    if (ok) setMode(null);
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={S.card}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Date d'expiration de la licence</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input style={{ ...S.input, width: 200 }} type="date" value={date} onChange={e => setDate(e.target.value)} />
          <button style={S.btn} disabled={busy || !date} onClick={async () => { setBusy(true); await onDate(b.slug, date); setBusy(false); }}>Enregistrer la date</button>
        </div>
        <p style={{ fontSize: 12, color: '#94a3b8', margin: '8px 0 0' }}>
          Actuellement : {b.expiresAt ? fmtDate(b.expiresAt) : '—'} ({b.licenceType === 'trial' ? 'essai' : b.licenceType === 'suspended' ? 'suspendue' : 'licence payée'})
        </p>
      </div>

      <div style={S.card}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Ajouter du temps</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {['15', '30', '90', '365'].map(j => (
            <button key={j} style={jours === j ? S.btn : S.btnGris} onClick={() => setJours(j)}>{j} jours</button>
          ))}
          <input style={{ ...S.input, width: 90 }} type="number" min="1" value={jours} onChange={e => setJours(e.target.value)} />
          <button style={S.btnVert} disabled={busy} onClick={() => valider('prolonger', { jours: Number(jours) })}>Prolonger</button>
        </div>
      </div>

      <div style={{ ...S.card, border: `2px solid ${suspendu ? '#7f1d1d' : '#14532d'}` }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 15 }}>Statut d'accès : <span style={{ color: suspendu ? '#f87171' : '#4ade80' }}>{suspendu ? 'Suspendue — aucun accès' : 'Active — les utilisateurs peuvent se connecter'}</span></h3>
        {mode === 'suspendre' ? (
          <div>
            <p style={{ fontSize: 13, color: '#fca5a5', margin: '6px 0 10px' }}>Les utilisateurs de cette boutique seront bloqués immédiatement. Leurs données sont conservées.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={S.btnRouge} disabled={busy} onClick={() => valider('suspendre', {})}>Confirmer la suspension</button>
              <button style={S.btnGris} onClick={() => setMode(null)}>Annuler</button>
            </div>
          </div>
        ) : suspendu ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
            <input style={{ ...S.input, width: 90 }} type="number" min="1" value={jours} onChange={e => setJours(e.target.value)} />
            <span style={{ fontSize: 13, color: '#94a3b8' }}>jours</span>
            <button style={S.btnVert} disabled={busy} onClick={() => valider('reactiver', { jours: Number(jours) })}>Réactiver l'accès</button>
          </div>
        ) : (
          <button style={{ ...S.btnGris, marginTop: 8 }} onClick={() => setMode('suspendre')}>Suspendre cette boutique</button>
        )}
      </div>
    </div>
  );
}

function LigneUtilisateur({ slug, u, notifier, recharger }) {
  const [edition, setEdition] = useState(false);
  const [mdp, setMdp] = useState('');
  const [busy, setBusy] = useState(false);

  async function basculer() {
    setBusy(true);
    try { await adminApi.post(`/boutiques/${encodeURIComponent(slug)}/utilisateurs/${u.id}/basculer`); await recharger(); }
    catch (e) { notifier(e.response?.data?.message || 'Action impossible.', true); }
    setBusy(false);
  }
  async function changerMdp() {
    setBusy(true);
    try {
      await adminApi.post(`/boutiques/${encodeURIComponent(slug)}/utilisateurs/${u.id}/mot-de-passe`, { motDePasse: mdp });
      notifier('Mot de passe modifié.');
      setEdition(false); setMdp('');
    } catch (e) { notifier(e.response?.data?.message || 'Action impossible.', true); }
    setBusy(false);
  }

  return (
    <div style={{ ...S.card, padding: 14, opacity: u.actif ? 1 : 0.6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, wordBreak: 'break-word' }}>{u.prenom} {u.nom}</div>
          <div style={{ fontSize: 12, color: '#94a3b8', wordBreak: 'break-all' }}>{u.email}</div>
        </div>
        <span style={{ background: '#1d4ed822', color: '#93c5fd', border: '1px solid #1d4ed855', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>{ROLES[u.role] || u.role}</span>
      </div>
      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>Dernière connexion : {fmtDateHeure(u.derniere_connexion)} · {u.actif ? 'Compte actif' : 'Compte désactivé'}</div>
      {edition ? (
        <div style={{ marginTop: 10 }}>
          <input style={S.input} value={mdp} onChange={e => setMdp(e.target.value)} placeholder="Nouveau mot de passe (6 caractères min.)" />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button style={S.btnVert} disabled={busy || mdp.length < 6} onClick={changerMdp}>Changer</button>
            <button style={S.btnGris} onClick={() => { setEdition(false); setMdp(''); }}>Annuler</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          <button style={S.btnGris} onClick={() => setEdition(true)}>Mot de passe</button>
          <button style={u.actif ? S.btnGris : S.btnVert} disabled={busy} onClick={basculer}>{u.actif ? 'Désactiver' : 'Activer'}</button>
        </div>
      )}
    </div>
  );
}

function OngletComptes({ slug, notifier }) {
  const [liste, setListe] = useState(null);
  async function charger() {
    try { setListe((await adminApi.get(`/boutiques/${encodeURIComponent(slug)}/utilisateurs`)).data); }
    catch { notifier('Chargement des comptes impossible.', true); setListe([]); }
  }
  useEffect(() => { charger(); }, [slug]);
  if (!liste) return <p style={{ color: '#94a3b8' }}>Chargement…</p>;
  if (liste.length === 0) return <p style={{ color: '#64748b' }}>Aucun compte.</p>;
  return <div style={{ display: 'grid', gap: 10 }}>{liste.map(u => <LigneUtilisateur key={u.id} slug={slug} u={u} notifier={notifier} recharger={charger} />)}</div>;
}

function ZoneSuppression({ b, onSupprimer }) {
  const [ouvert, setOuvert] = useState(false);
  const [saisie, setSaisie] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div style={{ ...S.card, marginTop: 18, border: '1px solid #7f1d1d' }}>
      <h3 style={{ margin: '0 0 6px', fontSize: 15, color: '#fca5a5' }}>Zone dangereuse</h3>
      {!ouvert ? (
        <>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 10px' }}>Supprime la boutique, toutes ses données et ses comptes. Action irréversible.</p>
          <button style={S.btnRouge} onClick={() => setOuvert(true)}>Supprimer cette boutique</button>
        </>
      ) : (
        <>
          <p style={{ fontSize: 13, color: '#fca5a5', margin: '0 0 10px' }}>
            Tapez le code <strong style={{ fontFamily: 'monospace' }}>{b.slug}</strong> pour confirmer la suppression définitive de « {b.nom} » : produits, ventes, clients et comptes seront perdus.
          </p>
          <input style={S.input} value={saisie} onChange={e => setSaisie(e.target.value)} placeholder={b.slug} />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button style={S.btnRouge} disabled={busy || saisie.trim() !== b.slug}
              onClick={async () => { setBusy(true); const ok = await onSupprimer(b.slug, saisie.trim()); if (!ok) setBusy(false); }}>
              {busy ? 'Suppression…' : 'Supprimer définitivement'}
            </button>
            <button style={S.btnGris} onClick={() => { setOuvert(false); setSaisie(''); }}>Annuler</button>
          </div>
        </>
      )}
    </div>
  );
}

function FicheBoutique({ b, onRetour, onAction, onDate, onAcceder, onSupprimer, notifier }) {
  const [tab, setTab] = useState('licence');
  const lic = licenceTexte(b);
  const tabs = [['licence', 'Licence'], ['comptes', 'Comptes']];
  return (
    <div>
      <button style={{ ...S.btnGris, marginBottom: 14 }} onClick={onRetour}>← Toutes les boutiques</button>
      <div style={{ ...S.card, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: '#1d4ed8', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 22, flexShrink: 0 }}>{(b.nom || '?')[0].toUpperCase()}</div>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ margin: 0, fontSize: 19, wordBreak: 'break-word' }}>{b.nom}</h2>
              <div style={{ fontSize: 13, color: '#94a3b8' }}>Code : <span style={{ color: '#60a5fa', fontFamily: 'monospace', fontWeight: 700 }}>{b.slug}</span> · créée le {new Date(b.createdAt).toLocaleDateString('fr-FR')}</div>
              <div style={{ fontSize: 13, color: '#94a3b8', wordBreak: 'break-all' }}>{b.email}{b.telephone ? ` · ${b.telephone}` : ''}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Badge statut={b.statut} />
            <button style={S.btnVert} onClick={() => onAcceder(b.slug)}>Accéder à la boutique</button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, marginTop: 14 }}>
          <Mini label="Utilisateurs" valeur={b.nbUtilisateurs ?? '—'} />
          <Mini label="Produits" valeur={b.nbProduits ?? '—'} />
          <Mini label="Clients" valeur={b.nbClients ?? '—'} />
          <Mini label="Ventes" valeur={b.nbVentes ?? '—'} />
          <Mini label="Chiffre d'affaires" valeur={fmtMontant(b.chiffreAffaires)} />
          <Mini label={lic.label} valeur={lic.valeur} couleur={lic.couleur} />
        </div>
        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 10 }}>
          Dernière connexion : {fmtDateHeure(b.derniereConnexion)}
          {b.dernierPaiement && <> · dernier paiement : {b.dernierPaiement.plan} ({fmtMontant(b.dernierPaiement.montant)})</>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {tabs.map(([k, l]) => <button key={k} style={tab === k ? S.btn : S.btnGris} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === 'licence' ? <OngletLicence b={b} onAction={onAction} onDate={onDate} /> : <OngletComptes slug={b.slug} notifier={notifier} />}
      <ZoneSuppression b={b} onSupprimer={onSupprimer} />
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
  const [notice, setNotice] = useState(null);
  const [ouverte, setOuverte] = useState(null); // slug de la boutique affichée en fiche
  const [formOuvert, setFormOuvert] = useState(false);
  const [form, setForm] = useState({ slug: '', nomBoutique: '', email: '', motDePasse: '', dureeJours: '15' });
  const [creation, setCreation] = useState(false);
  const [dernierResultat, setDernierResultat] = useState(null);
  const [testMail, setTestMail] = useState({ email: '', busy: false, resultat: null });

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
    setOuverte(null);
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

  async function supprimer(slug, confirmation) {
    try {
      await adminApi.post(`/boutiques/${encodeURIComponent(slug)}/supprimer`, { confirmation });
      afficher('Boutique supprimée.');
      setOuverte(null);
      await charger();
      return true;
    } catch (e) {
      afficher(e.response?.data?.message || 'Suppression impossible.', true);
      return false;
    }
  }

  async function definirDate(slug, date) {
    const ok = await action(slug, 'expiration', { date });
    return ok;
  }

  async function acceder(slug) {
    try {
      const r = await adminApi.post(`/boutiques/${encodeURIComponent(slug)}/acceder`);
      try {
        localStorage.setItem('token', r.data.token);
        localStorage.setItem('user', JSON.stringify(r.data.user));
        localStorage.setItem('boutique', r.data.boutique);
      } catch {}
      window.open('/', '_blank');
    } catch (e) {
      afficher(e.response?.data?.message || 'Accès impossible.', true);
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
  const fiche = ouverte ? data.boutiques.find(b => b.slug === ouverte) : null;

  return (
    <div style={S.page}>
      <div style={S.wrap}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 22, margin: 0 }}>Centre de gestion</h1>
            <p style={{ color: '#94a3b8', fontSize: 13, margin: '2px 0 0' }}>Mode super admin — toutes les boutiques MYBOGO-STOCK</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={S.btnGris} onClick={charger}>Actualiser</button>
            <button style={S.btnGris} onClick={deconnexion}>Déconnexion</button>
          </div>
        </div>

        {notice && (
          <div style={{ background: notice.erreur ? '#7f1d1d' : '#14532d', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 14 }}>{notice.texte}</div>
        )}

        {fiche ? (
          <FicheBoutique b={fiche} onRetour={() => setOuverte(null)} onAction={action} onDate={definirDate} onAcceder={acceder} onSupprimer={supprimer} notifier={afficher} />
        ) : (
          <>
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

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <div>
                <h2 style={{ fontSize: 17, margin: 0 }}>Gestion des boutiques</h2>
                <p style={{ color: '#94a3b8', fontSize: 13, margin: '2px 0 0' }}>{data.boutiques.length} boutique{data.boutiques.length !== 1 ? 's' : ''} enregistrée{data.boutiques.length !== 1 ? 's' : ''}</p>
              </div>
              <button style={S.btn} onClick={() => setFormOuvert(o => !o)}>{formOuvert ? 'Fermer' : '+ Nouvelle boutique'}</button>
            </div>

            {formOuvert && (
              <div style={{ ...S.card, marginBottom: 16 }}>
                <form onSubmit={creerBoutique} style={{ display: 'grid', gap: 10 }}>
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
                {dernierResultat && (
                  <div style={{ marginTop: 14, background: '#0f172a', border: '1px solid #16a34a', borderRadius: 10, padding: 14 }}>
                    <p style={{ color: '#4ade80', fontWeight: 700, margin: '0 0 6px' }}>Boutique créée. Utilisez « Message » sur sa carte pour envoyer les accès.</p>
                    <p style={{ margin: '2px 0', fontSize: 13 }}>Code boutique : <code style={{ color: '#60a5fa', fontWeight: 700 }}>{dernierResultat.slug}</code> · Email : <code>{dernierResultat.email}</code></p>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
              <input style={{ ...S.input, flex: '1 1 200px', width: 'auto' }} placeholder="Rechercher (nom, code, email)…" value={recherche} onChange={e => setRecherche(e.target.value)} />
              {['tous', 'actif', 'essai', 'expire', 'suspendu'].map(f => (
                <button key={f} style={filtre === f ? S.btn : S.btnGris} onClick={() => setFiltre(f)}>
                  {f === 'tous' ? 'Toutes' : STATUTS[f].label}
                </button>
              ))}
            </div>

            {visibles.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: 14 }}>{data.boutiques.length === 0 ? "Aucune boutique pour l'instant. Créez la première avec « + Nouvelle boutique »." : 'Aucune boutique ne correspond.'}</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 14 }}>
                {visibles.map(b => <CarteBoutique key={b.slug} b={b} onOuvrir={setOuverte} onAcceder={acceder} />)}
              </div>
            )}

            <div style={{ ...S.card, marginTop: 24 }}>
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
          </>
        )}
      </div>
    </div>
  );
}
