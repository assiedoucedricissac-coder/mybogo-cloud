import React, { useState, useEffect, useRef } from 'react';
import {
  Search, Trash2, ShoppingCart, Check, X, Scan,
  Plus, Minus, Tag, Banknote, Smartphone, CreditCard,
  ArrowLeftRight, User, ReceiptText, Percent, Printer, RotateCcw, AlertTriangle,
  Layers, Package, LogIn, LogOut, Wallet, ClipboardList, Shuffle, Settings2
} from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useDraggable } from '../hooks/useDraggable';

const fmt = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0));
// Convertit une valeur potentiellement en cours de saisie (ex: "12." ou "" ou juste ".")
// en nombre sûr pour les calculs, sans jamais produire NaN.
const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

const DENOMINATIONS = [10000, 5000, 2000, 1000, 500, 250, 200, 100, 50, 25, 10, 5];

// Persistance du panier en cours : survit à un changement de page et même à une
// fermeture accidentelle de l'app, tant que la vente n'a pas été encaissée.
const TICKETS_LS_KEY = 'mybogo_caisse_tickets';

const MODES = [
  { key: 'especes',      label: 'Espèces',      icon: Banknote },
  { key: 'mobile_money', label: 'Mobile Money', icon: Smartphone },
  { key: 'carte',        label: 'Carte',        icon: CreditCard },
  { key: 'virement',     label: 'Virement',     icon: ArrowLeftRight },
  { key: 'credit',       label: 'Crédit',       icon: User },
];

/* ── Document (facture/proforma/avoir/reçu) créé directement depuis la Caisse ──
   Reprend exactement le même formulaire que le module Facturation (mêmes champs,
   mêmes calculs), pour que créer un document ici se comporte "exactement de la
   même manière" — seule différence : l'impression sort en ticket thermique 80mm
   au lieu d'un PDF A4. */
const todayStrDoc = () => new Date().toISOString().slice(0,10);
const TYPES_DOC = [
  { value:'facture',  label:'Facture',  color:'bg-blue-100 text-blue-800',   ring:'ring-blue-500'  },
  { value:'proforma', label:'Proforma', color:'bg-amber-100 text-amber-800',  ring:'ring-amber-500' },
  { value:'avoir',    label:'Avoir',    color:'bg-red-100 text-red-800',      ring:'ring-red-500'   },
  { value:'recu',     label:'Reçu',     color:'bg-green-100 text-green-800',  ring:'ring-green-500' },
];
const MODES_PAIEMENT_DOC = ['especes','mobile_money','carte','virement','cheque','credit'];
const emptyLigneDoc = {
  produit_id:'', designation:'', quantite:1, unite:'pièce', prix_ht:'', remise:0,
  remise_montant:0, taux_tva:0, contenance:1, unite_libelle:'unité', conditionnement_id:''
};
const emptyDocForm = () => ({
  type:'facture', client_id:'', remise:0, remise_montant:0,
  mode_paiement:'especes', montant_paye:'', echeance:'', note:'',
  date_document: todayStrDoc(),
  lignes:[{ ...emptyLigneDoc }],
});
function calcLigneDoc(l) {
  const base = (parseFloat(l.prix_ht)||0) * (parseFloat(l.quantite)||0);
  const remisePct = (parseFloat(l.remise)||0) / 100;
  const remiseMt = parseFloat(l.remise_montant)||0;
  const net = Math.max(0, base * (1 - remisePct) - remiseMt);
  return { ht: net, ttc: net };
}
function calcTotauxDoc(lignes, remise, remiseMontant) {
  let ht = 0;
  lignes.forEach(l => { ht += calcLigneDoc(l).ht; });
  const remisePctMt = ht * (parseFloat(remise)||0) / 100;
  const remiseMt = parseFloat(remiseMontant)||0;
  return { ht, remisePctMt, remiseMt, total: Math.max(0, ht - remisePctMt - remiseMt) };
}

export default function Caisse() {
  const { user } = useAuth();

  // ── Multi-tickets ──
  const ticketIdRef = useRef(0);
  const mkTicket = () => ({
    id: ++ticketIdRef.current,
    panier: [], clientId: '', remise: '',
    remiseType: 'pct', modePaiement: 'especes', montantPaye: ''
  });
  const [tickets, setTickets]     = useState(() => {
    try {
      const data = JSON.parse(localStorage.getItem(TICKETS_LS_KEY));
      if (data?.tickets?.length) {
        ticketIdRef.current = Math.max(0, ...data.tickets.map(t => t.id || 0));
        return data.tickets;
      }
    } catch {}
    return [mkTicket()];
  });
  const [ticketActif, setTicketActif] = useState(() => {
    try {
      const data = JSON.parse(localStorage.getItem(TICKETS_LS_KEY));
      return data?.ticketActif || 0;
    } catch { return 0; }
  });

  // Sauvegarde automatique du panier en cours à chaque modification, pour le
  // retrouver tel quel si on quitte la page Caisse puis qu'on y revient.
  useEffect(() => {
    try { localStorage.setItem(TICKETS_LS_KEY, JSON.stringify({ tickets, ticketActif })); } catch {}
  }, [tickets, ticketActif]);

  const ticket       = tickets[ticketActif] ?? tickets[0];
  const panier       = ticket.panier;
  const clientId     = ticket.clientId;
  const remise       = ticket.remise;
  const remiseType   = ticket.remiseType;
  const modePaiement = ticket.modePaiement;
  const montantPaye  = ticket.montantPaye;

  function updateTicket(updates) {
    setTickets(prev => prev.map((t, i) => i === ticketActif ? { ...t, ...updates } : t));
  }
  function setPanier(updater) {
    setTickets(prev => prev.map((t, i) => {
      if (i !== ticketActif) return t;
      return { ...t, panier: typeof updater === 'function' ? updater(t.panier) : updater };
    }));
  }
  const setClientId     = v => updateTicket({ clientId: v });
  const setRemise       = v => updateTicket({ remise: v });
  const setRemiseType   = v => updateTicket({ remiseType: v });
  const setModePaiement = v => updateTicket({ modePaiement: v });
  const setMontantPaye  = v => updateTicket({ montantPaye: v });

  function nouveauTicket() {
    setTickets(prev => [...prev, mkTicket()]);
    setTicketActif(tickets.length);
  }
  function fermerTicket(idx) {
    if (tickets[idx]?.panier.length > 0) {
      if (!window.confirm(`Le ticket #${idx + 1} a des articles. Fermer quand même ?`)) return;
    }
    setTickets(prev => {
      const next = prev.filter((_, i) => i !== idx);
      return next.length ? next : [mkTicket()];
    });
    setTicketActif(prev => Math.max(0, prev >= idx ? prev - 1 : prev));
  }

  // ── États globaux ──
  const [produits, setProduits]         = useState([]);
  const [clients, setClients]           = useState([]);
  const [societe, setSociete]           = useState({});
  // Fonctionnalités activables/désactivables par le Super Admin (voir SuperAdmin.jsx) —
  // 1/absent = activé (comportement historique), 0 = désactivé explicitement pour ce client.
  const peutModifierPrix       = !!user && societe.feat_modifier_prix_caisse !== 0;
  const featVenteMelange       = societe.feat_vente_melange !== 0;
  const featFacturationCaisse  = societe.feat_facturation_sans_vente !== 0;
  const featVenteConditionnement = societe.feat_vente_conditionnement !== 0;
  const featVenteCredit        = societe.feat_vente_credit !== 0;
  const featMultiTickets       = societe.feat_multi_tickets !== 0;
  const [cachetB64, setCachetB64]       = useState(null);
  const [condMap, setCondMap]           = useState({});
  const [condPicker, setCondPicker]     = useState(null);
  const [formatSetup, setFormatSetup]   = useState(null); // { produit, genN, genPrix }
  const [tarifPicker, setTarifPicker]   = useState(null);
  const [search, setSearch]             = useState('');
  const [recu, setRecu]                 = useState(null);
  const [emissionFacture, setEmissionFacture] = useState(false);
  const [factureCreee, setFactureCreee] = useState(null); // { numero, total, r } — confirmation après création sans vente
  const [docModal, setDocModal] = useState(false); // formulaire complet "Nouveau document" (identique à Facturation)
  const [docForm, setDocForm]   = useState(emptyDocForm());
  const docModalDrag = useDraggable();
  // Un hook de drag par fenêtre — pour pouvoir toutes les déplacer et voir ce qu'il y a derrière.
  const ouvrirDrag = useDraggable();
  const resultatDrag = useDraggable();
  const historiqueDrag = useDraggable();
  const tarifPickerDrag = useDraggable();
  const formatSetupDrag = useDraggable();
  const arreteCaisseDrag = useDraggable();
  const mixModalDrag = useDraggable();
  const condPickerDrag = useDraggable();
  const recuDrag = useDraggable();
  const factureCreeeDrag = useDraggable();
  const [annulCaisse, setAnnulCaisse]   = useState(false);
  const [loading, setLoading]           = useState(false);
  const [session, setSession]           = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [modalFond, setModalFond]       = useState(null);
  const [fondInput, setFondInput]       = useState('');
  const [historique, setHistorique]     = useState([]);
  const [correctionSession, setCorrectionSession] = useState(null); // session (clôturée) en cours de correction via l'écran Arrêté
  const [correctionSansDetail, setCorrectionSansDetail] = useState(false); // true = aucun détail retrouvé (ancienne clôture) — le tableau reste identique, juste vide au départ
  const [cloturResult, setCloturResult] = useState(null);
  const [cloturLoading, setCloturLoading] = useState(false);
  const [arreteCaisse, setArreteCaisse] = useState(false);
  const [arreteDate, setArreteDate]     = useState(''); // date/heure affichée sur l'arrêté imprimé — modifiable si clôture faite en différé
  const [billsCounts, setBillsCounts]   = useState({});
  const [mixModal, setMixModal]         = useState(false);
  const [mixCartonSize, setMixCartonSize] = useState(24);
  const [mixFraction, setMixFraction]   = useState('half'); // 'quarter','half','full','libre'
  const [mixLibre, setMixLibre]         = useState('');
  const mixTarget = mixFraction === 'quarter' ? Math.round(mixCartonSize / 4)
                  : mixFraction === 'half'    ? Math.round(mixCartonSize / 2)
                  : mixFraction === 'full'    ? mixCartonSize
                  : (parseInt(mixLibre) || 0);
  // Config imprimante figée : après réglages sur le terrain, l'imprimante système par défaut
  // et le rouleau 58mm sont ceux qui conviennent — plus besoin de les choisir à chaque fois.
  const papierLargeur = 58;
  const selectedPrinter = '';
  const [mixItems, setMixItems]         = useState([]);
  const [mixSearch, setMixSearch]       = useState('');
  const searchRef = useRef(null);
  const panierRef = useRef(null);
  const impressionEnCoursRef = useRef(false);

  const clientSelectionne = clients.find(c => String(c.id) === String(clientId)) || null;

  function rechargerProduits() {
    api.get('/produits', { params: { actif: 1 } }).then(r => setProduits(r.data));
    api.get('/conditionnements').then(r => {
      const map = {};
      r.data.forEach(c => {
        if (!map[c.produit_id]) map[c.produit_id] = [];
        map[c.produit_id].push(c);
      });
      setCondMap(map);
    }).catch(() => {});
  }

  useEffect(() => {
    rechargerProduits();
    api.get('/clients').then(r => setClients(r.data));
    api.get('/config/societe').then(async r => {
      setSociete(r.data);
      if (r.data.cachet) {
        try {
          const resp = await fetch(window.location.origin + r.data.cachet);
          const blob = await resp.blob();
          const b64  = await new Promise(res => { const rd = new FileReader(); rd.onload = () => res(rd.result); rd.readAsDataURL(blob); });
          setCachetB64(b64);
        } catch {}
      }
    }).catch(() => {});
    api.get('/sessions-caisse/active').then(async r => {
      const s = r.data;
      if (s) {
        const today = new Date().toISOString().slice(0, 10);
        const sessionDate = s.created_at?.slice(0, 10) || s.date;
        if (sessionDate !== today) {
          // Session d'un autre jour → clôture automatique puis demander nouveau fond
          await api.post('/sessions-caisse/cloturer', { fond_cloture: 0 }).catch(() => {});
          setSession(null);
          setModalFond('ouvrir');
        } else {
          setSession(s);
        }
      } else {
        setModalFond('ouvrir');
      }
    }).catch(() => {}).finally(() => setSessionLoading(false));
    searchRef.current?.focus();
  }, []);

  async function handleOuvrir(e) {
    e.preventDefault();
    if (fondInput === '') return toast.error('Entrez le montant du fond');
    try {
      const r = await api.post('/sessions-caisse/ouvrir', { fond_ouverture: parseFloat(fondInput) || 0 });
      setSession(r.data);
      setModalFond(null);
      setFondInput('');
      toast.success('Caisse ouverte !');
    } catch (err) { toast.error(err.response?.data?.message || 'Erreur'); }
  }

  async function ouvrirHistorique() {
    const r = await api.get('/sessions-caisse').catch(() => ({ data: [] }));
    setHistorique(r.data);
    setModalFond('historique');
  }

  // "Modifier" ramène sur le même écran d'Arrêté que pour une clôture normale (même tableau de
  // coupures), avec le décompte billet par billet déjà rempli tel qu'il avait été saisi si on
  // l'a retrouvé — sinon le tableau démarre vide (ancienne session, jamais enregistré).
  async function ouvrirCorrectionSession(id) {
    try {
      const r = await api.get(`/sessions-caisse/${id}`);
      setCorrectionSession(r.data);
      let detail = null;
      try { detail = r.data.detail_billets ? JSON.parse(r.data.detail_billets) : null; } catch {}
      setBillsCounts(detail || {});
      setCorrectionSansDetail(!detail);
      setModalFond(null);
      setArreteCaisse(true);
    } catch { toast.error('Impossible de charger cette session'); }
  }

  async function enregistrerCorrectionDepuisArrete() {
    const totalEspeces = DENOMINATIONS.reduce((s, d) => s + (parseInt(billsCounts[d]) || 0) * d, 0);
    setCloturLoading(true);
    try {
      await api.put(`/sessions-caisse/${correctionSession.id}`, {
        fond_cloture: totalEspeces,
        detail_billets: billsCounts,
      });
      toast.success('Clôture corrigée');
      setArreteCaisse(false);
      setCorrectionSession(null);
      setCorrectionSansDetail(false);
      const r = await api.get('/sessions-caisse').catch(() => ({ data: [] }));
      setHistorique(r.data);
      setModalFond('historique');
    } catch (err) { toast.error(err.response?.data?.message || 'Erreur lors de la correction'); }
    finally { setCloturLoading(false); }
  }

  async function supprimerSession(id) {
    if (!window.confirm('Supprimer définitivement cette clôture ? Cette action est irréversible.')) return;
    try {
      await api.delete(`/sessions-caisse/${id}`);
      toast.success('Session supprimée');
      const r = await api.get('/sessions-caisse').catch(() => ({ data: [] }));
      setHistorique(r.data);
    } catch (err) { toast.error(err.response?.data?.message || 'Erreur lors de la suppression'); }
  }

  // resultat : si fourni (après une clôture), la session vient d'être fermée — le ticket
  // imprimé inclut alors l'écart final au lieu de n'être qu'un décompte préparatoire.
  // isHistoryReprint : réimpression d'une session PASSÉE depuis l'historique — le décompte
  // billet par billet n'a jamais été enregistré (seul le total compté l'était), donc ce
  // tableau n'a pas de sens ici et est simplement omis plutôt que de montrer "0 partout".
  function imprimerArrete(resultat = null, isHistoryReprint = false) {
    const sessData = resultat || session;
    // Si l'utilisateur a choisi une date/heure précise (clôture faite le lendemain, par ex.),
    // on l'utilise pour l'impression au lieu de l'instant présent.
    const date = isHistoryReprint && resultat?.clos_a ? new Date(resultat.clos_a)
      : arreteDate ? new Date(arreteDate) : new Date();
    const dateStr = date.toLocaleDateString('fr-FR', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    const heureStr = date.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
    const rows = DENOMINATIONS.map(d => {
      const qty = parseInt(billsCounts[d]) || 0;
      return { d, qty, total: qty * d };
    });
    const totalEspeces = rows.reduce((s, r) => s + r.total, 0);
    // Le client n'a qu'une imprimante thermique (pas d'A4) : ce document doit donc être au
    // format ticket étroit (58/80mm), pas un rapport A4 — sinon tout ce qui dépasse la
    // largeur réelle du papier est purement et simplement coupé par l'imprimante.
    const lignesHTML = rows.filter(r => r.qty > 0).map(r => `
      <tr>
        <td style="padding:2px 4px 2px 0">${new Intl.NumberFormat('fr-FR').format(r.d)} F</td>
        <td style="text-align:center;padding:2px 2px">${r.qty}</td>
        <td style="text-align:right;padding:2px 0;font-weight:700">${new Intl.NumberFormat('fr-FR').format(r.total)} F</td>
      </tr>`).join('') || '<tr><td colspan="3" style="text-align:center;color:#999;padding:6px 0">Aucun billet compté</td></tr>';
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Arrêté de caisse</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family:'Courier New', monospace; font-size:13px; width:${papierLargeur}mm; max-width:${papierLargeur}mm; padding:6mm 4mm; color:#000; overflow-x:hidden; }
      .center { text-align:center; }
      .bold { font-weight:bold; }
      .sep  { border-top:1px dashed #000; margin:6px 0; }
      .sep2 { border-top:2px solid #000; margin:6px 0; }
      table { width:100%; border-collapse:collapse; table-layout:fixed; }
      th, td { word-wrap:break-word; overflow-wrap:break-word; }
      th:nth-child(1), td:nth-child(1) { width:40%; }
      th:nth-child(2), td:nth-child(2) { width:24%; }
      th:nth-child(3), td:nth-child(3) { width:36%; }
      th { font-size:10px; text-transform:uppercase; padding-bottom:4px; border-bottom:1px dashed #000; }
      .total-row { display:flex; justify-content:space-between; font-size:14px; font-weight:800; padding-top:6px; }
      @media print { @page { margin:0; size:${papierLargeur}mm auto; } body { padding:4mm 3mm; } }
    </style></head><body>
    <div class="center bold" style="font-size:15px">ARRÊTÉ DE CAISSE${isHistoryReprint ? ' — RÉIMPRESSION' : resultat ? ' — CLÔTURÉ' : ''}</div>
    <div class="center">${dateStr}</div>
    <div class="center">${heureStr}</div>
    <div class="sep2"></div>
    ${sessData ? `<div style="display:flex;justify-content:space-between"><span>Fond d'ouverture</span><span>${new Intl.NumberFormat('fr-FR').format(sessData.fond_ouverture)} FCFA</span></div><div class="sep"></div>` : ''}
    ${!isHistoryReprint ? `
    <table>
      <thead><tr><th style="text-align:left">Coupure</th><th style="text-align:center">Qté</th><th style="text-align:right">Montant</th></tr></thead>
      <tbody>${lignesHTML}</tbody>
    </table>
    <div class="sep2"></div>
    <div class="total-row"><span>TOTAL BILLETS</span><span>${new Intl.NumberFormat('fr-FR').format(totalEspeces)} FCFA</span></div>
    ` : `<div class="center" style="font-size:10px;color:#666;font-style:italic">(détail billet par billet non conservé — voir le total ci-dessous)</div>`}
    ${(sessData?.reglements_credit || []).length > 0 ? `
    <div class="sep"></div>
    <div class="bold" style="font-size:11px;text-transform:uppercase;margin-bottom:4px">Règlements crédit reçus</div>
    ${(sessData.reglements_credit || []).map(r => `<div style="display:flex;justify-content:space-between;font-size:11px"><span>${r.client_nom}</span><span>+${new Intl.NumberFormat('fr-FR').format(r.montant)} F</span></div>`).join('')}
    <div style="display:flex;justify-content:space-between;font-weight:bold;margin-top:4px"><span>TOTAL REGL. CRÉDIT</span><span>+${new Intl.NumberFormat('fr-FR').format(sessData.total_reglements_credit || 0)} FCFA</span></div>
    ` : ''}
    ${(sessData?.reglements_facture || []).length > 0 ? `
    <div class="sep"></div>
    <div class="bold" style="font-size:11px;text-transform:uppercase;margin-bottom:4px">Règlements facture reçus</div>
    ${(sessData.reglements_facture || []).map(r => `<div style="display:flex;justify-content:space-between;font-size:11px"><span>${r.client_nom || r.facture_numero}</span><span>+${new Intl.NumberFormat('fr-FR').format(r.montant)} F</span></div>`).join('')}
    <div style="display:flex;justify-content:space-between;font-weight:bold;margin-top:4px"><span>TOTAL REGL. FACTURE</span><span>+${new Intl.NumberFormat('fr-FR').format(sessData.total_reglements_facture || 0)} FCFA</span></div>
    ` : ''}
    ${resultat ? `
    <div class="sep2"></div>
    <div style="display:flex;justify-content:space-between"><span>Total attendu</span><span class="bold">${new Intl.NumberFormat('fr-FR').format(resultat.fond_ouverture + resultat.total_ventes + (resultat.total_reglements_credit||0) + (resultat.total_reglements_facture||0))} FCFA</span></div>
    <div style="display:flex;justify-content:space-between"><span>Espèces comptées</span><span class="bold">${new Intl.NumberFormat('fr-FR').format(resultat.fond_cloture)} FCFA</span></div>
    <div class="sep"></div>
    <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:800"><span>ÉCART</span><span>${resultat.ecart >= 0 ? '+' : ''}${new Intl.NumberFormat('fr-FR').format(resultat.ecart)} FCFA</span></div>
    ` : ''}
    <div class="sep"></div>
    <div style="margin-top:20px;font-size:11px">Signature du caissier :</div>
    <div style="margin-top:18px;border-top:1px solid #000;width:70%"></div>
    </body></html>`;
    doPrint(html);
  }

  // Compte + clôture + impression, tout depuis la même fenêtre d'Arrêté — le client ne veut
  // plus faire "Arrêté" puis "Clôturer" séparément dans deux endroits différents.
  async function cloturerDepuisArrete() {
    const totalEspeces = DENOMINATIONS.reduce((s, d) => s + (parseInt(billsCounts[d]) || 0) * d, 0);
    const sessionAvantCloture = session;
    setCloturLoading(true);
    try {
      const r = await api.post('/sessions-caisse/cloturer', { fond_cloture: totalEspeces, detail_billets: billsCounts });
      const resultat = { ...sessionAvantCloture, ...r.data };
      setSession(null);
      setArreteCaisse(false);
      imprimerArrete(resultat);
      setCloturResult(resultat);
      setModalFond('resultat');
      toast.success('Caisse clôturée');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Erreur lors de la clôture');
    } finally {
      setCloturLoading(false);
    }
  }

  // Réimprime l'arrêté d'une session PASSÉE (le client reçoit parfois un client des jours
  // après qui redemande sa pièce comptable, ou le caissier a perdu le ticket physique).
  async function reimprimerArreteHistorique(sessionId) {
    try {
      const r = await api.get(`/sessions-caisse/${sessionId}`);
      imprimerArrete(r.data, true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Erreur lors de la réimpression');
    }
  }

  /* ── Filtrage produits ── */
  const filtered = search.length >= 1
    ? produits.filter(p =>
        p.nom.toLowerCase().includes(search.toLowerCase()) ||
        p.code.toLowerCase().includes(search.toLowerCase()) ||
        (p.code_barres || '').includes(search)
      ).slice(0, 12)
    : [];

  /* ── Ajouter au panier (avec gestion conditionnements + tarifs) ── */
  function addToCart(p) {
    if (p.qte_actuelle <= 0) { toast.error('Produit en rupture de stock'); return; }
    const conds = featVenteConditionnement ? (condMap[p.id] || []) : [];
    if (conds.length > 0) {
      setCondPicker({ produit: p, conds });
      setSearch('');
      return;
    }
    // Pas de conditionnements → proposer configuration si prix_vente = 0 (grossiste/carton)
    if (featVenteConditionnement && (!p.prix_vente || p.prix_vente === 0)) {
      setFormatSetup({ produit: p, genN: '', genPrix: '' });
      setSearch('');
      return;
    }
    // Sélecteur de tarif si le produit a des prix demi-gros ou gros
    const tarifs = [{ label: 'Détail', prix: p.prix_vente }];
    if (p.prix_revendeur > 0) tarifs.push({ label: 'Demi-gros', prix: p.prix_revendeur });
    if (p.prix_grossiste > 0) tarifs.push({ label: 'Gros', prix: p.prix_grossiste });
    if (tarifs.length > 1) {
      setTarifPicker({ produit: p, tarifs });
      setSearch('');
      return;
    }
    addSingleUnit(p);
  }

  async function setupAndAddToCart() {
    if (!formatSetup) return;
    const { produit, genN, genPrix } = formatSetup;
    const n = parseInt(genN);
    const prixCarton = parseFloat(genPrix);
    if (!n || n < 2) return toast.error('Entrez le nombre d\'unités par carton (ex: 48)');
    if (!prixCarton || prixCarton <= 0) return toast.error('Entrez le prix de vente du carton');
    const quart = Math.max(1, Math.round(n / 4));
    const demi  = Math.max(1, Math.round(n / 2));
    const formats = [
      { libelle: 'Bouteille', contenance: 1,     prix_vente: Math.round(prixCarton / n), ordre: 0 },
      { libelle: '¼ Carton',  contenance: quart, prix_vente: Math.round(prixCarton / 4), ordre: 1 },
      { libelle: '½ Carton',  contenance: demi,  prix_vente: Math.round(prixCarton / 2), ordre: 2 },
      { libelle: 'Carton',    contenance: n,     prix_vente: prixCarton,                 ordre: 3 },
    ];
    try {
      for (const f of formats) {
        await api.post('/conditionnements', { produit_id: produit.id, ...f });
      }
      // Mettre à jour le condMap sans rechargement complet
      const res = await api.get('/conditionnements');
      const map = {};
      res.data.forEach(c => {
        if (!map[c.produit_id]) map[c.produit_id] = [];
        map[c.produit_id].push(c);
      });
      setCondMap(map);
      const newConds = (map[produit.id] || []);
      setFormatSetup(null);
      setCondPicker({ produit, conds: newConds });
      toast.success('Formats enregistrés !');
    } catch (err) { toast.error(err.response?.data?.message || 'Erreur'); }
  }

  function addWithTarif(prod, tarif) {
    const panierKey = `${prod.id}_${tarif.label}`;
    if (prod.qte_actuelle <= 0) { toast.error('Produit en rupture'); setTarifPicker(null); return; }
    setPanier(prev => {
      const exists = prev.find(i => i.panier_id === panierKey);
      if (exists) {
        if (exists.quantite >= prod.qte_actuelle) { toast.error('Stock insuffisant'); return prev; }
        return prev.map(i => i.panier_id === panierKey ? { ...i, quantite: i.quantite + 1 } : i);
      }
      setTimeout(() => panierRef.current?.scrollTo({ top: 9999, behavior: 'smooth' }), 50);
      return [...prev, {
        panier_id: panierKey,
        produit_id: prod.id, nom: prod.nom, code: prod.code,
        prix_unitaire: tarif.prix, quantite: 1,
        contenance: 1, unite_libelle: tarif.label,
        stock_max: prod.qte_actuelle
      }];
    });
    setTarifPicker(null);
    searchRef.current?.focus();
  }

  function addSingleUnit(p) {
    const panierKey = `${p.id}_unite`;
    setPanier(prev => {
      const exists = prev.find(i => i.panier_id === panierKey);
      if (exists) {
        if (exists.quantite >= p.qte_actuelle) { toast.error('Stock insuffisant'); return prev; }
        return prev.map(i => i.panier_id === panierKey ? { ...i, quantite: i.quantite + 1 } : i);
      }
      const next = [...prev, {
        panier_id: panierKey,
        produit_id: p.id, nom: p.nom, code: p.code,
        prix_unitaire: p.prix_vente, quantite: 1,
        contenance: 1, unite_libelle: p.unite || 'unité',
        stock_max: p.qte_actuelle
      }];
      setTimeout(() => panierRef.current?.scrollTo({ top: 9999, behavior: 'smooth' }), 50);
      return next;
    });
    setSearch('');
    searchRef.current?.focus();
  }

  function addWithCond(prod, cond) {
    const panierKey = `${prod.id}_${cond.id}`;
    const maxQty = Math.floor(prod.qte_actuelle / cond.contenance);
    if (maxQty <= 0) { toast.error(`Stock insuffisant pour "${cond.libelle}"`); setCondPicker(null); return; }
    setPanier(prev => {
      const exists = prev.find(i => i.panier_id === panierKey);
      if (exists) {
        if (exists.quantite >= maxQty) { toast.error('Stock insuffisant'); return prev; }
        return prev.map(i => i.panier_id === panierKey ? { ...i, quantite: i.quantite + 1 } : i);
      }
      const next = [...prev, {
        panier_id: panierKey,
        produit_id: prod.id, nom: prod.nom, code: prod.code,
        prix_unitaire: cond.prix_vente, quantite: 1,
        contenance: cond.contenance, unite_libelle: cond.libelle,
        stock_max: maxQty
      }];
      setTimeout(() => panierRef.current?.scrollTo({ top: 9999, behavior: 'smooth' }), 50);
      return next;
    });
    setCondPicker(null);
    searchRef.current?.focus();
  }

  /* ── Décodage clavier AZERTY mal configuré ──
     Un scanner de code-barres émule un clavier et envoie des codes de touches "bruts" (US).
     Si Windows est réglé en clavier FRANÇAIS (AZERTY, le cas courant ici), chaque CHIFFRE
     scanné ressort comme le SYMBOLE non-majuscule situé sur cette touche en AZERTY
     (1→&, 2→é, 3→", 4→', 5→(, 6→-, 7→è, 8→_, 9→ç, 0→à) au lieu du chiffre lui-même —
     le code-barres devient alors une suite de symboles illisible dans la recherche.
     On détecte ce cas et on retrouve les chiffres d'origine automatiquement. */
  const AZERTY_VERS_CHIFFRE = { '&':'1', 'é':'2', '"':'3', "'":'4', '(':'5', '-':'6', 'è':'7', '_':'8', 'ç':'9', 'à':'0' };
  function decoderCodeAzerty(str) {
    if (!str) return null;
    const decoded = [...str].map(c => AZERTY_VERS_CHIFFRE[c]);
    if (decoded.some(d => d === undefined)) return null;
    return decoded.join('');
  }

  /* ── Scan Enter ──
     Un scanner de code-barres tape le code puis envoie "Entrée" tout seul.
     On gère plusieurs cas pour qu'un scan ne reste jamais sans effet ni sans retour :
     - une seule correspondance → on l'ajoute
     - plusieurs correspondances mais une seule a EXACTEMENT ce code-barres → on privilégie celle-là
     - le texte scanné est en fait un code-barres "AZERTY-garbled" (voir ci-dessus) → on décode et réessaie
     - aucune correspondance → message clair (code-barres inconnu) au lieu de ne rien faire
     Dans tous les cas d'échec, on vide le champ pour que le PROCHAIN scan ne vienne pas
     se concaténer à la suite d'un texte déjà invalide (ce qui produisait des messages
     d'erreur avec le même charabia répété plusieurs fois de suite). */
  function handleSearchKey(e) {
    if (e.key !== 'Enter') return;
    const code = search.trim();
    if (!code) return;

    if (filtered.length === 1) { addToCart(filtered[0]); return; }

    if (filtered.length > 1) {
      const exact = filtered.find(p => p.code_barres === code || p.code === code);
      if (exact) { addToCart(exact); return; }
      toast.error(`Plusieurs produits correspondent à "${code}" — précisez la recherche`);
      setSearch('');
      return;
    }

    const decode = decoderCodeAzerty(code);
    if (decode) {
      const match = produits.find(p => p.code_barres === decode || p.code === decode);
      if (match) { addToCart(match); return; }
    }

    toast.error(`Aucun produit trouvé pour le code "${code}"`);
    setSearch('');
  }

  function updateQty(panierKey, delta) {
    setPanier(prev => prev.map(i => {
      if (i.panier_id !== panierKey) return i;
      const nq = i.quantite + delta;
      if (nq <= 0) return null;
      if (nq > i.stock_max) { toast.error('Stock insuffisant'); return i; }
      return { ...i, quantite: nq };
    }).filter(Boolean));
  }

  function setQty(panierKey, val) {
    const q = parseInt(val) || 0;
    if (q <= 0) { setPanier(prev => prev.filter(i => i.panier_id !== panierKey)); return; }
    setPanier(prev => prev.map(i => {
      if (i.panier_id !== panierKey) return i;
      if (q > i.stock_max) { toast.error('Stock insuffisant'); return i; }
      return { ...i, quantite: q };
    }));
  }

  function removeItem(panierKey) {
    setPanier(prev => prev.filter(i => i.panier_id !== panierKey));
    // Après une suppression, Chromium laisse parfois la zone cliquable "figée" — un évènement
    // resize (celui que déclenche réduire/restaurer la fenêtre) force le repaint qui débloque.
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }

  // On garde la chaîne brute telle que tapée (ex: "12." en cours de saisie d'une décimale)
  // plutôt que de la convertir en nombre à chaque frappe : sinon la virgule/le point final
  // disparaît immédiatement et il devient impossible de saisir une décimale.
  function setRemiseLigne(panierKey, val) {
    setPanier(prev => prev.map(i => i.panier_id === panierKey ? { ...i, remise_fcfa: val } : i));
  }

  function setPrixLigne(panierKey, val) {
    setPanier(prev => prev.map(i => i.panier_id === panierKey ? { ...i, prix_unitaire: val } : i));
  }

  /* ── Vente mixte ── */
  function getMixUnitPrice(p) {
    const conds = condMap[p.id] || [];
    const bouteille = conds.find(c => c.contenance === 1) || conds[0];
    return bouteille ? bouteille.prix_vente : p.prix_vente;
  }

  function addToMix(p) {
    if (p.qte_actuelle <= 0) { toast.error('Rupture de stock'); return; }
    const prixUnit = getMixUnitPrice(p);
    setMixItems(prev => {
      if (prev.find(i => i.produit.id === p.id)) return prev;
      return [...prev, { produit: p, prixUnit }];
    });
    setMixSearch('');
  }

  function updateMixPrice(produitId, val) {
    setMixItems(prev => prev.map(i => i.produit.id === produitId ? { ...i, prixUnit: val } : i));
  }

  function validerMix() {
    if (mixItems.length === 0) { toast.error('Aucun produit dans le mix'); return; }
    const base = Math.floor(mixTarget / mixItems.length);
    const remainder = mixTarget % mixItems.length;
    const toAdd = mixItems.map((item, i) => ({ ...item, qte: base + (i < remainder ? 1 : 0) }));
    toAdd.forEach(({ produit, qte, prixUnit }) => {
      const panierKey = `${produit.id}_mix_${Date.now()}_${Math.random()}`;
      setPanier(prev => {
        if (qte > produit.qte_actuelle) { toast.error(`Stock insuffisant pour ${produit.nom}`); return prev; }
        return [...prev, {
          panier_id: panierKey,
          produit_id: produit.id, nom: produit.nom, code: produit.code,
          prix_unitaire: num(prixUnit), quantite: qte,
          contenance: 1, unite_libelle: 'u. (mix)',
          stock_max: produit.qte_actuelle
        }];
      });
    });
    toast.success(`Mélange ajouté au panier`);
    setMixModal(false);
    setMixItems([]);
    setMixSearch('');
    setTimeout(() => panierRef.current?.scrollTo({ top: 9999, behavior: 'smooth' }), 100);
  }

  const mixFiltered = mixSearch.trim().length >= 1
    ? produits.filter(p => p.nom.toLowerCase().includes(mixSearch.toLowerCase()) || p.code.toLowerCase().includes(mixSearch.toLowerCase())).slice(0, 6)
    : [];
  // Distribution automatique égale entre tous les produits du mix
  const mixDistrib = (() => {
    if (mixItems.length === 0) return [];
    const base = Math.floor(mixTarget / mixItems.length);
    const remainder = mixTarget % mixItems.length;
    return mixItems.map((item, i) => ({ ...item, qte: base + (i < remainder ? 1 : 0) }));
  })();
  const mixTotal = mixDistrib.reduce((s, i) => s + i.qte, 0);
  const mixMontant = mixDistrib.reduce((s, i) => s + i.qte * num(i.prixUnit), 0);

  /* ── Calculs ── */
  const totalLignes = panier.reduce((s, i) => {
    const brut = num(i.prix_unitaire) * i.quantite;
    const remiseFcfa = Math.min(num(i.remise_fcfa), brut);
    return s + brut - remiseFcfa;
  }, 0);

  const remiseVal  = parseFloat(remise) || 0;
  const remiseMt   = remiseType === 'pct'
    ? totalLignes * remiseVal / 100
    : Math.min(remiseVal, totalLignes);
  const remisePct  = totalLignes > 0 ? (remiseMt / totalLignes) * 100 : 0;

  const total      = Math.max(0, totalLignes - remiseMt);
  const monnaie    = (parseFloat(montantPaye) || 0) - total;

  /* ── Valider vente ── */
  async function handleVente() {
    if (!panier.length) return toast.error('Le ticket est vide');
    if (modePaiement === 'credit' && !clientId) return toast.error('Sélectionnez un client pour une vente à crédit');
    if (modePaiement === 'especes' && montantPaye && monnaie < 0) return toast.error('Montant insuffisant');
    setLoading(true);
    const acompte = modePaiement === 'credit' ? (parseFloat(montantPaye) || 0) : (parseFloat(montantPaye) || total);
    const resteDu = modePaiement === 'credit' ? total - acompte : 0;
    try {
      const res = await api.post('/ventes', {
        client_id: clientId || null,
        lignes: panier.map(i => ({
          produit_id: i.produit_id, quantite: i.quantite,
          prix_unitaire: num(i.prix_unitaire),
          remise: (num(i.remise_fcfa) && i.prix_unitaire && i.quantite)
            ? Math.min(100, (num(i.remise_fcfa) / (num(i.prix_unitaire) * i.quantite)) * 100)
            : 0,
          contenance: i.contenance || 1,
          unite_libelle: i.unite_libelle || 'unité',
        })),
        remise: remisePct,
        mode_paiement: modePaiement,
        montant_paye: acompte
      });
      setRecu({ venteId: res.data.id, numero: res.data.numero, panier: [...panier], total, monnaie, modePaiement, remiseMt, montantRecuVal: acompte, resteDu, clientNom: clientSelectionne?.nom || '', clientTel: clientSelectionne?.telephone || '', clientAdresse: clientSelectionne?.adresse || '' });
      updateTicket({ panier: [], remise: '', remiseType: 'pct', montantPaye: '', clientId: '' });
      toast.success(`Vente ${res.data.numero} enregistrée !`);
      rechargerProduits();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Erreur lors de la vente');
    } finally { setLoading(false); }
  }

  /* ── Nouveau document (facture/proforma/avoir/reçu) — formulaire complet, identique à Facturation ──
     Aucun impact sur le panier, le stock ou une vente : c'est un document indépendant. ── */
  function ouvrirDocModal() {
    setDocForm(emptyDocForm());
    setDocModal(true);
  }

  function setDocLigne(i, field, val) {
    setDocForm(f => {
      const lignes = [...f.lignes];
      lignes[i] = { ...lignes[i], [field]: val };

      if (field === 'produit_id' && val) {
        const p = produits.find(item => String(item.id) === String(val));
        if (p) {
          lignes[i].designation = p.nom;
          lignes[i].prix_ht = p.prix_vente || p.prix_achat || '';
          lignes[i].unite = p.unite || 'pièce';
          lignes[i].unite_libelle = p.unite || 'unité';
          lignes[i].contenance = 1;
          lignes[i].conditionnement_id = '';
        }
      }

      if (field === 'conditionnement_id') {
        if (!val) {
          const p = produits.find(item => String(item.id) === String(lignes[i].produit_id));
          if (p) {
            lignes[i].prix_ht = p.prix_vente || p.prix_achat || '';
            lignes[i].unite = p.unite || 'pièce';
            lignes[i].unite_libelle = p.unite || 'unité';
            lignes[i].contenance = 1;
          }
        } else {
          const cond = (condMap[lignes[i].produit_id] || []).find(item => String(item.id) === String(val));
          if (cond) {
            lignes[i].prix_ht = cond.prix_vente;
            lignes[i].unite = cond.libelle || 'pièce';
            lignes[i].unite_libelle = cond.libelle || 'unité';
            lignes[i].contenance = cond.contenance || 1;
          }
        }
      }
      return { ...f, lignes };
    });
  }
  function addDocLigne()     { setDocForm(f => ({ ...f, lignes: [...f.lignes, { ...emptyLigneDoc }] })); }
  function removeDocLigne(i) {
    setDocForm(f => ({ ...f, lignes: f.lignes.filter((_, idx) => idx !== i) }));
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }

  async function handleDocSubmit(e, statut = 'emise') {
    e.preventDefault();
    const payload = { ...docForm, statut };
    if (payload.type === 'recu') {
      const montant = parseFloat(payload.lignes[0]?.prix_ht);
      if (!montant || montant <= 0) return toast.error('Entrez le montant reçu');
      payload.lignes = [{ ...payload.lignes[0], designation: (payload.lignes[0]?.designation||'').trim() || 'Règlement reçu', quantite: 1 }];
    } else if (!payload.lignes.some(l => l.designation.trim())) {
      return toast.error('Au moins une ligne avec une désignation');
    }
    const validLignes = payload.lignes.filter(l => l.designation.trim() && parseFloat(l.prix_ht) > 0);
    if (!validLignes.length) return toast.error('Vérifiez les prix des lignes');

    setEmissionFacture(true);
    try {
      const res = await api.post('/facturation', { ...payload, lignes: validLignes });
      const totauxDoc = calcTotauxDoc(validLignes, docForm.remise, docForm.remise_montant);
      setDocModal(false);
      if (statut === 'brouillon') {
        toast.success(`Brouillon ${res.data.numero} enregistré`);
        return;
      }
      const paye = parseFloat(docForm.montant_paye) || 0;
      const r = {
        panier: validLignes.map(l => ({ nom: l.designation, prix_unitaire: num(l.prix_ht), quantite: num(l.quantite), remise_fcfa: num(l.remise_montant), contenance: l.contenance || 1, unite_libelle: l.unite_libelle })),
        total: totauxDoc.total, remiseMt: totauxDoc.remisePctMt + totauxDoc.remiseMt,
        modePaiement: paye < totauxDoc.total ? 'credit' : docForm.mode_paiement,
        montantRecuVal: paye, resteDu: Math.max(0, totauxDoc.total - paye),
        clientNom: clients.find(c => String(c.id) === String(docForm.client_id))?.nom || '',
        clientTel: clients.find(c => String(c.id) === String(docForm.client_id))?.telephone || '',
        clientAdresse: clients.find(c => String(c.id) === String(docForm.client_id))?.adresse || '',
      };
      setFactureCreee({ numero: res.data.numero, total: totauxDoc.total, r });
      toast.success(`${TYPES_DOC.find(t=>t.value===docForm.type)?.label || 'Document'} ${res.data.numero} créé`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Erreur lors de la création du document');
    } finally { setEmissionFacture(false); }
  }

  /* ── Annulation rapide depuis la caisse ── */
  async function annulerVenteCaisse() {
    if (!recu?.numero) return;
    setAnnulCaisse(true);
    try {
      const res = await api.get('/ventes', { params: { statut: 'payee' } });
      const v   = res.data.find(x => x.numero === recu.numero);
      if (!v) { toast.error('Vente introuvable'); return; }
      await api.put(`/ventes/${v.id}/annuler`, { motif: 'Erreur de saisie caisse' });
      toast.success('Vente annulée — stock remis à jour');
      setRecu(null);
      setPanier([]);
      rechargerProduits();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Erreur lors de l\'annulation');
    } finally { setAnnulCaisse(false); }
  }

  /* ── Impression ticket thermique ── */
  function printTicket(r) {
    const now   = new Date();
    const heure = now.toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
    const modeLabel = MODES.find(m => m.key === r.modePaiement)?.label || r.modePaiement;
    const lignes = r.panier.map(i => {
      const nomAffiche = i.contenance > 1 ? `${i.nom} (${i.unite_libelle})` : i.nom;
      const brut = num(i.prix_unitaire) * i.quantite;
      const remise = num(i.remise_fcfa);
      const net = Math.max(0, brut - remise);
      const totalCell = remise > 0
        ? `<span style="text-decoration:line-through;color:#999;font-size:10px">${fmt(brut)} F</span><br><span style="font-weight:700">${fmt(net)} F</span>`
        : `<span style="font-weight:600">${fmt(brut)} F</span>`;
      const remiseLine = remise > 0
        ? `<tr><td colspan="3" style="padding:0 0 3px 8px;font-size:10px;color:#666;font-style:italic">↳ Remise</td><td style="text-align:right;font-size:10px;color:#c00;padding-bottom:3px">- ${fmt(remise)} F</td></tr>`
        : '';
      return `
      <tr>
        <td style="padding:3px 4px 3px 0">${nomAffiche}</td>
        <td style="text-align:center;padding:3px 2px">${i.quantite}</td>
        <td style="text-align:right;padding:3px 2px">${fmt(num(i.prix_unitaire))} F</td>
        <td style="text-align:right;line-height:1.4;padding:3px 0 3px 2px">${totalCell}</td>
      </tr>${remiseLine}`;
    }).join('');

    const cachetUrl = cachetB64 || null;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Ticket ${r.numero}</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family: 'Courier New', monospace; font-size: 13px; width: ${papierLargeur}mm; max-width: ${papierLargeur}mm; padding: 6mm 4mm; color: #000; position: relative; overflow-x: hidden; }
      .cachet-watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%); width: 55mm; height: 55mm; object-fit: contain; opacity: 0.10; pointer-events: none; z-index: 0; }
      .content { position: relative; z-index: 1; }
      .center { text-align: center; }
      .bold   { font-weight: bold; }
      .big    { font-size: 16px; }
      .sep    { border-top: 1px dashed #000; margin: 6px 0; }
      .sep2   { border-top: 2px solid #000; margin: 6px 0; }
      /* Largeurs fixes : chaque colonne est bornée et le contenu passe à la ligne
         plutôt que de déborder et se faire couper par l'imprimante. */
      table   { width: 100%; border-collapse: collapse; table-layout: fixed; }
      th, td  { word-wrap: break-word; overflow-wrap: break-word; }
      th:nth-child(1), td:nth-child(1) { width: 42%; }
      th:nth-child(2), td:nth-child(2) { width: 14%; }
      th:nth-child(3), td:nth-child(3) { width: 22%; }
      th:nth-child(4), td:nth-child(4) { width: 22%; }
      th      { font-size: 10px; text-transform: uppercase; padding-bottom: 4px; border-bottom: 1px dashed #000; }
      .total-row { display: flex; justify-content: space-between; font-size: 15px; font-weight: bold; padding-top: 4px; }
      .right  { text-align: right; }
      @media print { @page { margin: 0; size: ${papierLargeur}mm auto; } body { padding: 4mm 3mm; } .cachet-watermark { position: fixed; } }
    </style></head><body>
    ${cachetUrl ? `<img class="cachet-watermark" src="${cachetUrl}" alt="" />` : ''}
    <div class="content">
    <div class="center bold big">${societe.nom || 'MON ENTREPRISE'}</div>
    ${societe.adresse ? `<div class="center">${societe.adresse}</div>` : ''}
    ${societe.telephone ? `<div class="center">Tél : ${societe.telephone}</div>` : ''}
    ${societe.nif ? `<div class="center">NIF : ${societe.nif}</div>` : ''}
    <div class="sep2"></div>
    <div class="center bold">TICKET DE CAISSE</div>
    <div class="center">N° ${r.numero}</div>
    <div class="center">${heure}</div>
    ${r.clientNom
      ? `<div class="sep"></div>
         <div><strong>Client :</strong> ${r.clientNom}</div>
         ${r.clientTel ? `<div>Tél : ${r.clientTel}</div>` : ''}`
      : ''}
    <div class="sep"></div>
    <table>
      <thead><tr>
        <th style="text-align:left">Article</th>
        <th style="text-align:center">Qté</th>
        <th style="text-align:right">P.U.</th>
        <th style="text-align:right">Total</th>
      </tr></thead>
      <tbody>${lignes}</tbody>
    </table>
    <div class="sep"></div>
    ${r.remiseMt > 0 ? `<div style="display:flex;justify-content:space-between"><span>Remise</span><span>- ${fmt(r.remiseMt)} FCFA</span></div>` : ''}
    <div class="sep2"></div>
    <div class="total-row"><span>TOTAL À PAYER</span><span>${fmt(r.total)} FCFA</span></div>
    <div class="sep"></div>
    <div style="display:flex;justify-content:space-between"><span>Mode de paiement</span><span>${modeLabel}</span></div>
    ${r.modePaiement === 'especes' ? `<div style="display:flex;justify-content:space-between"><span>Montant reçu</span><span>${fmt(r.montantRecuVal)} FCFA</span></div>` : ''}
    ${r.modePaiement === 'especes' && r.monnaie > 0 ? `<div style="display:flex;justify-content:space-between;font-weight:bold"><span>Monnaie rendue</span><span>${fmt(r.monnaie)} FCFA</span></div>` : ''}
    ${r.modePaiement === 'credit' && r.montantRecuVal > 0 ? `<div style="display:flex;justify-content:space-between"><span>Acompte versé</span><span>${fmt(r.montantRecuVal)} FCFA</span></div>` : ''}
    ${r.modePaiement === 'credit' ? `<div style="display:flex;justify-content:space-between;font-weight:bold;color:#dc2626"><span>Reste dû</span><span>${fmt(r.resteDu)} FCFA</span></div>` : ''}
    <div class="sep2"></div>
    <div class="center" style="margin-top:8px;font-size:11px">Merci pour votre achat !</div>
    <div class="center" style="font-size:11px">À bientôt</div>
    </div>
    </body></html>`;

    doPrint(html);
  }

  /* ── Émettre une Facture (document normalisé) depuis la vente et l'imprimer sur l'imprimante thermique ── */
  async function emettreEtImprimerFacture(r) {
    setEmissionFacture(true);
    try {
      const res = await api.post(`/facturation/from-vente/${r.venteId}`, { type: 'facture' });
      printFacture(r, res.data.numero);
      toast.success(`Facture ${res.data.numero} émise`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Erreur lors de l\'émission de la facture');
    } finally {
      setEmissionFacture(false);
    }
  }

  function printFacture(r, factureNumero) {
    const now   = new Date();
    const heure = now.toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
    const modeLabel = MODES.find(m => m.key === r.modePaiement)?.label || r.modePaiement;
    const lignes = r.panier.map(i => {
      const nomAffiche = i.contenance > 1 ? `${i.nom} (${i.unite_libelle})` : i.nom;
      const brut = num(i.prix_unitaire) * i.quantite;
      const remise = num(i.remise_fcfa);
      const net = Math.max(0, brut - remise);
      const totalCell = remise > 0
        ? `<span style="text-decoration:line-through;color:#999;font-size:10px">${fmt(brut)} F</span><br><span style="font-weight:700">${fmt(net)} F</span>`
        : `<span style="font-weight:600">${fmt(brut)} F</span>`;
      return `
      <tr>
        <td style="padding:3px 4px 3px 0">${nomAffiche}</td>
        <td style="text-align:center;padding:3px 2px">${i.quantite}</td>
        <td style="text-align:right;padding:3px 2px">${fmt(num(i.prix_unitaire))} F</td>
        <td style="text-align:right;line-height:1.4;padding:3px 0 3px 2px">${totalCell}</td>
      </tr>`;
    }).join('');

    const cachetUrl = cachetB64 || null;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Facture ${factureNumero}</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family: 'Courier New', monospace; font-size: 13px; width: ${papierLargeur}mm; max-width: ${papierLargeur}mm; padding: 6mm 4mm; color: #000; position: relative; overflow-x: hidden; }
      .cachet-watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%); width: 55mm; height: 55mm; object-fit: contain; opacity: 0.10; pointer-events: none; z-index: 0; }
      .content { position: relative; z-index: 1; }
      .center { text-align: center; }
      .bold   { font-weight: bold; }
      .big    { font-size: 16px; }
      .sep    { border-top: 1px dashed #000; margin: 6px 0; }
      .sep2   { border-top: 2px solid #000; margin: 6px 0; }
      table   { width: 100%; border-collapse: collapse; table-layout: fixed; }
      th, td  { word-wrap: break-word; overflow-wrap: break-word; }
      th:nth-child(1), td:nth-child(1) { width: 42%; }
      th:nth-child(2), td:nth-child(2) { width: 14%; }
      th:nth-child(3), td:nth-child(3) { width: 22%; }
      th:nth-child(4), td:nth-child(4) { width: 22%; }
      th      { font-size: 10px; text-transform: uppercase; padding-bottom: 4px; border-bottom: 1px dashed #000; }
      .total-row { display: flex; justify-content: space-between; font-size: 15px; font-weight: bold; padding-top: 4px; }
      @media print { @page { margin: 0; size: ${papierLargeur}mm auto; } body { padding: 4mm 3mm; } .cachet-watermark { position: fixed; } }
    </style></head><body>
    ${cachetUrl ? `<img class="cachet-watermark" src="${cachetUrl}" alt="" />` : ''}
    <div class="content">
    <div class="center bold big">${societe.nom || 'MON ENTREPRISE'}</div>
    ${societe.adresse ? `<div class="center">${societe.adresse}</div>` : ''}
    ${societe.telephone ? `<div class="center">Tél : ${societe.telephone}</div>` : ''}
    ${societe.nif ? `<div class="center">NIF : ${societe.nif}</div>` : ''}
    ${societe.rccm ? `<div class="center">RCCM : ${societe.rccm}</div>` : ''}
    <div class="sep2"></div>
    <div class="center bold">FACTURE</div>
    <div class="center">N° ${factureNumero}</div>
    <div class="center">${heure}</div>
    ${r.clientNom
      ? `<div class="sep"></div>
         <div><strong>Facturé à :</strong> ${r.clientNom}</div>
         ${r.clientTel ? `<div>Tél : ${r.clientTel}</div>` : ''}
         ${r.clientAdresse ? `<div>${r.clientAdresse}</div>` : ''}`
      : '<div class="center">Client de passage</div>'}
    <div class="sep"></div>
    <table>
      <thead><tr>
        <th style="text-align:left">Article</th>
        <th style="text-align:center">Qté</th>
        <th style="text-align:right">P.U.</th>
        <th style="text-align:right">Total</th>
      </tr></thead>
      <tbody>${lignes}</tbody>
    </table>
    <div class="sep"></div>
    ${r.remiseMt > 0 ? `<div style="display:flex;justify-content:space-between"><span>Remise</span><span>- ${fmt(r.remiseMt)} FCFA</span></div>` : ''}
    <div class="sep2"></div>
    <div class="total-row"><span>TOTAL À PAYER</span><span>${fmt(r.total)} FCFA</span></div>
    <div class="sep"></div>
    <div style="display:flex;justify-content:space-between"><span>Mode de paiement</span><span>${modeLabel}</span></div>
    ${r.modePaiement === 'especes' ? `<div style="display:flex;justify-content:space-between"><span>Montant reçu</span><span>${fmt(r.montantRecuVal)} FCFA</span></div>` : ''}
    ${r.modePaiement === 'especes' && r.monnaie > 0 ? `<div style="display:flex;justify-content:space-between;font-weight:bold"><span>Monnaie rendue</span><span>${fmt(r.monnaie)} FCFA</span></div>` : ''}
    ${r.modePaiement === 'credit' && r.montantRecuVal > 0 ? `<div style="display:flex;justify-content:space-between"><span>Acompte versé</span><span>${fmt(r.montantRecuVal)} FCFA</span></div>` : ''}
    ${r.modePaiement === 'credit' ? `<div style="display:flex;justify-content:space-between;font-weight:bold;color:#dc2626"><span>Reste dû</span><span>${fmt(r.resteDu)} FCFA</span></div>` : ''}
    <div class="sep2"></div>
    <div class="center" style="margin-top:8px;font-size:10px">Facture normalisée conforme aux dispositions fiscales</div>
    <div class="center" style="font-size:10px">en vigueur en République de Côte d'Ivoire</div>
    </div>
    </body></html>`;

    doPrint(html);
  }

  function doPrint(html) {
    // Mode "Aperçu à l'écran" : pour tester sur un poste sans imprimante thermique connectée
    // (ou sans imprimante du tout), on ouvre le rendu dans une fenêtre au lieu de l'envoyer
    // à une imprimante système qui échouerait forcément.
    if (!window.electronAPI || selectedPrinter === '__preview__') {
      const w = window.open('', '_blank', 'width=380,height=700');
      w.document.write(html);
      w.document.close();
      w.focus();
      if (window.electronAPI) return; // aperçu pur, pas de fenêtre d'impression système
      setTimeout(() => { w.print(); }, 300);
      return;
    }
    // Un clic répété (ex: double-clic pendant que l'imprimante thermique met du temps à
    // répondre) envoyait auparavant 2 impressions distinctes qui se chevauchaient sur le
    // rouleau — bande coupée en plein milieu, contenu mélangé. On ignore tout appel tant
    // que la précédente impression n'est pas terminée (ref, pas state : effet immédiat,
    // pas soumis au différé de rendu React entre deux clics rapprochés).
    if (impressionEnCoursRef.current) return;
    impressionEnCoursRef.current = true;
    window.electronAPI.printReceipt(html, selectedPrinter || undefined, papierLargeur)
      .then(r => { if (!r.success) toast.error('Impression échouée : ' + r.reason); })
      .catch(() => toast.error('Erreur impression'))
      .finally(() => { impressionEnCoursRef.current = false; });
  }

  /* ════════════════════════════════════════════════════════════════════
     RENDU
  ════════════════════════════════════════════════════════════════════ */
  /* ── Modals fond de caisse ── */
  const modalsFond = (
    <>
      {/* OUVRIR */}
      {modalFond === 'ouvrir' && (
        <div className="fixed inset-0 z-50">
          <div className="bg-white rounded-2xl shadow-xl" style={{ position: "absolute", top: "50%", left: "50%", transform: `translate(-50%, -50%) translate(${ouvrirDrag.offset.x}px, ${ouvrirDrag.offset.y}px)`, width: "calc(100% - 32px)", maxWidth: 420, maxHeight: "calc(100vh - 32px)", overflowY: "auto" }}>
            <div onMouseDown={ouvrirDrag.onMouseDown} className="flex items-center justify-between px-5 pt-4 pb-0 cursor-move select-none">
              <h2 className="text-xl font-bold text-gray-900">Ouverture de caisse</h2>
              <button type="button" onClick={() => setModalFond(null)} className="text-gray-400 hover:text-gray-600"><X size={22}/></button>
            </div>
            <div className="p-6 text-center">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Wallet size={28} className="text-green-600"/>
              </div>
              <p className="text-sm text-gray-500 mb-5">Entrez le fond de caisse du matin</p>
              <form onSubmit={handleOuvrir} className="space-y-4">
                <input
                  type="text" inputMode="numeric" autoFocus
                  className="input text-center text-2xl font-bold"
                  placeholder="0 FCFA"
                  value={fondInput}
                  onChange={e => setFondInput(e.target.value)}
                />
                <button type="submit" className="btn-primary w-full text-base py-3">
                  <LogIn size={18} className="inline mr-2"/> Ouvrir la caisse
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* RESULTAT CLÔTURE */}
      {modalFond === 'resultat' && cloturResult && (
        <div className="fixed inset-0 z-50">
          <div className="bg-white rounded-2xl shadow-xl" style={{ position: "absolute", top: "50%", left: "50%", transform: `translate(-50%, -50%) translate(${resultatDrag.offset.x}px, ${resultatDrag.offset.y}px)`, width: "calc(100% - 32px)", maxWidth: 420, maxHeight: "calc(100vh - 32px)", overflowY: "auto" }}>
            <div className="p-6">
              <h2 onMouseDown={resultatDrag.onMouseDown} className="text-xl font-bold text-gray-900 mb-4 text-center cursor-move select-none">Résultat de clôture</h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between border-b pb-2">
                  <span className="text-gray-500">Fond d'ouverture</span>
                  <span className="font-semibold">{fmt(cloturResult.fond_ouverture)} FCFA</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-gray-500">Ventes encaissées</span>
                  <span className="font-semibold text-blue-600">+ {fmt(cloturResult.total_ventes)} FCFA</span>
                </div>
                {cloturResult.total_reglements_credit > 0 && (
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-gray-500">Règlements crédit</span>
                    <span className="font-semibold text-orange-600">+ {fmt(cloturResult.total_reglements_credit)} FCFA</span>
                  </div>
                )}
                {cloturResult.total_reglements_facture > 0 && (
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-gray-500">Règlements facture</span>
                    <span className="font-semibold text-orange-600">+ {fmt(cloturResult.total_reglements_facture)} FCFA</span>
                  </div>
                )}
                <div className="flex justify-between border-b pb-2">
                  <span className="text-gray-500">Total attendu</span>
                  <span className="font-bold">{fmt(cloturResult.fond_ouverture + cloturResult.total_ventes + (cloturResult.total_reglements_credit || 0) + (cloturResult.total_reglements_facture || 0))} FCFA</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-gray-500">Espèces comptées</span>
                  <span className="font-semibold">{fmt(cloturResult.fond_cloture)} FCFA</span>
                </div>
                <div className={`flex justify-between text-base font-bold ${cloturResult.ecart >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  <span>Écart</span>
                  <span>{cloturResult.ecart >= 0 ? '+' : ''}{fmt(cloturResult.ecart)} FCFA</span>
                </div>
              </div>
              <button onClick={() => { setModalFond('ouvrir'); setCloturResult(null); }} className="btn-primary w-full mt-5">
                Ouvrir une nouvelle session
              </button>
              <button onClick={() => { setModalFond(null); setCloturResult(null); }} className="btn-secondary w-full mt-2">
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HISTORIQUE */}
      {modalFond === 'historique' && (
        <div className="fixed inset-0 z-50">
          <div className="bg-white rounded-2xl shadow-xl" style={{ position: "absolute", top: 16, left: "50%", transform: `translateX(-50%) translate(${historiqueDrag.offset.x}px, ${historiqueDrag.offset.y}px)`, width: "calc(100% - 32px)", maxWidth: 860, maxHeight: "calc(100vh - 32px)", overflowY: "auto" }}>
            <div onMouseDown={historiqueDrag.onMouseDown} className="flex items-center justify-between p-5 border-b cursor-move select-none">
              <h2 className="text-lg font-bold">Historique des sessions caisse</h2>
              <button onClick={() => setModalFond(null)} className="text-gray-400 hover:text-gray-600"><X size={22}/></button>
            </div>
            <div className="overflow-y-auto flex-1 p-1">
              <div className="table-wrap">
              <table className="table w-full text-sm">
                <thead><tr><th>Date</th><th>Fond ouv.</th><th>Ventes</th><th>Compté</th><th>Écart</th><th>Statut</th><th>Ticket</th></tr></thead>
                <tbody>
                  {historique.length === 0 && <tr><td colSpan="7" className="text-center py-8 text-gray-400">Aucune session</td></tr>}
                  {historique.map(s => {
                    const peutCorriger = s.statut === 'clos' && (user?.role === 'admin' || user?.role === 'super_admin');
                    return (
                    <tr key={s.id}>
                      <td className="text-xs">{new Date(s.created_at).toLocaleDateString('fr-FR')}</td>
                      <td>{fmt(s.fond_ouverture)} F</td>
                      <td className="text-blue-600">{fmt(s.total_ventes)} F</td>
                      <td>{s.fond_cloture != null ? fmt(s.fond_cloture)+' F' : '—'}</td>
                      <td className={s.ecart == null ? '' : s.ecart >= 0 ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                        {s.ecart == null ? '—' : `${s.ecart >= 0 ? '+' : ''}${fmt(s.ecart)} F`}
                      </td>
                      <td><span className={`badge ${s.statut === 'ouvert' ? 'badge-green' : 'badge-gray'}`}>{s.statut}</span></td>
                      <td>
                        <div className="flex items-center gap-1 flex-wrap">
                          {s.statut === 'clos' && (
                            <button onClick={() => reimprimerArreteHistorique(s.id)} title="Réimprimer l'arrêté"
                              className="flex items-center gap-1 text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap">
                              <Printer size={13}/> Imprimer
                            </button>
                          )}
                          {peutCorriger && (
                            <>
                              <button onClick={() => ouvrirCorrectionSession(s.id)} title="Corriger le montant compté"
                                className="flex items-center gap-1 text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap">
                                Modifier
                              </button>
                              <button onClick={() => supprimerSession(s.id)} title="Supprimer cette clôture"
                                className="flex items-center gap-1 text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap">
                                Supprimer
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        </div>
      )}

    </>
  );

  return (
    <div className="flex gap-4 h-[calc(100vh-80px)] overflow-hidden">

      {modalsFond}

      {/* ══════════ COLONNE GAUCHE — Catalogue ══════════ */}
      <div className="flex-1 flex flex-col gap-3 overflow-hidden">

        {/* Bannière fond de caisse */}
        {!sessionLoading && (
          <div className="flex flex-wrap items-center justify-between gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-2">
            <div className="flex items-center gap-2 text-green-700 text-sm font-medium">
              <Wallet size={16}/>
              {session
                ? <span>Fond de caisse : <strong>{fmt(session.fond_ouverture)} FCFA</strong></span>
                : <span className="text-orange-600">Aucune session ouverte</span>
              }
            </div>
            <div className="flex flex-wrap gap-2 items-center justify-end">
              <button onClick={async () => {
                  setBillsCounts({});
                  const now = new Date();
                  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
                  setArreteDate(now.toISOString().slice(0,16));
                  // Refresh session pour avoir les règlements crédit à jour
                  try { const r = await api.get('/sessions-caisse/active'); if (r.data) setSession(r.data); } catch {}
                  setArreteCaisse(true);
                }} className="btn-sm text-xs bg-white text-purple-700 border border-purple-200 hover:bg-purple-50 rounded-lg px-3 py-1 flex items-center gap-1">
                <ClipboardList size={13}/> Arrêté {session ? '/ Clôture' : ''}
              </button>
              <button onClick={ouvrirHistorique} className="btn-sm text-xs bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 rounded-lg px-3 py-1 flex items-center gap-1">
                Historique
              </button>
              {!session && (
                <button onClick={() => setModalFond('ouvrir')} className="btn-sm text-xs bg-green-600 text-white hover:bg-green-700 rounded-lg px-3 py-1 flex items-center gap-1">
                  <LogIn size={13}/> Ouvrir
                </button>
              )}
            </div>
          </div>
        )}

        {/* Barre de recherche / scan */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Scan size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400"/>
            <input
              ref={searchRef}
              className="input pl-10 text-base font-medium w-full"
              placeholder="Scanner ou rechercher un produit..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={handleSearchKey}
              autoComplete="off"
            />
            {search && (
              <button onClick={() => { setSearch(''); searchRef.current?.focus(); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={16}/>
              </button>
            )}
          </div>
          {featVenteMelange && (
            <button
              onClick={() => { setMixModal(true); setMixItems([]); setMixSearch(''); setMixCartonSize(24); setMixFraction('half'); }}
              className="flex items-center gap-1.5 px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-xl shrink-0 transition-colors"
              title="Vente mélange">
              <Shuffle size={16}/>
              <span className="hidden sm:inline">Mélange</span>
            </button>
          )}
        </div>

        {/* Grille produits */}
        {filtered.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2 overflow-y-auto">
            {filtered.map(p => (
              <button key={p.id} onClick={() => addToCart(p)} disabled={p.qte_actuelle <= 0}
                className={`text-left p-2 rounded-xl border-2 transition-all active:scale-95 ${
                  p.qte_actuelle <= 0
                    ? 'opacity-40 cursor-not-allowed bg-gray-50 border-gray-200'
                    : 'bg-white border-gray-200 hover:border-blue-400 hover:shadow-md hover:bg-blue-50'
                }`}>
                {/* Image ou placeholder */}
                {p.photo
                  ? <img src={p.photo} alt={p.nom} className="w-full h-20 object-cover rounded-lg mb-2" />
                  : <div className="w-full h-20 bg-gray-100 rounded-lg mb-2 flex items-center justify-center"><Package size={28} className="text-gray-300"/></div>
                }
                <p className="text-sm font-semibold text-gray-800 leading-tight line-clamp-2 mb-0.5">{p.nom}</p>
                <p className="text-xs text-gray-400 font-mono">{p.code}</p>
                {condMap[p.id]?.length > 0 && (
                  <p className="text-xs text-purple-600 font-medium mt-0.5 flex items-center gap-1">
                    <Layers size={10}/> {condMap[p.id].length} formats
                  </p>
                )}
                <p className="text-blue-700 font-bold mt-1 text-sm">{fmt(p.prix_vente)} <span className="text-xs font-normal">FCFA</span></p>
                <p className={`text-xs mt-0.5 font-medium ${p.qte_actuelle <= 3 ? 'text-orange-500' : 'text-green-600'}`}>
                  Stock : {p.qte_actuelle}
                </p>
              </button>
            ))}
          </div>
        )}

        {/* Message vide */}
        {search.length === 0 && panier.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-300 gap-3">
            <Scan size={56}/>
            <p className="text-base font-medium">Scannez ou tapez pour ajouter un article</p>
          </div>
        )}

        {/* Zone client */}
        <div className="flex items-center gap-2">
          <User size={16} className="text-gray-400 flex-shrink-0"/>
          <select className="input flex-1 text-sm" value={clientId} onChange={e => setClientId(e.target.value)}>
            <option value="">Client de passage</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.nom} {c.telephone ? `— ${c.telephone}` : ''}</option>)}
          </select>
        </div>
      </div>

      {/* ══════════ COLONNE DROITE — Ticket caisse ══════════ */}
      <div className="w-80 xl:w-96 flex flex-col bg-gray-900 rounded-2xl overflow-hidden shadow-2xl">

        {/* Onglets multi-tickets */}
        {featMultiTickets && (
        <div className="bg-gray-950 px-2 pt-1.5 flex items-end gap-0.5 overflow-x-auto">
          {tickets.map((t, i) => (
            <div key={t.id} onClick={() => setTicketActif(i)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-t-lg text-xs font-medium cursor-pointer whitespace-nowrap transition-colors flex-shrink-0 ${
                i === ticketActif
                  ? 'bg-gray-900 text-white border-t border-x border-gray-700'
                  : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
              }`}>
              <span>#{i + 1}</span>
              {t.panier.length > 0 && (
                <span className="bg-blue-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center leading-none">{t.panier.length}</span>
              )}
              {tickets.length > 1 && (
                <button onClick={e => { e.stopPropagation(); fermerTicket(i); }}
                  className="text-gray-500 hover:text-red-400 ml-0.5 transition-colors leading-none">
                  <X size={10}/>
                </button>
              )}
            </div>
          ))}
          <button onClick={nouveauTicket} title="Nouveau ticket"
            className="px-2 py-1.5 mb-0 text-gray-400 hover:text-white transition-colors flex-shrink-0">
            <Plus size={13}/>
          </button>
        </div>
        )}

        {/* En-tête ticket */}
        <div className="bg-blue-700 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <ReceiptText size={18}/>
            <span className="font-bold text-sm">TICKET #{ticketActif + 1}</span>
          </div>
          <span className="text-blue-200 text-xs">
            {panier.length} article{panier.length > 1 ? 's' : ''}
          </span>
        </div>

        {/* Liste des articles */}
        <div ref={panierRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          {panier.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-600 gap-2">
              <ShoppingCart size={30}/>
              <p className="text-xs text-center">Aucun article</p>
            </div>
          ) : panier.map((item, idx) => (
            <div key={item.panier_id} className="flex items-center gap-2 py-2 border-b border-gray-800">
              <span className="text-gray-500 text-xs w-5 text-right">{idx + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-medium truncate">{item.nom}</p>
                {item.contenance > 1 && (
                  <p className="text-purple-400 text-xs font-medium">{item.unite_libelle} × {item.contenance} u.</p>
                )}
                <div className="flex items-center gap-1 mt-1 flex-wrap">
                  {peutModifierPrix ? (
                    <>
                      <input
                        type="text" inputMode="decimal"
                        value={item.prix_unitaire || ''}
                        onChange={e => setPrixLigne(item.panier_id, e.target.value.replace(/[^0-9.,]/g,'').replace(',', '.'))}
                        className="w-24 text-center bg-white text-blue-700 text-xs font-bold rounded px-2 py-1 border-2 border-blue-400 focus:outline-none focus:border-blue-600"
                        title="Modifier le prix"
                      />
                      <span className="text-gray-400 text-xs">F/{item.contenance > 1 ? item.unite_libelle : 'u.'}</span>
                      <input
                        type="text" inputMode="decimal"
                        value={item.remise_fcfa || ''}
                        onChange={e => setRemiseLigne(item.panier_id, e.target.value.replace(/[^0-9.,]/g,'').replace(',', '.'))}
                        placeholder="-remise"
                        className="w-16 text-center bg-yellow-900 text-yellow-300 text-xs rounded px-1 py-1 border border-yellow-600 focus:outline-none"
                      />
                      <span className="text-yellow-400 text-xs">F</span>
                    </>
                  ) : (
                    <p className="text-gray-400 text-xs">{fmt(num(item.prix_unitaire))} F/{item.contenance > 1 ? item.unite_libelle : 'u.'}</p>
                  )}
                </div>
              </div>
              {/* Quantité */}
              <div className="flex items-center gap-1">
                <button onClick={() => updateQty(item.panier_id, -1)}
                  className="w-6 h-6 rounded-md bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-center">
                  <Minus size={10}/>
                </button>
                <input
                  type="text" inputMode="numeric"
                  value={item.quantite}
                  onChange={e => setQty(item.panier_id, e.target.value.replace(/[^0-9]/g,''))}
                  className="w-8 text-center bg-gray-800 text-white text-xs rounded border border-gray-700 py-0.5"
                />
                <button onClick={() => updateQty(item.panier_id, 1)}
                  className="w-6 h-6 rounded-md bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-center">
                  <Plus size={10}/>
                </button>
              </div>
              {/* Total ligne */}
              <div className="text-right w-20">
                <p className="text-white text-xs font-bold">{fmt(Math.max(0, num(item.prix_unitaire) * item.quantite - num(item.remise_fcfa)))}</p>
                {num(item.remise_fcfa) > 0 && <p className="text-yellow-400 text-xs line-through opacity-60">{fmt(num(item.prix_unitaire) * item.quantite)}</p>}
                <p className="text-gray-500 text-xs">FCFA</p>
              </div>
              <button onClick={() => removeItem(item.panier_id)}
                className="text-gray-600 hover:text-red-400 transition-colors ml-1">
                <Trash2 size={12}/>
              </button>
            </div>
          ))}
        </div>

        {/* Section totaux + paiement */}
        <div className="bg-gray-800 px-4 py-3 space-y-3">

          {/* Sous-total + remise */}
          <div className="space-y-1 text-sm border-b border-gray-700 pb-2">
            <div className="flex justify-between text-gray-400">
              <span>Sous-total</span>
              <span>{fmt(totalLignes)} FCFA</span>
            </div>
            {remiseMt > 0 && (
              <div className="flex justify-between text-green-400 font-medium">
                <span>Remise {remiseType === 'pct' ? `(${remiseVal}%)` : `(${fmt(remiseVal)} FCFA)`}</span>
                <span>− {fmt(remiseMt)} FCFA</span>
              </div>
            )}
          </div>

          {/* TOTAL */}
          <div className="flex justify-between items-center">
            <span className="text-white font-bold text-lg">TOTAL</span>
            <span className="text-2xl font-black text-blue-400">{fmt(total)} <span className="text-sm font-normal">FCFA</span></span>
          </div>

          {/* Remise globale */}
          {peutModifierPrix && (
            <div className="flex gap-2 items-center">
              <Tag size={14} className="text-gray-400 flex-shrink-0"/>
              <div className="flex rounded-lg overflow-hidden border border-gray-600 text-xs flex-shrink-0">
                <button onClick={() => { setRemiseType('pct'); setRemise(''); }}
                  className={`px-2.5 py-1.5 font-medium transition-colors ${remiseType === 'pct' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
                  <Percent size={11}/>
                </button>
                <button onClick={() => { setRemiseType('fixe'); setRemise(''); }}
                  className={`px-2.5 py-1.5 font-medium transition-colors ${remiseType === 'fixe' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
                  F
                </button>
              </div>
              <input
                type="text" inputMode="decimal"
                value={remise}
                onChange={e => setRemise(e.target.value.replace(/[^0-9.,]/g,'').replace(',', '.'))}
                placeholder={remiseType === 'pct' ? 'Remise %' : 'Remise FCFA'}
                className="flex-1 bg-gray-700 border border-gray-600 text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500"
              />
            </div>
          )}

          {/* Mode de paiement */}
          <div className="grid grid-cols-3 gap-1.5">
            {MODES.filter(m => featVenteCredit || m.key !== 'credit').map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => setModePaiement(key)}
                className={`flex flex-col items-center gap-0.5 py-2 rounded-xl text-xs font-medium transition-all ${
                  modePaiement === key
                    ? 'bg-blue-600 text-white shadow-lg scale-105'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}>
                <Icon size={15}/>
                <span>{label}</span>
              </button>
            ))}
          </div>

          {/* Montant reçu (espèces) */}
          {modePaiement === 'especes' && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-300 block">Montant reçu du client (FCFA)</label>
              <input
                type="text" inputMode="numeric"
                value={montantPaye}
                onChange={e => setMontantPaye(e.target.value.replace(/[^0-9]/g,''))}
                placeholder={`ex : ${fmt(total)}`}
                className="w-full bg-gray-600 border border-gray-400 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder-gray-300"
              />
              {montantPaye && (
                <div className={`flex justify-between text-sm font-bold px-1 ${monnaie >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  <span>{monnaie >= 0 ? 'Monnaie à rendre' : 'Manque'}</span>
                  <span>{fmt(Math.abs(monnaie))} FCFA</span>
                </div>
              )}
            </div>
          )}

          {/* Acompte (crédit) */}
          {modePaiement === 'credit' && (
            <div className="space-y-2 bg-orange-950/40 border border-orange-800/50 rounded-xl p-3">
              {/* Sélecteur client intégré */}
              <div>
                <p className="text-xs text-orange-300 font-medium mb-1">Client *</p>
                <select
                  className="w-full bg-gray-700 border border-orange-600 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  value={clientId}
                  onChange={e => setClientId(e.target.value)}
                >
                  <option value="">— Choisir un client —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.nom}{c.telephone ? ` — ${c.telephone}` : ''}</option>)}
                </select>
              </div>

              {/* Infos crédit du client sélectionné */}
              {clientSelectionne && clientSelectionne.limite_credit > 0 && (() => {
                const detteActuelle = clientSelectionne.solde < 0 ? -clientSelectionne.solde : 0;
                const disponible = clientSelectionne.limite_credit - detteActuelle;
                const resteApresVente = disponible - (total - (parseFloat(montantPaye) || 0));
                return (
                  <div className="bg-gray-800 rounded-lg px-3 py-2 space-y-1 text-xs">
                    <div className="flex justify-between text-gray-400">
                      <span>Limite accordée</span>
                      <span className="text-white font-medium">{fmt(clientSelectionne.limite_credit)} FCFA</span>
                    </div>
                    <div className="flex justify-between text-gray-400">
                      <span>Créance actuelle</span>
                      <span className="text-red-400 font-medium">{fmt(detteActuelle)} FCFA</span>
                    </div>
                    <div className="flex justify-between border-t border-gray-700 pt-1">
                      <span className="text-gray-300 font-semibold">Disponible</span>
                      <span className={`font-bold ${disponible <= 0 ? 'text-red-400' : 'text-green-400'}`}>{fmt(Math.max(0, disponible))} FCFA</span>
                    </div>
                    {resteApresVente < 0 && (
                      <p className="text-red-400 font-semibold text-center pt-1">⚠ Dépassement de {fmt(-resteApresVente)} FCFA</p>
                    )}
                  </div>
                );
              })()}

              {/* Acompte */}
              <div>
                <p className="text-xs text-orange-300 font-medium mb-1">Acompte versé</p>
                <input
                  type="text" inputMode="numeric"
                  value={montantPaye}
                  onChange={e => setMontantPaye(e.target.value.replace(/[^0-9]/g,''))}
                  placeholder="0 si rien payé maintenant"
                  className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-500 placeholder-gray-500"
                />
              </div>
              <div className="flex justify-between text-sm font-bold px-1 text-orange-400">
                <span>Reste dû</span>
                <span>{fmt(total - (parseFloat(montantPaye) || 0))} FCFA</span>
              </div>
            </div>
          )}

          {/* Bouton valider */}
          <button
            onClick={handleVente}
            disabled={loading || !panier.length || (modePaiement === 'especes' && montantPaye && monnaie < 0)}
            className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-base py-3.5 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg">
            <Check size={20}/>
            {loading ? 'Traitement...' : modePaiement === 'credit' ? `Crédit — ${fmt(total)} FCFA` : `Encaisser — ${fmt(total)} FCFA`}
          </button>

          {/* Créer un document (facture/proforma/avoir/reçu) sans passer par une vente —
              formulaire complet identique à Facturation, impression en ticket thermique */}
          {featFacturationCaisse && (
            <button
              onClick={ouvrirDocModal}
              title="Ouvre le même formulaire que dans Facturation — imprime en ticket thermique, sans enregistrer de vente ni toucher au stock"
              className="w-full border-2 border-indigo-500 text-indigo-300 hover:bg-indigo-950 font-semibold text-sm py-2.5 rounded-xl transition-all flex items-center justify-center gap-2">
              <ReceiptText size={16}/>
              Facture sans vente
            </button>
          )}
        </div>
      </div>

      {/* ══════════ MODAL SÉLECTEUR DE TARIF ══════════ */}
      {tarifPicker && (
        <div className="fixed inset-0 z-50">
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden" style={{ position:'absolute', top:'50%', left:'50%', transform:`translate(-50%,-50%) translate(${tarifPickerDrag.offset.x}px, ${tarifPickerDrag.offset.y}px)`, width:'calc(100% - 32px)', maxWidth:384 }}>
            <div onMouseDown={tarifPickerDrag.onMouseDown} className="flex items-center justify-between px-5 py-4 border-b cursor-move select-none">
              <div>
                <h3 className="font-bold text-gray-900 text-base">{tarifPicker.produit.nom}</h3>
                <p className="text-xs text-gray-400 mt-0.5">Choisir le tarif de vente</p>
              </div>
              <button onClick={() => setTarifPicker(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <div className="p-4 space-y-2">
              {tarifPicker.tarifs.map(t => (
                <button
                  key={t.label}
                  onClick={() => addWithTarif(tarifPicker.produit, t)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 active:scale-95 transition-all text-left"
                >
                  <div>
                    <p className="font-bold text-gray-900">{t.label}</p>
                    <p className="text-xs text-gray-400">1 {tarifPicker.produit.unite || 'unité'}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-blue-700 text-base">{fmt(t.prix)}</p>
                    <p className="text-xs text-gray-400">FCFA</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════ MODAL CONFIGURATION FORMATS (premier clic sur produit carton sans conditionnements) ══════════ */}
      {formatSetup && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" style={{ transform: `translate(${formatSetupDrag.offset.x}px, ${formatSetupDrag.offset.y}px)` }}>
            <div onMouseDown={formatSetupDrag.onMouseDown} className="px-5 py-4 border-b flex items-center justify-between cursor-move select-none">
              <div>
                <h3 className="font-bold text-gray-900 text-base">Configurer les formats</h3>
                <p className="text-xs text-gray-400 mt-0.5">{formatSetup.produit.nom}</p>
              </div>
              <button onClick={() => setFormatSetup(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-600">Ce produit n'a pas encore de formats configurés. Renseignez les informations du carton :</p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Nombre d'unités par carton</label>
                  <input type="text" inputMode="numeric" className="input text-center text-lg font-bold"
                    placeholder="Ex : 48" value={formatSetup.genN}
                    onChange={e => setFormatSetup(s => ({ ...s, genN: e.target.value.replace(/[^0-9]/g,'') }))} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Prix de vente d'un carton (FCFA)</label>
                  <input type="text" inputMode="numeric" className="input text-lg font-bold"
                    placeholder="Ex : 14 000" value={formatSetup.genPrix}
                    onChange={e => setFormatSetup(s => ({ ...s, genPrix: e.target.value.replace(/[^0-9]/g,'') }))} />
                </div>
              </div>
              {formatSetup.genN && formatSetup.genPrix && (() => {
                const n = +formatSetup.genN || 1;
                const p = +formatSetup.genPrix || 0;
                const nf = v => new Intl.NumberFormat('fr-FR').format(v);
                return (
                  <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-800 space-y-1">
                    <p className="font-bold mb-1">Formats qui seront créés :</p>
                    <p>Bouteille · {nf(Math.round(p/n))} FCFA</p>
                    <p>¼ Carton ({Math.round(n/4)} u.) · {nf(Math.round(p/4))} FCFA</p>
                    <p>½ Carton ({Math.round(n/2)} u.) · {nf(Math.round(p/2))} FCFA</p>
                    <p>Carton ({n} u.) · {nf(p)} FCFA</p>
                  </div>
                );
              })()}
              <button onClick={setupAndAddToCart}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors">
                Enregistrer et choisir le format
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ MODAL ARRÊTÉ DE CAISSE ══════════ */}
      {arreteCaisse && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]" style={{ transform: `translate(${arreteCaisseDrag.offset.x}px, ${arreteCaisseDrag.offset.y}px)` }}>
            {/* En-tête */}
            <div onMouseDown={arreteCaisseDrag.onMouseDown} className="bg-blue-900 px-5 py-4 flex items-center justify-between flex-shrink-0 cursor-move select-none">
              <div className="flex items-center gap-2 text-white">
                <ClipboardList size={20}/>
                <div>
                  <h3 className="font-bold text-base">{correctionSession ? 'Corriger la clôture' : 'Arrêté de caisse'}</h3>
                </div>
              </div>
              <button onClick={() => { setArreteCaisse(false); setCorrectionSession(null); setCorrectionSansDetail(false); }} className="text-blue-300 hover:text-white text-2xl leading-none">&times;</button>
            </div>

            {correctionSession ? (
              <div className="px-5 py-3 bg-amber-50 border-b border-amber-100 flex-shrink-0">
                <p className="text-xs font-semibold text-amber-800">
                  Session du {new Date(correctionSession.created_at).toLocaleDateString('fr-FR')} — fond d'ouverture {fmt(correctionSession.fond_ouverture)} F, ventes {fmt(correctionSession.total_ventes)} F
                </p>
                <p className="text-xs text-amber-700 mt-1">
                  {correctionSansDetail
                    ? "Le détail par coupure n'avait pas été enregistré pour cette session (ancienne clôture) — recomptez les billets ci-dessous."
                    : "Le décompte billet par billet enregistré à l'époque est repris ci-dessous — corrigez les quantités qui étaient fausses."}
                </p>
              </div>
            ) : (
              /* Date/heure de l'arrêté — modifiable si la clôture est faite en différé */
              <div className="px-5 py-3 bg-blue-50 border-b border-blue-100 flex-shrink-0">
                <label className="text-xs font-semibold text-blue-800 block mb-1">Date et heure de l'arrêté</label>
                <input
                  type="datetime-local"
                  value={arreteDate}
                  onChange={e => setArreteDate(e.target.value)}
                  className="w-full border border-blue-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                />
              </div>
            )}

            {/* Corps — même tableau de coupures dans tous les cas (clôture normale ou correction) ;
                pré-rempli si le détail a été retrouvé, vide sinon (ancienne session). */}
            <div className="overflow-y-auto flex-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-100 text-gray-600 text-xs uppercase">
                    <th className="text-left px-4 py-2 font-semibold">Coupure</th>
                    <th className="text-center px-3 py-2 font-semibold w-24">Quantité</th>
                    <th className="text-right px-4 py-2 font-semibold w-32">Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {DENOMINATIONS.map(d => {
                    const qty = parseInt(billsCounts[d]) || 0;
                    const total = qty * d;
                    return (
                      <tr key={d} className={`border-b border-gray-100 ${qty > 0 ? 'bg-green-50' : ''}`}>
                        <td className="px-4 py-2 font-semibold text-gray-800">{fmt(d)} <span className="text-xs text-gray-400 font-normal">FCFA</span></td>
                        <td className="px-3 py-1.5 text-center">
                          <input
                            type="text" inputMode="numeric"
                            value={billsCounts[d] || ''}
                            onChange={e => setBillsCounts(prev => ({ ...prev, [d]: e.target.value.replace(/[^0-9]/g,'') }))}
                            placeholder="0"
                            className="w-20 text-center border rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                          />
                        </td>
                        <td className={`px-4 py-2 text-right font-bold ${qty > 0 ? 'text-green-700' : 'text-gray-300'}`}>
                          {qty > 0 ? fmt(total) + ' FCFA' : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pied — total + boutons */}
            <div className="flex-shrink-0 border-t border-gray-200 bg-gray-50 px-4 py-3 space-y-3">
              {(() => {
                const totalEspeces = DENOMINATIONS.reduce((s, d) => s + (parseInt(billsCounts[d]) || 0) * d, 0);
                const source = correctionSession || session;
                const reglCredit = source?.total_reglements_credit || 0;
                const reglFacture = source?.total_reglements_facture || 0;
                return (
                  <div className="space-y-2">
                    {reglCredit > 0 && (
                      <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-orange-800 font-semibold">Règlements crédit reçus</span>
                          <span className="font-bold text-orange-700">+ {fmt(reglCredit)} FCFA</span>
                        </div>
                        <div className="text-xs text-orange-600 mt-0.5">{(source?.reglements_credit || []).length} versement(s) de clients</div>
                      </div>
                    )}
                    {reglFacture > 0 && (
                      <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-orange-800 font-semibold">Règlements facture reçus</span>
                          <span className="font-bold text-orange-700">+ {fmt(reglFacture)} FCFA</span>
                        </div>
                        <div className="text-xs text-orange-600 mt-0.5">{(source?.reglements_facture || []).length} règlement(s) de facture</div>
                      </div>
                    )}
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-gray-700 text-base">Total espèces comptées</span>
                      <span className="text-2xl font-black text-blue-700">{fmt(totalEspeces)} <span className="text-sm font-normal">FCFA</span></span>
                    </div>
                  </div>
                );
              })()}
              <div className="flex gap-2">
                <button onClick={() => { setArreteCaisse(false); setCorrectionSession(null); setCorrectionSansDetail(false); }}
                  className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-600 hover:bg-gray-100 font-medium text-sm transition-colors">
                  Fermer
                </button>
                {!correctionSession && (
                  <button onClick={() => imprimerArrete()}
                    className="flex-1 py-2.5 rounded-xl border-2 border-blue-700 text-blue-700 hover:bg-blue-50 font-bold text-sm flex items-center justify-center gap-2 transition-colors">
                    <Printer size={16}/> Imprimer
                  </button>
                )}
              </div>
              {correctionSession ? (
                <button onClick={enregistrerCorrectionDepuisArrete} disabled={cloturLoading}
                  className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors">
                  <Check size={16}/> {cloturLoading ? 'Enregistrement...' : 'Enregistrer la correction'}
                </button>
              ) : session && (
                <button onClick={cloturerDepuisArrete} disabled={cloturLoading}
                  className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors">
                  <LogOut size={16}/> {cloturLoading ? 'Clôture en cours...' : 'Clôturer la caisse'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════ MODAL ASSORTIMENT / VENTE MIXTE ══════════ */}
      {mixModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]" style={{ transform: `translate(${mixModalDrag.offset.x}px, ${mixModalDrag.offset.y}px)` }}>
            {/* En-tête */}
            <div onMouseDown={mixModalDrag.onMouseDown} className="bg-orange-500 px-5 py-4 flex items-center justify-between flex-shrink-0 rounded-t-2xl cursor-move select-none">
              <div className="flex items-center gap-2 text-white">
                <Shuffle size={20}/>
                <div>
                  <h3 className="font-bold text-base">Vente Mélange</h3>
                  <p className="text-orange-100 text-xs">Mélange de produits — {mixTotal}/{mixTarget} bouteilles</p>
                </div>
              </div>
              <button onClick={() => { setMixModal(false); setMixItems([]); }} className="text-orange-200 hover:text-white text-2xl leading-none">&times;</button>
            </div>

            {/* Sélecteur de cible */}
            <div className="px-4 pt-3 pb-2 border-b flex-shrink-0 space-y-2">
              {/* Ligne 1 : taille du carton */}
              <div>
                <p className="text-xs text-gray-400 font-medium mb-1">Taille du carton</p>
                <div className="flex gap-2 flex-wrap">
                  {[6, 12, 24, 48].map(n => (
                    <button key={n} onClick={() => setMixCartonSize(n)}
                      className={`px-4 py-1.5 rounded-lg text-sm font-bold border-2 transition-colors ${mixCartonSize === n ? 'bg-gray-800 border-gray-800 text-white' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}>
                      {n} btl/carton
                    </button>
                  ))}
                </div>
              </div>
              {/* Ligne 2 : fraction */}
              <div>
                <p className="text-xs text-gray-400 font-medium mb-1">Format</p>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { key:'quarter', label:'¼ Carton' },
                    { key:'half',    label:'½ Carton' },
                    { key:'full',    label:'Carton entier' },
                    { key:'libre',   label:'Libre' },
                  ].map(f => (
                    <button key={f.key} onClick={() => setMixFraction(f.key)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-semibold border-2 transition-colors ${mixFraction === f.key ? 'bg-orange-500 border-orange-500 text-white' : 'border-gray-200 text-gray-600 hover:border-orange-300'}`}>
                      {f.label}
                      {f.key !== 'libre' && (
                        <span className="ml-1 text-xs opacity-75">
                          ({f.key==='quarter' ? Math.round(mixCartonSize/4) : f.key==='half' ? Math.round(mixCartonSize/2) : mixCartonSize} u.)
                        </span>
                      )}
                    </button>
                  ))}
                  {mixFraction === 'libre' && (
                    <input type="text" inputMode="numeric" placeholder="nb"
                      className="w-16 text-center border-2 border-orange-400 rounded-lg text-sm py-1 px-2 focus:outline-none"
                      value={mixLibre}
                      onChange={e => setMixLibre(e.target.value.replace(/[^0-9]/g,''))}
                      autoFocus
                    />
                  )}
                </div>
              </div>
              {/* Barre de progression */}
              {mixTarget > 0 && (
                <>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${mixTotal >= mixTarget ? 'bg-green-500' : 'bg-orange-400'}`}
                      style={{ width: `${Math.min(100, (mixTotal / mixTarget) * 100)}%` }}
                    />
                  </div>
                  <p className={`text-xs font-semibold ${mixTotal >= mixTarget ? 'text-green-600' : 'text-orange-500'}`}>
                    {mixTotal >= mixTarget ? `Objectif atteint ! (${mixTotal} u.)` : `${mixTotal} / ${mixTarget} bouteilles`}
                  </p>
                </>
              )}
            </div>

            {/* Recherche produit */}
            <div className="px-4 py-3 border-b flex-shrink-0">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                <input
                  className="input pl-9 text-sm w-full"
                  placeholder="Rechercher un produit à ajouter..."
                  value={mixSearch}
                  onChange={e => setMixSearch(e.target.value)}
                  autoFocus
                />
              </div>
              {mixFiltered.length > 0 && (
                <div className="mt-2 space-y-1 max-h-36 overflow-y-auto">
                  {mixFiltered.map(p => (
                    <button key={p.id} onClick={() => addToMix(p)} disabled={p.qte_actuelle <= 0}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border text-left transition-colors ${p.qte_actuelle <= 0 ? 'opacity-40 cursor-not-allowed bg-gray-50' : 'hover:bg-orange-50 hover:border-orange-300 border-gray-200'}`}>
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{p.nom}</p>
                        <p className="text-xs text-gray-400">Stock : {p.qte_actuelle}</p>
                      </div>
                      <p className="text-sm font-bold text-orange-600">{fmt(getMixUnitPrice(p))} <span className="text-xs text-gray-400">FCFA/u.</span></p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Liste des articles du mix — qté distribuée automatiquement */}
            <div className="flex-1 overflow-y-auto px-4 py-2">
              {mixDistrib.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-6">Aucun produit ajouté</p>
              ) : (
                <div className="space-y-2">
                  {mixDistrib.map(({ produit, qte, prixUnit }) => (
                    <div key={produit.id} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{produit.nom}</p>
                        {peutModifierPrix ? (
                          <div className="flex items-center gap-1 mt-0.5">
                            <input
                              type="text" inputMode="decimal"
                              value={prixUnit || ''}
                              onChange={e => updateMixPrice(produit.id, e.target.value.replace(/[^0-9.,]/g,'').replace(',', '.'))}
                              className="w-20 text-center bg-white text-blue-700 text-xs font-bold rounded px-2 py-0.5 border-2 border-blue-400 focus:outline-none"
                            />
                            <span className="text-xs text-gray-400">F/u.</span>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400">{fmt(num(prixUnit))} F/u.</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 bg-orange-100 rounded-lg px-3 py-1">
                        <span className="text-orange-700 font-black text-base">{qte}</span>
                        <span className="text-orange-500 text-xs">u.</span>
                      </div>
                      <p className="text-sm font-bold text-gray-800 w-20 text-right">{fmt(qte * num(prixUnit))}</p>
                      <button onClick={() => setMixItems(prev => prev.filter(i => i.produit.id !== produit.id))}
                        className="text-gray-400 hover:text-red-500 transition-colors ml-1">
                        <X size={14}/>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pied — total + bouton */}
            <div className="px-4 py-3 border-t bg-gray-50 rounded-b-2xl flex-shrink-0">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs text-gray-500">{mixItems.length} produit{mixItems.length > 1 ? 's' : ''} · {mixTotal} bouteille{mixTotal > 1 ? 's' : ''}</p>
                  <p className="text-lg font-black text-gray-900">{fmt(mixMontant)} <span className="text-sm font-normal text-gray-500">FCFA</span></p>
                </div>
                <button onClick={validerMix}
                  className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-5 py-2.5 rounded-xl transition-colors flex items-center gap-2">
                  <ShoppingCart size={16}/>
                  Ajouter au panier
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ MODAL SÉLECTEUR DE CONDITIONNEMENT ══════════ */}
      {condPicker && (
        <div className="fixed inset-0 z-50">
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden" style={{ position:'absolute', top:'50%', left:'50%', transform:`translate(-50%,-50%) translate(${condPickerDrag.offset.x}px, ${condPickerDrag.offset.y}px)`, width:'calc(100% - 32px)', maxWidth:384 }}>
            <div onMouseDown={condPickerDrag.onMouseDown} className="flex items-center justify-between px-5 py-4 border-b cursor-move select-none">
              <div>
                <h3 className="font-bold text-gray-900 text-base">{condPicker.produit.nom}</h3>
                <p className="text-xs text-gray-400 mt-0.5">Choisir le format de vente</p>
              </div>
              <button onClick={() => setCondPicker(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <div className="p-4 space-y-2">
              {condPicker.conds.map(c => {
                const maxQty = Math.floor(condPicker.produit.qte_actuelle / c.contenance);
                const dispo = maxQty > 0;
                return (
                  <button
                    key={c.id}
                    onClick={() => dispo && addWithCond(condPicker.produit, c)}
                    disabled={!dispo}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all text-left ${
                      dispo
                        ? 'border-gray-200 hover:border-blue-400 hover:bg-blue-50 active:scale-95'
                        : 'border-gray-100 opacity-40 cursor-not-allowed bg-gray-50'
                    }`}
                  >
                    <div>
                      <p className="font-bold text-gray-900">{c.libelle}</p>
                      <p className="text-xs text-gray-400">{c.contenance} unité{c.contenance > 1 ? 's' : ''} • {dispo ? `${maxQty} disponible${maxQty > 1 ? 's' : ''}` : 'stock insuffisant'}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-blue-700 text-base">{fmt(c.prix_vente)}</p>
                      <p className="text-xs text-gray-400">FCFA</p>
                    </div>
                  </button>
                );
              })}
              {condPicker.produit.prix_vente > 0 && (
                <div className="pt-1 border-t border-gray-100">
                  <button
                    onClick={() => { addSingleUnit(condPicker.produit); setCondPicker(null); }}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 border-dashed border-gray-200 hover:border-gray-400 hover:bg-gray-50 transition-all text-left"
                  >
                    <div>
                      <p className="font-semibold text-gray-700">À l'unité</p>
                      <p className="text-xs text-gray-400">1 {condPicker.produit.unite || 'unité'} • stock : {condPicker.produit.qte_actuelle}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-gray-700 text-base">{fmt(condPicker.produit.prix_vente)}</p>
                      <p className="text-xs text-gray-400">FCFA</p>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════ MODAL REÇU ══════════ */}
      {recu && (
        <div className="fixed inset-0 z-50">
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden" style={{ position:'absolute', top:'50%', left:'50%', transform:`translate(-50%,-50%) translate(${recuDrag.offset.x}px, ${recuDrag.offset.y}px)`, width:'calc(100% - 32px)', maxWidth:340, maxHeight:'calc(100vh - 32px)', overflowY:'auto' }}>
            {/* En-tête */}
            <div onMouseDown={recuDrag.onMouseDown} className="bg-green-600 px-6 py-5 text-center text-white cursor-move select-none">
              <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-2">
                <Check size={30}/>
              </div>
              <h2 className="text-xl font-bold">Vente enregistrée !</h2>
              <p className="text-green-200 text-sm mt-0.5">Bon N° {recu.numero}</p>
            </div>

            {/* Corps ticket */}
            <div className="px-5 py-4 font-mono text-sm space-y-1.5 border-b border-dashed">
              {recu.panier.map((i, idx) => {
                const isTarif = ['Détail','Demi-gros','Gros'].includes(i.unite_libelle);
                const suffix = i.contenance > 1
                  ? ` (${i.unite_libelle})`
                  : isTarif && i.unite_libelle !== 'Détail'
                    ? ` [${i.unite_libelle}]`
                    : '';
                const brut = num(i.prix_unitaire) * i.quantite;
                const remise = num(i.remise_fcfa);
                const net = Math.max(0, brut - remise);
                return (
                  <div key={idx}>
                    <div className="flex justify-between gap-2 items-baseline">
                      <span className="text-gray-600 truncate flex-1 text-xs">
                        {i.nom}{suffix}{i.quantite > 1 ? ` ×${i.quantite}` : ''}
                      </span>
                      <div className="text-right flex-shrink-0">
                        {remise > 0 && (
                          <span className="line-through text-gray-400 text-xs mr-1">{fmt(brut)}</span>
                        )}
                        <span className={`font-bold text-sm ${remise > 0 ? 'text-green-700' : 'text-gray-800'}`}>{fmt(net)}</span>
                      </div>
                    </div>
                    {remise > 0 && (
                      <div className="flex justify-between text-red-500 text-xs pl-2 -mt-0.5">
                        <span className="italic">↳ remise</span>
                        <span>− {fmt(remise)} F</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="px-5 py-3 space-y-1 text-sm border-b border-dashed">
              {recu.remiseMt > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Remise</span><span>− {fmt(recu.remiseMt)} FCFA</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base">
                <span>TOTAL</span><span className="text-blue-700">{fmt(recu.total)} FCFA</span>
              </div>
              {recu.modePaiement === 'especes' && (
                <div className="flex justify-between text-gray-600">
                  <span>Montant reçu</span><span>{fmt(recu.montantRecuVal)} FCFA</span>
                </div>
              )}
              {recu.modePaiement === 'especes' && recu.monnaie > 0 && (
                <div className="flex justify-between text-green-600 font-semibold">
                  <span>Monnaie rendue</span><span>{fmt(recu.monnaie)} FCFA</span>
                </div>
              )}
              <div className="flex justify-between text-gray-400">
                <span>Mode de paiement</span><span className="capitalize">{MODES.find(m=>m.key===recu.modePaiement)?.label}</span>
              </div>
            </div>

            <div className="p-4 space-y-2">
              <button onClick={() => printTicket(recu)}
                className="w-full bg-gray-800 hover:bg-gray-700 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
                <Printer size={18}/> Imprimer le ticket
              </button>
              <button onClick={() => emettreEtImprimerFacture(recu)} disabled={emissionFacture}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
                {emissionFacture
                  ? <><span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"/> Émission…</>
                  : <><ReceiptText size={18}/> Émettre une facture</>}
              </button>
              <button onClick={() => { setRecu(null); searchRef.current?.focus(); }}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
                <ShoppingCart size={18}/> Nouvelle vente
              </button>
              {/* Annulation rapide — erreur de caisse */}
              <button
                onClick={annulerVenteCaisse}
                disabled={annulCaisse}
                className="w-full flex items-center justify-center gap-2 border-2 border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-60 font-semibold py-2.5 rounded-xl transition-colors text-sm"
              >
                {annulCaisse
                  ? <><span className="animate-spin inline-block w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full"/> Annulation…</>
                  : <><RotateCcw size={15}/> Annuler cette vente (erreur)</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ CONFIRMATION FACTURE SANS VENTE ══════════ */}
      {factureCreee && (
        <div className="fixed inset-0 z-50">
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden" style={{ position:'absolute', top:'50%', left:'50%', transform:`translate(-50%,-50%) translate(${factureCreeeDrag.offset.x}px, ${factureCreeeDrag.offset.y}px)`, width:'calc(100% - 32px)', maxWidth:340 }}>
            <div onMouseDown={factureCreeeDrag.onMouseDown} className="bg-indigo-600 px-6 py-5 text-center text-white cursor-move select-none">
              <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-2">
                <ReceiptText size={30}/>
              </div>
              <h2 className="text-xl font-bold">Facture créée</h2>
              <p className="text-indigo-200 text-sm mt-0.5">N° {factureCreee.numero}</p>
              <p className="text-indigo-200 text-xs mt-1">Aucune vente enregistrée — stock non impacté</p>
            </div>
            <div className="px-6 py-4 text-center">
              <p className="text-2xl font-black text-gray-800">{fmt(factureCreee.total)} <span className="text-sm font-normal text-gray-400">FCFA</span></p>
            </div>
            <div className="p-4 space-y-2 border-t">
              <button onClick={() => printFacture(factureCreee.r, factureCreee.numero)}
                className="w-full bg-gray-800 hover:bg-gray-700 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
                <Printer size={18}/> Imprimer la facture
              </button>
              <button onClick={() => { setFactureCreee(null); searchRef.current?.focus(); }}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
                <Check size={18}/> Terminer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ NOUVEAU DOCUMENT — même formulaire que Facturation, imprimé en ticket ══════════ */}
      {docModal && (() => {
        const totauxDoc = calcTotauxDoc(docForm.lignes, docForm.remise, docForm.remise_montant);
        const typeConfigDoc = TYPES_DOC.find(t => t.value === docForm.type) || TYPES_DOC[0];
        return (
          <div className="fixed inset-0 z-50">
            <div className="bg-white rounded-2xl shadow-xl" style={{ position:'absolute', top:16, left:'50%', transform:`translateX(-50%) translate(${docModalDrag.offset.x}px, ${docModalDrag.offset.y}px)`, width:'calc(100% - 32px)', maxWidth:1024, maxHeight:'calc(100vh - 32px)', overflowY:'auto' }}>
              <div onMouseDown={docModalDrag.onMouseDown} className="flex items-center justify-between p-5 border-b sticky top-0 bg-white rounded-t-2xl z-10 cursor-move select-none">
                <h2 className="text-lg font-semibold">Nouveau document</h2>
                <button onClick={() => setDocModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
              </div>
              <form onSubmit={e => handleDocSubmit(e, 'emise')} className="p-5 space-y-5">

                {/* 1. Type de document */}
                <div>
                  <label className="label mb-2">Type de document</label>
                  <div className="grid grid-cols-4 gap-2">
                    {TYPES_DOC.map(t => (
                      <button key={t.value} type="button"
                        onClick={() => setDocForm(f => ({ ...f, type: t.value }))}
                        className={`py-2 px-3 rounded-xl border-2 text-sm font-medium transition-all
                          ${docForm.type===t.value ? `border-current ${t.color} ring-2 ${t.ring}` : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                  {docForm.type==='proforma' && <p className="text-xs text-amber-600 mt-1">⚠ Document non définitif — ne génère pas d'écriture fiscale</p>}
                  {docForm.type==='avoir' && <p className="text-xs text-red-600 mt-1">Note de crédit à émettre en compensation d'une facture existante</p>}
                </div>

                {/* Client + infos */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="label">Client</label>
                    <select className="input" value={docForm.client_id} onChange={e => setDocForm(f => ({...f, client_id: e.target.value}))}>
                      <option value="">Client de passage</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Mode de règlement</label>
                    <select className="input" value={docForm.mode_paiement} onChange={e => setDocForm(f => ({...f, mode_paiement: e.target.value}))}>
                      {MODES_PAIEMENT_DOC.filter(m => featVenteCredit || m !== 'credit').map(m => <option key={m} value={m}>{m.replace(/_/g,' ')}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Date du document</label>
                    <input type="date" className="input" value={docForm.date_document} onChange={e => setDocForm(f => ({...f, date_document: e.target.value}))}/>
                  </div>
                  <div>
                    <label className="label">{docForm.type==='proforma' ? "Date d'échéance / validité" : "Date d'échéance paiement"}</label>
                    <input type="date" className="input" value={docForm.echeance} onChange={e => setDocForm(f => ({...f, echeance: e.target.value}))}/>
                  </div>
                </div>

                {/* Lignes — un Reçu est juste la preuve d'un montant encaissé */}
                {docForm.type==='recu' ? (
                  <div className="border border-green-200 rounded-xl p-4 space-y-3 bg-green-50/40">
                    <label className="label">Montant du reçu</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] text-gray-400 block mb-0.5">Montant reçu (FCFA) *</label>
                        <input type="number" min="0" step="1" className="input text-lg font-bold text-green-700"
                          value={docForm.lignes[0]?.prix_ht ?? ''}
                          onChange={e => { setDocLigne(0,'prix_ht',e.target.value); setDocLigne(0,'quantite',1); }}
                          placeholder="0" required/>
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-400 block mb-0.5">Motif (optionnel)</label>
                        <input className="input" value={docForm.lignes[0]?.designation ?? ''}
                          onChange={e => setDocLigne(0,'designation', e.target.value)}
                          placeholder="Règlement reçu"/>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="label">Lignes articles / prestations</label>
                      <button type="button" onClick={addDocLigne} className="btn-secondary btn-sm text-xs">
                        <Plus size={13}/> Ajouter ligne
                      </button>
                    </div>
                    <div className="space-y-2">
                      {docForm.lignes.map((l, i) => {
                        const { ttc } = calcLigneDoc(l);
                        const conds = condMap[l.produit_id] || [];
                        return (
                          <div key={i} className="border border-gray-200 rounded-xl p-3 space-y-2.5">
                            <div className="flex items-start gap-2">
                              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <select className="input text-xs py-1.5" value={l.produit_id} onChange={e => setDocLigne(i,'produit_id',e.target.value)}>
                                  <option value="">— Texte libre —</option>
                                  {produits.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
                                </select>
                                <input className="input text-xs py-1.5" placeholder="Désignation *" value={l.designation} required
                                  onChange={e => setDocLigne(i,'designation',e.target.value)}/>
                              </div>
                              {docForm.lignes.length>1 && (
                                <button type="button" onClick={() => removeDocLigne(i)} className="text-red-400 hover:text-red-600 p-1.5 shrink-0"><Trash2 size={14}/></button>
                              )}
                            </div>

                            {l.produit_id && (
                              <div className="flex flex-wrap gap-1.5">
                                <button type="button" onClick={() => setDocLigne(i,'conditionnement_id','')}
                                  className={`text-xs font-medium px-2.5 py-1 rounded-lg border-2 transition-all
                                    ${!l.conditionnement_id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                                  Unité
                                </button>
                                {conds.map(cond => (
                                  <button type="button" key={cond.id} onClick={() => setDocLigne(i,'conditionnement_id',cond.id)}
                                    className={`text-xs font-medium px-2.5 py-1 rounded-lg border-2 transition-all
                                      ${String(l.conditionnement_id)===String(cond.id) ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                                    {cond.libelle} ({cond.contenance}u)
                                  </button>
                                ))}
                              </div>
                            )}

                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
                              <div>
                                <label className="text-[10px] text-gray-400 block mb-0.5">Qté</label>
                                <input type="text" inputMode="decimal" className="input text-xs py-1 text-center" value={l.quantite} onChange={e => setDocLigne(i,'quantite',e.target.value)}/>
                              </div>
                              <div>
                                <label className="text-[10px] text-gray-400 block mb-0.5">Prix unitaire</label>
                                <input type="number" min="0" step="1" className="input text-xs py-1 text-right" value={l.prix_ht} required onChange={e => setDocLigne(i,'prix_ht',e.target.value)}/>
                              </div>
                              <div>
                                <label className="text-[10px] text-gray-400 block mb-0.5">Rem. %</label>
                                <input type="number" min="0" max="100" className="input text-xs py-1 text-center" value={l.remise} onChange={e => setDocLigne(i,'remise',e.target.value)}/>
                              </div>
                              <div>
                                <label className="text-[10px] text-gray-400 block mb-0.5">Remise (FCFA)</label>
                                <input type="number" min="0" step="1" className="input text-xs py-1 text-center" value={l.remise_montant} onChange={e => setDocLigne(i,'remise_montant',e.target.value)}/>
                              </div>
                              <div className="text-right">
                                <label className="text-[10px] text-gray-400 block mb-0.5">Total</label>
                                <div className="font-semibold text-blue-700 text-sm py-1">{fmt(ttc)} FCFA</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Totaux + remise + note */}
                <div className="flex flex-col sm:flex-row gap-4 items-start">
                  <div className="flex-1 space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="label">Remise globale (%)</label>
                        <input type="number" min="0" max="100" className="input" value={docForm.remise} onChange={e => setDocForm(f => ({...f, remise: e.target.value}))}/>
                      </div>
                      <div>
                        <label className="label">Remise globale (FCFA)</label>
                        <input type="number" min="0" className="input" value={docForm.remise_montant} onChange={e => setDocForm(f => ({...f, remise_montant: e.target.value}))}/>
                      </div>
                      <div>
                        <label className="label">Montant payé (FCFA)</label>
                        <input type="number" min="0" className="input" placeholder={`Total: ${fmt(totauxDoc.total)}`}
                          value={docForm.montant_paye} onChange={e => setDocForm(f => ({...f, montant_paye: e.target.value}))}/>
                      </div>
                    </div>
                    <div>
                      <label className="label">Note / observations</label>
                      <textarea className="input" rows={2} value={docForm.note} onChange={e => setDocForm(f => ({...f, note: e.target.value}))}/>
                    </div>
                  </div>

                  <div className="w-full sm:w-64 bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                    <div className="flex justify-between text-gray-600"><span>Sous-total</span><span>{fmt(totauxDoc.ht)} FCFA</span></div>
                    {totauxDoc.remisePctMt > 0 && <div className="flex justify-between text-red-600"><span>Remise ({docForm.remise}%)</span><span>-{fmt(totauxDoc.remisePctMt)} FCFA</span></div>}
                    {totauxDoc.remiseMt > 0 && <div className="flex justify-between text-red-600"><span>Remise globale</span><span>-{fmt(totauxDoc.remiseMt)} FCFA</span></div>}
                    <div className="flex justify-between font-bold text-base border-t pt-2 text-blue-700"><span>TOTAL</span><span>{fmt(totauxDoc.total)} FCFA</span></div>
                    {parseFloat(docForm.montant_paye) > 0 && parseFloat(docForm.montant_paye) < totauxDoc.total && (
                      <div className="flex justify-between text-red-600 text-xs"><span>Reste à payer</span><span>{fmt(totauxDoc.total - parseFloat(docForm.montant_paye))} FCFA</span></div>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2 border-t">
                  <button type="button" className="btn-secondary" onClick={() => setDocModal(false)}>Annuler</button>
                  <button type="submit" onClick={e => { e.preventDefault(); handleDocSubmit(e,'brouillon'); }} disabled={emissionFacture} className="btn-secondary disabled:opacity-40">Enregistrer en brouillon</button>
                  <button type="submit" disabled={emissionFacture} className="btn-primary disabled:opacity-40">
                    {emissionFacture ? 'Émission…' : `Émettre ${docForm.type==='facture'?'la facture':docForm.type==='proforma'?'le proforma':docForm.type==='avoir'?"l'avoir":'le reçu'}`}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}
    </div>
  );
}







