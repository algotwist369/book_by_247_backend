const SuperAdminNotification = require("../../models/SuperAdminNotification");

// Get paginated notifications
const getNotifications = async (req, res, next) => {
    try {
        const { page = 1, limit = 20, filter = 'all' } = req.query;
        const query = {};

        if (filter === 'unread') query.read = false;
        if (filter === 'read') query.read = true;

        const notifications = await SuperAdminNotification.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        const total = await SuperAdminNotification.countDocuments(query);
        const unreadCount = await SuperAdminNotification.countDocuments({ read: false });

        return res.json({
            success: true,
            data: notifications,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            },
            unreadCount
        });
    } catch (err) {
        next(err);
    }
};

// Mark a single notification as read
const markRead = async (req, res, next) => {
    try {
        const { id } = req.params;
        const notification = await SuperAdminNotification.findByIdAndUpdate(
            id,
            { read: true },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({ success: false, message: "Notification not found" });
        }

        return res.json({ success: true, data: notification });
    } catch (err) {
        next(err);
    }
};

// Mark all as read
const markAllRead = async (req, res, next) => {
    try {
        await SuperAdminNotification.updateMany({ read: false }, { read: true });
        return res.json({ success: true, message: "All notifications marked as read" });
    } catch (err) {
        next(err);
    }
};

// Clear all notifications (Optional, for admin cleanup)
const clearAll = async (req, res, next) => {
    try {
        await SuperAdminNotification.deleteMany({});
        return res.json({ success: true, message: "All notifications cleared" });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    getNotifications,
    markRead,
    markAllRead,
    clearAll
};
