const express = require("express");
const router = express.Router();
const adminController = require("../../controllers/superAdmin/adminController");
const sidebarController = require("../../controllers/superAdmin/sidebarManagementController");
const analyticsController = require("../../controllers/superAdmin/analyticsController");
const superAdminAuth = require("../../middleware/superAdminAuth");
const notificationController = require("../../controllers/superAdmin/notificationController");

// All management routes are protected by superAdminAuth
router.use(superAdminAuth);

// Notifications
router.get("/notifications", notificationController.getNotifications);
router.patch("/notifications/:id/read", notificationController.markRead);
router.post("/notifications/mark-all-read", notificationController.markAllRead);
router.delete("/notifications/clear-all", notificationController.clearAll);

// Analytics
router.get("/stats", analyticsController.getPlatformStats);

// Admin & there business Management
router.get("/admins", adminController.getAllAdmins);
router.get("/admins/:id/businesses", adminController.getAdminAllBusiness);
router.patch("/admins/:id/status", adminController.updateAdminStatus);
router.patch("/admins/:adminId/businesses/:businessId/status", adminController.updateAdminBusinessStatus);
router.patch("/admins/:adminId/businesses/:businessId/plan", adminController.updateAdminBusinessPlan);

// Sidebar Management
router.patch("/admins/:id/sidebar", sidebarController.toggleAdminSidebar);
router.patch("/admins/:adminId/managers/sidebar", sidebarController.toggleAdmin_sManagerSidebar);

module.exports = router;
