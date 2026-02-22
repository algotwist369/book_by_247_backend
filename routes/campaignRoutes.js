// campaignRoutes.js - Marketing campaign routes
const express = require("express");
const router = express.Router();
const campaignController = require("../controllers/campaignController");
const campaignEnhancedController = require("../controllers/campaignEnhancedController");
const campaignAnalyticsController = require("../controllers/campaignAnalyticsController");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

// All routes require authentication (Admin or Manager)
router.use(authMiddleware, roleMiddleware(["admin", "manager"]));

// ================== Campaign Management ==================

// Create new campaign
router.post("/", campaignController.createCampaign);

// Get campaigns with filtering and pagination
router.get("/", campaignController.getCampaigns);

// Get campaign statistics - MUST BE BEFORE /:id
router.get("/stats", campaignController.getCampaignStats);

// Get target audience count (for preview before creating campaign) - MUST BE BEFORE /:id
router.post("/audience-count", campaignController.getTargetAudienceCount);

// ================== Campaign Templates - MUST BE BEFORE /:id ==================

// Get popular templates - MUST BE BEFORE /templates
router.get("/templates/popular", campaignEnhancedController.getPopularTemplates);

// Get templates
router.get("/templates", campaignEnhancedController.getTemplates);

// Get template by ID - MUST BE BEFORE generic :id route
router.get("/templates/:id", campaignEnhancedController.getTemplateById);

// Create template
router.post("/templates", campaignEnhancedController.createTemplate);

// ================== Automated Campaigns - MUST BE BEFORE /:id ==================

// Get automated campaigns
router.get("/automated", campaignEnhancedController.getAutomatedCampaigns);

// Create automated campaign
router.post("/automated", campaignEnhancedController.createAutomatedCampaign);

// Get automated campaign by ID
router.get("/automated/:id", campaignEnhancedController.getAutomatedCampaignById);

// Update automated campaign
router.put("/automated/:id", campaignEnhancedController.updateAutomatedCampaign);

// Delete automated campaign
router.delete("/automated/:id", campaignEnhancedController.deleteAutomatedCampaign);

// Trigger automated campaign manually
router.post("/automated/:id/trigger", campaignEnhancedController.triggerAutomatedCampaign);

// ================== Drip Campaigns - MUST BE BEFORE /:id ==================

// Get drip campaigns
router.get("/drip", campaignEnhancedController.getDripCampaigns);

// Create drip campaign
router.post("/drip", campaignEnhancedController.createDripCampaign);

// Get drip campaign enrollments
router.get("/drip/:id/enrollments", campaignEnhancedController.getDripEnrollments);

// Enroll customer in drip campaign
router.post("/drip/:id/enroll", campaignEnhancedController.enrollInDrip);

// ================== Campaign Analytics - MUST BE BEFORE /:id ==================

// Get best time to send analysis
router.get("/analytics/best-time", campaignAnalyticsController.analyzeBestTimeToSend);

// Get campaign insights
router.get("/analytics/insights", campaignAnalyticsController.getCampaignInsights);

// Get customer engagement pattern
router.get("/analytics/customer-pattern/:customerId", campaignAnalyticsController.getCustomerEngagementPattern);

// Compare campaigns
router.post("/analytics/compare", campaignAnalyticsController.compareCampaigns);

// ================== Link Tracking - MUST BE BEFORE /:id ==================

// Generate tracking link with UTM parameters
router.post("/tracking/generate-link", campaignEnhancedController.generateTrackingLink);

// ================== Campaign by ID - MUST BE LAST ==================

// Get campaign by ID - MUST BE AFTER ALL SPECIFIC ROUTES
router.get("/:id", campaignController.getCampaignById);

// Update campaign
router.put("/:id", campaignController.updateCampaign);

// ================== Campaign Actions ==================

// Launch campaign
router.post("/:id/launch", campaignController.launchCampaign);

// Cancel campaign
router.post("/:id/cancel", campaignController.cancelCampaign);

// Clone campaign
router.post("/:id/clone", campaignEnhancedController.cloneCampaign);

// Start A/B test
router.post("/:id/ab-test/start", campaignEnhancedController.startABTest);

// Get A/B test results
router.get("/:id/ab-test/results", campaignEnhancedController.getABTestResults);

module.exports = router;

