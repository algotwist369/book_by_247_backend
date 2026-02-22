const SuperAdminNotification = require("../models/SuperAdminNotification");
const { emitToRole } = require("../config/socket");

/**
 * Notify all live Super Admins and persist the notification
 */
const notifySuperAdmin = async ({ title, message, type = "info", link = "", metadata = {} }) => {
    try {
        // 1. Persist to Database
        const notification = await SuperAdminNotification.create({
            title,
            message,
            type,
            link,
            metadata
        });

        // 2. Emit Real-time Pulse
        emitToRole("super-admin", "superAdminNotification:new", {
            notification,
            timestamp: new Date()
        });

        console.log(`[SuperAdmin Notification] Created: ${title}`);
        return notification;
    } catch (error) {
        console.error("Error creating Super Admin notification:", error);
    }
};

module.exports = {
    notifySuperAdmin
};
