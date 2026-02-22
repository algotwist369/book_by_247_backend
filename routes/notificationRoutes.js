const express = require("express");
const router = express.Router();
const notificationController = require("../controllers/notificationController");
const notificationEnhancedController = require("../controllers/notificationEnhancedController");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

// All routes require authentication (Admin or Manager)
router.use(authMiddleware, roleMiddleware(["admin", "manager"]));

// ================== Notification Management ==================

// Create notification
router.post("/", notificationController.createNotification);

// Send notification
router.post("/:notificationId/send", notificationController.sendNotification);

// Get notifications
router.get("/", notificationController.getNotifications);

// Get notification analytics
router.get("/:notificationId/analytics", notificationController.getNotificationAnalytics);

// ================== Campaign Management ==================

// Create campaign
router.post("/campaigns", notificationController.createCampaign);

// Get campaigns
router.get("/campaigns", notificationController.getCampaigns);

// ================== Customer Analytics ==================

// Get customer analytics
router.get("/analytics/customers", notificationController.getCustomerAnalytics);

// ================== Automated Notifications ==================

// Get automated notifications summary
router.get("/automated/summary", notificationEnhancedController.getAutomatedNotificationsSummary);

// Send birthday wishes
router.post("/automated/birthday", notificationEnhancedController.sendBirthdayWishes);

// Send anniversary wishes
router.post("/automated/anniversary", notificationEnhancedController.sendAnniversaryWishes);

// Send appointment reminders
router.post("/automated/appointment-reminders", notificationEnhancedController.sendAppointmentReminders);

// Send reactivation campaign to inactive customers
router.post("/automated/reactivation", notificationEnhancedController.sendReactivationCampaign);

// Send review requests
router.post("/automated/review-requests", notificationEnhancedController.sendReviewRequest);

module.exports = router;