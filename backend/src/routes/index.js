const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth');

const authCtrl = require('../controllers/authController');
const userCtrl = require('../controllers/userController');
const produitCtrl = require('../controllers/produitController');
const venteCtrl = require('../controllers/venteController');
const achatCtrl = require('../controllers/achatController');
const clientCtrl = require('../controllers/clientController');
const fournisseurCtrl = require('../controllers/fournisseurController');
const dashboardCtrl = require('../controllers/dashboardController');
const rapportCtrl = require('../controllers/rapportController');
const factureCtrl      = require('../controllers/factureController');
const facturationCtrl  = require('../controllers/facturationController');
const dgiCtrl          = require('../controllers/dgiController');
const superAdminCtrl   = require('../controllers/superAdminController');
const inventaireCtrl   = require('../controllers/inventaireController');
const backupCtrl       = require('../controllers/backupController');
const sessionCaisseCtrl = require('../controllers/sessionCaisseController');
const retraitCtrl       = require('../controllers/retraitController');
const condCtrl         = require('../controllers/conditionnementController');
const licenceCtrl      = require('../controllers/licenceController');
const locationCtrl         = require('../controllers/locationController');
const abonnementCtrl       = require('../controllers/abonnementController');

// Licence
router.get('/licence/status',   licenceCtrl.getStatus);
router.post('/licence/activate',  authMiddleware, requireRole('super_admin','admin'), licenceCtrl.activate);
router.post('/licence/generate',  authMiddleware, requireRole('super_admin'), licenceCtrl.generate);
// Accessible aussi à l'admin local (pas seulement super_admin) : le client doit pouvoir
// lire son ID Machine et le transmettre au fournisseur SANS avoir besoin du compte
// Super Admin partagé — éviter que le client n'ait jamais à s'y connecter.
router.get('/licence/machine-id', authMiddleware, requireRole('super_admin','admin'), licenceCtrl.machineId);

// Public — infos entreprise (login screen)
router.get('/public/config', (req, res) => {
  try {
    const { db } = require('../config/database');
    const e = db.prepare('SELECT nom, slogan FROM entreprise WHERE id = 1').get();
    res.json({ nom: e?.nom || '', slogan: e?.slogan || '' });
  } catch(_) { res.json({ nom: '', slogan: '' }); }
});

// Téléchargement du setup desktop
router.get('/public/download', (req, res) => {
  const url = process.env.DOWNLOAD_URL;
  if (!url) return res.status(404).json({ message: 'Aucun fichier téléchargeable disponible.' });
  res.redirect(url);
});

// Abonnements (public — inscription & paiement)
router.get('/public/plans',               abonnementCtrl.getPlans);
router.post('/public/abonnement',         abonnementCtrl.initierAbonnement);
router.get('/public/paiement/statut/:reference', abonnementCtrl.statutPaiement);
router.post('/admin/confirmer-paiement',  authMiddleware, requireRole('super_admin'), abonnementCtrl.confirmerPaiement);
router.get('/admin/abonnements',          authMiddleware, requireRole('super_admin'), abonnementCtrl.listerAbonnements);

// Jèko webhook (raw body needed for signature verification)
router.post('/webhook/jeko', (req, res, next) => {
  let raw = '';
  req.on('data', chunk => { raw += chunk; });
  req.on('end', () => {
    req.rawBody = raw;
    try { req.body = JSON.parse(raw); } catch {}
    next();
  });
}, abonnementCtrl.webhookJeko);

// Auth
router.post('/auth/login', authCtrl.login);
router.get('/auth/me', authMiddleware, authCtrl.getMe);
router.put('/auth/password', authMiddleware, authCtrl.changePassword);

// Utilisateurs (admin seulement)
router.get('/users', authMiddleware, requireRole('admin'), userCtrl.getAll);
router.get('/users/:id', authMiddleware, requireRole('admin'), userCtrl.getOne);
router.post('/users', authMiddleware, requireRole('admin'), userCtrl.create);
router.put('/users/:id', authMiddleware, requireRole('admin'), userCtrl.update);
router.put('/users/:id/password', authMiddleware, requireRole('admin'), userCtrl.resetPassword);
router.delete('/users/:id', authMiddleware, requireRole('admin'), userCtrl.remove);

// Catégories
router.get('/categories', authMiddleware, produitCtrl.getCategories);
router.post('/categories', authMiddleware, requireRole('admin','gestionnaire'), produitCtrl.createCategorie);

// Conditionnements
router.get('/conditionnements',                         authMiddleware, condCtrl.getAll);
router.get('/produits/:produitId/conditionnements',     authMiddleware, condCtrl.getByProduit);
router.post('/conditionnements',                        authMiddleware, requireRole('admin','gestionnaire'), condCtrl.create);
router.put('/conditionnements/:id',                     authMiddleware, requireRole('admin','gestionnaire'), condCtrl.update);
router.delete('/conditionnements/:id',                  authMiddleware, requireRole('admin','gestionnaire'), condCtrl.remove);

// Produits
router.get('/produits', authMiddleware, produitCtrl.getAll);
router.get('/produits/:id', authMiddleware, produitCtrl.getOne);
router.post('/produits', authMiddleware, requireRole('admin','gestionnaire','magasinier'), produitCtrl.create);
router.put('/produits/:id', authMiddleware, requireRole('admin','gestionnaire','magasinier'), produitCtrl.update);
router.delete('/produits/fictifs', authMiddleware, requireRole('admin','super_admin'), produitCtrl.purgeFictifs);
router.delete('/produits/:id', authMiddleware, requireRole('admin','gestionnaire'), produitCtrl.remove);
router.post('/produits/:id/stock', authMiddleware, requireRole('admin','gestionnaire','magasinier'), produitCtrl.ajusterStock);
router.get('/produits/:id/mouvements', authMiddleware, produitCtrl.getMouvements);
router.post('/produits/:id/photo', authMiddleware, requireRole('admin','gestionnaire','magasinier'), produitCtrl.uploadPhoto);
router.delete('/produits/:id/photo', authMiddleware, requireRole('admin','gestionnaire','magasinier'), produitCtrl.supprimerPhoto);

// Ventes
router.get('/ventes', authMiddleware, venteCtrl.getAll);
router.get('/ventes/:id', authMiddleware, venteCtrl.getOne);
router.post('/ventes', authMiddleware, venteCtrl.create);
router.put('/ventes/:id/annuler', authMiddleware, requireRole('admin','gestionnaire','caissier'), venteCtrl.annuler);
router.delete('/ventes/:id', authMiddleware, requireRole('admin','super_admin'), venteCtrl.supprimer);
router.get('/ventes/:id/facture-pdf', authMiddleware, factureCtrl.genererPDF);

// Achats
router.get('/achats/stats', authMiddleware, requireRole('admin','gestionnaire','comptable'), achatCtrl.getStats);
router.get('/achats/marge-produits', authMiddleware, requireRole('admin','gestionnaire','comptable'), achatCtrl.getMargeParProduit);
router.get('/achats', authMiddleware, requireRole('admin','gestionnaire','magasinier','comptable'), achatCtrl.getAll);
router.get('/achats/:id', authMiddleware, achatCtrl.getOne);
router.post('/achats', authMiddleware, requireRole('admin','gestionnaire','magasinier'), achatCtrl.create);
router.put('/achats/:id', authMiddleware, requireRole('admin','gestionnaire','magasinier'), achatCtrl.update);
router.delete('/achats/:id', authMiddleware, requireRole('admin','gestionnaire'), achatCtrl.remove);
router.post('/achats/:id/lignes', authMiddleware, requireRole('admin','gestionnaire','magasinier'), achatCtrl.ajouterLignes);
router.put('/achats/:id/lignes', authMiddleware, requireRole('admin','gestionnaire','magasinier'), achatCtrl.remplacerLignes);

// Clients
router.get('/clients', authMiddleware, clientCtrl.getAll);
router.get('/clients/:id', authMiddleware, clientCtrl.getOne);
router.post('/clients', authMiddleware, clientCtrl.create);
router.put('/clients/:id', authMiddleware, clientCtrl.update);
router.delete('/clients/:id', authMiddleware, requireRole('admin','gestionnaire'), clientCtrl.remove);
router.post('/clients/:id/paiements', authMiddleware, clientCtrl.ajouterPaiement);
router.get('/clients/:id/paiements', authMiddleware, clientCtrl.getPaiements);

// Fournisseurs
router.get('/fournisseurs', authMiddleware, requireRole('admin','gestionnaire','magasinier','comptable'), fournisseurCtrl.getAll);
router.get('/fournisseurs/:id', authMiddleware, fournisseurCtrl.getOne);
router.post('/fournisseurs', authMiddleware, requireRole('admin','gestionnaire'), fournisseurCtrl.create);
router.put('/fournisseurs/:id', authMiddleware, requireRole('admin','gestionnaire'), fournisseurCtrl.update);
router.delete('/fournisseurs/:id', authMiddleware, requireRole('admin'), fournisseurCtrl.remove);
router.post('/fournisseurs/:id/paiements', authMiddleware, requireRole('admin','gestionnaire','comptable','magasinier'), fournisseurCtrl.ajouterPaiement);

// Dashboard
router.get('/dashboard', authMiddleware, dashboardCtrl.getStats);

// Facturation (factures, proforma, avoir, reçu)
router.get('/facturation',                      authMiddleware, facturationCtrl.getAll);
router.get('/facturation/:id',                  authMiddleware, facturationCtrl.getOne);
router.post('/facturation',                     authMiddleware, facturationCtrl.create);
router.put('/facturation/:id',                  authMiddleware, facturationCtrl.update);
router.post('/facturation/from-vente/:venteId', authMiddleware, facturationCtrl.createFromVente);
router.put('/facturation/:id/statut',           authMiddleware, requireRole('admin','gestionnaire','comptable'), facturationCtrl.updateStatut);
router.post('/facturation/:id/paiement',        authMiddleware, requireRole('admin','gestionnaire','comptable','caissier'), facturationCtrl.ajouterPaiement);
router.post('/facturation/:id/convertir',       authMiddleware, requireRole('admin','gestionnaire'), facturationCtrl.convertirProforma);
router.get('/facturation/:id/pdf',              authMiddleware, facturationCtrl.genererPDF);

// DGI — Facturation Normalisée Électronique
router.get('/dgi/statut',                       authMiddleware, requireRole('admin','gestionnaire','comptable'), dgiCtrl.getStatut);
router.get('/dgi/historique',                   authMiddleware, requireRole('admin','gestionnaire','comptable'), dgiCtrl.historique);
router.post('/dgi/soumettre/:id',               authMiddleware, requireRole('admin','gestionnaire'), dgiCtrl.soumettre);
router.get('/dgi/verifier/:id',                 authMiddleware, dgiCtrl.verifierStatut);
router.post('/dgi/resoumettre/:id',             authMiddleware, requireRole('admin','gestionnaire'), dgiCtrl.resoumettre);

// Infos entreprise publiques (pour impression tickets — tous les rôles connectés)
router.get('/config/societe', authMiddleware, superAdminCtrl.getEntreprise);
router.post('/config/verifier-historique-pin', authMiddleware, superAdminCtrl.verifierHistoriquePin);

// Super Admin — gestion entreprise
router.get('/superadmin/entreprise', authMiddleware, requireRole('super_admin','admin'), superAdminCtrl.getEntreprise);
router.put('/superadmin/entreprise', authMiddleware, requireRole('super_admin','admin'), superAdminCtrl.updateEntreprise);
router.post('/superadmin/entreprise/logo', authMiddleware, requireRole('super_admin','admin'), superAdminCtrl.uploadLogoEntreprise);
router.post('/superadmin/entreprise/cachet', authMiddleware, requireRole('super_admin','admin'), superAdminCtrl.uploadCachetEntreprise);
router.post('/superadmin/seed-demo', authMiddleware, requireRole('super_admin'), superAdminCtrl.seedDemo);
router.put('/superadmin/compte',     authMiddleware, requireRole('super_admin'), superAdminCtrl.updateCompte);
router.put('/superadmin/fonctionnalites', authMiddleware, requireRole('super_admin'), superAdminCtrl.updateFonctionnalites);

// Inventaires
router.get('/inventaires/stats', authMiddleware, requireRole('admin','gestionnaire','magasinier','comptable'), inventaireCtrl.getStats);
router.get('/inventaires', authMiddleware, requireRole('admin','gestionnaire','magasinier','comptable'), inventaireCtrl.getAll);
router.get('/inventaires/:id', authMiddleware, requireRole('admin','gestionnaire','magasinier','comptable'), inventaireCtrl.getOne);
router.get('/inventaires/:id/pdf', authMiddleware, requireRole('admin','gestionnaire','magasinier','comptable'), inventaireCtrl.exportPDF);
router.get('/inventaires/:id/excel', authMiddleware, requireRole('admin','gestionnaire','magasinier','comptable'), inventaireCtrl.exportExcel);
router.post('/inventaires', authMiddleware, requireRole('admin','gestionnaire','magasinier'), inventaireCtrl.create);
router.put('/inventaires/:id/lignes/:ligneId', authMiddleware, requireRole('admin','gestionnaire','magasinier'), inventaireCtrl.updateLigne);
router.post('/inventaires/:id/soumettre', authMiddleware, requireRole('admin','gestionnaire','magasinier'), inventaireCtrl.soumettre);
router.post('/inventaires/:id/valider', authMiddleware, requireRole('admin','gestionnaire'), inventaireCtrl.valider);
router.post('/inventaires/:id/rejeter', authMiddleware, requireRole('admin','gestionnaire'), inventaireCtrl.rejeter);
router.post('/inventaires/:id/synchroniser', authMiddleware, requireRole('admin','gestionnaire','magasinier'), inventaireCtrl.synchroniser);
router.delete('/inventaires/:id', authMiddleware, requireRole('admin','gestionnaire'), inventaireCtrl.annuler);

// Sauvegarde & Restauration
router.get('/retraits',       authMiddleware, retraitCtrl.getAll);
router.post('/retraits',      authMiddleware, retraitCtrl.create);

router.get('/sessions-caisse/active',    authMiddleware, sessionCaisseCtrl.getActive);
router.get('/sessions-caisse',           authMiddleware, requireRole('admin','gestionnaire'), sessionCaisseCtrl.getHistorique);
router.get('/sessions-caisse/:id',       authMiddleware, requireRole('admin','gestionnaire'), sessionCaisseCtrl.getOne);
router.post('/sessions-caisse/ouvrir',   authMiddleware, sessionCaisseCtrl.ouvrir);
router.post('/sessions-caisse/cloturer', authMiddleware, sessionCaisseCtrl.cloturer);
router.put('/sessions-caisse/:id',       authMiddleware, requireRole('admin'), sessionCaisseCtrl.corriger);
router.delete('/sessions-caisse/:id',    authMiddleware, requireRole('admin'), sessionCaisseCtrl.remove);

router.get('/backup/infos',        authMiddleware, requireRole('admin','super_admin'), backupCtrl.infos);
router.get('/backup/telecharger',  authMiddleware, requireRole('admin','super_admin'), backupCtrl.telecharger);
router.post('/backup/restaurer',   authMiddleware, requireRole('admin','super_admin'), backupCtrl.restaurer);
router.get('/backup/auto/statut',  authMiddleware, requireRole('admin','super_admin'), backupCtrl.statutAuto);
router.post('/backup/auto/lancer', authMiddleware, requireRole('admin','super_admin'), backupCtrl.lancerMaintenant);
router.post('/backup/reinitialiser', authMiddleware, requireRole('admin','super_admin'), backupCtrl.reinitialiser);

// Rapports
router.get('/rapports/ventes', authMiddleware, requireRole('admin','gestionnaire','comptable'), rapportCtrl.ventesParPeriode);
router.get('/rapports/produits', authMiddleware, requireRole('admin','gestionnaire','comptable'), rapportCtrl.produitsVendus);
router.get('/rapports/inventaire', authMiddleware, rapportCtrl.inventaire);
router.get('/rapports/mouvements', authMiddleware, rapportCtrl.mouvementsStock);
router.get('/rapports/benefices', authMiddleware, requireRole('admin','gestionnaire','comptable'), rapportCtrl.benefices);
router.get('/rapports/remises',  authMiddleware, requireRole('admin','gestionnaire','comptable'), rapportCtrl.remises);
router.get('/rapports/marge',    authMiddleware, requireRole('admin','gestionnaire','comptable'), rapportCtrl.margeRapport);
router.get('/rapports/paiements', authMiddleware, requireRole('admin','gestionnaire','comptable'), rapportCtrl.paiementsRapport);

// Location événementielle
router.get('/location/stats',                authMiddleware, requireRole('admin','gestionnaire','caissier'), locationCtrl.getStats);
router.get('/location/articles',             authMiddleware, locationCtrl.getArticles);
router.post('/location/articles',            authMiddleware, requireRole('admin','gestionnaire'), locationCtrl.saveArticle);
router.put('/location/articles/:id',         authMiddleware, requireRole('admin','gestionnaire'), locationCtrl.saveArticle);
router.delete('/location/articles/:id',      authMiddleware, requireRole('admin','gestionnaire'), locationCtrl.deleteArticle);
router.get('/location/contrats',             authMiddleware, locationCtrl.getContrats);
router.get('/location/contrats/:id',         authMiddleware, locationCtrl.getContrat);
router.post('/location/contrats',            authMiddleware, requireRole('admin','gestionnaire','caissier'), locationCtrl.createContrat);
router.put('/location/contrats/:id',         authMiddleware, requireRole('admin','gestionnaire'), locationCtrl.updateContrat);
router.post('/location/contrats/:id/retour', authMiddleware, requireRole('admin','gestionnaire'), locationCtrl.enregistrerRetour);

module.exports = router;
