const express = require('express');
const router = express.Router();
const qrCodeController = require('../controllers/qrCodeController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

// Admin only routes - require authentication and admin role
router.get('/qr', authMiddleware, roleMiddleware(['admin']), qrCodeController.getQRCode); // Preserving the original /qr route with updated middleware
router.get('/status', authMiddleware, roleMiddleware(['api_token', 'admin']), qrCodeController.getConnectionStatus);
router.post('/logout', authMiddleware, roleMiddleware(['api_token', 'admin']), qrCodeController.logout);
router.post('/reset', authMiddleware, roleMiddleware(['api_token', 'admin']), qrCodeController.resetConnection);

module.exports = router;
