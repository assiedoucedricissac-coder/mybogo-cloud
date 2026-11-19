import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Receipt, Eye, X, FileText, AlertTriangle, RotateCcw, Printer, RefreshCw, Check, Trash2 } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useDraggable } from '../hooks/useDraggable';
import HistoriquePinGate from '../components/HistoriquePinGate';

const fmt  = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0)) + ' FCFA';
const fmtN = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0));

const MOTIFS = [
  'Erreur de saisie',
  'Retour client',
  'Produit défectueux',
  'Client a changé d\'avis',
  'Double enregistrement',
  'Autre',
];

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function Ventes() {
  const impressionEnCoursRef = useRef(false);
  const [ventes, setVentes]         = useState([]);
  const [detail, setDetail]         = useState(null);
  // Par défaut, sans filtre explicite, on ne montre que l'historique du jour — pas tout
  // l'historique depuis toujours (voir aussi le PIN sur un filtre dépassant 24h).
  const [filtres, setFiltres]       = useState({ date_debut: todayStr(), date_fin: todayStr(), statut: '' });
  const [cancelModal, setCancelModal] = useState(null); // { id, numero, lignes }
  const [motif, setMotif]           = useState('');
  const [annulEnCours, setAnnulEnCours] = useState(false);
  const [deleteModal, setDeleteModal] = useState(null); // { id, numero, total }
  const [confirmDeleteNumero, setConfirmDeleteNumero] = useState('');
  const [suppEnCours, setSuppEnCours] = useState(false);
  const [confirmReset, setConfirmReset] = useState('');
  const [reinitialisation, setReinit] = useState(false);
  const { hasRole } = useAuth();

  // Réimpression du ticket thermique (même circuit imprimante que la Caisse) — les clients
  // reviennent parfois des jours après redemander leur ticket perdu.
  const [societe, setSociete] = useState({});
  // Config imprimante figée : imprimante système par défaut + rouleau 58mm.
  const papierLargeur = 58;
  const selectedPrinter = '';

  useEffect(() => { api.get('/config/societe').then(r => setSociete(r.data)).catch(() => {}); }, []);

  function load() {
    const params = {};
    if (filtres.date_debut) params.date_debut = filtres.date_debut;
    if (filtres.date_fin)   params.date_fin   = filtres.date_fin;
    if (filtres.statut)     params.statut     = filtres.statut;
    api.get('/ventes', { params }).then(r => setVentes(r.data));
  }

  useEffect(() => { load(); }, [filtres]);

  async function ouvrirAnnulation(v) {
    try {
      // Charger le détail pour afficher les lignes
      const res = await api.get(`/ventes/${v.id}`);
      setCancelModal({ id: v.id, numero: v.numero, total: v.total, lignes: res.data.lignes });
      setMotif('');
    } catch (err) {
      toast.error(err.code === 'ECONNABORTED' ? 'Le serveur ne répond pas — réessayez' : (err.response?.data?.message || 'Erreur lors du chargement de la vente'));
    }
  }

  async function confirmerAnnulation() {
    if (!cancelModal) return;
    setAnnulEnCours(true);
    try {
      await api.put(`/ventes/${cancelModal.id}/annuler`, { motif });
      toast.success('Vente annulée — stock remis à jour');
      setCancelModal(null);
      setDetail(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Erreur lors de l\'annulation');
    } finally { setAnnulEnCours(false); }
  }

  // Suppression DÉFINITIVE — distincte de l'annulation : n'efface la ligne d'historique que
  // pour une vente déjà annulée (le stock a donc déjà été restitué), et exige de retaper le
  // numéro exact pour confirmer, vu que c'est irréversible.
  function ouvrirSuppression(v) {
    setDeleteModal({ id: v.id, numero: v.numero, total: v.total });
    setConfirmDeleteNumero('');
  }

  async function confirmerSuppression() {
    if (!deleteModal || confirmDeleteNumero !== deleteModal.numero) return;
    setSuppEnCours(true);
    try {
      await api.delete(`/ventes/${deleteModal.id}`);
      toast.success('Vente supprimée définitivement');
      setDeleteModal(null);
      setDetail(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Erreur lors de la suppression');
    } finally { setSuppEnCours(false); }
  }

  async function voirDetail(id) {
    const res = await api.get(`/ventes/${id}`);
    setDetail(res.data);
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

  async function imprimerFacture(id) {
    try {
      const res = await api.get(`/ventes/${id}/facture-pdf`, { responseType: 'blob', timeout: 30000 });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      window.open(url, '_blank');
    } catch { toast.error('Erreur lors de la génération du PDF'); }
  }

  // Réimprime le ticket de caisse thermique d'une vente déjà enregistrée, à l'identique du
  // format imprimé à la Caisse (pas le PDF A4 de "imprimerFacture" ci-dessus, qui est un tout
  // autre document) — sur l'imprimante actuellement sélectionnée par le caissier.
  async function reimprimerTicket(id) {
    try {
      const v = (await api.get(`/ventes/${id}`)).data;
      const date = new Date(v.created_at);
      const heure = date.toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
      const modeLbl = modeLabel[v.mode_paiement] || v.mode_paiement;
      const lignesHTML = (v.lignes || []).map(l => {
        const nomAffiche = l.contenance > 1 ? `${l.produit_nom} (${l.unite_libelle || ''})` : l.produit_nom;
        return `
        <tr>
          <td style="padding:3px 4px 3px 0">${nomAffiche}</td>
          <td style="text-align:center;padding:3px 2px">${l.quantite}</td>
          <td style="text-align:right;padding:3px 2px">${fmtN(l.prix_unitaire)} F</td>
          <td style="text-align:right;padding:3px 0 3px 2px;font-weight:700">${fmtN(l.total)} F</td>
        </tr>`;
      }).join('');
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ticket ${v.numero}</title>
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family:'Courier New', monospace; font-size:13px; width:${papierLargeur}mm; max-width:${papierLargeur}mm; color:#000; overflow-x:hidden; }
        /* Le contenu est centré dans une bande à 90% de la largeur de page plutôt que collé à
           gauche avec une marge droite fixe : si la largeur réelle imprimable de l'imprimante
           ne correspond pas exactement à la largeur choisie, l'écart se répartit également des
           deux côtés au lieu de couper le texte d'un seul côté. */
        .page { width:90%; margin:0 auto; padding:6mm 0; }
        .center { text-align:center; } .bold { font-weight:bold; } .big { font-size:16px; }
        .sep { border-top:1px dashed #000; margin:6px 0; } .sep2 { border-top:2px solid #000; margin:6px 0; }
        table { width:100%; border-collapse:collapse; table-layout:fixed; }
        th, td { word-wrap:break-word; overflow-wrap:break-word; }
        th:nth-child(1), td:nth-child(1) { width:42%; } th:nth-child(2), td:nth-child(2) { width:14%; }
        th:nth-child(3), td:nth-child(3) { width:22%; } th:nth-child(4), td:nth-child(4) { width:22%; }
        th { font-size:10px; text-transform:uppercase; padding-bottom:4px; border-bottom:1px dashed #000; }
        .total-row { display:flex; justify-content:space-between; font-size:15px; font-weight:bold; padding-top:4px; }
        @media print { @page { margin:0; size:${papierLargeur}mm auto; } .page { padding:4mm 0; } }
      </style></head><body>
      <div class="page">
      <div class="center bold big">${societe.nom || 'MON ENTREPRISE'}</div>
      ${societe.adresse ? `<div class="center">${societe.adresse}</div>` : ''}
      ${societe.telephone ? `<div class="center">Tél : ${societe.telephone}</div>` : ''}
      ${societe.nif ? `<div class="center">NIF : ${societe.nif}</div>` : ''}
      <div class="sep2"></div>
      <div class="center bold">TICKET DE CAISSE — RÉIMPRESSION</div>
      <div class="center">N° ${v.numero}</div>
      <div class="center">${heure}</div>
      ${v.client_nom ? `<div class="sep"></div><div><strong>Client :</strong> ${v.client_nom}</div>` : ''}
      <div class="sep"></div>
      <table>
        <thead><tr><th style="text-align:left">Article</th><th style="text-align:center">Qté</th><th style="text-align:right">P.U.</th><th style="text-align:right">Total</th></tr></thead>
        <tbody>${lignesHTML}</tbody>
      </table>
      <div class="sep2"></div>
      <div class="total-row"><span>TOTAL</span><span>${fmtN(v.total)} FCFA</span></div>
      <div class="sep"></div>
      <div style="display:flex;justify-content:space-between"><span>Mode de paiement</span><span>${modeLbl}</span></div>
      ${v.mode_paiement === 'especes' ? `<div style="display:flex;justify-content:space-between"><span>Montant reçu</span><span>${fmtN(v.montant_paye)} FCFA</span></div>` : ''}
      ${v.mode_paiement === 'especes' && v.monnaie > 0 ? `<div style="display:flex;justify-content:space-between;font-weight:bold"><span>Monnaie rendue</span><span>${fmtN(v.monnaie)} FCFA</span></div>` : ''}
      ${v.statut === 'partielle' ? `<div style="display:flex;justify-content:space-between;font-weight:bold;color:#dc2626"><span>Reste dû</span><span>${fmtN(v.total - (v.montant_paye||0))} FCFA</span></div>` : ''}
      ${v.statut === 'annulee' ? `<div class="center bold" style="margin-top:6px;color:#dc2626">VENTE ANNULÉE</div>` : ''}
      <div class="sep2"></div>
      <div class="center" style="margin-top:8px;font-size:11px">Merci pour votre achat !</div>
      </div>
      </body></html>`;

      if (!window.electronAPI || selectedPrinter === '__preview__') {
        const w = window.open('', '_blank', 'width=380,height=700');
        w.document.write(html); w.document.close(); w.focus();
        if (!window.electronAPI) setTimeout(() => w.print(), 300);
        return;
      }
      // Un double-clic pendant que l'imprimante thermique met du temps à répondre envoyait
      // 2 impressions qui se chevauchaient sur le rouleau (coupure en plein milieu, contenu
      // mélangé). On ignore tout appel tant que la précédente impression n'est pas terminée.
      if (impressionEnCoursRef.current) return;
      impressionEnCoursRef.current = true;
      try {
        const r = await window.electronAPI.printReceipt(html, selectedPrinter || undefined, papierLargeur);
        if (!r?.success) toast.error(`Impression échouée : ${r?.reason || 'inconnue'}`);
      } finally { impressionEnCoursRef.current = false; }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Erreur lors de la réimpression');
    }
  }

  function statutBadge(v) {
    if (v.statut === 'annulee')   return 'badge-red';
    if (v.statut === 'payee')     return 'badge-green';
    if (v.statut === 'partielle') return (!v.montant_paye || Number(v.montant_paye) === 0) ? 'badge-red' : 'badge-yellow';
    return 'badge-gray';
  }
  function statutLabel(v) {
    if (v.statut === 'annulee')   return 'Annulée';
    if (v.statut === 'payee')     return 'Soldée';
    if (v.statut === 'partielle') return (!v.montant_paye || Number(v.montant_paye) === 0) ? 'Impayée' : 'Partielle';
    return v.statut;
  }
  const modeLabel    = { especes:'Espèces', mobile_money:'Mobile Money', carte:'Carte', virement:'Virement', mixte:'Mixte', credit:'Crédit' };

  const canCancel = hasRole('admin', 'gestionnaire', 'caissier');
  const canDelete = hasRole('admin', 'super_admin');

  // PIN demandé seulement si le filtre de dates choisi dépasse 24h — l'historique du jour
  // (pas de filtre, ou filtre sur une seule journée) reste consultable librement.
  const filtreDepasse24h = !!(filtres.date_debut && filtres.date_fin
    && (new Date(filtres.date_fin) - new Date(filtres.date_debut)) > 24 * 3600 * 1000);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2"><Receipt size={22}/> Historique des ventes</h1>
          <p className="page-sub">Toutes les transactions enregistrées</p>
        </div>
      </div>

      <HistoriquePinGate societe={societe} active={filtreDepasse24h}>
      <>
      {/* Filtres */}
      <div className="card p-4 flex flex-wrap gap-3 items-center">
        <input type="date" className="input w-auto" value={filtres.date_debut} onChange={e => setFiltres(f => ({...f, date_debut: e.target.value}))} />
        <input type="date" className="input w-auto" value={filtres.date_fin}   onChange={e => setFiltres(f => ({...f, date_fin: e.target.value}))} />
        <select className="input w-auto" value={filtres.statut} onChange={e => setFiltres(f => ({...f, statut: e.target.value}))}>
          <option value="">Tous les statuts</option>
          <option value="payee">Soldée</option>
          <option value="partielle">Partielle</option>
          <option value="annulee">Annulée</option>
        </select>
        <button onClick={() => setFiltres({ date_debut: todayStr(), date_fin: todayStr(), statut:'' })} className="btn-secondary btn-sm">
          Réinitialiser
        </button>
      </div>

      {/* Résumé */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 px-5 py-3 shadow-sm">
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Transactions</p>
          <p className="text-2xl font-black text-gray-900">{ventes.filter(v => v.statut !== 'annulee').length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 px-5 py-3 shadow-sm">
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Chiffre d'affaires</p>
          <p className="text-xl font-black text-blue-700">{fmt(ventes.filter(v => v.statut !== 'annulee').reduce((s, v) => s + v.total, 0))}</p>
        </div>
        {ventes.filter(v => v.statut === 'annulee').length > 0 && (
          <div className="bg-red-50 rounded-2xl border border-red-100 px-5 py-3 shadow-sm">
            <p className="text-xs text-red-400 font-semibold uppercase tracking-wide">Annulées</p>
            <p className="text-2xl font-black text-red-600">{ventes.filter(v => v.statut === 'annulee').length}</p>
          </div>
        )}
      </div>

      {/* Tableau */}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>N° Vente</th>
              <th>Date</th>
              <th>Client</th>
              <th>Produits</th>
              <th>Caissier</th>
              <th>Paiement</th>
              <th>Total</th>
              <th>Statut</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {ventes.map(v => (
              <tr key={v.id} className={v.statut === 'annulee' ? 'opacity-50' : ''}>
                <td><span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{v.numero}</span></td>
                <td className="text-xs">{new Date(v.created_at).toLocaleString('fr-FR')}</td>
                <td>{v.client_nom || 'Passage'}</td>
                <td className="text-xs text-gray-600 max-w-[200px]">
                  <span className="line-clamp-2" title={v.produits_resume || ''}>
                    {v.produits_resume || <span className="text-gray-300 italic">—</span>}
                  </span>
                </td>
                <td className="text-xs">{v.user_nom}</td>
                <td className="text-xs">{modeLabel[v.mode_paiement] || v.mode_paiement}</td>
                <td className="font-semibold text-blue-700">{fmt(v.total)}</td>
                <td>
                  <span className={`badge ${statutBadge(v)}`}>
                    {statutLabel(v)}
                  </span>
                </td>
                <td>
                  <div className="flex gap-1">
                    <button onClick={() => voirDetail(v.id)} className="text-blue-600 hover:bg-blue-50 p-1.5 rounded" title="Voir le détail">
                      <Eye size={15}/>
                    </button>
                    <button onClick={() => imprimerFacture(v.id)} className="text-green-600 hover:bg-green-50 p-1.5 rounded" title="Facture PDF">
                      <FileText size={15}/>
                    </button>
                    <button onClick={() => reimprimerTicket(v.id)} className="text-purple-600 hover:bg-purple-50 p-1.5 rounded" title="Réimprimer le ticket">
                      <Printer size={15}/>
                    </button>
                    {v.statut !== 'annulee' && canCancel && (
                      <button onClick={() => ouvrirAnnulation(v)} className="text-red-500 hover:bg-red-50 p-1.5 rounded" title="Annuler cette vente">
                        <RotateCcw size={15}/>
                      </button>
                    )}
                    {v.statut === 'annulee' && canDelete && (
                      <button onClick={() => ouvrirSuppression(v)} className="text-red-700 hover:bg-red-50 p-1.5 rounded" title="Supprimer définitivement">
                        <Trash2 size={15}/>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {ventes.length === 0 && (
              <tr><td colSpan="9" className="text-center py-10 text-gray-400">Aucune vente enregistrée</td></tr>
            )}
          </tbody>
        </table>
      </div>
      </>
      </HistoriquePinGate>

      {/* Zone dangereuse — repartir à zéro (nouvelle installation client) */}
      {hasRole('admin', 'super_admin') && (
        <div className="bg-white rounded-2xl shadow-sm border-2 border-red-200 p-5">
          <h2 className="text-base font-semibold text-red-700 flex items-center gap-2 mb-2">
            <AlertTriangle size={16}/> Zone dangereuse — Base vierge
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Efface définitivement tout l'historique des ventes ainsi que produits, achats, factures, clients et fournisseurs —
            pour repartir sur une base vide avant d'installer chez un nouveau client. Les comptes utilisateurs et les
            informations de l'entreprise sont conservés. Une sauvegarde de sécurité est créée automatiquement avant l'effacement.
            (Le même bouton se trouve aussi dans Sauvegarde.)
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
      )}

      {/* ── Modal détail vente ── */}
      {detail && createPortal(
        <div className="fixed inset-0 z-50">
          <div className="bg-white rounded-2xl shadow-xl" style={{ position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", width: "calc(100% - 32px)", maxWidth: 640, maxHeight: "calc(100vh - 32px)", overflowY: "auto" }}>
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Vente {detail.numero}</h2>
                <p className="text-xs text-gray-400">{new Date(detail.created_at).toLocaleString('fr-FR')}</p>
              </div>
              <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <div className="p-5 space-y-4">

              {detail.statut === 'annulee' && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-medium">
                  <AlertTriangle size={16}/> Cette vente a été annulée
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-gray-400 mb-0.5">Client</p><p className="font-medium">{detail.client_nom || 'Client de passage'}</p></div>
                <div><p className="text-xs text-gray-400 mb-0.5">Caissier</p><p className="font-medium">{detail.user_nom}</p></div>
                <div><p className="text-xs text-gray-400 mb-0.5">Mode de paiement</p><p>{modeLabel[detail.mode_paiement] || detail.mode_paiement}</p></div>
                <div><p className="text-xs text-gray-400 mb-0.5">Statut</p><span className={`badge ${statutBadge(detail)}`}>{statutLabel(detail)}</span></div>
              </div>

              <div className="table-wrap">
                <table className="table text-sm">
                  <thead><tr><th>Article</th><th>Qté</th><th>Prix unitaire</th><th>Total</th></tr></thead>
                  <tbody>
                    {detail.lignes?.map(l => (
                      <tr key={l.id}>
                        <td className="font-medium">{l.produit_nom}</td>
                        <td className="text-center">{l.quantite}</td>
                        <td>{fmt(l.prix_unitaire)}</td>
                        <td className="font-semibold">{fmt(l.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-1 text-sm border-t pt-3">
                <div className="flex justify-between text-gray-500">
                  <span>Sous-total</span><span>{fmt(detail.sous_total)}</span>
                </div>
                {detail.remise > 0 && (
                  <div className="flex justify-between text-red-500">
                    <span>Remise ({detail.remise}%)</span>
                    <span>− {fmt(detail.sous_total * detail.remise / 100)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base border-t pt-2">
                  <span>TOTAL</span><span className="text-blue-700">{fmt(detail.total)}</span>
                </div>
                {detail.monnaie > 0 && (
                  <div className="flex justify-between text-gray-500 text-xs">
                    <span>Monnaie rendue</span><span>{fmt(detail.monnaie)}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button onClick={() => imprimerFacture(detail.id)} className="btn-primary flex-1 justify-center gap-2 text-sm">
                  <Printer size={15}/> Facture PDF
                </button>
                <button onClick={() => reimprimerTicket(detail.id)} className="flex-1 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm">
                  <Printer size={15}/> Réimprimer le ticket
                </button>
              </div>

              {detail.statut !== 'annulee' && canCancel && (
                <button
                  onClick={() => { ouvrirAnnulation(detail); setDetail(null); }}
                  className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
                >
                  <RotateCcw size={15}/> Annuler cette vente
                </button>
              )}
              {detail.statut === 'annulee' && canDelete && (
                <button
                  onClick={() => { ouvrirSuppression(detail); setDetail(null); }}
                  className="w-full flex items-center justify-center gap-2 bg-red-800 hover:bg-red-900 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
                >
                  <Trash2 size={15}/> Supprimer définitivement
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Modal confirmation annulation ── */}
      {cancelModal && createPortal(
        <div className="fixed inset-0 z-[60]">
          <div className="bg-white rounded-2xl shadow-2xl" style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:'calc(100% - 32px)', maxWidth:480, maxHeight:'calc(100vh - 32px)', overflowY:'auto' }}>
            <div className="p-6 space-y-4">

              {/* Icône + titre */}
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <RotateCcw size={24} className="text-red-600"/>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Annuler la vente</h3>
                  <p className="text-sm text-gray-500 font-mono">{cancelModal.numero} — {fmt(cancelModal.total)}</p>
                </div>
              </div>

              {/* Avertissement */}
              <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-amber-600"/>
                <span>Les articles seront <strong>remis automatiquement en stock</strong>. Cette action ne peut pas être annulée.</span>
              </div>

              {/* Articles remis en stock */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Articles remis en stock</p>
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  {cancelModal.lignes?.map((l, i) => (
                    <div key={l.id} className={`flex items-center justify-between px-3 py-2.5 text-sm ${i > 0 ? 'border-t border-gray-100' : ''}`}>
                      <span className="text-gray-700">{l.produit_nom}</span>
                      <span className="font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-lg text-xs">
                        + {l.quantite} unité{l.quantite > 1 ? 's' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Motif */}
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">Motif d'annulation</label>
                <select
                  className="input text-sm w-full"
                  value={motif}
                  onChange={e => setMotif(e.target.value)}
                >
                  <option value="">— Sélectionner un motif —</option>
                  {MOTIFS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              {/* Boutons */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setCancelModal(null)}
                  className="flex-1 btn-secondary py-2.5"
                >
                  Garder la vente
                </button>
                <button
                  onClick={confirmerAnnulation}
                  disabled={annulEnCours}
                  className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl transition-colors"
                >
                  {annulEnCours
                    ? <><span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"/>&nbsp;Annulation…</>
                    : <><RotateCcw size={15}/> Confirmer</>
                  }
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Modal confirmation suppression définitive ── */}
      {deleteModal && createPortal(
        <div className="fixed inset-0 z-[60]">
          <div className="bg-white rounded-2xl shadow-2xl" style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:'calc(100% - 32px)', maxWidth:440, maxHeight:'calc(100vh - 32px)', overflowY:'auto' }}>
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <Trash2 size={24} className="text-red-700"/>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Supprimer définitivement</h3>
                  <p className="text-sm text-gray-500 font-mono">{deleteModal.numero} — {fmt(deleteModal.total)}</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800">
                <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-red-600"/>
                <span>Cette vente disparaîtra <strong>définitivement</strong> de l'historique, sans aucune trace. Contrairement à l'annulation, cette action ne peut pas être défaite.</span>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">
                  Tapez <span className="font-mono font-bold text-red-700">{deleteModal.numero}</span> pour confirmer
                </label>
                <input
                  type="text" autoFocus
                  className="input text-sm w-full font-mono"
                  value={confirmDeleteNumero}
                  onChange={e => setConfirmDeleteNumero(e.target.value)}
                  placeholder={deleteModal.numero}
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={() => setDeleteModal(null)} className="flex-1 btn-secondary py-2.5">
                  Annuler
                </button>
                <button
                  onClick={confirmerSuppression}
                  disabled={suppEnCours || confirmDeleteNumero !== deleteModal.numero}
                  className="flex-1 flex items-center justify-center gap-2 bg-red-700 hover:bg-red-800 disabled:opacity-40 text-white font-semibold py-2.5 rounded-xl transition-colors"
                >
                  {suppEnCours
                    ? <><span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"/>&nbsp;Suppression…</>
                    : <><Trash2 size={15}/> Supprimer</>
                  }
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}





