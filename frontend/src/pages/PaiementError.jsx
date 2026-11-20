import React from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { XCircle, RefreshCw } from 'lucide-react';

export default function PaiementError() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const ref = searchParams.get('ref') || '';

  const slug = ref.replace(/^MYBOGO-([^-]+)-.*$/, '$1');

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4" style={{ fontFamily: 'Segoe UI, Arial, sans-serif' }}>
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <XCircle size={32} className="text-red-500" />
        </div>
        <h2 className="text-2xl font-black text-gray-900 mb-2">Paiement annulé</h2>
        <p className="text-gray-500 text-sm mb-6">
          Votre paiement n'a pas abouti. Aucun montant n'a été débité.
          {slug && <> Votre réservation pour <strong>{slug}</strong> est toujours en attente.</>}
        </p>
        <button
          onClick={() => navigate('/subscribe')}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors shadow mb-3"
        >
          <RefreshCw size={18} /> Réessayer
        </button>
        <button onClick={() => navigate('/')} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
          Retour à l'accueil
        </button>
      </div>
    </div>
  );
}
