const Business = require("../models/Business");
const { notifySuperAdmin } = require("./superAdminNotifications");

/**
 * Check for upcoming and actual plan expiries
 * 1. Notify 2 days before expiry
 * 2. Update status and notify on actual expiry
 */
const checkPlanExpiries = async () => {
    console.log("[Plan Expiry Scheduler] Running daily check...");
    try {
        const now = new Date();

        // --- 1. Upcoming Expiries (2 days warning) ---
        const twoDaysFromNowStart = new Date(now);
        twoDaysFromNowStart.setDate(now.getDate() + 2);
        twoDaysFromNowStart.setHours(0, 0, 0, 0);

        const twoDaysFromNowEnd = new Date(twoDaysFromNowStart);
        twoDaysFromNowEnd.setHours(23, 59, 59, 999);

        const upcomingExpiries = await Business.find({
            expireAt: { $gte: twoDaysFromNowStart, $lte: twoDaysFromNowEnd },
            plan: { $ne: "expired" }
        });

        for (const business of upcomingExpiries) {
            await notifySuperAdmin({
                title: "Upcoming Plan Expiry",
                message: `Business "${business.name}"'s plan (${business.plan}) will expire in 2 days.`,
                type: "warning",
                link: `/admins/business/${business._id}`,
                metadata: { businessId: business._id, expireAt: business.expireAt }
            });
        }

        // --- 2. Actual Expiries (Past date & not yet marked expired) ---
        const expiredBusinesses = await Business.find({
            expireAt: { $lt: now },
            plan: { $ne: "expired" }
        });

        for (const business of expiredBusinesses) {
            business.plan = "expired";
            business.superAdminRemark = `Plan automatically marked as expired by system on ${now.toLocaleDateString()}`;

            await business.save();

            await notifySuperAdmin({
                title: "Plan Expired",
                message: `Business "${business.name}"'s plan has expired and has been deactivated.`,
                type: "error",
                link: `/admins/business/${business._id}`,
                metadata: { businessId: business._id, expiredAt: business.expireAt }
            });
        }

        console.log(`[Plan Expiry Scheduler] Summary: ${upcomingExpiries.length} warnings sent, ${expiredBusinesses.length} plans expired.`);
    } catch (error) {
        console.error("[Plan Expiry Scheduler] Error during execution:", error);
    }
};

/**
 * Start the scheduler
 * Runs daily (every 24 hours)
 */
const startPlanExpiryScheduler = () => {
    console.log("[Plan Expiry Scheduler] Initialized.");

    // Run every 24 hours
    setInterval(checkPlanExpiries, 24 * 60 * 60 * 1000);

    // Initial check on startup (after 45 seconds to ensure DB stability)
    setTimeout(checkPlanExpiries, 45000);
};

module.exports = {
    checkPlanExpiries,
    startPlanExpiryScheduler
};
