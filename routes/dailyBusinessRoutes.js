const express = require("express");
const router = express.Router();
const dailyBusinessController = require("../controllers/dailyBusinessController");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

// All routes require authentication
router.use(authMiddleware);

// ================== Daily Business Routes ==================

// Add daily business record (Manager only)
router.post("/",
    roleMiddleware(["manager"]),
    dailyBusinessController.addDailyBusiness
);

// Get daily business records (Manager + Admin)
router.get("/",
    roleMiddleware(["manager", "admin"]),
    dailyBusinessController.getDailyBusinessRecords
);

// Get daily summary (Manager + Admin)
router.get("/summary",
    roleMiddleware(["manager", "admin"]),
    dailyBusinessController.getDailySummary
);

// Get business analytics (Manager + Admin)
router.get("/analytics",
    roleMiddleware(["manager", "admin"]),
    dailyBusinessController.getBusinessAnalytics
);

// Update daily business record (Manager only)
router.put("/:id",
    roleMiddleware(["manager"]),
    dailyBusinessController.updateDailyBusiness
);

// Delete daily business record (Manager only)
router.delete("/:id",
    roleMiddleware(["manager"]),
    dailyBusinessController.deleteDailyBusiness
);

// ================== PHASE 3 ENHANCEMENT: New Routes ==================

// Initialize daily business (Manager + Admin)
router.post("/initialize",
    roleMiddleware(["manager", "admin"]),
    dailyBusinessController.initializeDailyBusiness
);

// Close daily business with cash reconciliation (Manager + Admin)
router.post("/:id/close",
    roleMiddleware(["manager", "admin"]),
    dailyBusinessController.closeDailyBusiness
);

// Get cash discrepancies (Admin only)
router.get("/cash-discrepancies",
    roleMiddleware(["admin"]),
    dailyBusinessController.getCashDiscrepancies
);

module.exports = router;

