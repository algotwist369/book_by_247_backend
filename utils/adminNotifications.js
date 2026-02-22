// adminNotifications.js - Utility for creating admin notifications

const AdminNotification = require("../models/AdminNotification");
const { emitToUser } = require("../config/socket");

/**
 * Create a system notification for an admin
 * @param {string} adminId - Admin ID
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {Object} options - Additional options
 */
const createAdminNotification = async (adminId, title, message, options = {}) => {
    try {
        const notification = await AdminNotification.create({
            admin: adminId,
            title,
            message,
            type: options.type || 'system',
            priority: options.priority || 'normal',
            relatedBusiness: options.relatedBusiness,
            relatedManager: options.relatedManager,
            relatedUser: options.relatedUser,
            actionUrl: options.actionUrl,
            actionText: options.actionText,
            metadata: options.metadata || {}
        });

        // Emit real-time notification via Socket.IO
        emitToUser(adminId.toString(), 'notification:new', {
            notification: notification.toObject(),
            unreadCount: await AdminNotification.countDocuments({ admin: adminId, isRead: false })
        });

        return notification;
    } catch (error) {
        console.error('Error creating admin notification:', error);
        return null;
    }
};

/**
 * Create notification for new business created
 */
const notifyNewBusinessCreated = async (adminId, business) => {
    return await createAdminNotification(
        adminId,
        'New Business Created',
        `${business.name} (${business.type}) has been created successfully`,
        {
            type: 'business',
            priority: 'normal',
            relatedBusiness: business._id,
            actionUrl: `/admin/businesses/${business._id}`,
            actionText: 'View Business'
        }
    );
};

/**
 * Create notification for business updated
 */
const notifyBusinessUpdated = async (adminId, business) => {
    return await createAdminNotification(
        adminId,
        'Business Updated',
        `${business.name} details have been updated`,
        {
            type: 'business',
            priority: 'low',
            relatedBusiness: business._id,
            actionUrl: `/admin/businesses/${business._id}`,
            actionText: 'View Business'
        }
    );
};

/**
 * Create notification for new manager created
 */
const notifyNewManagerCreated = async (adminId, manager, business) => {
    return await createAdminNotification(
        adminId,
        'New Manager Added',
        `${manager.name} has been added as manager to ${business.name}`,
        {
            type: 'user',
            priority: 'normal',
            relatedManager: manager._id,
            relatedBusiness: business._id,
            actionUrl: `/admin/managers/${manager._id}`,
            actionText: 'View Manager'
        }
    );
};

/**
 * Create notification for business deleted
 */
const notifyBusinessDeleted = async (adminId, businessName) => {
    return await createAdminNotification(
        adminId,
        'Business Deleted',
        `${businessName} has been deleted`,
        {
            type: 'business',
            priority: 'high',
            metadata: { source: 'admin_deletion' }
        }
    );
};

/**
 * Create notification for security event
 */
const notifySecurityEvent = async (adminId, event, details = {}) => {
    return await createAdminNotification(
        adminId,
        'Security Alert',
        event,
        {
            type: 'security',
            priority: 'urgent',
            metadata: {
                source: 'security_monitor',
                ...details
            }
        }
    );
};

/**
 * Create notification for payment event
 */
const notifyPaymentEvent = async (adminId, event, amount = null) => {
    return await createAdminNotification(
        adminId,
        'Payment Event',
        event + (amount ? ` - Amount: ₹${amount}` : ''),
        {
            type: 'payment',
            priority: 'high',
            metadata: { source: 'payment_gateway' }
        }
    );
};

module.exports = {
    createAdminNotification,
    notifyNewBusinessCreated,
    notifyBusinessUpdated,
    notifyNewManagerCreated,
    notifyBusinessDeleted,
    notifySecurityEvent,
    notifyPaymentEvent
};

