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
router.post('/test-email', adminAuth, adminController.testerEmail);
router.post('/boutiques/:slug/mot-de-passe', adminAuth, adminController.reinitialiserMotDePasse);

module.exports = router;
