const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const adminAuth = require('../middleware/adminAuth');

router.post('/login', adminController.login);
router.get('/boutiques', adminAuth, adminController.lister);
router.post('/boutiques', adminAuth, adminController.creer);

module.exports = router;
