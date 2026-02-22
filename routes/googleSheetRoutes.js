const express = require('express');
const router = express.Router();
const googleSheetController = require('../controllers/googleSheetController');
const protect = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');


// ==========================================
// PUBLIC WEBHOOKS (Double Tick)
// ==========================================
// Endpoint to receive leads directly from WhatsApp automation
router.post('/webhook', googleSheetController.receiveWebhookLead);

// ==========================================
// ADMIN PROTECTED ROUTES
// ==========================================
router.get('/leads', protect, roleMiddleware(['admin']), googleSheetController.getAllLeads);
router.post('/sync', protect, roleMiddleware(['admin']), googleSheetController.manualSync);
router.post('/forward-lead', protect, roleMiddleware(['admin']), googleSheetController.forwardLeadToManagers);

// Get all leads with manager tracking (Admin view)
router.get('/leads/admin', protect, roleMiddleware(['admin']), googleSheetController.getLeadsForAdmin);

// Analytics
router.get('/leads/analytics', protect, roleMiddleware(['admin']), googleSheetController.getLeadAnalytics);

// Configuration - Allow admin to set their Google Sheet URL
router.post('/leads/config', protect, roleMiddleware(['admin']), googleSheetController.updateGoogleSheetConfig);
router.get('/leads/config', protect, roleMiddleware(['admin']), async (req, res) => {
    try {
        const Admin = require('../models/Admin');
        const admin = await Admin.findById(req.user.id).select('googleSheetUrl syncConfig');
        res.json({ success: true, data: admin });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
router.delete('/leads/config', protect, roleMiddleware(['admin']), googleSheetController.disconnectGoogleSheet);

// Managers for a location (for manual forwarding)
router.get('/leads/managers', protect, roleMiddleware(['admin']), googleSheetController.getManagersByLocation);

// Update lead status (Admin/Manager manually marking as done)
router.post('/leads/admin-status', protect, roleMiddleware(['admin', 'manager']), googleSheetController.updateLeadAdminStatus);


// ==========================================
// MANAGER PROTECTED ROUTES
// ==========================================

// Get leads only for manager's assigned location(s)
router.get('/leads/manager', protect, roleMiddleware(['manager']), googleSheetController.getLeadsForManager);

// Update lead contact status (mark as called or whatsapped)
router.post('/leads/update-status', protect, roleMiddleware(['manager']), googleSheetController.updateLeadContactStatus);

// Add Remark
router.post('/leads/remark', protect, roleMiddleware(['admin', 'manager']), googleSheetController.addLeadRemark);
module.exports = router;
