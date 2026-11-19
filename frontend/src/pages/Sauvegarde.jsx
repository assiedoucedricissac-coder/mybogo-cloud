import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import {
  Download, Upload, Database, HardDrive, Users, Package,
  ShoppingCart, AlertTriangle, CheckCircle, Clock, Info,
  RefreshCw, Usb, Cloud, FolderOpen
} from 'lucide-react';

function fmt(bytes) {
  if (bytes < 1024) return bytes + ' o';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' Ko';
  return (bytes / (1024 * 1024)).toFixed(2) + ' Mo';
}
function dateHeure(d) {
  return new Date(d).toLocaleString('fr-FR', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

const LS_KEY = 'mybogo_backup_history';

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; }
}
function saveHistory(list) {
  localStorage.setItem(LS_KEY, JSON.stringify(list.slice(0, 20)));
}

export default function Sauvegarde() {
  const [infos, setInfos]         = useState(null);
  const [loading, setLoading]     = useState(true);
  const [telechargement, setTel]  = useState(false);
  const [restauration, setRest]   = useState(false);
  const [history, setHistory]     = useState(loadHistory());
  const [autoStatut, setAutoStatut] = useState(null);
  const [lancementAuto, setLancementAuto] = useState(false);
  const [confirmReset, setConfirmReset] = useState('');
  const [reinitialisation, setReinit] = useState(false);
  const fileRef = useRef();

  useEffect(() => { chargerInfos(); chargerStatutAuto(); }, []);

  async function chargerStatutAuto() {
    try {
      const r = await api.get('/backup/auto/statut');
      setAutoStatut(r.data);
    } catch {}
  }

  async function lancerMaintenant() {
    setLancementAuto(true);
    try {
      await api.post('/backup/auto/lancer');
      toast.success('Sauvegarde automatique lancée !');
      setTimeout(chargerStatutAuto, 2000);
    } catch { toast.error('Erreur lors du lancement'); }
    finally { setLancementAuto(false); }
  }

  async function chargerInfos() {
    setLoading(true);
    try {
      const r = await api.get('/backup/infos');
      setInfos(r.data);
    } catch {
      toast.error('Impossible de charger les infos de la base');
    } finally { setLoading(false); }
  }

  async function telecharger() {
    setTel(true);
    try {
      const r = await api.get('/backup/telecharger', { responseType: 'blob', timeout: 60000 });
      const d   = new Date();
      const nom = `mybogo-sauvegarde-${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}.db`;
      const url = URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a');
      a.href = url; a.download = nom; a.click();
      URL.revokeObjectURL(url);

      const newEntry = { date: new Date().toISOString(), nom, taille: r.data.size };
      const updated  = [newEntry, ...history];
      setHistory(updated);
      saveHistory(updated);
      toast.success('Sauvegarde téléchargée avec succès !');
    } catch { toast.error('Erreur lors du téléchargement'); }
    finally  { setTel(false); }
  }

  async function reinitialiser() {
    if (confirmReset !== 'REINITIALISER') return;
    const ok = window.confirm(
      "⚠️ DERNIÈRE CONFIRMATION\n\nTous les produits, ventes, achats, factures, clients et fournisseurs vont être définitivement supprimés.\nUne sauvegarde de sécurité sera conservée automatiquement, mais cette action est destinée à repartir sur une base vierge (ex: avant d'installer chez un nouveau client).\n\nContinuer ?"
    );
    if (!ok) return;
    setReinit(true);
    try {
      await api.post('/backup/reinitialiser', { confirmation: confirmReset });
      toast.success('Données effacées — base vierge. Redémarrez l\'application.', { duration: 8000 });
      setConfirmReset('');
      setTimeout(() => window.location.reload(), 3000);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Erreur lors de la réinitialisation');
    } finally { setReinit(false); }
  }

  async function restaurer(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.db')) {
      toast.error('Sélectionnez un fichier .db (sauvegarde MYBOGO)');
      return;
    }
    const ok = window.confirm(
      `⚠️ ATTENTION\n\nVous allez remplacer TOUTES les données actuelles par celles du fichier :\n"${file.name}"\n\nCette action est irréversible.\n\nContinuer ?`
    );
    if (!ok) { e.target.value = ''; return; }

    setRest(true);
    try {
      const form = new FormData();
      form.append('backup', file);
      await api.post('/backup/restaurer', form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 });
      toast.success('Restauration effectuée ! Redémarrez l\'application.', { duration: 8000 });
      setTimeout(() => window.location.reload(), 3000);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Erreur lors de la restauration');
    } finally {
      setRest(false);
      e.target.value = '';
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* En-tête */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <HardDrive className="text-blue-600" size={24}/> Sauvegarde & Restauration
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Protégez vos données en les sauvegardant régulièrement sur une clé USB ou Google Drive.
        </p>
      </div>

      {/* État de la base */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2 mb-4">
          <Database size={16} className="text-blue-500"/> État de la base de données
        </h2>
        {loading ? (
          <div className="flex items-center gap-3 text-gray-400 py-4">
            <RefreshCw size={18} className="animate-spin"/> Chargement…
          </div>
        ) : infos ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Taille', value: fmt(infos.taille), icon: HardDrive, color: 'blue' },
              { label: 'Ventes', value: infos.nb_ventes, icon: ShoppingCart, color: 'emerald' },
              { label: 'Produits', value: infos.nb_produits, icon: Package, color: 'violet' },
              { label: 'Clients', value: infos.nb_clients, icon: Users, color: 'orange' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className={`bg-${color}-50 border border-${color}-100 rounded-xl p-3 text-center`}>
                <Icon size={18} className={`text-${color}-500 mx-auto mb-1`}/>
                <p className={`text-xl font-bold text-${color}-700`}>{value}</p>
                <p className={`text-xs text-${color}-500`}>{label}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-red-500 text-sm">Impossible de lire les informations</p>
        )}
        {infos && (
          <p className="text-xs text-gray-400 mt-3 flex items-center gap-1">
            <Clock size={11}/> Dernière modification : {dateHeure(infos.derniere_modif)}
          </p>
        )}
      </div>

      {/* Sauvegarde automatique */}
      <div className="bg-white rounded-2xl shadow-sm border border-blue-100 p-5">
        <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2 mb-3">
          <RefreshCw size={16} className="text-blue-500"/> Sauvegarde automatique
        </h2>

        {/* Statut dernière sauvegarde */}
        <div className={`flex items-center gap-3 p-3 rounded-xl mb-4 ${autoStatut?.dernierBackup ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'}`}>
          {autoStatut?.dernierBackup
            ? <CheckCircle size={18} className="text-emerald-500 flex-shrink-0"/>
            : <Clock size={18} className="text-amber-500 flex-shrink-0"/>
          }
          <div>
            <p className={`text-sm font-semibold ${autoStatut?.dernierBackup ? 'text-emerald-700' : 'text-amber-700'}`}>
              {autoStatut?.dernierBackup
                ? `Dernière sauvegarde : ${dateHeure(autoStatut.dernierBackup)}`
                : 'Aucune sauvegarde effectuée depuis le démarrage'
              }
            </p>
            <p className="text-xs text-gray-500 mt-0.5">Fréquence : toutes les 2 heures · 7 fichiers conservés</p>
          </div>
        </div>

        {/* Destinations */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          {[
            { icon: HardDrive, label: 'Local (AppData)', desc: 'Toujours actif', ok: true },
            { icon: Usb, label: 'Clé USB', desc: 'Branchez une clé USB — copie automatique', ok: false },
            { icon: Cloud, label: 'OneDrive / Drive', desc: 'Installé sur le PC — copie automatique', ok: false },
          ].map(({ icon: Icon, label, desc, ok }) => (
            <div key={label} className={`flex gap-2 p-3 rounded-xl border text-sm ${ok ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200'}`}>
              <Icon size={16} className={`mt-0.5 flex-shrink-0 ${ok ? 'text-emerald-500' : 'text-gray-400'}`}/>
              <div>
                <p className={`font-medium ${ok ? 'text-emerald-700' : 'text-gray-600'}`}>{label}</p>
                <p className="text-gray-400 text-xs mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={lancerMaintenant}
          disabled={lancementAuto}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm"
        >
          {lancementAuto
            ? <><RefreshCw size={15} className="animate-spin"/> En cours…</>
            : <><RefreshCw size={15}/> Sauvegarder maintenant</>
          }
        </button>

        <p className="text-xs text-gray-400 mt-3 flex items-center gap-1">
          <Info size={11}/>
          Les fichiers sont copiés dans <span className="font-mono">MYBOGO-SAUVEGARDES\</span> sur chaque destination détectée.
        </p>
      </div>

      {/* Télécharger une sauvegarde */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2 mb-2">
          <Download size={16} className="text-emerald-500"/> Créer une sauvegarde
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Télécharge un fichier <span className="font-mono font-semibold">.db</span> contenant toutes vos données
          (produits, ventes, clients, stock…). Enregistrez ce fichier sur une clé USB ou Google Drive.
        </p>
        <button
          onClick={telecharger}
          disabled={telechargement}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold px-6 py-3 rounded-xl transition-colors shadow-sm"
        >
          {telechargement
            ? <><RefreshCw size={17} className="animate-spin"/> Préparation…</>
            : <><Download size={17}/> Télécharger la sauvegarde</>
          }
        </button>

        {/* Instructions */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { icon: Usb, title: 'Clé USB', desc: 'Branchez la clé, puis déplacez le fichier .db téléchargé dessus.' },
            { icon: Cloud, title: 'Google Drive', desc: 'Uploadez le fichier dans Google Drive depuis votre navigateur.' },
            { icon: FolderOpen, title: 'Dossier local', desc: 'Conservez plusieurs versions datées dans un dossier dédié.' },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex gap-2 p-3 bg-gray-50 rounded-xl border border-gray-100 text-sm">
              <Icon size={16} className="text-gray-400 mt-0.5 flex-shrink-0"/>
              <div><p className="font-medium text-gray-700">{title}</p><p className="text-gray-400 text-xs mt-0.5">{desc}</p></div>
            </div>
          ))}
        </div>
      </div>

      {/* Historique */}
      {history.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2 mb-3">
            <Clock size={16} className="text-gray-500"/> Historique des sauvegardes
          </h2>
          <div className="space-y-2">
            {history.map((h, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle size={14} className="text-emerald-500 flex-shrink-0"/>
                  <div>
                    <p className="font-mono text-gray-700 text-xs">{h.nom}</p>
                    <p className="text-gray-400 text-xs">{dateHeure(h.date)}</p>
                  </div>
                </div>
                <span className="text-xs text-gray-400">{fmt(h.taille)}</span>
              </div>
            ))}
          </div>
          <button
            onClick={() => { setHistory([]); saveHistory([]); }}
            className="text-xs text-gray-400 hover:text-red-400 mt-2"
          >
            Effacer l'historique
          </button>
        </div>
      )}

      {/* Restaurer */}
      <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-5">
        <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2 mb-2">
          <Upload size={16} className="text-red-500"/> Restaurer une sauvegarde
        </h2>

        <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl mb-4">
          <AlertTriangle size={16} className="text-amber-600 mt-0.5 flex-shrink-0"/>
          <p className="text-sm text-amber-800">
            La restauration <strong>remplace toutes les données actuelles</strong> par celles du fichier sélectionné.
            Cette opération est irréversible. N'utilisez cette option que si vous êtes sûr.
          </p>
        </div>

        <p className="text-sm text-gray-500 mb-4">
          Sélectionnez un fichier <span className="font-mono font-semibold">.db</span> précédemment
          téléchargé depuis cette page.
        </p>

        <input
          ref={fileRef}
          type="file"
          accept=".db"
          className="hidden"
          onChange={restaurer}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={restauration}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold px-6 py-3 rounded-xl transition-colors shadow-sm"
        >
          {restauration
            ? <><RefreshCw size={17} className="animate-spin"/> Restauration…</>
            : <><Upload size={17}/> Choisir un fichier de sauvegarde</>
          }
        </button>

        <div className="flex items-start gap-2 mt-4 text-xs text-gray-400">
          <Info size={13} className="mt-0.5 flex-shrink-0"/>
          <span>Après la restauration, redémarrez l'application pour que les données soient prises en compte.</span>
        </div>
      </div>

      {/* Zone dangereuse — repartir à zéro (nouvelle installation client) */}
      <div className="bg-white rounded-2xl shadow-sm border-2 border-red-200 p-5">
        <h2 className="text-base font-semibold text-red-700 flex items-center gap-2 mb-2">
          <AlertTriangle size={16}/> Zone dangereuse — Base vierge
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Efface définitivement produits, ventes, achats, factures, clients et fournisseurs, pour repartir sur une base vide —
          typiquement avant d'installer l'application chez un nouveau client, pour ne pas laisser de données de test.
          Les comptes utilisateurs et les informations de l'entreprise sont conservés. Une sauvegarde de sécurité est créée automatiquement avant l'effacement.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
          <div className="flex-1 w-full">
            <label className="text-xs font-medium text-gray-600 mb-1 block">
              Tapez <span className="font-mono font-bold text-red-600">REINITIALISER</span> pour confirmer
            </label>
            <input
              type="text"
              value={confirmReset}
              onChange={e => setConfirmReset(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
              placeholder="REINITIALISER"
            />
          </div>
          <button
            onClick={reinitialiser}
            disabled={confirmReset !== 'REINITIALISER' || reinitialisation}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-6 py-2.5 rounded-xl transition-colors shadow-sm whitespace-nowrap"
          >
            {reinitialisation
              ? <><RefreshCw size={16} className="animate-spin"/> Effacement…</>
              : <><AlertTriangle size={16}/> Tout effacer</>
            }
          </button>
        </div>
      </div>

      {/* Conseil fréquence */}
      <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-100 rounded-2xl text-sm text-blue-800">
        <Info size={16} className="mt-0.5 flex-shrink-0 text-blue-500"/>
        <div>
          <p className="font-semibold mb-1">Conseil — Fréquence recommandée</p>
          <ul className="space-y-1 text-blue-700 list-disc list-inside">
            <li>Sauvegardez <strong>chaque soir</strong> en fin de journée</li>
            <li>Conservez les sauvegardes de la <strong>semaine précédente</strong></li>
            <li>Gardez toujours une copie <strong>hors site</strong> (Google Drive, email)</li>
            <li>Testez la restauration <strong>une fois par mois</strong> sur un PC de test</li>
          </ul>
        </div>
      </div>

    </div>
  );
}
