import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Search, Edit, Trash2, Package, RefreshCw, Layers, X as XIcon, Camera, Eye, Barcode } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useDraggable } from '../hooks/useDraggable';

function Modal({ title, onClose, children }) {
  const { offset, onMouseDown } = useDraggable();
  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        className="absolute bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-y-auto"
        style={{ top: 16, left: '50%', transform: `translateX(-50%) translate(${offset.x}px, ${offset.y}px)`, width: 'calc(100% - 32px)', maxWidth: 672, maxHeight: 'calc(100vh - 32px)' }}
        onClick={e => e.stopPropagation()}
      >
        <div onMouseDown={onMouseDown} className="flex items-center justify-between p-6 border-b sticky top-0 bg-white z-10 rounded-t-2xl cursor-move select-none">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>,
    document.body
  );
}

// Génère un code produit à partir du nom de catégorie et du nom du produit
// Format : [3 lettres cat]-[3 lettres nom]-[séquence 3 chiffres]
// Ex: Boissons + Coca-Cola → BOI-COC-001
function genererCode(catNom, prodNom, existingCodes = []) {
  const clean = (str) =>
    (str || '')
      .toUpperCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')  // supprimer les accents
      .replace(/[^A-Z0-9]/g, '')        // garder seulement lettres et chiffres
      .substring(0, 3)
      .padEnd(3, 'X');

  const prefix = `${clean(catNom)}-${clean(prodNom)}`;
  const existing = existingCodes.filter(c => c && c.startsWith(prefix));
  const nums = existing.map(c => parseInt(c.slice(-3)) || 0);
  const seq = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `${prefix}-${String(seq).padStart(3, '0')}`;
}

const emptyForm = {
  code: '', nom: '', description: '', categorie_id: '', marque: '', code_barres: '',
  unite: 'pièce', prix_achat: '', prix_vente: '', prix_revendeur: '', prix_grossiste: '',
  qte_min: 5, qte_max: 1000, qte_actuelle: 0, emplacement: '', date_expiration: '',
  is_fictif: false
};

export default function Produits() {
  const [produits, setProduits] = useState([]);
  const [categories, setCategories] = useState([]);
  const [condMap, setCondMap] = useState({});
  const [societe, setSociete] = useState({});
  const featVenteConditionnement = societe.feat_vente_conditionnement !== 0; // désactivable par le Super Admin
  const [search, setSearch] = useState('');
  const [filtre, setFiltre] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [codeAuto, setCodeAuto] = useState(true); // mode auto-génération activé
  const [loading, setLoading] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [newCatInput, setNewCatInput] = useState('');
  const [newCatOpen, setNewCatOpen] = useState(false);
  const ficheProduitDrag = useDraggable();
  const [newProdConds, setNewProdConds] = useState([]);
  const [existingConds, setExistingConds] = useState([]); // conditionnements réels du produit en édition (avec id)
  const [initialQteActuelle, setInitialQteActuelle] = useState(0); // pour calculer le delta de stock à l'édition
  const [bouteillesParCarton, setBouteillesParCarton] = useState(24);
  const [prixAchatCarton, setPrixAchatCarton] = useState('');
  const [prixVenteCarton, setPrixVenteCarton] = useState('');
  // Stock de départ saisi directement en cartons — nombre brut tapé par l'utilisateur, converti
  // en pièces au moment d'enregistrer (pas à la saisie), pour ne jamais dépendre de l'ordre
  // dans lequel "Unités par carton" et "Stock initial" sont remplis.
  const [stockInitialCartons, setStockInitialCartons] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const photoInputRef = useRef(null);
  const [condModal, setCondModal] = useState(null); // { produit, conds, form }
  const [ficheProduit, setFicheProduit] = useState(null); // fiche produit en lecture seule
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [genCarton, setGenCarton] = useState({ n: '', prix: '' });
  const emptyCondForm = { libelle: '', contenance: 1, prix_vente: '', ordre: 0 };
  const PRESETS_COND = [
    { libelle: 'Bouteille',  contenance: 1 },
    { libelle: '¼ Carton',  contenance: 6 },
    { libelle: '½ Carton',  contenance: 12 },
    { libelle: 'Carton',    contenance: 24 },
  ];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (filtre) params.alerte = filtre;
      const [pRes, catRes, condsRes] = await Promise.all([api.get('/produits', { params }), api.get('/categories'), api.get('/conditionnements')]);
      setProduits(pRes.data);
      setCategories(catRes.data);
      const map = {};
      condsRes.data.forEach(cd => { if (!map[cd.produit_id]) map[cd.produit_id] = []; map[cd.produit_id].push(cd); });
      setCondMap(map);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  }, [search, filtre]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get('/config/societe').then(r => setSociete(r.data)).catch(() => {}); }, []);

  // Recalcule le code automatiquement si le nom ou la catégorie change (en mode add seulement)
  useEffect(() => {
    if (modal !== 'add' || !codeAuto) return;
    if (!form.nom && !form.categorie_id) return;

    const cat = categories.find(c => String(c.id) === String(form.categorie_id));
    const catNom = cat ? cat.nom : 'ART';
    const prodNom = form.nom || 'XXX';
    const existingCodes = produits.map(p => p.code);
    const newCode = genererCode(catNom, prodNom, existingCodes);
    setForm(prev => ({ ...prev, code: newCode }));
  }, [form.nom, form.categorie_id, modal, codeAuto]);

  async function creerCategorie() {
    const nom = newCatInput.trim();
    if (!nom) return;
    try {
      const res = await api.post('/categories', { nom });
      const [p, c] = await Promise.all([api.get('/produits'), api.get('/categories')]);
      setProduits(p.data);
      setCategories(c.data);
      setForm(prev => ({ ...prev, categorie_id: res.data.id }));
      setNewCatInput('');
      setNewCatOpen(false);
      toast.success(`Famille "${nom}" créée`);
    } catch (err) { toast.error(err.response?.data?.message || 'Erreur'); }
  }

  function openAdd() {
    const existingCodes = produits.map(p => p.code);
    const codeInitial   = genererCode('ART', 'NOU', existingCodes);
    setForm({ ...emptyForm, code: codeInitial });
    setCodeAuto(true);
    setNewProdConds([]);
    setExistingConds([]);
    setInitialQteActuelle(0);
    setBouteillesParCarton(24);
    setPrixAchatCarton('');
    setPrixVenteCarton('');
    setStockInitialCartons('');
    setNewCatOpen(false);
    setNewCatInput('');
    setShowAdvanced(false);
    setImageFile(null);
    setImagePreview(null);
    setModal('add');
  }

  function handleImageSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = ev => setImagePreview(ev.target.result);
    reader.readAsDataURL(file);
  }

  async function uploadPhoto(produitId) {
    if (!imageFile) return;
    const fd = new FormData();
    fd.append('photo', imageFile);
    await api.post(`/produits/${produitId}/photo`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  }

  // Le format "Carton" (Unités par carton / Prix d'achat du carton / Prix de vente du carton)
  // est saisi ici directement — le format "Carton" suit toujours exactement ces 2 champs
  // (c'est littéralement le même prix, pas une dérivation). Pour un NOUVEAU produit, les 3
  // autres formats (Bouteille/¼/½ Carton) sont créés en même temps avec une suggestion de
  // prix — pratique, comme avant — mais UNE SEULE FOIS : dès qu'un format a un prix, cet
  // effet ne le touche plus jamais, même si le prix du carton change ensuite. Rien n'est donc
  // recalculé/écrasé après coup ; seule la contenance suit "Unités par carton" en direct.
  useEffect(() => {
    const pac = parseFloat(prixAchatCarton) || 0;
    const pvc = parseFloat(prixVenteCarton) || 0;
    if (pac <= 0 && pvc <= 0) return;
    const n = Math.max(1, parseInt(bouteillesParCarton) || 24);
    const quart = Math.max(1, Math.round(n / 4));
    const demi  = Math.max(1, Math.round(n / 2));
    setNewProdConds(prev => {
      const byLibelle = new Map(prev.map(c => [c.libelle, c]));

      // Carton : toujours synchronisé, jamais "figé" — ce sont littéralement les 2 champs ci-dessus.
      byLibelle.set('Carton', { ...(byLibelle.get('Carton') || { ordre: 3 }), libelle: 'Carton', contenance: n, prix_achat: pac, prix_vente: pvc });

      // Bouteille/¼/½ : suggestion de prix qui suit le prix du carton PENDANT la saisie (sinon
      // elle reste figée sur la toute première frappe, ex: "1" tapé avant "10000" → arrondi à
      // 0 pour toujours) — mais seulement tant que l'utilisateur n'a pas modifié ce format lui-
      // même à la main (propriété "manuel"). Dès qu'il touche un format, la suggestion s'arrête
      // net pour celui-là et son prix ne bouge plus jamais tout seul. Uniquement à la création
      // d'un nouveau produit (pas en modification, pour ne pas rajouter des formats à un
      // produit existant qui n'en avait pas).
      if (modal === 'add') {
        const suggererOuGarder = (libelle, contenance, ordre) => {
          const existant = byLibelle.get(libelle);
          if (existant?.manuel) { byLibelle.set(libelle, { ...existant, contenance }); return; }
          byLibelle.set(libelle, {
            libelle, contenance, ordre, manuel: false,
            prix_vente: pvc > 0 ? Math.round(pvc * contenance / n) : 0,
            prix_achat: pac > 0 ? Math.round(pac * contenance / n) : 0,
          });
        };
        suggererOuGarder('Bouteille', 1, 0);
        suggererOuGarder('¼ Carton', quart, 1);
        suggererOuGarder('½ Carton', demi, 2);
      }

      return Array.from(byLibelle.values());
    });
  }, [prixAchatCarton, prixVenteCarton, bouteillesParCarton, modal]);

  // Stock de départ saisi en cartons : convertit en pièces (form.qte_actuelle) à chaque
  // changement, quel que soit l'ordre dans lequel "Unités par carton" et "Stock initial" sont
  // remplis — avant, si "Stock initial" était tapé avant "Unités par carton", la conversion se
  // faisait avec la mauvaise contenance (souvent la valeur par défaut 24) et donnait un nombre
  // de pièces faux, silencieusement.
  useEffect(() => {
    if (stockInitialCartons === '' || bouteillesParCarton <= 0) return;
    const cartons = parseInt(stockInitialCartons) || 0;
    setForm(f => ({ ...f, qte_actuelle: cartons * bouteillesParCarton }));
  }, [stockInitialCartons, bouteillesParCarton]);

  // Ordre d'affichage fixe (du plus petit au plus grand), indépendant de l'ordre dans lequel
  // les boutons "+" sont cliqués — sinon cliquer "½ Carton" avant "¼ Carton" les affichait
  // dans le mauvais sens à la Caisse.
  const ORDRE_LIBELLE = { 'Bouteille': 0, '¼ Carton': 1, '½ Carton': 2, 'Carton': 3 };

  function ajouterCondCreation(preset) {
    if (newProdConds.find(c => c.libelle === preset.libelle)) return;
    // manuel:false — cliquer "+" ajoute juste la ligne, ça ne compte PAS comme un prix tapé à
    // la main. Si le prix du carton est renseigné ensuite, la suggestion doit encore pouvoir
    // remplir ce format (sinon il reste bloqué à 0 pour toujours, comme observé sur un produit
    // où ¼/½ avaient été ajoutés via ce bouton avant que le prix du carton soit tapé).
    setNewProdConds(prev => [...prev, { libelle: preset.libelle, contenance: preset.contenance, prix_vente: 0, prix_achat: 0, manuel: false, ordre: ORDRE_LIBELLE[preset.libelle] ?? prev.length }]);
  }

  function supprimerCondCreation(libelle) {
    setNewProdConds(prev => prev.filter(c => c.libelle !== libelle));
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }

  function updatePrixCondCreation(libelle, prix) {
    const val = parseFloat(prix) || 0;
    // Le prix de vente par format (Bouteille/¼/½/Carton) est totalement indépendant
    // du "Prix de vente à l'unité" — modifier l'un ne touche plus l'autre. "manuel: true"
    // arrête définitivement la suggestion automatique pour CE format précis.
    setNewProdConds(prev => prev.map(c => c.libelle === libelle ? { ...c, prix_vente: val, manuel: true } : c));
  }

  async function openEdit(p) {
    setForm({
      ...p,
      prix_vente:     p.prix_vente     ?? '',
      prix_achat:     p.prix_achat     ?? '',
      prix_revendeur: p.prix_revendeur ?? '',
      prix_grossiste: p.prix_grossiste ?? '',
      qte_min:        p.qte_min        ?? '',
      qte_max:        p.qte_max        ?? '',
      tva:            p.tva            ?? '',
      date_expiration: p.date_expiration ? p.date_expiration.split('T')[0] : '',
    });
    setCodeAuto(false);
    setImageFile(null);
    setImagePreview(null);
    setInitialQteActuelle(p.qte_actuelle || 0);

    // Précharger les formats de carton existants (mêmes infos qu'à la création)
    try {
      const res = await api.get(`/produits/${p.id}/conditionnements`);
      const conds = res.data || [];
      setExistingConds(conds);
      // manuel:true — un format déjà enregistré ne doit jamais être touché par la suggestion
      // automatique (de toute façon inactive en modification, mais on protège quand même).
      setNewProdConds(conds.map(c => ({ id: c.id, libelle: c.libelle, contenance: c.contenance, prix_vente: c.prix_vente, prix_achat: c.prix_achat, manuel: true, ordre: c.ordre })));
      const cartonCond = conds.reduce((max, c) => (!max || c.contenance > max.contenance) ? c : max, null);
      if (cartonCond && cartonCond.contenance > 1) {
        setBouteillesParCarton(cartonCond.contenance);
        // Relit le prix du carton tel qu'enregistré sur CE format — ne jamais le recalculer
        // depuis le prix à la pièce, sinon un arrondi (ex: 9500/24=395,8→396) revient au
        // carton sous une valeur différente de celle réellement saisie (ex: 396×24=9504≠9500).
        setPrixVenteCarton(cartonCond.prix_vente ? String(cartonCond.prix_vente) : '');
        setPrixAchatCarton(cartonCond.prix_achat ? String(cartonCond.prix_achat) : '');
        setStockInitialCartons(p.qte_actuelle > 0 ? String(Math.round(p.qte_actuelle / cartonCond.contenance)) : '');
      } else {
        setBouteillesParCarton(24);
        setPrixVenteCarton('');
        setPrixAchatCarton('');
        setStockInitialCartons('');
      }
    } catch {
      setExistingConds([]);
      setNewProdConds([]);
      setBouteillesParCarton(24);
      setPrixVenteCarton('');
      setPrixAchatCarton('');
      setStockInitialCartons('');
    }

    setModal('edit');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    // Le prix à la pièce et les prix par format restent des champs indépendants pendant la
    // saisie — mais pour un magasin qui ne vend JAMAIS à la pièce et ne connaît/veut jamais
    // renseigner ce prix, on calcule le prix à la pièce EXACT (avec décimales, sans arrondi)
    // depuis le prix du carton UNIQUEMENT si le champ à la pièce a été laissé vide. C'est ce
    // prix exact qui sert en interne à valoriser le stock et l'achat lié au stock de départ —
    // il n'est jamais réaffiché comme un champ "arrondi" qui pourrait dériver.
    const payload = { ...form };
    if ((!payload.prix_achat || payload.prix_achat === '') && parseFloat(prixAchatCarton) > 0 && bouteillesParCarton > 0) {
      payload.prix_achat = parseFloat(prixAchatCarton) / bouteillesParCarton;
    }
    if ((!payload.prix_vente || payload.prix_vente === '') && parseFloat(prixVenteCarton) > 0 && bouteillesParCarton > 0) {
      payload.prix_vente = parseFloat(prixVenteCarton) / bouteillesParCarton;
    }
    try {
      let produitId = form.id;
      if (modal === 'add') {
        const res = await api.post('/produits', payload);
        produitId = res.data.id;
        for (const c of newProdConds) {
          await api.post('/conditionnements', { produit_id: produitId, ...c });
        }
        toast.success('Produit créé' + (newProdConds.length > 0 ? ` avec ${newProdConds.length} format(s)` : ''));
      } else {
        await api.put(`/produits/${form.id}`, payload);
        // Synchroniser les formats de carton : mise à jour, création, suppression
        for (const c of newProdConds) {
          const existant = existingConds.find(ec => ec.libelle === c.libelle);
          if (existant) await api.put(`/conditionnements/${existant.id}`, c);
          else await api.post('/conditionnements', { produit_id: form.id, ...c });
        }
        for (const ec of existingConds) {
          if (!newProdConds.find(c => c.libelle === ec.libelle)) {
            await api.delete(`/conditionnements/${ec.id}`);
          }
        }
        // Ajustement de stock si la quantité a changé (garde la traçabilité des mouvements)
        const delta = (form.qte_actuelle || 0) - initialQteActuelle;
        if (delta !== 0) {
          await api.post(`/produits/${form.id}/stock`, {
            quantite: Math.abs(delta),
            type: delta > 0 ? 'entree' : 'sortie',
            motif: 'Ajustement depuis la fiche produit',
          });
        }
        toast.success('Produit mis à jour');
      }
      if (imageFile) await uploadPhoto(produitId);
      setModal(null);
      setImageFile(null);
      setImagePreview(null);
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Erreur'); }
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/produits/${id}`);
      toast.success('Produit supprimé');
      setConfirmDeleteId(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Erreur');
      setConfirmDeleteId(null);
    }
  }

  function regenererCode() {
    const cat = categories.find(c => String(c.id) === String(form.categorie_id));
    const catNom = cat ? cat.nom : 'ART';
    const prodNom = form.nom || 'XXX';
    const existingCodes = produits.map(p => p.code);
    setForm(prev => ({ ...prev, code: genererCode(catNom, prodNom, existingCodes) }));
  }

  async function ouvrirConditionnements(prod) {
    const res = await api.get(`/produits/${prod.id}/conditionnements`);
    setCondModal({ produit: prod, conds: res.data, form: { ...emptyCondForm, prix_vente: '' } });
  }

  async function ajouterConditionnement(e) {
    e.preventDefault();
    if (!condModal) return;
    const { form, produit } = condModal;
    try {
      await api.post('/conditionnements', {
        produit_id: produit.id,
        libelle: form.libelle,
        contenance: form.contenance,
        prix_vente: form.prix_vente,
        ordre: form.ordre,
      });
      const res = await api.get(`/produits/${produit.id}/conditionnements`);
      setCondModal(prev => ({ ...prev, conds: res.data, form: { ...emptyCondForm, prix_vente: '' } }));
      toast.success('Conditionnement ajouté');
    } catch (err) { toast.error(err.response?.data?.message || 'Erreur'); }
  }

  async function supprimerConditionnement(id) {
    if (!condModal) return;
    await api.delete(`/conditionnements/${id}`);
    const res = await api.get(`/produits/${condModal.produit.id}/conditionnements`);
    setCondModal(prev => ({ ...prev, conds: res.data }));
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    toast.success('Supprimé');
  }

  async function genererFormats() {
    if (!condModal) return;
    const n = parseInt(genCarton.n) || 0;
    const prixCarton = parseFloat(genCarton.prix) || 0;
    if (n < 2) return toast.error('Entrez le nombre d\'unités par carton (ex: 48)');
    if (prixCarton <= 0) return toast.error('Entrez le prix de vente du carton');
    const quart = Math.max(1, Math.round(n / 4));
    const demi  = Math.max(1, Math.round(n / 2));
    // Libellés suffixés par la taille du carton pour pouvoir faire cohabiter
    // plusieurs tailles de carton (24, 48...) sur le même produit.
    const formats = [
      { libelle: 'Bouteille',       contenance: 1,     prix_vente: Math.round(prixCarton / n), ordre: 0 },
      { libelle: `¼ Carton ${n}`,   contenance: quart, prix_vente: Math.round(prixCarton / 4), ordre: 1 },
      { libelle: `½ Carton ${n}`,   contenance: demi,  prix_vente: Math.round(prixCarton / 2), ordre: 2 },
      { libelle: `Carton ${n}`,     contenance: n,     prix_vente: prixCarton,                 ordre: 3 },
    ];
    try {
      for (const f of formats) {
        const existant = condModal.conds.find(c => c.libelle === f.libelle);
        if (existant) await api.put(`/conditionnements/${existant.id}`, f);
        else await api.post('/conditionnements', { produit_id: condModal.produit.id, ...f });
      }
      const res = await api.get(`/produits/${condModal.produit.id}/conditionnements`);
      setCondModal(prev => ({ ...prev, conds: res.data }));
      toast.success(`Formats pour carton de ${n} générés !`);
    } catch (err) { toast.error(err.response?.data?.message || 'Erreur'); }
  }

  function appliquerPreset(preset) {
    const pv = condModal?.produit?.prix_vente || 0;
    setCondModal(prev => ({
      ...prev,
      form: {
        ...prev.form,
        libelle: preset.libelle,
        contenance: preset.contenance,
        prix_vente: Math.round(pv * preset.contenance),
      }
    }));
  }

  const f = v => v != null ? new Intl.NumberFormat('fr-FR').format(v) : '-';

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2"><Package size={22}/> Produits</h1>
          <p className="page-sub">{produits.length} article{produits.length !== 1 ? 's' : ''} dans le catalogue</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => load()} className="btn-secondary flex items-center gap-1.5" title="Actualiser la liste">
            <RefreshCw size={14}/> Actualiser
          </button>
          {produits.some(p => p.is_fictif) && (
            <button onClick={async () => {
              try {
                const res = await api.delete('/produits/fictifs');
                toast.success(res.data.message);
                load();
              } catch { toast.error('Erreur lors de la purge'); }
            }} className="btn-secondary text-red-600 border-red-200 hover:bg-red-50">
              Purger les fictifs
            </button>
          )}
          <button onClick={openAdd} className="btn-primary">
            <Plus size={16}/> Nouveau produit
          </button>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"/>
          <input className="input pl-10" placeholder="Rechercher par nom, code, code-barres..." value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
        <select className="input sm:w-52" value={filtre} onChange={e => setFiltre(e.target.value)}>
          <option value="">Tous les produits</option>
          <option value="rupture">En rupture</option>
          <option value="faible">Stock faible</option>
          <option value="expire">Expirés</option>
        </select>
      </div>

      {/* Table */}
      <div className="table-wrap">
        <table className="table">
          <thead><tr>
            <th className="w-10"></th>
            <th>Produit</th>
            <th>Prix vente</th>
            <th>Stock (unités)</th>
            <th>En cartons</th>
            <th>Statut</th>
            <th>Actions</th>
          </tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="7" className="text-center py-12 text-gray-400">Chargement...</td></tr>
            ) : produits.length === 0 ? (
              <tr><td colSpan="7" className="text-center py-12 text-gray-400">Aucun produit trouvé</td></tr>
            ) : produits.map(p => {
              const stockStatus = p.qte_actuelle === 0 ? 'badge-red' : p.qte_actuelle <= p.qte_min ? 'badge-yellow' : 'badge-green';
              const stockLabel = p.qte_actuelle === 0 ? 'Rupture' : p.qte_actuelle <= p.qte_min ? 'Faible' : 'OK';
              const conds = condMap[p.id] || [];
              const cartonCond = conds.reduce((max, c) => (!max || c.contenance > max.contenance) ? c : max, null);
              const qtCartons = cartonCond && cartonCond.contenance > 1 ? Math.floor(p.qte_actuelle / cartonCond.contenance) : null;
              const qtReste = cartonCond && cartonCond.contenance > 1 ? p.qte_actuelle % cartonCond.contenance : null;
              return (
                <tr key={p.id}>
                  <td className="w-10">
                    {p.photo
                      ? <img src={p.photo} alt={p.nom} className="w-10 h-10 object-cover rounded-lg border border-gray-200" />
                      : <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center"><Package size={16} className="text-gray-300"/></div>
                    }
                  </td>
                  <td>
                    <div className="font-medium flex items-center gap-2">
                      {p.nom}
                      {p.is_fictif ? <span className="text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full font-normal">Fictif</span> : null}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                      <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{p.code}</span>
                      {p.categorie_nom && <span>{p.categorie_nom}</span>}
                      {p.marque && <span>· {p.marque}</span>}
                    </div>
                  </td>
                  <td className="font-semibold text-blue-700">{f(p.prix_vente)}</td>
                  <td><span className={stockStatus + ' badge'}>{p.qte_actuelle} {stockLabel}</span></td>
                  <td>
                    {qtCartons !== null
                      ? <span className="font-semibold text-gray-800">{qtCartons} <span className="text-xs text-gray-400 font-normal">ctn{qtReste > 0 ? ` + ${qtReste}` : ''}</span></span>
                      : <span className="text-gray-300">—</span>
                    }
                  </td>
                  <td><span className={p.actif ? 'badge-green' : 'badge-red'}>{p.actif ? 'Actif' : 'Inactif'}</span></td>
                  <td>
                    {confirmDeleteId === p.id ? (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-red-600 font-medium">Confirmer ?</span>
                        <button onClick={() => handleDelete(p.id)} className="text-xs bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600">Oui</button>
                        <button onClick={() => setConfirmDeleteId(null)} className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded hover:bg-gray-300">Non</button>
                      </div>
                    ) : (
                      <div className="flex gap-1">
                        <button onClick={() => setFicheProduit(p)} className="text-gray-600 hover:bg-gray-50 p-1.5 rounded" title="Fiche produit"><Eye size={15}/></button>
                        <button onClick={() => openEdit(p)} className="text-blue-600 hover:bg-blue-50 p-1.5 rounded" title="Modifier"><Edit size={15}/></button>
                        {featVenteConditionnement && (
                          <button onClick={() => ouvrirConditionnements(p)} className="text-purple-600 hover:bg-purple-50 p-1.5 rounded" title="Conditionnements"><Layers size={15}/></button>
                        )}
                        <button onClick={() => setConfirmDeleteId(p.id)} className="text-red-500 hover:bg-red-50 p-1.5 rounded" title="Supprimer"><Trash2 size={15}/></button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">{produits.length} produit(s)</p>

      {/* ═══════════ FICHE PRODUIT (lecture seule) ═══════════ */}
      {ficheProduit && (() => {
        const conds = condMap[ficheProduit.id] || [];
        const cartonCond = conds.reduce((max, c) => (!max || c.contenance > max.contenance) ? c : max, null);
        const prixAchatCarton = cartonCond ? Math.round((ficheProduit.prix_achat || 0) * cartonCond.contenance) : null;
        return createPortal(
          <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={() => setFicheProduit(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mt-6"
              style={{ transform: `translate(${ficheProduitDrag.offset.x}px, ${ficheProduitDrag.offset.y}px)` }}
              onClick={e => e.stopPropagation()}>
              <div onMouseDown={ficheProduitDrag.onMouseDown} className="flex items-center justify-between p-5 border-b cursor-move select-none">
                <h2 className="text-lg font-semibold flex items-center gap-2"><Package size={18}/> Fiche produit</h2>
                <button onClick={() => setFicheProduit(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
              </div>
              <div className="p-5 space-y-4">
                <div className="flex items-center gap-3">
                  {ficheProduit.photo
                    ? <img src={ficheProduit.photo} alt={ficheProduit.nom} className="w-16 h-16 object-cover rounded-xl border border-gray-200"/>
                    : <div className="w-16 h-16 bg-gray-100 rounded-xl flex items-center justify-center"><Package size={24} className="text-gray-300"/></div>
                  }
                  <div>
                    <p className="text-lg font-bold text-gray-900">{ficheProduit.nom}</p>
                    <p className="text-xs text-gray-400">{ficheProduit.categorie_nom || 'Sans catégorie'}{ficheProduit.marque ? ` · ${ficheProduit.marque}` : ''}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-gray-50 rounded-lg px-3 py-2">
                    <p className="text-xs text-gray-400">Code produit</p>
                    <p className="font-mono font-semibold text-gray-800">{ficheProduit.code}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg px-3 py-2">
                    <p className="text-xs text-gray-400 flex items-center gap-1"><Barcode size={11}/> Code-barres</p>
                    <p className="font-mono font-semibold text-gray-800">{ficheProduit.code_barres || '—'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-blue-50 rounded-lg px-3 py-2">
                    <p className="text-xs text-blue-400">Prix de vente (unité)</p>
                    <p className="font-bold text-blue-700">{f(ficheProduit.prix_vente)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg px-3 py-2">
                    <p className="text-xs text-gray-400">Prix d'achat (unité)</p>
                    <p className="font-semibold text-gray-700">{f(ficheProduit.prix_achat)}</p>
                  </div>
                </div>

                <div className="border border-purple-200 rounded-xl p-3 bg-purple-50/40">
                  <p className="text-xs font-semibold text-purple-700 flex items-center gap-1 mb-2"><Layers size={12}/> Conditionnement principal (carton)</p>
                  {cartonCond ? (
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <p className="text-xs text-gray-400">Format</p>
                        <p className="font-semibold text-gray-800">{cartonCond.libelle} ({cartonCond.contenance}u)</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Prix d'achat carton</p>
                        <p className="font-semibold text-gray-800">{f(prixAchatCarton)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Prix de vente carton</p>
                        <p className="font-semibold text-green-700">{f(cartonCond.prix_vente)}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">Aucun conditionnement carton configuré pour ce produit.</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-gray-400">Stock actuel</p>
                    <p className="font-semibold text-gray-800">{ficheProduit.qte_actuelle} {ficheProduit.unite || 'unité(s)'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Emplacement</p>
                    <p className="font-semibold text-gray-800">{ficheProduit.emplacement || '—'}</p>
                  </div>
                </div>

                {ficheProduit.description && (
                  <div>
                    <p className="text-xs text-gray-400">Description</p>
                    <p className="text-sm text-gray-700">{ficheProduit.description}</p>
                  </div>
                )}
              </div>
              <div className="p-5 pt-0 flex gap-2">
                <button onClick={() => { const p = ficheProduit; setFicheProduit(null); openEdit(p); }} className="btn-primary flex-1 justify-center">
                  <Edit size={14}/> Modifier
                </button>
                <button onClick={() => setFicheProduit(null)} className="btn-secondary flex-1 justify-center">Fermer</button>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}

      {/* ═══════════ MODAL CONDITIONNEMENTS ═══════════ */}
      {condModal && createPortal(
        <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setCondModal(null)}>
          <div
            className="absolute bg-white rounded-2xl shadow-xl overflow-y-auto"
            style={{ top: 16, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 512, maxHeight: 'calc(100vh - 32px)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <Layers size={18} className="text-purple-600"/> Conditionnements
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">{condModal.produit.nom}</p>
              </div>
              <button onClick={() => setCondModal(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <div className="p-5 space-y-5">

              {/* ── Générateur automatique 4 formats ── */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
                <p className="text-xs font-bold text-blue-800">⚡ Générer les 4 formats automatiquement</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-600 mb-0.5 block">Unités par carton</label>
                    <input type="text" inputMode="numeric" className="input text-sm text-center font-bold"
                      placeholder="Ex: 48" value={genCarton.n}
                      onChange={e => setGenCarton(g => ({ ...g, n: e.target.value.replace(/[^0-9]/g,'') }))} />
                    <div className="flex gap-1 mt-1">
                      {[6,12,24,48].map(n => (
                        <button key={n} type="button" onClick={() => setGenCarton(g => ({ ...g, n: String(n) }))}
                          className={`flex-1 text-xs py-1 rounded-lg border transition-colors
                            ${String(n)===genCarton.n ? 'border-blue-500 bg-blue-100 text-blue-700 font-semibold' : 'border-gray-200 text-gray-500 hover:border-blue-300'}`}>
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 mb-0.5 block">Prix vente carton (FCFA)</label>
                    <input type="text" inputMode="numeric" className="input text-sm"
                      placeholder="Ex: 14000" value={genCarton.prix}
                      onChange={e => setGenCarton(g => ({ ...g, prix: e.target.value.replace(/[^0-9]/g,'') }))} />
                  </div>
                </div>
                {genCarton.n && genCarton.prix && (
                  <div className="text-xs text-blue-700 space-y-0.5">
                    {(() => { const n=+genCarton.n||1; const p=+genCarton.prix||0; return (<>
                      <p>Bouteille : {new Intl.NumberFormat('fr-FR').format(Math.round(p/n))} FCFA</p>
                      <p>¼ Carton ({Math.round(n/4)} u.) : {new Intl.NumberFormat('fr-FR').format(Math.round(p/4))} FCFA</p>
                      <p>½ Carton ({Math.round(n/2)} u.) : {new Intl.NumberFormat('fr-FR').format(Math.round(p/2))} FCFA</p>
                      <p>Carton ({n} u.) : {new Intl.NumberFormat('fr-FR').format(p)} FCFA</p>
                    </>); })()}
                  </div>
                )}
                <button type="button" onClick={genererFormats}
                  className="w-full btn-primary text-sm py-1.5 justify-center">
                  Générer / mettre à jour ces formats
                </button>
                <p className="text-[11px] text-blue-600">
                  Astuce : un même produit peut avoir plusieurs tailles de carton (ex: 24 et 48) —
                  générez d'abord pour 24, puis changez le nombre pour 48 et générez à nouveau, les deux cohabiteront.
                </p>
              </div>

              {/* Presets */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Modèles rapides (boissons)</p>
                <div className="flex flex-wrap gap-2">
                  {PRESETS_COND.map(preset => (
                    <button
                      key={preset.libelle}
                      type="button"
                      onClick={() => appliquerPreset(preset)}
                      className="px-3 py-1.5 rounded-lg border border-purple-200 bg-purple-50 text-purple-700 text-xs font-semibold hover:bg-purple-100 transition-colors"
                    >
                      {preset.libelle} ({preset.contenance} u.)
                    </button>
                  ))}
                </div>
              </div>

              {/* Formulaire ajout */}
              <form onSubmit={ajouterConditionnement} className="bg-gray-50 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Ajouter un format</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="label text-xs">Libellé (ex: Bouteille, ½ Carton, Carton)</label>
                    <input
                      className="input text-sm"
                      value={condModal.form.libelle}
                      onChange={e => setCondModal(prev => ({ ...prev, form: { ...prev.form, libelle: e.target.value } }))}
                      placeholder="Bouteille, ¼ Carton, Carton..."
                      required
                    />
                  </div>
                  <div>
                    <label className="label text-xs">Contenu (nb d'unités de base)</label>
                    <input
                      type="text" inputMode="numeric"
                      className="input text-sm"
                      value={condModal.form.contenance}
                      onChange={e => { const v = e.target.value.replace(/[^0-9]/g,''); setCondModal(prev => ({ ...prev, form: { ...prev.form, contenance: parseInt(v) || 1 } })); }}
                      required
                    />
                  </div>
                  <div>
                    <label className="label text-xs">Prix de vente (FCFA)</label>
                    <input
                      type="text" inputMode="numeric"
                      className="input text-sm"
                      value={condModal.form.prix_vente}
                      onChange={e => { const v = e.target.value.replace(/[^0-9]/g,''); setCondModal(prev => ({ ...prev, form: { ...prev.form, prix_vente: v } })); }}
                      placeholder="Ex: 12 000"
                      required
                    />
                  </div>
                </div>
                <button type="submit" className="btn-primary btn-sm w-full justify-center">
                  <Plus size={14}/> Ajouter ce format
                </button>
              </form>

              {/* Liste existante */}
              {condModal.conds.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Formats configurés</p>
                  <div className="space-y-2">
                    {condModal.conds.map(c => (
                      <div key={c.id} className="flex items-center justify-between px-3 py-2.5 bg-white border border-gray-200 rounded-xl">
                        <div>
                          <p className="font-semibold text-gray-800 text-sm">{c.libelle}</p>
                          <p className="text-xs text-gray-400">{c.contenance} unité{c.contenance > 1 ? 's' : ''} de base</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-blue-700 text-sm">{new Intl.NumberFormat('fr-FR').format(c.prix_vente)} FCFA</span>
                          <button
                            onClick={() => supprimerConditionnement(c.id)}
                            className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-colors"
                            title="Supprimer"
                          >
                            <XIcon size={14}/>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-center text-sm text-gray-400 py-2">Aucun format configuré — utilisez les modèles ci-dessus pour commencer</p>
              )}

              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setCondModal(null)}
                  className="btn-secondary w-full justify-center"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {modal && (
        <Modal title={modal === 'add' ? 'Nouveau produit' : 'Modifier le produit'} onClose={() => setModal(null)}>
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* ── Photo produit ── */}
            <div className="flex justify-center">
              <div className="relative group cursor-pointer" onClick={() => photoInputRef.current?.click()}>
                {imagePreview || form.photo ? (
                  <img src={imagePreview || form.photo} alt="Photo" className="w-28 h-28 object-cover rounded-2xl border-2 border-gray-200 shadow-md" />
                ) : (
                  <div className="w-28 h-28 bg-gray-100 border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center gap-2 text-gray-400">
                    <Camera size={28}/>
                    <span className="text-xs text-center leading-tight">Ajouter<br/>une photo</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 rounded-2xl flex items-center justify-center transition-all">
                  <Camera size={22} className="text-white"/>
                </div>
              </div>
              <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
            </div>

            {/* ── Bloc 1 : Identification ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="label">Famille</label>
                <div className="flex gap-2">
                  <select className="input flex-1" value={form.categorie_id} onChange={e => setForm(p => ({...p, categorie_id: e.target.value}))}>
                    <option value="">-- Sélectionner --</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                  </select>
                  <button type="button" onClick={() => setNewCatOpen(v => !v)} className="btn-secondary btn-sm shrink-0 px-3" title="Créer une famille">
                    <Plus size={14}/>
                  </button>
                </div>
                {newCatOpen && (
                  <div className="flex gap-2 mt-2">
                    <input className="input flex-1 text-sm" placeholder="Nom de la famille (ex: Boissons)" value={newCatInput}
                      onChange={e => setNewCatInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), creerCategorie())} autoFocus />
                    <button type="button" onClick={creerCategorie} className="btn-primary btn-sm shrink-0">Créer</button>
                    <button type="button" onClick={() => { setNewCatOpen(false); setNewCatInput(''); }} className="btn-secondary btn-sm shrink-0"><XIcon size={14}/></button>
                  </div>
                )}
              </div>

              <div className="sm:col-span-2">
                <label className="label">Nom du produit *</label>
                <input className="input text-base" value={form.nom} onChange={e => setForm(p => ({...p, nom: e.target.value}))} required placeholder="Ex: Castel 65cl, Coca-Cola 33cl…" />
              </div>

              <div className="sm:col-span-2">
                <label className="label flex items-center gap-1"><Barcode size={13}/> Code-barres</label>
                <input className="input font-mono" value={form.code_barres || ''}
                  onChange={e => setForm(p => ({...p, code_barres: e.target.value}))}
                  // Un scanner de code-barres tape le code puis envoie un "Entrée" automatique —
                  // sans ce blocage, cet Entrée soumettait immédiatement tout le formulaire
                  // (le produit était créé avant même que le nom ou le prix de vente soient
                  // renseignés). On bloque juste la soumission, le code scanné reste bien saisi.
                  onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
                  placeholder="Cliquez ici puis scannez le produit, ou saisissez le code à la main" />
                <p className="text-xs text-gray-400 mt-1">
                  C'est ce code qui permet de retrouver le produit en scannant dans la Caisse — sans lui, le scanner ne trouvera jamais ce produit.
                </p>
              </div>
            </div>

            {/* ── Bloc 2 : Prix ── */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Prix d'achat (FCFA)</label>
                <input
                  type="text" inputMode="numeric"
                  className="input"
                  value={form.prix_achat}
                  onChange={e => { const v = e.target.value.replace(/[^0-9]/g,''); setForm(p => ({...p, prix_achat: v === '' ? '' : +v})); }}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="label">
                  Prix de vente à l'unité
                  <span className="text-gray-400 font-normal text-xs"> (0 si vente carton uniquement)</span>
                </label>
                <input
                  type="text" inputMode="numeric"
                  className="input"
                  value={form.prix_vente}
                  onChange={e => {
                    const v = e.target.value.replace(/[^0-9]/g,'');
                    setForm(p => ({...p, prix_vente: v === '' ? '' : +v}));
                  }}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="label">Prix demi-gros <span className="text-gray-400 font-normal text-xs">(optionnel)</span></label>
                <input type="text" inputMode="numeric" className="input" value={form.prix_revendeur||''} onChange={e => { const v = e.target.value.replace(/[^0-9]/g,''); setForm(p => ({...p, prix_revendeur: v === '' ? '' : +v})); }} placeholder="—" />
              </div>
              <div>
                <label className="label">Prix gros <span className="text-gray-400 font-normal text-xs">(optionnel)</span></label>
                <input type="text" inputMode="numeric" className="input" value={form.prix_grossiste||''} onChange={e => { const v = e.target.value.replace(/[^0-9]/g,''); setForm(p => ({...p, prix_grossiste: v === '' ? '' : +v})); }} placeholder="—" />
              </div>
              {form.prix_achat > 0 && form.prix_vente > 0 && (
                <div className="col-span-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 flex flex-wrap gap-4 text-xs">
                  <span className="text-green-700 font-medium">Marge détail : {new Intl.NumberFormat('fr-FR').format(form.prix_vente - form.prix_achat)} FCFA</span>
                  {form.prix_revendeur > 0 && <span className="text-blue-700 font-medium">Demi-gros : {new Intl.NumberFormat('fr-FR').format(form.prix_revendeur - form.prix_achat)} FCFA</span>}
                  {form.prix_grossiste > 0 && <span className="text-purple-700 font-medium">Gros : {new Intl.NumberFormat('fr-FR').format(form.prix_grossiste - form.prix_achat)} FCFA</span>}
                </div>
              )}
            </div>

            {/* ── Bloc 3 : Stock ── */}
            <div className="grid grid-cols-2 gap-3">
              {(modal === 'add' || modal === 'edit') && (
                <div className="col-span-2">
                  <label className="label">{modal === 'add' ? 'Stock initial' : 'Stock actuel'}</label>
                  {bouteillesParCarton > 0 ? (
                    <div className="flex gap-2 items-center">
                      <div className="flex-1">
                        <input
                          type="text" inputMode="numeric" className="input"
                          placeholder="0"
                          value={stockInitialCartons}
                          onChange={e => setStockInitialCartons(e.target.value.replace(/[^0-9]/g,''))}
                        />
                        <p className="text-xs text-gray-400 mt-1">en cartons ({bouteillesParCarton} btl/carton)</p>
                      </div>
                      <span className="text-gray-400 font-medium">=</span>
                      <div className="flex-1">
                        <div className="input bg-gray-50 text-gray-700 font-semibold">{form.qte_actuelle || 0}</div>
                        <p className="text-xs text-gray-400 mt-1">bouteilles en stock</p>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <input type="text" inputMode="numeric" className="input" value={form.qte_actuelle || ''} onChange={e => { const v = e.target.value.replace(/[^0-9]/g,''); setForm(p => ({...p, qte_actuelle: v === '' ? 0 : +v})); }} placeholder="0" />
                      <p className="text-xs text-gray-400 mt-1">en unités</p>
                    </div>
                  )}
                </div>
              )}
              <div>
                <label className="label">Seuil d'alerte <span className="text-gray-400 font-normal text-xs">(stock bas)</span></label>
                <input type="text" inputMode="numeric" className="input" value={form.qte_min} onChange={e => { const v = e.target.value.replace(/[^0-9]/g,''); setForm(p => ({...p, qte_min: v === '' ? '' : +v})); }} />
              </div>
            </div>

            {/* ── Bloc 4 : Conditionnements carton (création et modification) ── */}
            {featVenteConditionnement && (modal === 'add' || modal === 'edit') && (
              <div className="border border-purple-200 rounded-xl p-4 space-y-3 bg-purple-50/40">
                <div className="flex items-center gap-2">
                  <Layers size={15} className="text-purple-600"/>
                  <p className="text-sm font-semibold text-gray-700">Vente par conditionnement</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label text-xs">Unités par carton</label>
                    <input
                      type="text" inputMode="numeric"
                      className="input font-bold text-center"
                      value={bouteillesParCarton}
                      onChange={e => {
                        const val = Math.max(1, parseInt(e.target.value.replace(/[^0-9]/g,'')) || 1);
                        setBouteillesParCarton(val);
                      }}
                    />
                  </div>
                  <div>
                    <label className="label text-xs">Prix d'achat du carton (FCFA)</label>
                    <input
                      type="text" inputMode="numeric"
                      className="input"
                      value={prixAchatCarton}
                      onChange={e => setPrixAchatCarton(e.target.value.replace(/[^0-9]/g,''))}
                      placeholder="Ex: 12 600"
                    />
                  </div>
                  <div>
                    <label className="label text-xs">Prix de vente du carton (FCFA)</label>
                    <input
                      type="text" inputMode="numeric"
                      className="input border-green-300 focus:border-green-500"
                      value={prixVenteCarton}
                      onChange={e => setPrixVenteCarton(e.target.value.replace(/[^0-9]/g,''))}
                      placeholder="Ex: 12 800"
                    />
                  </div>
                </div>

                {/* Ajouter un autre format (¼, ½, Bouteille...) — manuel, prix à 0 au départ,
                    aucun calcul depuis le prix du carton ou d'un autre format */}
                {(() => {
                  const n = Math.max(1, parseInt(bouteillesParCarton) || 24);
                  const presetsDispo = [
                    { libelle: 'Bouteille', contenance: 1 },
                    { libelle: '¼ Carton',  contenance: Math.max(1, Math.round(n / 4)) },
                    { libelle: '½ Carton',  contenance: Math.max(1, Math.round(n / 2)) },
                  ].filter(preset => !newProdConds.find(c => c.libelle === preset.libelle));
                  return presetsDispo.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {presetsDispo.map(preset => (
                        <button key={preset.libelle} type="button" onClick={() => ajouterCondCreation(preset)}
                          className="px-3 py-1.5 rounded-lg border border-purple-200 bg-purple-50 text-purple-700 text-xs font-semibold hover:bg-purple-100 transition-colors">
                          + {preset.libelle} ({preset.contenance} u.)
                        </button>
                      ))}
                    </div>
                  );
                })()}

                {/* Formats ajoutés — prix de vente modifiable, chacun indépendant */}
                {newProdConds.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Prix de vente par format</p>
                    {newProdConds.map(c => (
                      <div key={c.libelle} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-gray-200">
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-gray-800">{c.libelle}</p>
                          <p className="text-xs text-gray-400">× {c.contenance} unité{c.contenance > 1 ? 's' : ''}</p>
                        </div>
                        <input
                          type="text" inputMode="numeric"
                          className="input w-28 text-center text-sm font-bold text-blue-700"
                          value={c.prix_vente}
                          onChange={e => updatePrixCondCreation(c.libelle, e.target.value.replace(/[^0-9]/g,''))}
                        />
                        <span className="text-xs text-gray-400 w-8">FCFA</span>
                        <button type="button" onClick={() => supprimerCondCreation(c.libelle)}
                          className="text-red-400 hover:text-red-600 shrink-0" title="Retirer ce format">
                          <XIcon size={14}/>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Options avancées (repliées) ── */}
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <button type="button" onClick={() => setShowAdvanced(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-500 hover:bg-gray-50 transition-colors">
                <span className="font-medium">Options avancées</span>
                <span className="text-xs">{showAdvanced ? '▲ Masquer' : '▼ Afficher'} (code, marque, unité, emplacement…)</span>
              </button>
              {showAdvanced && (
                <div className="p-4 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="label text-xs">Code produit {modal === 'add' && <span className="text-blue-500 font-normal ml-1">{codeAuto ? '(auto)' : '(manuel)'}</span>}</label>
                    <div className="flex gap-2">
                      <input className={`input flex-1 font-mono text-sm ${codeAuto && modal === 'add' ? 'bg-blue-50 text-blue-800' : ''}`}
                        value={form.code} onChange={e => { setCodeAuto(false); setForm(p => ({...p, code: e.target.value})); }}
                        required disabled={modal === 'edit'} placeholder="BOI-CAS-001" />
                      {modal === 'add' && (
                        <button type="button" onClick={() => { setCodeAuto(true); regenererCode(); }} className="btn-secondary btn-sm shrink-0" title="Régénérer">
                          <RefreshCw size={14}/>
                        </button>
                      )}
                    </div>
                  </div>
                  <div><label className="label text-xs">Marque</label><input className="input" value={form.marque||''} onChange={e => setForm(p => ({...p, marque: e.target.value}))} /></div>
                  <div>
                    <label className="label text-xs">Unité de base</label>
                    <select className="input" value={form.unite} onChange={e => setForm(p => ({...p, unite: e.target.value}))}>
                      {['pièce','cartouche','rame','bouteille','canette','briquette','kg','g','litre','ml','boîte','carton','pack','sachet','mètre','lot','palette'].map(u => <option key={u}>{u}</option>)}
                    </select>
                  </div>
                  <div><label className="label text-xs">Emplacement (ex: Rayon A)</label><input className="input" value={form.emplacement||''} onChange={e => setForm(p => ({...p, emplacement: e.target.value}))} /></div>
                  <div><label className="label text-xs">Date d'expiration</label><input type="date" className="input" value={form.date_expiration||''} onChange={e => setForm(p => ({...p, date_expiration: e.target.value}))} /></div>
                  <div className="sm:col-span-2"><label className="label text-xs">Description / Notes</label><textarea className="input" rows={2} value={form.description||''} onChange={e => setForm(p => ({...p, description: e.target.value}))} /></div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              {modal === 'edit' && (
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="actif" checked={!!form.actif} onChange={e => setForm(p => ({...p, actif: e.target.checked ? 1 : 0}))} />
                  <label htmlFor="actif" className="text-sm">Produit actif</label>
                </div>
              )}
              <div className="flex items-center gap-2">
                <input type="checkbox" id="is_fictif" checked={!!form.is_fictif} onChange={e => setForm(p => ({...p, is_fictif: e.target.checked}))} />
                <label htmlFor="is_fictif" className="text-sm text-gray-500">Produit fictif <span className="text-xs text-gray-400">(test uniquement, exclu des rapports)</span></label>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" className="btn-secondary" onClick={() => setModal(null)}>Annuler</button>
              <button type="submit" className="btn-primary">Enregistrer</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
