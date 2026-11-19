import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ShoppingBag, Plus, Trash2, Eye, X, Check, Calendar, Edit } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useDraggable } from '../hooks/useDraggable';
import HistoriquePinGate from '../components/HistoriquePinGate';

const fmt = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0)) + ' FCFA';
const todayStr = () => new Date().toISOString().slice(0,10);

const emptyFourn = { nom: '', telephone: '', email: '' };
const emptyProd  = { nom: '', prix_achat: '', prix_vente: '' };
const emptyNewFormat = { actif: false, libelle: 'Carton', contenance: '', prix_achat: '', prix_vente: '' };
const emptyForm  = () => ({ fournisseur_id: '', note: '', lignes: [], mode_paiement: 'especes', montant_paye: '', date_achat: todayStr(), frais_livraison: '' });

export default function Achats() {
  const [achats, setAchats] = useState([]);
  const [fournisseurs, setFournisseurs] = useState([]);
  const [produits, setProduits] = useState([]);
  const [societe, setSociete] = useState({});
  const featAchatsCorrection = societe.feat_achats_correction !== 0; // désactivable par le Super Admin
  const [modal, setModal] = useState(null);
  const [detail, setDetail] = useState(null);
  const addModalDrag = useDraggable();
  const detailModalDrag = useDraggable();
  const [editAchat, setEditAchat] = useState(null);
  const [savingAchat, setSavingAchat] = useState(false);
  const [ajoutId, setAjoutId] = useState(null); // { id, numero } — si non-null, la modale "add" ajoute des articles à CET achat au lieu d'en créer un nouveau
  const [remplacerId, setRemplacerId] = useState(null); // { id, numero } — si non-null, la modale "add" remplace/corrige les articles existants de CET achat
  const [form, setForm] = useState(emptyForm());
  const [searchProd, setSearchProd] = useState('');

  const [showNewFourn, setShowNewFourn] = useState(false);
  const [newFourn, setNewFourn] = useState(emptyFourn);
  const [savingFourn, setSavingFourn] = useState(false);

  const [showNewProd, setShowNewProd] = useState(false);
  const [newProd, setNewProd] = useState(emptyProd);
  const [newFormat, setNewFormat] = useState(emptyNewFormat);
  const [savingProd, setSavingProd] = useState(false);

  // Onglet "Marge par article" : totaux achat/marge/vente, par produit ou globaux sur une
  // période. Cliquer une ligne du tableau bascule les 3 cartes sur ce seul produit.
  const [tab, setTab] = useState('historique');
  const [margeProduits, setMargeProduits] = useState([]);
  const [margeDates, setMargeDates] = useState({ debut: '', fin: '' });
  const [margeSelection, setMargeSelection] = useState(null); // produit_id sélectionné, ou null = totaux globaux

  // Onglet "Historique" : filtre par dates, même principe que "Marge par article".
  // Par défaut, sans filtre explicite, on ne montre que l'historique du jour — pas tout
  // l'historique depuis toujours (voir aussi le PIN sur un filtre dépassant 24h).
  const [histDates, setHistDates] = useState({ debut: todayStr(), fin: todayStr() });

  function loadAchats(dates = histDates) {
    const params = {};
    if (dates.debut && dates.fin) { params.date_debut = dates.debut; params.date_fin = dates.fin; }
    api.get('/achats', { params }).then(r => setAchats(r.data));
  }

  function loadMargeProduits(dates = margeDates) {
    const params = {};
    if (dates.debut && dates.fin) { params.date_debut = dates.debut; params.date_fin = dates.fin; }
    api.get('/achats/marge-produits', { params }).then(r => setMargeProduits(r.data)).catch(() => {});
  }

  useEffect(() => {
    loadAchats();
    api.get('/fournisseurs').then(r => setFournisseurs(r.data));
    api.get('/produits').then(r => setProduits(r.data));
    api.get('/config/societe').then(r => setSociete(r.data)).catch(() => {});
  }, []);

  useEffect(() => { if (tab === 'marge') loadMargeProduits(); }, [tab]);

  async function addLigne(p) {
    let formats = [];
    try {
      const res = await api.get(`/produits/${p.id}/conditionnements`);
      formats = res.data; // all active conditionnements
    } catch {}

    // Sélection par défaut : préférer "Carton" (plein), sinon le dernier format
    let format_idx = formats.length > 0 ? formats.length - 1 : 0;
    const cartonIdx = formats.findIndex(c =>
      c.libelle.toLowerCase() === 'carton' ||
      (c.libelle.toLowerCase().includes('carton') && !c.libelle.includes('¼') && !c.libelle.includes('½') && !c.libelle.includes('1/4') && !c.libelle.includes('1/2'))
    );
    if (cartonIdx >= 0) format_idx = cartonIdx;

    const format_sel = formats[format_idx] || null;
    const contenance = format_sel ? format_sel.contenance : 1;
    // Prix D'ACHAT du format — pré-rempli depuis le prix d'achat déjà connu du format
    // (pas son prix de VENTE, qui n'a rien à voir avec ce qu'on paie au fournisseur).
    const prix = format_sel && format_sel.prix_achat > 0
      ? format_sel.prix_achat
      : Math.round((p.prix_achat || 0) * contenance);
    // Prix de vente du format : repris tel quel s'il existe déjà (aucun calcul). Prix de vente
    // à la pièce : repris tel quel depuis la fiche produit. Les deux sont saisis à la main et
    // totalement indépendants l'un de l'autre — jamais l'un dérivé/arrondi à partir de l'autre.
    const prix_vente = format_sel ? (format_sel.prix_vente || 0) : 0;
    const prix_vente_piece = p.prix_vente || 0;

    setForm(f => ({
      ...f,
      lignes: [...f.lignes, { produit_id: p.id, produit_ref: p, nom: p.nom, formats, format_idx, nb: 1, prix, prix_vente, prix_vente_piece }]
    }));
    setSearchProd('');
    setShowNewProd(false);
  }

  function updateFormatIdx(i, newIdx) {
    setForm(f => ({
      ...f,
      lignes: f.lignes.map((l, idx) => {
        if (idx !== i) return l;
        const fmt_sel = l.formats[newIdx];
        const contenance = fmt_sel ? fmt_sel.contenance : 1;
        const prix = fmt_sel && fmt_sel.prix_achat > 0
          ? fmt_sel.prix_achat
          : Math.round(l.prix / (l.formats[l.format_idx]?.contenance || 1)) * contenance;
        const prix_vente = fmt_sel ? (fmt_sel.prix_vente || 0) : 0;
        return { ...l, format_idx: newIdx, prix, prix_vente };
      })
    }));
  }

  function updateLigne(i, field, val) {
    setForm(f => ({ ...f, lignes: f.lignes.map((l, idx) => idx === i ? { ...l, [field]: +val || 0 } : l) }));
  }

  function removeLigne(i) {
    setForm(f => ({ ...f, lignes: f.lignes.filter((_, idx) => idx !== i) }));
    // Après une suppression, Chromium laisse parfois la zone cliquable "figée" (clic/saisie
    // sans effet) jusqu'au prochain repaint forcé — signe classique reconnu par l'utilisateur
    // lui-même : réduire puis restaurer la fenêtre débloque tout, ce qui déclenche justement un
    // évènement "resize". On le déclenche nous-mêmes juste après pour ne pas avoir à le faire.
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }

  // Chaque prix (à la pièce et par format) est saisi à la main et enregistré tel quel — jamais
  // calculé/arrondi à partir d'un autre champ. Ne touche à rien si un champ n'a pas été modifié
  // par rapport à sa valeur d'origine.
  async function syncPrixVente() {
    for (const l of form.lignes) {
      const fmt_sel = l.formats[l.format_idx] || null;

      const nouveauPrixPiece = l.prix_vente_piece || 0;
      if (l.produit_ref && nouveauPrixPiece !== (l.produit_ref.prix_vente || 0)) {
        try { await api.put(`/produits/${l.produit_id}`, { ...l.produit_ref, prix_vente: nouveauPrixPiece }); } catch {}
      }

      if (fmt_sel) {
        const nouveauPrixFormat = l.prix_vente || 0;
        if (nouveauPrixFormat !== (fmt_sel.prix_vente || 0)) {
          try {
            await api.put(`/conditionnements/${fmt_sel.id}`, {
              libelle: fmt_sel.libelle, contenance: fmt_sel.contenance,
              prix_vente: nouveauPrixFormat, prix_achat: fmt_sel.prix_achat, ordre: fmt_sel.ordre,
            });
          } catch {}
        }
      }
    }
  }

  // Total = somme des (nb × prix par format) + frais de livraison éventuels
  const sousTotalArticles = form.lignes.reduce((s, l) => s + (l.nb || 1) * (l.prix || 0), 0);
  const total = sousTotalArticles + (parseFloat(form.frais_livraison) || 0);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.lignes.length) return toast.error('Ajoutez au moins un article');
    // Convertir chaque ligne en unités pour le backend
    const lignesBackend = form.lignes.map(l => {
      const fmt_sel = l.formats[l.format_idx] || null;
      const contenance = fmt_sel ? fmt_sel.contenance : 1;
      return {
        produit_id:    l.produit_id,
        quantite:      (l.nb || 1) * contenance,
        // Pas d'arrondi : sinon (prix du format ÷ contenance) × quantité ne retombe pas
        // exactement sur le prix du format payé (ex: 4100F÷48 arrondi à 85 → 85×48=4080≠4100).
        prix_unitaire: contenance > 0 ? (l.prix || 0) / contenance : (l.prix || 0),
        // Format réellement saisi (ex: "2 Carton(s) de 24") — conservé pour l'affichage,
        // sans impact sur le stock qui reste toujours compté en pièces.
        conditionnement_id: fmt_sel ? fmt_sel.id : null,
        nb_format: fmt_sel ? (l.nb || 1) : null,
      };
    });
    try {
      if (remplacerId) {
        await api.put(`/achats/${remplacerId.id}/lignes`, { lignes: lignesBackend });
        toast.success(`Articles de ${remplacerId.numero} corrigés, stock mis à jour`);
        setRemplacerId(null);
      } else if (ajoutId) {
        await api.post(`/achats/${ajoutId.id}/lignes`, { lignes: lignesBackend });
        toast.success(`Articles ajoutés à ${ajoutId.numero}, stock mis à jour`);
        setAjoutId(null);
      } else {
        await api.post('/achats', { ...form, lignes: lignesBackend });
        toast.success('Achat enregistré, stock mis à jour');
      }
      await syncPrixVente();
      setModal(null);
      setForm(emptyForm());
      loadAchats();
      api.get('/produits').then(r => setProduits(r.data));
    } catch (err) { toast.error(err.response?.data?.message || 'Erreur'); }
  }

  async function voirDetail(id) {
    const res = await api.get(`/achats/${id}`);
    setDetail(res.data);
  }

  function startEditAchat() {
    setEditAchat({
      fournisseur_id: detail.fournisseur_id || '',
      mode_paiement: detail.mode_paiement || 'especes',
      montant_paye: detail.montant_paye || '',
      frais_livraison: detail.frais_livraison || '',
      date_achat: (detail.created_at || '').slice(0, 10) || todayStr(),
      note: detail.note || '',
    });
  }

  async function saveEditAchat() {
    setSavingAchat(true);
    try {
      const res = await api.put(`/achats/${detail.id}`, editAchat);
      toast.success('Achat corrigé');
      setEditAchat(null);
      const refreshed = await api.get(`/achats/${detail.id}`);
      setDetail(refreshed.data);
      loadAchats();
    } catch (err) { toast.error(err.response?.data?.message || 'Erreur lors de la correction'); }
    finally { setSavingAchat(false); }
  }

  async function supprimerAchat() {
    if (!window.confirm(`Supprimer définitivement l'achat ${detail.numero} ? Le stock ajouté par cet achat sera retiré et le solde fournisseur ajusté.`)) return;
    setSavingAchat(true);
    try {
      await api.delete(`/achats/${detail.id}`);
      toast.success('Achat supprimé');
      setDetail(null);
      setEditAchat(null);
      loadAchats();
    } catch (err) { toast.error(err.response?.data?.message || 'Erreur lors de la suppression'); }
    finally { setSavingAchat(false); }
  }

  async function creerFournisseur() {
    if (!newFourn.nom.trim()) return toast.error('Le nom est obligatoire');
    setSavingFourn(true);
    try {
      const res = await api.post('/fournisseurs', newFourn);
      const created = { ...newFourn, id: res.data.id };
      setFournisseurs(prev => [...prev, created]);
      setForm(f => ({ ...f, fournisseur_id: String(created.id) }));
      setNewFourn(emptyFourn);
      setShowNewFourn(false);
      toast.success(`Fournisseur "${created.nom}" créé`);
    } catch (err) { toast.error(err.response?.data?.message || 'Erreur création fournisseur'); }
    finally { setSavingFourn(false); }
  }

  async function creerProduit() {
    if (!newProd.nom.trim()) return toast.error('Le nom est obligatoire');
    setSavingProd(true);
    try {
      const code = 'ART-' + Date.now().toString(36).toUpperCase().slice(-6);
      const payload = {
        code,
        nom: newProd.nom.trim(),
        prix_achat: Number(newProd.prix_achat) || 0,
        prix_vente: Number(newProd.prix_vente) || 0,
        qte_actuelle: 0,
      };
      const res = await api.post('/produits', payload);
      const produitId = res.data.id;
      const created = { ...payload, id: produitId };
      setProduits(prev => [...prev, created]);

      // Format d'achat (Carton, etc.) renseigné en même temps que le produit — pratique pour
      // un magasin qui achète/vend en gros et ne raisonne jamais au prix à la pièce. Prix
      // d'achat/vente du format saisis à la main, indépendants du prix à la pièce ci-dessus.
      if (newFormat.actif && newFormat.libelle.trim() && Number(newFormat.contenance) > 0) {
        const n = Number(newFormat.contenance);
        const pac = Number(newFormat.prix_achat) || 0;
        const pvc = Number(newFormat.prix_vente) || 0;
        // "ordre" est explicitement croissant avec la contenance (du plus petit au plus
        // grand format) — sinon le tri retombe sur l'ordre de création et le Carton, créé en
        // premier, apparaissait avant ¼/½ à la Caisse au lieu d'après.
        await api.post('/conditionnements', {
          produit_id: produitId,
          libelle: newFormat.libelle.trim(),
          contenance: n,
          prix_achat: pac,
          prix_vente: pvc,
          ordre: 3,
        });
        // Si c'est un carton, ¼ et ½ Carton sont créés en même temps (suggestion de prix
        // modifiable ensuite dans Produits) — comme avant, pour que le choix du format soit
        // directement disponible à la Caisse sans étape supplémentaire dans Produits.
        if (newFormat.libelle.trim().toLowerCase().includes('carton') && n > 1) {
          const quart = Math.max(1, Math.round(n / 4));
          const demi  = Math.max(1, Math.round(n / 2));
          if (quart < n) {
            await api.post('/conditionnements', {
              produit_id: produitId, libelle: '¼ Carton', contenance: quart,
              prix_achat: pac > 0 ? Math.round(pac * quart / n) : 0,
              prix_vente: pvc > 0 ? Math.round(pvc * quart / n) : 0,
              ordre: 1,
            });
          }
          if (demi < n && demi !== quart) {
            await api.post('/conditionnements', {
              produit_id: produitId, libelle: '½ Carton', contenance: demi,
              prix_achat: pac > 0 ? Math.round(pac * demi / n) : 0,
              prix_vente: pvc > 0 ? Math.round(pvc * demi / n) : 0,
              ordre: 2,
            });
          }
        }
      }

      await addLigne(created); // recharge les formats du produit, y compris celui qu'on vient de créer
      setNewProd(emptyProd);
      setNewFormat(emptyNewFormat);
      setShowNewProd(false);
      toast.success(`Produit "${created.nom}" créé et ajouté`);
    } catch (err) { toast.error(err.response?.data?.message || 'Erreur création produit'); }
    finally { setSavingProd(false); }
  }

  const filteredProds = searchProd.length >= 1
    ? produits.filter(p => p.nom.toLowerCase().includes(searchProd.toLowerCase()) || (p.code && p.code.toLowerCase().includes(searchProd.toLowerCase())) || (p.code_barres && p.code_barres.includes(searchProd))).slice(0, 8)
    : [];

  // Scanner un code-barres = taper le code puis un "Entrée" automatique. Sans ce handler,
  // cet Entrée soumettait tout le formulaire d'achat en cours (produit non ajouté). On bloque
  // la soumission et, si le code correspond à un seul produit, on l'ajoute directement.
  function handleSearchProdKey(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const code = searchProd.trim();
    if (!code) return;
    const exact = produits.find(p => p.code_barres === code || p.code === code);
    if (exact) { addLigne(exact); return; }
    if (filteredProds.length === 1) addLigne(filteredProds[0]);
  }

  function openModal() {
    setForm(emptyForm());
    setAjoutId(null);
    setRemplacerId(null);
    setShowNewFourn(false);
    setShowNewProd(false);
    setNewFourn(emptyFourn);
    setNewProd(emptyProd);
    setNewFormat(emptyNewFormat);
    setSearchProd('');
    setModal('add');
  }

  // Reprend le même formulaire que "Nouvel achat", mais pour continuer à ajouter les
  // articles d'une même facture fournisseur déjà enregistrée (au lieu d'en recréer une).
  function ouvrirAjoutArticles() {
    setForm({ ...emptyForm(), fournisseur_id: detail.fournisseur_id || '' });
    setAjoutId({ id: detail.id, numero: detail.numero });
    setRemplacerId(null);
    setShowNewFourn(false);
    setShowNewProd(false);
    setSearchProd('');
    setModal('add');
    setDetail(null);
  }

  // Convertit une ligne déjà enregistrée (produit_id/quantite/prix_unitaire/format) dans le
  // format éditable du formulaire ({produit_id, nom, formats, format_idx, nb, prix}).
  async function ligneVersFormLigne(l) {
    let formats = [];
    try { const res = await api.get(`/produits/${l.produit_id}/conditionnements`); formats = res.data; } catch {}
    let format_idx = 0;
    if (l.conditionnement_id) {
      const idx = formats.findIndex(f => f.id === l.conditionnement_id);
      if (idx >= 0) format_idx = idx;
    }
    const fmt_sel = formats[format_idx] || null;
    const contenance = fmt_sel ? fmt_sel.contenance : 1;
    const nb = l.nb_format || (contenance > 0 ? Math.round(l.quantite / contenance) : l.quantite) || 1;
    const prix = Math.round((l.prix_unitaire || 0) * contenance);
    const produit_ref = produits.find(p => p.id === l.produit_id) || null;
    const prix_vente = fmt_sel ? (fmt_sel.prix_vente || 0) : 0;
    const prix_vente_piece = produit_ref?.prix_vente || 0;
    return { produit_id: l.produit_id, produit_ref, nom: l.produit_nom, formats, format_idx, nb, prix, prix_vente, prix_vente_piece };
  }

  // Recharge les articles existants d'un achat dans le formulaire pour pouvoir corriger
  // produit/quantité/prix (pas seulement les champs administratifs de "Corriger cet achat").
  async function ouvrirCorrigerLignes() {
    const lignesForm = await Promise.all((detail.lignes || []).map(ligneVersFormLigne));
    setForm({ ...emptyForm(), fournisseur_id: detail.fournisseur_id || '', lignes: lignesForm });
    setRemplacerId({ id: detail.id, numero: detail.numero });
    setAjoutId(null);
    setShowNewFourn(false);
    setShowNewProd(false);
    setSearchProd('');
    setModal('add');
    setDetail(null);
  }

  // PIN demandé seulement si le filtre de dates de l'historique dépasse 24h — l'historique
  // du jour (pas de filtre, ou filtre sur une seule journée) reste consultable librement.
  const histDepasse24h = !!(histDates.debut && histDates.fin
    && (new Date(histDates.fin) - new Date(histDates.debut)) > 24 * 3600 * 1000);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2"><ShoppingBag size={22}/> Achats fournisseurs</h1>
          <p className="page-sub">{achats.length} bon{achats.length !== 1 ? 's' : ''} d'achat enregistré{achats.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={openModal} className="btn-primary"><Plus size={16}/> Nouvel achat</button>
      </div>

      <div className="flex gap-1 bg-white rounded-2xl p-1 border border-gray-100 w-fit shadow-sm">
        {['historique', 'marge'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${tab === t ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
            {t === 'historique' ? 'Historique' : 'Marge par article'}
          </button>
        ))}
      </div>

      {tab === 'historique' && (
        <HistoriquePinGate societe={societe} active={histDepasse24h}>
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap bg-white border border-gray-200 rounded-lg px-3 py-2 w-fit">
            <span className="text-xs text-gray-500">Du</span>
            <input type="date" className="input py-1 text-xs w-auto" value={histDates.debut}
              onChange={e => { const d = { ...histDates, debut: e.target.value }; setHistDates(d); if (d.debut && d.fin) loadAchats(d); }}/>
            <span className="text-xs text-gray-500">au</span>
            <input type="date" className="input py-1 text-xs w-auto" value={histDates.fin}
              onChange={e => { const d = { ...histDates, fin: e.target.value }; setHistDates(d); if (d.debut && d.fin) loadAchats(d); }}/>
            {(histDates.debut !== todayStr() || histDates.fin !== todayStr()) && (
              <button onClick={() => { const d = { debut: todayStr(), fin: todayStr() }; setHistDates(d); loadAchats(d); }}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium">Revenir à aujourd'hui</button>
            )}
          </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>N°</th><th>Date</th><th>Fournisseur</th><th>Article (qté)</th><th>Total</th><th>Marge potentielle</th><th>Statut</th><th>Actions</th></tr></thead>
            <tbody>
              {achats.map(a => (
                <tr key={a.id}>
                  <td><span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{a.numero}</span></td>
                  <td className="text-xs">{new Date(a.created_at).toLocaleString('fr-FR')}</td>
                  <td>{a.fournisseur_nom || '-'}</td>
                  <td className="text-xs text-gray-600 max-w-[220px]" title={a.articles_resume || ''}>
                    <span className="line-clamp-2">{a.articles_resume || '-'}</span>
                  </td>
                  <td>
                    <span className="font-semibold text-blue-700">{fmt(a.total)}</span>
                    {a.total - (a.montant_paye || 0) > 0 && (
                      <p className="text-xs text-orange-600">Reste dû : {fmt(a.total - (a.montant_paye || 0))}</p>
                    )}
                  </td>
                  <td>
                    <span className={`font-semibold ${a.marge_potentielle >= 0 ? 'text-amber-600' : 'text-red-600'}`}>
                      {a.marge_potentielle >= 0 ? '' : '-'}{fmt(Math.abs(a.marge_potentielle || 0))}
                    </span>
                  </td>
                  <td><span className="badge badge-green">{a.statut}</span></td>
                  <td><button onClick={() => voirDetail(a.id)} className="text-blue-600 hover:bg-blue-50 p-1.5 rounded"><Eye size={15}/></button></td>
                </tr>
              ))}
              {achats.length === 0 && <tr><td colSpan="8" className="text-center py-8 text-gray-400">Aucun achat</td></tr>}
            </tbody>
          </table>
        </div>
        </div>
        </HistoriquePinGate>
      )}

      {tab === 'marge' && (() => {
        const selected = margeSelection ? margeProduits.find(p => p.produit_id === margeSelection) : null;
        const cardsData = selected || margeProduits.reduce((s, p) => ({
          total_achat: s.total_achat + (p.total_achat || 0),
          total_vente: s.total_vente + (p.total_vente || 0),
          total_marge: s.total_marge + (p.total_marge || 0),
        }), { total_achat: 0, total_vente: 0, total_marge: 0 });
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap bg-white border border-gray-200 rounded-lg px-3 py-2 w-fit">
              <span className="text-xs text-gray-500">Du</span>
              <input type="date" className="input py-1 text-xs w-auto" value={margeDates.debut}
                onChange={e => { const d = { ...margeDates, debut: e.target.value }; setMargeDates(d); if (d.debut && d.fin) loadMargeProduits(d); }}/>
              <span className="text-xs text-gray-500">au</span>
              <input type="date" className="input py-1 text-xs w-auto" value={margeDates.fin}
                onChange={e => { const d = { ...margeDates, fin: e.target.value }; setMargeDates(d); if (d.debut && d.fin) loadMargeProduits(d); }}/>
              {(margeDates.debut || margeDates.fin) && (
                <button onClick={() => { const d = { debut: '', fin: '' }; setMargeDates(d); loadMargeProduits(d); }}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium">Réinitialiser (tout)</button>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                {selected ? `Totaux — ${selected.produit_nom}` : 'Totaux — tous les articles'}
                {selected && (
                  <button onClick={() => setMargeSelection(null)} className="ml-2 text-blue-600 hover:text-blue-800 normal-case font-medium">
                    (voir le total de tout)
                  </button>
                )}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="card py-3 px-4">
                  <span className="text-xs font-medium text-gray-500">Total Achat</span>
                  <div className="mt-1 text-lg font-bold text-red-600">{fmt(cardsData.total_achat)}</div>
                </div>
                <div className="card py-3 px-4">
                  <span className="text-xs font-medium text-gray-500">Total Prix de vente</span>
                  <div className="mt-1 text-lg font-bold text-green-600">{fmt(cardsData.total_vente)}</div>
                </div>
                <div className="card py-3 px-4">
                  <span className="text-xs font-medium text-gray-500">Total Marge</span>
                  <div className={`mt-1 text-lg font-bold ${cardsData.total_marge >= 0 ? 'text-blue-700' : 'text-red-600'}`}>{fmt(cardsData.total_marge)}</div>
                </div>
              </div>
            </div>

            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Produit</th><th>Qté achetée</th><th>Total Achat</th><th>Total Prix de vente</th><th>Total Marge</th></tr></thead>
                <tbody>
                  {margeProduits.map(p => {
                    // Affiche en cartons (le plus grand format actif du produit) plutôt qu'en
                    // pièces, puisque la majorité des produits se vendent au carton — le reste
                    // non divisible (achats à l'unité mélangés) s'ajoute en pièces à côté.
                    const n = p.format_contenance || 1;
                    const cartons = n > 1 ? Math.floor(p.qte_achetee / n) : 0;
                    const reste = n > 1 ? p.qte_achetee % n : p.qte_achetee;
                    const qteAffichee = n > 1
                      ? `${cartons} ${p.format_libelle}${reste > 0 ? ` + ${reste} u.` : ''}`
                      : `${p.qte_achetee} u.`;
                    return (
                    <tr key={p.produit_id} onClick={() => setMargeSelection(margeSelection === p.produit_id ? null : p.produit_id)}
                      className={`cursor-pointer ${margeSelection === p.produit_id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                      <td className="font-medium">{p.produit_nom}</td>
                      <td>{qteAffichee}</td>
                      <td className="text-red-600">{fmt(p.total_achat)}</td>
                      <td className="text-green-600">{fmt(p.total_vente)}</td>
                      <td className={p.total_marge >= 0 ? 'text-blue-700 font-semibold' : 'text-red-600 font-semibold'}>{fmt(p.total_marge)}</td>
                    </tr>
                    );
                  })}
                  {margeProduits.length === 0 && <tr><td colSpan="5" className="text-center py-8 text-gray-400">Aucun achat sur cette période</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {modal === 'add' && createPortal(
        <div className="fixed inset-0 z-50">
          <div className="bg-white rounded-2xl shadow-xl" style={{ position: "absolute", top: 16, left: "50%", transform: `translateX(-50%) translate(${addModalDrag.offset.x}px, ${addModalDrag.offset.y}px)`, width: "calc(100% - 32px)", maxWidth: 660, maxHeight: "calc(100vh - 32px)", overflowY: "auto" }}>
            <div onMouseDown={addModalDrag.onMouseDown} className="flex items-center justify-between p-6 border-b cursor-move select-none">
              <h2 className="text-lg font-semibold">
                {remplacerId ? `Corriger les articles — ${remplacerId.numero}` : ajoutId ? `Ajouter des articles — ${ajoutId.numero}` : 'Nouvel achat fournisseur'}
              </h2>
              <button onClick={() => { setModal(null); setAjoutId(null); setRemplacerId(null); }} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">

              {ajoutId && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-2.5 text-sm text-indigo-800">
                  Ces articles seront ajoutés à l'achat <strong>{ajoutId.numero}</strong> ({fournisseurs.find(f => String(f.id)===String(form.fournisseur_id))?.nom || 'sans fournisseur'}). Le paiement/date/frais de livraison de cet achat ne sont pas modifiés ici — utilisez "Corriger cet achat" pour ça.
                </div>
              )}
              {remplacerId && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-sm text-amber-800">
                  Vous corrigez les articles de l'achat <strong>{remplacerId.numero}</strong> — la liste ci-dessous remplacera entièrement l'ancienne. Le stock et le solde fournisseur seront ajustés automatiquement. Bloqué si une partie du stock a déjà été vendue.
                </div>
              )}

              {/* Fournisseur */}
              {!ajoutId && !remplacerId && (
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <label className="label mb-0">Fournisseur</label>
                    <button type="button" onClick={() => { setShowNewFourn(v => !v); setNewFourn(emptyFourn); }}
                      className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 ml-auto">
                      {showNewFourn ? <><X size={12}/> Annuler</> : <><Plus size={12}/> Nouveau fournisseur</>}
                    </button>
                  </div>
                  <select className="input" value={form.fournisseur_id} onChange={e => setForm(f => ({...f, fournisseur_id: e.target.value}))}>
                    <option value="">-- Sélectionner --</option>
                    {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
                  </select>

                  {showNewFourn && (
                    <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                      <p className="text-xs font-semibold text-blue-700 mb-1">Nouveau fournisseur</p>
                      <input className="input text-sm" placeholder="Nom *" value={newFourn.nom}
                        onChange={e => setNewFourn(f => ({...f, nom: e.target.value}))} />
                      <div className="grid grid-cols-2 gap-2">
                        <input className="input text-sm" placeholder="Téléphone" value={newFourn.telephone}
                          onChange={e => setNewFourn(f => ({...f, telephone: e.target.value}))} />
                        <input className="input text-sm" placeholder="Email" value={newFourn.email}
                          onChange={e => setNewFourn(f => ({...f, email: e.target.value}))} />
                      </div>
                      <button type="button" onClick={creerFournisseur} disabled={savingFourn}
                        className="btn-primary text-sm py-1.5 flex items-center gap-1">
                        <Check size={14}/> {savingFourn ? 'Création...' : 'Créer & sélectionner'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Date de l'achat + Note */}
              {!ajoutId && !remplacerId && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label flex items-center gap-1"><Calendar size={12}/> Date de l'achat</label>
                    <input type="date" className="input" value={form.date_achat} onChange={e => setForm(f => ({...f, date_achat: e.target.value}))} />
                    <p className="text-xs text-gray-400 mt-1">Si différente d'aujourd'hui, sert au calcul des marges par période</p>
                  </div>
                  <div>
                    <label className="label">Note</label>
                    <input className="input" value={form.note} onChange={e => setForm(f => ({...f, note: e.target.value}))} placeholder="Référence BL, etc." />
                  </div>
                </div>
              )}

              {/* Recherche produit */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <label className="label mb-0">Ajouter un produit</label>
                  <button type="button" onClick={() => { setShowNewProd(v => !v); setNewProd({ ...emptyProd, nom: searchProd }); setNewFormat(emptyNewFormat); setSearchProd(''); }}
                    className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 ml-auto">
                    {showNewProd ? <><X size={12}/> Annuler</> : <><Plus size={12}/> Nouveau produit</>}
                  </button>
                </div>

                {!showNewProd && (
                  <>
                    <input className="input" placeholder="Rechercher un produit ou scanner un code-barres..." value={searchProd}
                      onChange={e => setSearchProd(e.target.value)} onKeyDown={handleSearchProdKey} />
                    {(filteredProds.length > 0 || searchProd.length >= 2) && (
                      <div className="border border-gray-200 rounded-lg mt-1 overflow-hidden">
                        {filteredProds.map(p => (
                          <button key={p.id} type="button" onClick={() => addLigne(p)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex justify-between border-b last:border-0">
                            <span>{p.nom} <span className="text-gray-400 text-xs">({p.code})</span></span>
                            <span className="text-gray-500">PA: {fmt(p.prix_achat)}</span>
                          </button>
                        ))}
                        {filteredProds.length === 0 && searchProd.length >= 2 && (
                          <button type="button"
                            onClick={() => { setShowNewProd(true); setNewProd({ ...emptyProd, nom: searchProd }); setNewFormat(emptyNewFormat); setSearchProd(''); }}
                            className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 flex items-center gap-1">
                            <Plus size={13}/> Créer le produit "{searchProd}"
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}

                {showNewProd && (
                  <div className="mt-1 p-3 bg-green-50 border border-green-200 rounded-lg space-y-2">
                    <p className="text-xs font-semibold text-green-700 mb-1">Nouveau produit</p>
                    <input className="input text-sm" placeholder="Nom du produit *" value={newProd.nom}
                      onChange={e => setNewProd(p => ({...p, nom: e.target.value}))} />
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-500 mb-0.5 block">Prix d'achat (pièce)</label>
                        <input className="input text-sm" placeholder="0" inputMode="numeric" value={newProd.prix_achat}
                          onChange={e => setNewProd(p => ({...p, prix_achat: e.target.value.replace(/[^0-9]/g,'')}))} />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-0.5 block">Prix de vente (pièce)</label>
                        <input className="input text-sm" placeholder="0" inputMode="numeric" value={newProd.prix_vente}
                          onChange={e => setNewProd(p => ({...p, prix_vente: e.target.value.replace(/[^0-9]/g,'')}))} />
                      </div>
                    </div>

                    <button type="button" onClick={() => setNewFormat(f => ({ ...f, actif: !f.actif }))}
                      className="text-xs text-green-700 hover:text-green-900 flex items-center gap-1 font-medium">
                      {newFormat.actif ? <><X size={12}/> Retirer le format</> : <><Plus size={12}/> Ce produit s'achète par carton (ou autre format)</>}
                    </button>

                    {newFormat.actif && (
                      <div className="p-2.5 bg-white border border-green-200 rounded-lg space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-gray-500 mb-0.5 block">Libellé du format</label>
                            <input className="input text-sm" placeholder="Carton" value={newFormat.libelle}
                              onChange={e => setNewFormat(f => ({...f, libelle: e.target.value}))} />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 mb-0.5 block">Nb de pièces par format</label>
                            <input className="input text-sm" placeholder="Ex: 48" inputMode="numeric" value={newFormat.contenance}
                              onChange={e => setNewFormat(f => ({...f, contenance: e.target.value.replace(/[^0-9]/g,'')}))} />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-gray-500 mb-0.5 block">Prix d'achat du format</label>
                            <input className="input text-sm" placeholder="0" inputMode="numeric" value={newFormat.prix_achat}
                              onChange={e => setNewFormat(f => ({...f, prix_achat: e.target.value.replace(/[^0-9]/g,'')}))} />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 mb-0.5 block">Prix de vente du format</label>
                            <input className="input text-sm" placeholder="0" inputMode="numeric" value={newFormat.prix_vente}
                              onChange={e => setNewFormat(f => ({...f, prix_vente: e.target.value.replace(/[^0-9]/g,'')}))} />
                          </div>
                        </div>
                        <p className="text-xs text-gray-400">Indépendant du prix à la pièce ci-dessus — les deux sont saisis à la main, sans calcul entre eux.</p>
                      </div>
                    )}

                    <button type="button" onClick={creerProduit} disabled={savingProd}
                      className="btn-primary text-sm py-1.5 flex items-center gap-1" style={{backgroundColor:'#16a34a'}}>
                      <Check size={14}/> {savingProd ? 'Création...' : 'Créer & ajouter à la liste'}
                    </button>
                  </div>
                )}
              </div>

              {form.lignes.length > 0 && (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Produit</th>
                        <th>Format reçu</th>
                        <th className="text-center">Qté</th>
                        <th title="Prix pour UN format entier (ex: le prix d'UN carton complet), pas le prix à la pièce — le prix à la pièce est calculé automatiquement dans la colonne Détail">Prix d'achat du format ⓘ</th>
                        <th title="Prix de vente pour UN format entier (ex: le carton complet) — saisi à la main, tel quel">Prix de vente du format ⓘ</th>
                        <th title="Prix de vente à la pièce — indépendant du format, saisi à la main, tel quel. C'est cette valeur qui détermine la marge dans les rapports et le tableau de bord">Prix de vente (pièce) ⓘ</th>
                        <th className="text-xs text-gray-400">Détail</th>
                        <th>Total</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.lignes.map((l, i) => {
                        const fmt_sel = l.formats[l.format_idx] || null;
                        const contenance = fmt_sel ? fmt_sel.contenance : 1;
                        const qte_total = (l.nb || 1) * contenance;
                        const prix_unit = contenance > 0 ? Math.round((l.prix || 0) / contenance) : (l.prix || 0);
                        return (
                          <tr key={i}>
                            <td className="font-medium">{l.nom}</td>
                            <td>
                              {l.formats.length > 0 ? (
                                <select className="input text-sm py-1" value={l.format_idx}
                                  onChange={e => updateFormatIdx(i, +e.target.value)}>
                                  {l.formats.map((f, fi) => (
                                    <option key={f.id} value={fi}>{f.libelle} ({f.contenance} u.)</option>
                                  ))}
                                </select>
                              ) : (
                                <span className="text-gray-400 text-sm italic">Unité</span>
                              )}
                            </td>
                            <td className="text-center">
                              <input type="text" inputMode="numeric" className="input w-16 text-center" value={l.nb}
                                onChange={e => updateLigne(i, 'nb', e.target.value.replace(/[^0-9]/g,'') || 1)} />
                            </td>
                            <td>
                              <input type="text" inputMode="numeric" className="input w-28" value={l.prix}
                                onChange={e => updateLigne(i, 'prix', e.target.value.replace(/[^0-9]/g,'') || 0)} />
                            </td>
                            <td>
                              <input type="text" inputMode="numeric" className={`input w-28 ${!l.prix_vente ? 'border-red-300' : ''}`} value={l.prix_vente}
                                onChange={e => updateLigne(i, 'prix_vente', e.target.value.replace(/[^0-9]/g,'') || 0)} />
                            </td>
                            <td>
                              <input type="text" inputMode="numeric" className={`input w-24 ${!l.prix_vente_piece ? 'border-red-300' : ''}`} value={l.prix_vente_piece}
                                onChange={e => updateLigne(i, 'prix_vente_piece', e.target.value.replace(/[^0-9]/g,'') || 0)} />
                            </td>
                            <td className="text-xs text-gray-400 whitespace-nowrap">
                              {qte_total} u. · PA {new Intl.NumberFormat('fr-FR').format(prix_unit)}/u
                            </td>
                            <td className="font-semibold">{fmt((l.nb || 1) * (l.prix || 0))}</td>
                            <td><button type="button" onClick={() => removeLigne(i)} className="text-red-400 hover:text-red-600"><Trash2 size={14}/></button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex justify-between items-center text-sm text-gray-600 border-t pt-3">
                <span>Sous-total articles</span><span>{fmt(sousTotalArticles)}</span>
              </div>
              {!ajoutId && !remplacerId && (
                <div>
                  <label className="label">Frais de livraison (FCFA) <span className="text-gray-400 font-normal text-xs">(si facturés par le fournisseur)</span></label>
                  <input type="text" inputMode="numeric" className="input" value={form.frais_livraison}
                    onChange={e => { const v = e.target.value.replace(/[^0-9]/g,''); setForm(f => ({...f, frais_livraison: v})); }}
                    placeholder="0" />
                </div>
              )}
              <div className="flex justify-between items-center font-bold text-lg border-t pt-3">
                <span>TOTAL{ajoutId ? ' DES ARTICLES AJOUTÉS' : remplacerId ? ' CORRIGÉ' : ''}</span>
                <span className="text-blue-700">{fmt((ajoutId || remplacerId) ? sousTotalArticles : total)}</span>
              </div>

              {/* Paiement : cash sur place ou à crédit — non pertinent en mode "ajout/correction d'articles" */}
              {!ajoutId && !remplacerId && (
                <div className="grid grid-cols-2 gap-3 bg-gray-50 rounded-xl p-4">
                  <div>
                    <label className="label text-xs">Mode de paiement</label>
                    <select className="input" value={form.mode_paiement} onChange={e => setForm(f => ({...f, mode_paiement: e.target.value}))}>
                      {['especes','mobile_money','carte','virement','cheque','credit'].map(m => <option key={m} value={m}>{m.replace(/_/g,' ')}</option>)}
                    </select>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-0.5">
                      <label className="label text-xs mb-0">Montant payé (FCFA)</label>
                      <button type="button" onClick={() => setForm(f => ({...f, montant_paye: total}))} className="text-xs text-blue-600 hover:text-blue-800">Payer cash</button>
                    </div>
                    <input type="text" inputMode="numeric" className="input" placeholder="0 (à crédit)"
                      value={form.montant_paye}
                      onChange={e => { const v = e.target.value.replace(/[^0-9]/g,''); setForm(f => ({...f, montant_paye: v === '' ? '' : +v})); }} />
                  </div>
                  {form.montant_paye > 0 && form.montant_paye < total && (
                    <p className="col-span-2 text-xs text-orange-600 font-medium">
                      Reste dû au fournisseur après cet achat : {fmt(total - form.montant_paye)}
                    </p>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button type="button" className="btn-secondary" onClick={() => { setModal(null); setAjoutId(null); setRemplacerId(null); }}>Annuler</button>
                <button type="submit" className="btn-primary">{remplacerId ? 'Enregistrer la correction' : ajoutId ? 'Ajouter ces articles' : "Enregistrer l'achat"}</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {detail && createPortal(
        <div className="fixed inset-0 z-50">
          <div className="bg-white rounded-2xl shadow-xl" style={{ position: "absolute", top: 16, left: "50%", transform: `translateX(-50%) translate(${detailModalDrag.offset.x}px, ${detailModalDrag.offset.y}px)`, width: "calc(100% - 32px)", maxWidth: 640, maxHeight: "calc(100vh - 32px)", overflowY: "auto" }}>
            <div onMouseDown={detailModalDrag.onMouseDown} className="flex items-center justify-between p-6 border-b cursor-move select-none">
              <h2 className="text-lg font-semibold">Achat {detail.numero}</h2>
              <button onClick={() => { setDetail(null); setEditAchat(null); }} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-500">Fournisseur: <strong>{detail.fournisseur_nom || '-'}</strong> · {new Date(detail.created_at).toLocaleString('fr-FR')}</p>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Produit</th><th>Qté</th><th>PU</th><th>Total</th></tr></thead>
                  <tbody>{detail.lignes?.map(l => <tr key={l.id}><td>{l.produit_nom}</td><td>{l.quantite}</td><td>{fmt(l.prix_unitaire)}</td><td>{fmt(l.total)}</td></tr>)}</tbody>
                </table>
              </div>
              {detail.frais_livraison > 0 && (
                <div className="flex justify-between text-sm text-gray-500 border-t pt-3"><span>Frais de livraison</span><span>{fmt(detail.frais_livraison)}</span></div>
              )}
              <div className="flex justify-between font-bold text-lg border-t pt-3"><span>TOTAL</span><span className="text-blue-700">{fmt(detail.total)}</span></div>
              <div className="flex justify-between text-sm text-gray-500"><span>Montant payé ({(detail.mode_paiement||'especes').replace(/_/g,' ')})</span><span>{fmt(detail.montant_paye)}</span></div>
              {detail.total - (detail.montant_paye || 0) > 0 && (
                <div className="flex justify-between text-sm text-orange-600 font-semibold"><span>Reste dû au fournisseur</span><span>{fmt(detail.total - (detail.montant_paye || 0))}</span></div>
              )}

              {!editAchat ? (
                <div className="border-t pt-4">
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={ouvrirAjoutArticles} className="btn-primary flex items-center gap-1.5">
                      <Plus size={14}/> Ajouter des articles
                    </button>
                    {featAchatsCorrection && (
                      <button onClick={ouvrirCorrigerLignes} className="btn-secondary text-amber-700 border-amber-200 hover:bg-amber-50 flex items-center gap-1.5">
                        <Edit size={14}/> Corriger les articles
                      </button>
                    )}
                    <button onClick={startEditAchat} className="btn-secondary">Corriger fournisseur/paiement</button>
                    {featAchatsCorrection && (
                      <button onClick={supprimerAchat} disabled={savingAchat} className="btn-secondary text-red-600 border-red-200 hover:bg-red-50 disabled:opacity-40 flex items-center gap-1.5">
                        <Trash2 size={14}/> Supprimer
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">"Ajouter" continue la facture. {featAchatsCorrection && '"Corriger les articles" change produit/qté/prix des lignes déjà saisies (bloqué si déjà vendu). '}"Corriger fournisseur/paiement" change les infos administratives.</p>
                </div>
              ) : (
                <div className="border-t pt-4 space-y-3 bg-gray-50 rounded-xl p-4">
                  <p className="text-sm font-semibold text-gray-700">Corriger l'achat</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Fournisseur</label>
                      <select className="input" value={editAchat.fournisseur_id} onChange={e => setEditAchat(a => ({...a, fournisseur_id: e.target.value}))}>
                        <option value="">-- Aucun --</option>
                        {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">Date de l'achat</label>
                      <input type="date" className="input" value={editAchat.date_achat} onChange={e => setEditAchat(a => ({...a, date_achat: e.target.value}))}/>
                    </div>
                    <div>
                      <label className="label">Mode de paiement</label>
                      <select className="input" value={editAchat.mode_paiement} onChange={e => setEditAchat(a => ({...a, mode_paiement: e.target.value}))}>
                        <option value="especes">Espèces</option>
                        <option value="mobile_money">Mobile Money</option>
                        <option value="virement">Virement</option>
                        <option value="cheque">Chèque</option>
                      </select>
                    </div>
                    <div>
                      <label className="label">Montant payé</label>
                      <input type="number" min="0" className="input" value={editAchat.montant_paye} onChange={e => setEditAchat(a => ({...a, montant_paye: e.target.value}))}/>
                    </div>
                    <div>
                      <label className="label">Frais de livraison</label>
                      <input type="number" min="0" className="input" value={editAchat.frais_livraison} onChange={e => setEditAchat(a => ({...a, frais_livraison: e.target.value}))}/>
                    </div>
                  </div>
                  <div>
                    <label className="label">Note</label>
                    <input className="input" value={editAchat.note} onChange={e => setEditAchat(a => ({...a, note: e.target.value}))}/>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button className="btn-secondary" onClick={() => setEditAchat(null)}>Annuler</button>
                    <button className="btn-primary disabled:opacity-40" disabled={savingAchat} onClick={saveEditAchat}>
                      {savingAchat ? 'Enregistrement...' : 'Enregistrer la correction'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
