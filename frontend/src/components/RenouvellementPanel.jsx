import React, { useEffect, useState } from 'react';
import { Zap } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

const METHODES = [
  { id: 'wave', label: 'Wave' },
  { id: 'orange', label: 'Orange Money' },
  { id: 'mtn', label: 'MTN MoMo' },
  { id: 'moov', label: 'Moov Money' },
];

const periode = jours => (jours >= 365 ? 'an' : jours >= 90 ? 'trimestre' : 'mois');
const fmt = n => Number(n).toLocaleString('fr-FR');

export default function RenouvellementPanel() {
  const [plans, setPlans] = useState([]);
  const [plan, setPlan] = useState('');
  const [methode, setMethode] = useState('wave');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/public/plans').then(r => {
      setPlans(r.data);
      const defaut = r.data.find(p => p.code === 'mensuel') || r.data[0];
      if (defaut) setPlan(defaut.code);
    }).catch(() => toast.error('Impossible de charger les formules'));
  }, []);

  const choisi = plans.find(p => p.code === plan);

  async function payer() {
    if (!choisi) return;
    setLoading(true);
    try {
      const r = await api.post('/licence/renouveler', { plan, methode });
      window.location.href = r.data.redirect_url;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Paiement impossible');
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 text-left">
      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Choisir une formule</p>
        <div className="grid grid-cols-3 gap-2">
          {plans.map(p => (
            <button key={p.code} type="button" onClick={() => setPlan(p.code)}
              className={`rounded-xl p-2 text-center border-2 transition-all ${plan === p.code ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}`}>
              <p className="font-bold text-gray-900 text-xs">{p.nom}</p>
              <p className="text-blue-600 font-black text-sm">{fmt(p.prix)}</p>
              <p className="text-gray-400 text-[10px]">FCFA/{periode(p.duree_jours)}</p>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Payer avec</p>
        <div className="grid grid-cols-2 gap-2">
          {METHODES.map(m => (
            <button key={m.id} type="button" onClick={() => setMethode(m.id)}
              className={`rounded-xl px-3 py-2 text-sm font-bold border-2 transition-all ${methode === m.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 hover:border-blue-300 text-gray-700'}`}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <button onClick={payer} disabled={loading || !choisi}
        className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-colors shadow">
        <Zap size={16} />
        {loading ? 'Redirection vers le paiement…' : choisi ? `Payer ${fmt(choisi.prix)} FCFA` : 'Chargement…'}
      </button>
      <p className="text-center text-xs text-gray-400">Paiement sécurisé via Jèko. Votre accès est prolongé automatiquement après confirmation.</p>
    </div>
  );
}
