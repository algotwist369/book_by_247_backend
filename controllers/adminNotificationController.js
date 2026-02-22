require('dotenv').config();
const AdminNotification = require("../models/AdminNotification");
const { setCache, getCache, deleteCache } = require("../utils/cache");
const { emitToUser } = require("../config/socket");

// ================== Get Admin Notifications ==================
const getAdminNotifications = async (req, res, next) => {
    try {
        const adminId = req.user.id;
        const { page = 1, limit = 20, isRead, type, priority } = req.query;
        // Cache Removed for Real-time
        // const cachedData = await getCache(cacheKey);
        // if (cachedData) {
        //     return res.json({ success: true, source: "cache", ...cachedData });
        // }

        let query = { admin: adminId };

        if (isRead !== undefined) {
            query.isRead = isRead === 'true';
        }
        if (type) {
            query.type = type;
        }
        if (priority) {
            query.priority = priority;
        }

        const notifications = await AdminNotification.find(query)
            .populate('relatedBusiness', 'name type branch')
            .populate('relatedManager', 'name username')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .lean();

        const total = await AdminNotification.countDocuments(query);
        const unreadCount = await AdminNotification.countDocuments({ admin: adminId, isRead: false });

        const response = {
            success: true,
            data: notifications,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            },
            unreadCount
        };

        // Cache Removed for Real-time
        // await setCache(cacheKey, response, 60);

        return res.json(response);
    } catch (err) {
        next(err);
    }
};

// ================== Get Unread Count ==================
const getUnreadCount = async (req, res, next) => {
    try {
        const adminId = req.user.id;
        const count = await AdminNotification.countDocuments({ admin: adminId, isRead: false });

        return res.json({ success: true, count });
    } catch (err) {
        next(err);
    }
};

// ================== Mark Notification as Read ==================
const markAsRead = async (req, res, next) => {
    try {
        const { id } = req.params;
        const adminId = req.user.id;

        const notification = await AdminNotification.findOne({ _id: id, admin: adminId });
        if (!notification) {
            return res.status(404).json({ success: false, message: "Notification not found" });
        }

        notification.isRead = true;
        notification.readAt = new Date();
        await notification.save();

        // Cache Invalidation Removed
        // await deleteCache(`admin:${adminId}:notifications`);

        // Get updated unread count
        const unreadCount = await AdminNotification.countDocuments({ admin: adminId, isRead: false });

        // 🔥 Emit real-time Socket.IO event
        emitToUser(adminId.toString(), 'admin:notification:read', {
            notificationId: id,
            unreadCount
        });

        return res.json({ success: true, message: "Notification marked as read", unreadCount });
    } catch (err) {
        next(err);
    }
};

// ================== Mark All as Read ==================
const markAllAsRead = async (req, res, next) => {
    try {
        const adminId = req.user.id;

        await AdminNotification.updateMany(
            { admin: adminId, isRead: false },
            { $set: { isRead: true, readAt: new Date() } }
        );

        // Cache Invalidation Removed
        // await deleteCache(`admin:${adminId}:notifications`);

        // 🔥 Emit real-time Socket.IO event
        emitToUser(adminId.toString(), 'admin:notification:all-read', {
            unreadCount: 0
        });

        return res.json({ success: true, message: "All notifications marked as read", unreadCount: 0 });
    } catch (err) {
        next(err);
    }
};

// ================== Delete Notification ==================
const deleteNotification = async (req, res, next) => {
    try {
        const { id } = req.params;
        const adminId = req.user.id;

        const notification = await AdminNotification.findOneAndDelete({ _id: id, admin: adminId });
        if (!notification) {
            return res.status(404).json({ success: false, message: "Notification not found" });
        }

        // Cache Invalidation Removed
        // await deleteCache(`admin:${adminId}:notifications`);

        // Get updated unread count
        const unreadCount = await AdminNotification.countDocuments({ admin: adminId, isRead: false });

        // 🔥 Emit real-time Socket.IO event
        emitToUser(adminId.toString(), 'admin:notification:deleted', {
            notificationId: id,
            unreadCount
        });

        return res.json({ success: true, message: "Notification deleted", unreadCount });
    } catch (err) {
        next(err);
    }
};

// ================== Delete All Notifications ==================
const deleteAllNotifications = async (req, res, next) => {
    try {
        const adminId = req.user.id;

        // Delete all notifications for this admin
        const result = await AdminNotification.deleteMany({ admin: adminId });

        // Cache Invalidation Removed
        // await deleteCache(`admin:${adminId}:notifications`);

        // 🔥 Emit real-time Socket.IO event
        emitToUser(adminId.toString(), 'admin:notification:all-deleted', {
            unreadCount: 0,
            deletedCount: result.deletedCount
        });

        return res.json({
            success: true,
            message: `All notifications deleted (${result.deletedCount} removed)`,
            deletedCount: result.deletedCount,
            unreadCount: 0
        });
    } catch (err) {
        next(err);
    }
};

// ================== Get Recent Notifications ==================
const getRecentNotifications = async (req, res, next) => {
    try {
        const adminId = req.user.id;
        const limit = parseInt(req.query.limit) || 5;

        const notifications = await AdminNotification.find({ admin: adminId })
            .populate('relatedBusiness', 'name type branch')
            .populate('relatedManager', 'name username')
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();

        return res.json({ success: true, data: notifications });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    getAdminNotifications,
    getUnreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    deleteAllNotifications,
    getRecentNotifications
};

