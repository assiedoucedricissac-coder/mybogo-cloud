import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, CheckCircle, Mail } from 'lucide-react';

export default function SubscribePending() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4" style={{ fontFamily: 'Segoe UI, Arial, sans-serif' }}>
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
        <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <Clock size={40} className="text-yellow-500" />
        </div>
        <h1 className="text-2xl font-black text-gray-900 mb-3">Paiement en attente de confirmation</h1>
        <p className="text-gray-500 text-sm mb-6 leading-relaxed">
          Votre demande a bien été enregistrée. Une fois votre paiement Wave vérifié, votre boutique sera activée et vous recevrez vos identifiants de connexion.
        </p>

        <div className="bg-blue-50 rounded-xl p-4 border border-blue-100 mb-6 text-left space-y-3">
          <div className="flex items-start gap-3">
            <CheckCircle size={18} className="text-green-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-gray-700">Votre boutique sera créée automatiquement après confirmation.</p>
          </div>
          <div className="flex items-start gap-3">
            <Mail size={18} className="text-blue-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-gray-700">Vous recevrez vos identifiants à l'adresse email fournie.</p>
          </div>
          <div className="flex items-start gap-3">
            <Clock size={18} className="text-yellow-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-gray-700">Délai habituel : moins de 24 heures (souvent immédiat).</p>
          </div>
        </div>

        <button
          onClick={() => navigate('/')}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors"
        >
          Retour à l'accueil
        </button>
      </div>
    </div>
  );
}
