const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const adminNotificationController = require("../controllers/adminNotificationController");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

// Admin only routes
router.use(authMiddleware, roleMiddleware(["admin"]));

// ================== Admin Dashboard ==================
router.get("/dashboard", adminController.getAdminDashboard);
router.get("/stats", adminController.getAdminStats);

// ================== Admin Profile & Settings ==================
router.get("/profile", adminController.getAdminProfile);
router.put("/profile", adminController.updateAdminProfile);
router.put("/password", adminController.updateAdminPassword);

// ================== Admin Notifications ==================
router.get("/notifications", adminNotificationController.getAdminNotifications);
router.get("/notifications/unread-count", adminNotificationController.getUnreadCount);
router.get("/notifications/recent", adminNotificationController.getRecentNotifications);
router.put("/notifications/:id/read", adminNotificationController.markAsRead);
router.put("/notifications/read-all", adminNotificationController.markAllAsRead);
router.delete("/notifications/all", adminNotificationController.deleteAllNotifications);
router.delete("/notifications/:id", adminNotificationController.deleteNotification);

// ================== Business Management ==================
router.post("/business", adminController.createBusiness);
router.get("/businesses", adminController.getBusinesses);
router.get("/business/:businessId/link", adminController.getBusinessLink);
router.put("/business/:id", adminController.updateBusiness);
router.put("/business/:id/status", adminController.updateBusinessStatus);
router.delete("/business/:id", adminController.deleteBusiness);

// ================== Manager Management ==================
router.post("/manager", adminController.createManager);
router.get("/managers", adminController.getManagers);
router.get("/manager/:id", adminController.getManagerById);
router.put("/manager/:id", adminController.updateManager);
router.put("/manager/:id/status", adminController.updateManagerStatus);
router.delete("/manager/:id", adminController.deleteManager);

// ================== Get Business by ID (must be last to avoid conflicts) ==================
router.get("/:id", adminController.getBusinessById);

module.exports = router;
