import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle, Loader } from 'lucide-react';
import api from '../services/api';

export default function PaiementSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const ref = searchParams.get('ref') || '';
  const [statut, setStatut] = useState('loading'); // loading | actif | pending
  const [boutique, setBoutique] = useState(null);

  useEffect(() => {
    if (!ref) { setStatut('pending'); return; }
    let tries = 0;
    const poll = async () => {
      try {
        const r = await api.get(`/public/paiement/statut/${encodeURIComponent(ref)}`);
        if (r.data.statut === 'actif') {
          setBoutique(r.data);
          setStatut('actif');
        } else {
          tries++;
          if (tries < 12) setTimeout(poll, 5000);
          else setStatut('pending');
        }
      } catch {
        tries++;
        if (tries < 12) setTimeout(poll, 5000);
        else setStatut('pending');
      }
    };
    poll();
  }, [ref]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4" style={{ fontFamily: 'Segoe UI, Arial, sans-serif' }}>
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">

        {statut === 'loading' && (
          <>
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Loader size={32} className="text-blue-600 animate-spin" />
            </div>
            <h2 className="text-xl font-black text-gray-900 mb-2">Vérification du paiement…</h2>
            <p className="text-gray-500 text-sm">Nous confirmons votre paiement auprès de Jèko. Cela peut prendre quelques secondes.</p>
          </>
        )}

        {statut === 'actif' && boutique && (
          <>
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} className="text-green-600" />
            </div>
            <h2 className="text-2xl font-black text-gray-900 mb-2">Boutique activée !</h2>
            <p className="text-gray-500 text-sm mb-6">
              Votre espace <strong>{boutique.nom_boutique}</strong> est prêt. Connectez-vous avec votre email.
            </p>
            <button
              onClick={() => navigate('/login')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors shadow"
            >
              Se connecter maintenant
            </button>
          </>
        )}

        {statut === 'pending' && (
          <>
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} className="text-yellow-600" />
            </div>
            <h2 className="text-xl font-black text-gray-900 mb-2">Paiement reçu</h2>
            <p className="text-gray-500 text-sm mb-6">
              Votre paiement a bien été enregistré. Votre boutique sera activée sous quelques minutes.
              Vérifiez votre email <strong>{ref ? ref.replace(/^MYBOGO-([^-]+)-.*$/, '$1') : ''}</strong> pour vos accès.
            </p>
            <button
              onClick={() => navigate('/subscribe/pending')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors shadow"
            >
              Voir le statut
            </button>
          </>
        )}
      </div>
    </div>
  );
}
