const express = require('express');
const router = express.Router();
const leadController = require('../controllers/leadController');
const protect = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

// Admin Protected Routes
/* const admin = roleMiddleware(['admin']); */

// Public Route
router.post('/track', leadController.trackLead);

// Admin Protected Routes
router.get('/analytics/summary', protect, roleMiddleware(['admin']), leadController.getAnalyticsSummary);
router.get('/analytics/business-breakdown', protect, roleMiddleware(['admin']), leadController.getBusinessBreakdown);
router.get('/analytics/ip-journeys', protect, roleMiddleware(['admin']), leadController.getIpJourneys);

module.exports = router;
