import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Users, Plus, Edit, Trash2, Eye, Search, Wallet, CheckCircle, AlertCircle, Printer } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useDraggable } from '../hooks/useDraggable';

const fmt  = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0)) + ' FCFA';
const fmtN = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0));
const fmtD = s => new Date(s).toLocaleDateString('fr-FR');

const empty = { nom:'', telephone:'', email:'', adresse:'', numero_contribuable:'', limite_credit:0, dette_initiale:'' };
const emptyPai = { montant:'', mode_paiement:'especes', note:'' };
const MODES = ['especes','mobile_money','carte','virement'];
const modeLabel = { especes:'Espèces', mobile_money:'Mobile Money', carte:'Carte', virement:'Virement' };

// Construit la timeline crédit (achats à crédit + factures + versements) d'un client
function buildTimeline(client) {
  const items = [];
  (client.ventes || []).forEach(v => {
    const resteInitial = v.total - (v.montant_paye || 0);
    if (resteInitial > 0 || v.statut === 'partielle') {
      items.push({ date: v.created_at, kind: 'dette', label: `Achat ${v.numero}`, montant: resteInitial });
    }
  });
  (client.factures || []).forEach(f => {
    const resteInitial = f.total - (f.montant_paye || 0);
    if (resteInitial > 0 || f.statut === 'partielle') {
      items.push({ date: f.created_at, kind: 'dette', label: `Facture ${f.numero}`, montant: resteInitial });
    }
  });
  (client.paiements || []).forEach(p => {
    items.push({ date: p.created_at, kind: 'paiement', label: p.note || 'Versement', montant: p.montant, mode: p.mode_paiement });
  });
  (client.paiements_facture || []).forEach(p => {
    items.push({ date: p.created_at, kind: 'paiement', label: p.note || `Règlement ${p.facture_numero}`, montant: p.montant, mode: p.mode_paiement });
  });
  items.sort((a, b) => new Date(a.date) - new Date(b.date));
  let solde = 0;
  return items.map(it => {
    solde = it.kind === 'dette' ? solde + it.montant : solde - it.montant;
    return { ...it, solde: Math.max(0, solde) };
  });
}

export default function Clients() {
  const impressionEnCoursRef = useRef(false);
  const [tab, setTab]                   = useState('clients');
  const [clients, setClients]           = useState([]);
  const [search, setSearch]             = useState('');
  const [modal, setModal]               = useState(null);
  const modalDrag = useDraggable();
  const debiteurDrag = useDraggable();
  const detailDrag = useDraggable();
  const [form, setForm]                 = useState(empty);
  const [detail, setDetail]             = useState(null);        // fiche client normale
  const [debiteurFiche, setDebiteurFiche] = useState(null);     // fiche débiteur avec timeline
  const [paiForm, setPaiForm]           = useState(emptyPai);
  const [paiLoading, setPaiLoading]     = useState(false);
  const [dernierRecuId, setDernierRecuId] = useState(null); // reçu du dernier versement, pour impression immédiate
  const [detteAnterieure, setDetteAnterieure] = useState(null); // { montant, date, note } — formulaire de reprise de solde
  const [savingDette, setSavingDette]   = useState(false);
  const [societe, setSociete]           = useState({});
  // Config imprimante figée : imprimante système par défaut + rouleau 58mm.
  const papierLargeur = 58;
  const selectedPrinter = '';

  function load() { api.get('/clients', { params: search ? { search } : {} }).then(r => setClients(r.data)); }
  useEffect(() => { load(); }, [search]);
  useEffect(() => { api.get('/config/societe').then(r => setSociete(r.data)).catch(() => {}); }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    const { dette_initiale, ...payload } = form;
    try {
      if (modal === 'add') {
        const res = await api.post('/clients', payload);
        const montantDette = parseFloat(dette_initiale);
        if (montantDette > 0) {
          await api.post('/facturation', {
            type: 'facture', client_id: res.data.id, statut: 'emise', montant_paye: 0,
            lignes: [{ designation: 'Dette antérieure (reprise de solde avant informatisation)', quantite: 1, unite: 'pièce', prix_ht: montantDette, remise: 0, remise_montant: 0, taux_tva: 0 }],
          });
          toast.success(`Client créé avec une dette antérieure de ${fmt(montantDette)}`);
        } else {
          toast.success('Client créé');
        }
      } else {
        await api.put(`/clients/${form.id}`, payload);
        toast.success('Mis à jour');
      }
      setModal(null); load();
    } catch (err) { toast.error(err.response?.data?.message || 'Erreur'); }
  }

  async function handleDelete(id) {
    if (!confirm('Supprimer ce client ?')) return;
    await api.delete(`/clients/${id}`);
    toast.success('Supprimé'); load();
  }

  async function voirDetail(id) {
    const res = await api.get(`/clients/${id}`);
    setDetail(res.data);
    setDetteAnterieure(null);
  }

  // Reprend une dette d'avant l'installation du logiciel : enregistrée comme une facture
  // impayée au nom du client, ce qui la fait apparaître automatiquement dans sa dette totale,
  // sa fiche débiteur, et se règle en premier (FIFO) au prochain versement — sans rien
  // construire de nouveau, en réutilisant exactement le système de facturation existant.
  function ouvrirDetteAnterieure() {
    setDetteAnterieure({ montant: '', date: new Date().toISOString().slice(0,10), note: '' });
  }

  async function enregistrerDetteAnterieure() {
    const montant = parseFloat(detteAnterieure.montant);
    if (!montant || montant <= 0) return toast.error('Montant invalide');
    setSavingDette(true);
    try {
      await api.post('/facturation', {
        type: 'facture',
        client_id: detail.id,
        statut: 'emise',
        montant_paye: 0,
        date_document: detteAnterieure.date,
        lignes: [{
          designation: detteAnterieure.note.trim() || 'Dette antérieure (reprise de solde avant informatisation)',
          quantite: 1, unite: 'pièce', prix_ht: montant, remise: 0, remise_montant: 0, taux_tva: 0,
        }],
      });
      toast.success('Dette antérieure enregistrée');
      setDetteAnterieure(null);
      const res = await api.get(`/clients/${detail.id}`);
      setDetail(res.data);
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Erreur'); }
    finally { setSavingDette(false); }
  }

  async function ouvrirDebiteur(client) {
    const res = await api.get(`/clients/${client.id}`);
    setDebiteurFiche(res.data);
    setPaiForm(emptyPai);
    setDernierRecuId(null);
  }

  async function handleVersement(e) {
    e.preventDefault();
    if (!paiForm.montant || paiForm.montant <= 0) return toast.error('Montant invalide');
    setPaiLoading(true);
    try {
      const res0 = await api.post(`/clients/${debiteurFiche.id}/paiements`, paiForm);
      toast.success('Versement enregistré');
      setPaiForm(emptyPai);
      setDernierRecuId(res0.data.recu_id || null);
      // Rafraîchir la fiche
      const res = await api.get(`/clients/${debiteurFiche.id}`);
      setDebiteurFiche(res.data);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Erreur');
    } finally { setPaiLoading(false); }
  }

  // Imprime le reçu sur l'imprimante thermique choisie (même pipeline que la Caisse), au lieu
  // d'ouvrir un PDF A4 qui ne laissait pas la main pour choisir l'imprimante ni le format ticket.
  async function imprimerRecu(id, resteAPayer) {
    try {
      const f = (await api.get(`/facturation/${id}`)).data;
      const now = new Date();
      const heure = now.toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>Reçu ${f.numero}</title>
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family: 'Courier New', monospace; font-size: 13px; width: ${papierLargeur}mm; max-width: ${papierLargeur}mm; padding: 6mm 4mm; color: #000; }
        .center { text-align: center; }
        .bold   { font-weight: bold; }
        .big    { font-size: 16px; }
        .sep    { border-top: 1px dashed #000; margin: 6px 0; }
        .sep2   { border-top: 2px solid #000; margin: 6px 0; }
        .row    { display:flex; justify-content:space-between; }
        @media print { @page { margin: 0; size: ${papierLargeur}mm auto; } body { padding: 4mm 3mm; } }
      </style></head><body>
      <div class="center bold big">${societe.nom || 'MON ENTREPRISE'}</div>
      ${societe.adresse ? `<div class="center">${societe.adresse}</div>` : ''}
      ${societe.telephone ? `<div class="center">Tél : ${societe.telephone}</div>` : ''}
      ${societe.nif ? `<div class="center">NIF : ${societe.nif}</div>` : ''}
      <div class="sep2"></div>
      <div class="center bold">REÇU DE PAIEMENT</div>
      <div class="center">N° ${f.numero}</div>
      <div class="center">${heure}</div>
      <div class="sep"></div>
      <div><strong>Reçu de :</strong> ${f.client_nom || 'Client de passage'}</div>
      <div class="sep"></div>
      <div class="row bold" style="font-size:15px"><span>MONTANT VERSÉ</span><span>${fmt(f.montant_paye)}</span></div>
      <div class="sep"></div>
      <div class="row"><span>Mode de paiement</span><span>${modeLabel[f.mode_paiement] || f.mode_paiement}</span></div>
      ${resteAPayer > 0
        ? `<div class="row bold" style="color:#dc2626"><span>Reste à payer (total)</span><span>${fmt(resteAPayer)}</span></div>`
        : `<div class="center bold" style="margin-top:6px">COMPTE SOLDÉ</div>`}
      <div class="sep2"></div>
      <div class="center" style="margin-top:8px;font-size:11px">Merci de votre confiance</div>
      </body></html>`;
      doPrintRecu(html);
    } catch { toast.error('Erreur génération du reçu'); }
  }

  function doPrintRecu(html) {
    if (!window.electronAPI || selectedPrinter === '__preview__') {
      const w = window.open('', '_blank', 'width=380,height=700');
      w.document.write(html);
      w.document.close();
      w.focus();
      if (window.electronAPI) return;
      setTimeout(() => { w.print(); }, 300);
      return;
    }
    // Un double-clic pendant que l'imprimante thermique met du temps à répondre envoyait
    // 2 impressions qui se chevauchaient sur le rouleau (coupure en plein milieu, contenu
    // mélangé). On ignore tout appel tant que la précédente impression n'est pas terminée.
    if (impressionEnCoursRef.current) return;
    impressionEnCoursRef.current = true;
    window.electronAPI.printReceipt(html, selectedPrinter || undefined, papierLargeur)
      .then(r => { if (!r?.success) toast.error(`Impression échouée : ${r?.reason || 'inconnue'}`); })
      .catch(() => toast.error('Erreur impression'))
      .finally(() => { impressionEnCoursRef.current = false; });
  }

  const dette = c => (c.solde < 0 ? -c.solde : 0) + (c.dette_factures || 0);
  const debiteurs = clients.filter(c => dette(c) > 0).sort((a, b) => dette(b) - dette(a));
  const totalDettes = debiteurs.reduce((s, c) => s + dette(c), 0);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2"><Users size={22}/> Clients</h1>
          <p className="page-sub">{clients.length} client{clients.length !== 1 ? 's' : ''} · {debiteurs.length > 0 ? <span className="text-red-500 font-semibold">{debiteurs.length} débiteur{debiteurs.length > 1 ? 's' : ''}</span> : 'aucune créance'}</p>
        </div>
        <button onClick={() => { setForm(empty); setModal('add'); }} className="btn-primary"><Plus size={16}/> Nouveau client</button>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 bg-white rounded-2xl p-1 border border-gray-100 w-fit shadow-sm">
        {[['clients','Tous les clients'], ['debiteurs', `Débiteurs${debiteurs.length ? ` (${debiteurs.length})` : ''}`]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${tab === k ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* ══ ONGLET CLIENTS ══ */}
      {tab === 'clients' && (<>
        <div className="relative max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
          <input className="input pl-9" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Nom</th><th>Téléphone</th><th>Créance</th><th>Actions</th></tr></thead>
            <tbody>
              {clients.map(c => (
                <tr key={c.id}>
                  <td className="font-medium">{c.nom}</td>
                  <td>{c.telephone || '-'}</td>
                  <td>{dette(c) > 0 ? <span className="text-red-600 font-bold">{fmt(dette(c))}</span> : <span className="text-gray-400">—</span>}</td>
                  <td>
                    <div className="flex gap-2">
                      <button onClick={() => voirDetail(c.id)} className="text-gray-600 hover:bg-gray-50 p-1.5 rounded"><Eye size={15}/></button>
                      <button onClick={() => { setForm(c); setModal('edit'); }} className="text-blue-600 hover:bg-blue-50 p-1.5 rounded"><Edit size={15}/></button>
                      <button onClick={() => handleDelete(c.id)} className="text-red-500 hover:bg-red-50 p-1.5 rounded"><Trash2 size={15}/></button>
                    </div>
                  </td>
                </tr>
              ))}
              {clients.length === 0 && <tr><td colSpan="4" className="text-center py-8 text-gray-400">Aucun client</td></tr>}
            </tbody>
          </table>
        </div>
      </>)}

      {/* ══ ONGLET DÉBITEURS ══ */}
      {tab === 'debiteurs' && (
        <div className="space-y-4">
          {debiteurs.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <CheckCircle size={48} className="mx-auto mb-3 text-green-400"/>
              <p className="font-medium text-green-600">Aucune créance en cours</p>
              <p className="text-sm mt-1">Tous les clients sont à jour</p>
            </div>
          ) : (<>
            {/* Résumé */}
            <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-orange-800">
                <AlertCircle size={18}/>
                <span className="text-sm font-medium">{debiteurs.length} débiteur{debiteurs.length > 1 ? 's' : ''}</span>
              </div>
              <span className="text-orange-700 font-bold text-lg">{fmt(totalDettes)}</span>
            </div>

            {/* Liste */}
            <div className="space-y-2">
              {debiteurs.map(c => (
                <button key={c.id} onClick={() => ouvrirDebiteur(c)}
                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between hover:border-blue-300 hover:shadow-sm transition-all text-left">
                  <div>
                    <p className="font-semibold text-gray-900">{c.nom}</p>
                    {c.telephone && <p className="text-xs text-gray-400">{c.telephone}</p>}
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-red-600">{fmt(dette(c))}</p>
                    <p className="text-xs text-gray-400">Doit</p>
                  </div>
                </button>
              ))}
            </div>
          </>)}
        </div>
      )}

      {/* ══ MODAL AJOUTER / MODIFIER CLIENT ══ */}
      {modal && createPortal(
        <div className="fixed inset-0 z-50">
          <div className="bg-white rounded-2xl shadow-xl" style={{ position: "absolute", top: 16, left: "50%", transform: `translateX(-50%) translate(${modalDrag.offset.x}px, ${modalDrag.offset.y}px)`, width: "calc(100% - 32px)", maxWidth: 640, maxHeight: "calc(100vh - 32px)", overflowY: "auto" }}>
            <div onMouseDown={modalDrag.onMouseDown} className="flex items-center justify-between p-6 border-b cursor-move select-none">
              <h2 className="text-lg font-semibold">{modal === 'add' ? 'Nouveau client' : 'Modifier'}</h2>
              <button onClick={() => setModal(null)} className="text-gray-400 text-2xl">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-3">
              <div><label className="label">Nom *</label><input className="input" value={form.nom} onChange={e => setForm(f=>({...f,nom:e.target.value}))} required /></div>
              <div><label className="label">Téléphone</label><input className="input" value={form.telephone||''} onChange={e => setForm(f=>({...f,telephone:e.target.value}))} /></div>
              <div><label className="label">Email</label><input type="email" className="input" value={form.email||''} onChange={e => setForm(f=>({...f,email:e.target.value}))} /></div>
              <div><label className="label">Adresse</label><input className="input" value={form.adresse||''} onChange={e => setForm(f=>({...f,adresse:e.target.value}))} /></div>
              <div><label className="label">Limite de crédit (FCFA)</label><input type="number" className="input" value={form.limite_credit||0} onChange={e => setForm(f=>({...f,limite_credit:+e.target.value}))} /></div>
              {modal === 'add' && (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
                  <label className="label text-orange-800">Dette antérieure (FCFA) <span className="text-gray-400 font-normal text-xs">— si ce client devait déjà de l'argent avant le logiciel</span></label>
                  <input type="number" min="0" className="input" value={form.dette_initiale} onChange={e => setForm(f=>({...f,dette_initiale:e.target.value}))} placeholder="0" />
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" className="btn-secondary" onClick={() => setModal(null)}>Annuler</button>
                <button type="submit" className="btn-primary">Enregistrer</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ══ FICHE DÉBITEUR (timeline + versement) ══ */}
      {debiteurFiche && (() => {
        const resteActuel = dette(debiteurFiche);
        const timeline = buildTimeline(debiteurFiche);
        const estSolde = resteActuel <= 0;
        const resteApres = Math.max(0, resteActuel - (parseFloat(paiForm.montant) || 0));
        return createPortal(
          <div className="fixed inset-0 z-50">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]" style={{ transform: `translate(${debiteurDrag.offset.x}px, ${debiteurDrag.offset.y}px)` }}>
              {/* Header */}
              <div onMouseDown={debiteurDrag.onMouseDown} className="flex items-start justify-between p-5 border-b shrink-0 cursor-move select-none">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{debiteurFiche.nom}</h2>
                  {debiteurFiche.telephone && <p className="text-sm text-gray-500">{debiteurFiche.telephone}</p>}
                </div>
                <div className="flex items-center gap-3">
                  {estSolde
                    ? <span className="flex items-center gap-1 bg-green-100 text-green-700 font-bold px-3 py-1 rounded-full text-sm"><CheckCircle size={15}/> SOLDÉ</span>
                    : <span className="bg-red-100 text-red-700 font-bold px-3 py-1 rounded-full text-sm">{fmt(resteActuel)}</span>
                  }
                  <button onClick={() => setDebiteurFiche(null)} className="text-gray-400 text-2xl">&times;</button>
                </div>
              </div>

              {/* Timeline scrollable */}
              <div className="flex-1 overflow-y-auto p-5 space-y-2">
                {debiteurFiche.dette_factures > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 mb-3 text-xs text-blue-800">
                    Dont <strong>{fmt(debiteurFiche.dette_factures)}</strong> sur des factures impayées — un versement ci-dessous règle automatiquement la ou les factures les plus anciennes en premier.
                  </div>
                )}
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Historique</p>
                {timeline.length === 0 && <p className="text-gray-400 text-sm text-center py-4">Aucun mouvement</p>}
                {timeline.map((it, i) => (
                  <div key={i} className={`flex items-center gap-3 rounded-xl px-4 py-3 border ${it.kind === 'dette' ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
                    <div className={`w-2 h-2 rounded-full shrink-0 ${it.kind === 'dette' ? 'bg-red-500' : 'bg-green-500'}`}/>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{it.label}</p>
                      <p className="text-xs text-gray-400">{fmtD(it.date)}{it.mode ? ` — ${modeLabel[it.mode] || it.mode}` : ''}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`font-bold text-sm ${it.kind === 'dette' ? 'text-red-600' : 'text-green-600'}`}>
                        {it.kind === 'dette' ? '+' : '−'}{fmtN(it.montant)}
                      </p>
                      <p className="text-xs text-gray-500">Reste : {fmtN(it.solde)}</p>
                    </div>
                  </div>
                ))}

                {/* Badge soldé si balance = 0 */}
                {estSolde && (
                  <div className="flex items-center justify-center gap-2 bg-green-100 border border-green-300 rounded-xl py-3 mt-2">
                    <CheckCircle size={20} className="text-green-600"/>
                    <span className="text-green-700 font-bold">Compte soldé — rien dû</span>
                  </div>
                )}

                {/* Historique des règlements — réimpression de n'importe quel reçu passé */}
                {debiteurFiche.recus?.length > 0 && (
                  <div className="pt-3 mt-3 border-t">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Historique des règlements</p>
                    <div className="space-y-1">
                      {debiteurFiche.recus.map(r => (
                        <div key={r.id} className="flex justify-between items-center py-1.5 text-sm">
                          <div>
                            <p className="font-mono text-xs text-gray-500">{r.numero}</p>
                            <p className="text-xs text-gray-400">{fmtD(r.created_at)} — {modeLabel[r.mode_paiement] || r.mode_paiement}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-green-600">{fmt(r.total)}</p>
                            <button type="button" onClick={() => imprimerRecu(r.id, resteActuel)}
                              className="text-blue-600 hover:bg-blue-50 p-1.5 rounded" title="Réimprimer ce reçu">
                              <Printer size={14}/>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Reçu du dernier versement enregistré */}
              {dernierRecuId && (
                <div className="border-t p-4 bg-green-50 flex items-center justify-between gap-3">
                  <p className="text-sm text-green-700 font-medium">Règlement enregistré</p>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => imprimerRecu(dernierRecuId, resteActuel)} className="btn-primary btn-sm">
                      <Printer size={14}/> Imprimer le reçu
                    </button>
                  </div>
                </div>
              )}

              {/* Formulaire versement */}
              {!estSolde && (
                <form onSubmit={handleVersement} className="border-t p-5 space-y-3 shrink-0 bg-gray-50 rounded-b-2xl">
                  <p className="text-sm font-semibold text-gray-700">Enregistrer un versement</p>
                  <div className="flex gap-2">
                    <input
                      type="number" step="100" required
                      value={paiForm.montant}
                      onChange={e => setPaiForm(p=>({...p, montant:e.target.value}))}
                      placeholder={`Max ${fmtN(resteActuel)} FCFA`}
                      className="input flex-1"
                      autoFocus
                    />
                    <button type="button"
                      onClick={() => setPaiForm(p=>({...p, montant: resteActuel}))}
                      className="btn-secondary text-xs px-3 whitespace-nowrap">
                      Tout solder
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {MODES.map(m => (
                      <button key={m} type="button" onClick={() => setPaiForm(p=>({...p,mode_paiement:m}))}
                        className={`py-1.5 rounded-lg text-xs font-medium border transition-all ${paiForm.mode_paiement === m ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:border-blue-300'}`}>
                        {modeLabel[m]}
                      </button>
                    ))}
                  </div>
                  <input className="input text-sm" value={paiForm.note} onChange={e => setPaiForm(p=>({...p,note:e.target.value}))} placeholder="Note (optionnel)" />
                  {paiForm.montant > 0 && (
                    <div className={`rounded-lg px-3 py-2 text-sm flex justify-between font-medium ${resteApres === 0 ? 'bg-green-100 text-green-700' : 'bg-orange-50 text-orange-700'}`}>
                      <span>Reste après ce versement</span>
                      <span>{resteApres === 0 ? '✓ Soldé' : fmt(resteApres)}</span>
                    </div>
                  )}
                  <button type="submit" disabled={paiLoading} className="btn-primary w-full">
                    {paiLoading ? 'Enregistrement...' : 'Valider le versement'}
                  </button>
                </form>
              )}
            </div>
          </div>,
          document.body
        );
      })()}

      {/* ══ FICHE CLIENT NORMALE ══ */}
      {detail && createPortal(
        <div className="fixed inset-0 z-50">
          <div className="bg-white rounded-2xl shadow-xl" style={{ position: "absolute", top: 16, left: "50%", transform: `translateX(-50%) translate(${detailDrag.offset.x}px, ${detailDrag.offset.y}px)`, width: "calc(100% - 32px)", maxWidth: 640, maxHeight: "calc(100vh - 32px)", overflowY: "auto" }}>
            <div onMouseDown={detailDrag.onMouseDown} className="flex items-center justify-between p-6 border-b cursor-move select-none">
              <h2 className="text-lg font-semibold">{detail.nom}</h2>
              <button onClick={() => { setDetail(null); setDetteAnterieure(null); }} className="text-gray-400 text-2xl">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-500">Téléphone</span><p>{detail.telephone || '-'}</p></div>
                <div><span className="text-gray-500">Email</span><p>{detail.email || '-'}</p></div>
                <div><span className="text-gray-500">Adresse</span><p>{detail.adresse || '-'}</p></div>
              </div>
              {/* Dette antérieure au logiciel — reprise de solde */}
              <div className="border-t pt-3">
                {!detteAnterieure ? (
                  <button onClick={ouvrirDetteAnterieure} className="btn-secondary btn-sm text-xs text-orange-700 border-orange-200 hover:bg-orange-50">
                    + Ajouter une dette antérieure (avant informatisation)
                  </button>
                ) : (
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-2">
                    <p className="text-xs font-semibold text-orange-800">Reprise d'une dette existant avant le logiciel</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-gray-500 block mb-0.5">Montant dû (FCFA) *</label>
                        <input type="number" min="1" className="input text-sm" value={detteAnterieure.montant}
                          onChange={e => setDetteAnterieure(d => ({...d, montant: e.target.value}))} placeholder="0" autoFocus/>
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500 block mb-0.5">Depuis quand</label>
                        <input type="date" className="input text-sm" value={detteAnterieure.date}
                          onChange={e => setDetteAnterieure(d => ({...d, date: e.target.value}))}/>
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 block mb-0.5">Note (optionnel)</label>
                      <input className="input text-sm" value={detteAnterieure.note}
                        onChange={e => setDetteAnterieure(d => ({...d, note: e.target.value}))} placeholder="Ex: solde repris de l'ancien cahier"/>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <button onClick={() => setDetteAnterieure(null)} className="btn-secondary btn-sm text-xs">Annuler</button>
                      <button onClick={enregistrerDetteAnterieure} disabled={savingDette} className="btn-primary btn-sm text-xs disabled:opacity-40">
                        {savingDette ? 'Enregistrement...' : 'Enregistrer cette dette'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <h3 className="font-semibold text-gray-700 pt-2">Dernières ventes</h3>
              <div className="space-y-1">
                {detail.ventes?.map(v => (
                  <div key={v.id} className="flex justify-between items-center py-2 border-b border-gray-100 text-sm">
                    <div><p className="font-mono text-xs text-gray-500">{v.numero}</p><p className="text-xs text-gray-400">{fmtD(v.created_at)}</p></div>
                    <div className="text-right">
                      <p className="font-semibold text-blue-700">{fmt(v.total)}</p>
                      {v.statut === 'partielle' && <p className="text-xs text-orange-600">Reste : {fmt(v.total - v.montant_paye)}</p>}
                    </div>
                  </div>
                ))}
                {!detail.ventes?.length && <p className="text-gray-400 text-sm">Aucune vente</p>}
              </div>
              <h3 className="font-semibold text-gray-700 pt-2">Dernières factures</h3>
              <div className="space-y-1">
                {detail.factures?.map(f => (
                  <div key={f.id} className="flex justify-between items-center py-2 border-b border-gray-100 text-sm">
                    <div><p className="font-mono text-xs text-gray-500">{f.numero}</p><p className="text-xs text-gray-400">{fmtD(f.created_at)}</p></div>
                    <div className="text-right">
                      <p className="font-semibold text-blue-700">{fmt(f.total)}</p>
                      {['emise','partielle'].includes(f.statut) && f.total - f.montant_paye > 0 && <p className="text-xs text-orange-600">Reste : {fmt(f.total - f.montant_paye)}</p>}
                    </div>
                  </div>
                ))}
                {!detail.factures?.length && <p className="text-gray-400 text-sm">Aucune facture</p>}
              </div>

              <h3 className="font-semibold text-gray-700 pt-2">Historique des règlements</h3>
              <div className="space-y-1">
                {detail.recus?.map(r => (
                  <div key={r.id} className="flex justify-between items-center py-2 border-b border-gray-100 text-sm">
                    <div>
                      <p className="font-mono text-xs text-gray-500">{r.numero}</p>
                      <p className="text-xs text-gray-400">{fmtD(r.created_at)} — {modeLabel[r.mode_paiement] || r.mode_paiement}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-green-600">{fmt(r.total)}</p>
                      <button type="button" onClick={() => imprimerRecu(r.id, dette(detail))}
                        className="text-blue-600 hover:bg-blue-50 p-1.5 rounded" title="Réimprimer ce reçu">
                        <Printer size={14}/>
                      </button>
                    </div>
                  </div>
                ))}
                {!detail.recus?.length && <p className="text-gray-400 text-sm">Aucun règlement</p>}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}





