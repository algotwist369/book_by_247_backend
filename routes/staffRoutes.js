const express = require("express");
const router = express.Router();
const staffController = require("../controllers/staffController");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

// Staff routes
router.use(authMiddleware, roleMiddleware(["staff"]));

// ================== Staff Dashboard ==================
router.get("/dashboard", staffController.getStaffDashboard);

// ================== Staff Profile ==================
router.get("/profile", staffController.getMyProfile);
router.put("/profile", staffController.updateMyProfile);

// ================== Attendance ==================
router.post("/attendance/check-in", staffController.checkIn);
router.post("/attendance/check-out", staffController.checkOut);

// ================== Business Info ==================
router.get("/business", staffController.getMyBusiness);

// ================== Transactions ==================
router.post("/transactions", staffController.addTransaction);
router.get("/transactions", staffController.getMyTransactions);

module.exports = router;
