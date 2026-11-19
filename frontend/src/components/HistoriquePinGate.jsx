import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

// Verrou par code PIN devant un contenu sensible (Historique Vente / Historique Achat).
// Si aucun PIN n'est configuré (Paramètres), le contenu s'affiche directement — comportement
// inchangé tant que le client n'a rien activé. Le PIN n'est jamais reçu en clair côté
// frontend : on soumet la saisie au serveur qui répond juste ok/pas ok.
// `active` : le verrou ne s'applique que si true (ex: filtre de dates qui dépasse 24h) —
// à false, le contenu reste visible même si un PIN est configuré (ex: historique du jour).
// Une fois déverrouillé, ça reste déverrouillé pour le reste de la visite sur cette page.
export default function HistoriquePinGate({ societe, active = true, children }) {
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState('');
  const [checking, setChecking] = useState(false);

  if (!active || !societe?.historique_pin_actif || unlocked) return children;

  async function verifier(e) {
    e.preventDefault();
    if (!pin) return;
    setChecking(true);
    try {
      const r = await api.post('/config/verifier-historique-pin', { pin });
      if (r.data.ok) { setUnlocked(true); setPin(''); }
      else toast.error('Code PIN incorrect');
    } catch { toast.error('Erreur de vérification'); }
    finally { setChecking(false); }
  }

  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center">
        <Lock size={24} className="text-gray-500"/>
      </div>
      <p className="text-sm font-semibold text-gray-700">Section protégée par code PIN</p>
      <form onSubmit={verifier} className="flex items-center gap-2">
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          className="input w-40 text-center tracking-widest"
          placeholder="Code PIN"
          value={pin}
          onChange={e => setPin(e.target.value)}
        />
        <button type="submit" disabled={checking || !pin} className="btn-primary btn-sm">
          {checking ? '...' : 'Déverrouiller'}
        </button>
      </form>
    </div>
  );
}
