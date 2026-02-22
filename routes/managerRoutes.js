const express = require("express");
const router = express.Router();
const managerController = require("../controllers/managerController");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

// Manager routes
router.use(authMiddleware, roleMiddleware(["manager"]));

// ================== Manager Dashboard ==================
router.get("/dashboard", managerController.getManagerDashboard);
router.get("/stats", managerController.getManagerStats);
router.get("/appointments/stats", managerController.getManagerAppointmentStats);

// ================== Staff Management ==================
router.post("/staff", managerController.addStaff);
router.get("/staff", managerController.getStaff);
router.get("/staff/:id", managerController.getStaffById);
router.put("/staff/:id", managerController.updateStaff);
router.delete("/staff/:id", managerController.deleteStaff);

// ================== Transaction Management ==================
router.post("/transaction", managerController.addTransaction);
router.put("/transaction/:id", managerController.updateTransaction);
router.get("/transaction/:id", managerController.getTransaction);
router.get("/transactions", managerController.getTransactions);

// ================== Business Management (Manager can update their own business) ==================
router.get("/business", managerController.getBusinessInfo);
router.put("/business", managerController.updateBusiness);

// ================== Alerts / System Notifications ==================
router.get("/alerts", managerController.getAlerts);
router.post("/alerts/test", managerController.createTestNotification);
router.put("/alerts/:id/read", managerController.markAlertAsRead);
router.post("/alerts/mark-all-read", managerController.markAllAlertsAsRead);

// ================== Manager Profile & Settings ==================
router.get("/profile", managerController.getManagerProfile);
router.put("/profile", managerController.updateManagerProfile);
router.put("/password", managerController.updateManagerPassword);

module.exports = router;
