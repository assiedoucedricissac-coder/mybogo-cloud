const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const adminAuth = require('../middleware/adminAuth');

router.post('/login', adminController.login);
router.get('/boutiques', adminAuth, adminController.lister);
router.post('/boutiques', adminAuth, adminController.creer);
router.post('/boutiques/:slug/prolonger', adminAuth, adminController.prolonger);
router.post('/boutiques/:slug/suspendre', adminAuth, adminController.suspendre);
router.post('/boutiques/:slug/reactiver', adminAuth, adminController.reactiver);
router.get('/boutiques/:slug/utilisateurs', adminAuth, adminController.utilisateurs);
router.post('/boutiques/:slug/utilisateurs/:id/basculer', adminAuth, adminController.basculerUtilisateur);
router.post('/boutiques/:slug/utilisateurs/:id/mot-de-passe', adminAuth, adminController.motDePasseUtilisateur);
router.post('/boutiques/:slug/expiration', adminAuth, adminController.definirExpiration);
router.post('/boutiques/:slug/acceder', adminAuth, adminController.acceder);
router.post('/boutiques/:slug/supprimer', adminAuth, adminController.supprimerBoutique);
router.post('/test-email', adminAuth, adminController.testerEmail);
router.post('/boutiques/:slug/mot-de-passe', adminAuth, adminController.reinitialiserMotDePasse);

module.exports = router;
