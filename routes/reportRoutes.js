const express = require("express");
const router = express.Router();
const reportController = require("../controllers/reportController");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

// Reports (Admin & Manager)
router.use(authMiddleware, roleMiddleware(["admin", "manager"]));

router.get("/", reportController.getReports);
router.get("/analytics", reportController.getAnalytics);
router.get("/summary", reportController.getSummary);
router.get("/trends", reportController.getTrends);
router.get("/export", reportController.exportReports);

module.exports = router;
