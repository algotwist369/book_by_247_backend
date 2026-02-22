// campaignSchedulerRoutes.js - Manual scheduler trigger routes
const express = require("express");
const router = express.Router();
const { executeAutomatedCampaigns, processDripCampaigns } = require("../utils/campaignScheduler");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

// All routes require authentication (Admin only for manual triggers)
router.use(authMiddleware, roleMiddleware(["admin"]));

// ================== Manual Scheduler Triggers ==================

// Manually trigger automated campaign execution
router.post("/execute-automated", async (req, res, next) => {
    try {
        const result = await executeAutomatedCampaigns();
        
        return res.json({
            success: result.success,
            message: result.success 
                ? `Automated campaigns executed successfully. Executed: ${result.executed}, Sent: ${result.sent}`
                : `Failed to execute automated campaigns: ${result.error}`,
            data: result
        });
    } catch (err) {
        next(err);
    }
});

// Manually trigger drip campaign processing
router.post("/process-drip", async (req, res, next) => {
    try {
        const result = await processDripCampaigns();
        
        return res.json({
            success: result.success,
            message: result.success 
                ? `Drip campaigns processed successfully. Sent: ${result.sent}`
                : `Failed to process drip campaigns: ${result.error}`,
            data: result
        });
    } catch (err) {
        next(err);
    }
});

// Execute both automated and drip campaigns
router.post("/execute-all", async (req, res, next) => {
    try {
        const automatedResult = await executeAutomatedCampaigns();
        const dripResult = await processDripCampaigns();
        
        return res.json({
            success: automatedResult.success && dripResult.success,
            message: "Campaign execution completed",
            data: {
                automated: automatedResult,
                drip: dripResult
            }
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;

