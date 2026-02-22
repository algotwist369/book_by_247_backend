const Notification = require("../models/Notification");
const Campaign = require("../models/Campaign");
const Customer = require("../models/Customer");
const Business = require("../models/Business");
const Manager = require("../models/Manager");
const { setCache, getCache, deleteCache } = require("../utils/cache");
const { getTargetCustomers, getCustomerAnalytics } = require("../utils/customerAnalytics");
const { sendMail } = require("../utils/sendMail");
const { sendSMS } = require("../utils/sendSMS");

// ================== Create Notification ==================
const createNotification = async (req, res, next) => {
    try {
        const managerId = req.user.id;
        const {
            title,
            message,
            type,
            targetAudience,
            content,
            delivery,
            campaign
        } = req.body;

        // Get manager's business
        const manager = await Manager.findById(managerId).populate('business');
        if (!manager || !manager.business) {
            return res.status(404).json({
                success: false,
                message: "Manager or business not found"
            });
        }

        // Get target customers
        const targetCustomers = await getTargetCustomers(manager.business._id, targetAudience);

        if (targetCustomers.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No customers found matching the target criteria"
            });
        }

        // Create notification
        const notification = await Notification.create({
            business: manager.business._id,
            sender: managerId,
            title,
            message,
            type,
            targetAudience: {
                ...targetAudience,
                individualCustomers: targetCustomers.map(c => c._id)
            },
            content,
            delivery,
            campaign,
            status: 'draft',
            stats: {
                totalRecipients: targetCustomers.length
            }
        });

        // Cache Invalidation Removed
        // await deleteCache(`manager:${managerId}:notifications`);
        // await deleteCache(`business:${manager.business._id}:notifications`);

        return res.status(201).json({
            success: true,
            message: "Notification created successfully",
            data: {
                notification: notification.toObject(),
                targetCount: targetCustomers.length,
                estimatedCost: calculateNotificationCost(targetCustomers.length, delivery.channels)
            }
        });
    } catch (err) {
        next(err);
    }
};

// ================== Send Notification ==================
const sendNotification = async (req, res, next) => {
    try {
        const { notificationId } = req.params;
        const managerId = req.user.id;

        // Get notification
        const notification = await Notification.findById(notificationId)
            .populate('business')
            .populate('sender');

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: "Notification not found"
            });
        }

        // Check if manager has permission
        if (notification.sender._id.toString() !== managerId) {
            return res.status(403).json({
                success: false,
                message: "Access denied"
            });
        }

        // Update status to sending
        notification.status = 'sending';
        await notification.save();

        // Get target customers
        const customers = await Customer.find({
            _id: { $in: notification.targetAudience.individualCustomers }
        });

        // Send notifications
        const results = await Promise.allSettled(
            customers.map(customer => sendNotificationToCustomer(notification, customer))
        );

        // Prepare delivery records without saving yet
        const deliveryRecords = [];
        results.forEach((result, index) => {
            const customer = customers[index];

            if (result.status === 'fulfilled') {
                // Handle successful sends with channel-specific results
                const channelResults = result.value || [];
                channelResults.forEach(channelResult => {
                    deliveryRecords.push({
                        customer: customer._id,
                        channel: channelResult.channel,
                        status: channelResult.success ? 'sent' : 'failed',
                        sentAt: new Date(),
                        failureReason: channelResult.success ? null : channelResult.error
                    });
                });
            } else {
                // Handle completely failed sends
                notification.delivery.channels.forEach(channel => {
                    deliveryRecords.push({
                        customer: customer._id,
                        channel: channel,
                        status: 'failed',
                        sentAt: new Date(),
                        failureReason: result.reason?.message || 'Unknown error'
                    });
                });
            }
        });

        // Add all delivery records at once
        notification.deliveries.push(...deliveryRecords);

        // Update notification stats and status
        await notification.updateStats();
        notification.status = 'sent';
        notification.sentAt = new Date();
        await notification.save();

        // Cache Invalidation Removed
        // await deleteCache(`manager:${managerId}:notifications`);
        // await deleteCache(`business:${notification.business._id}:notifications`);

        return res.json({
            success: true,
            message: "Notification sent successfully",
            data: {
                totalSent: notification.stats.sent,
                totalFailed: notification.stats.failed,
                deliveryRate: notification.deliveryRate
            }
        });
    } catch (err) {
        next(err);
    }
};

// ================== Get Notifications ==================
const getNotifications = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const {
            page = 1,
            limit = 10,
            status,
            type,
            startDate,
            endDate
        } = req.query;

        let query = {};

        // Role-based filtering
        if (userRole === 'admin') {
            // Admin sees notifications from ALL their businesses
            const businesses = await Business.find({ admin: userId }).select('_id');
            const businessIds = businesses.map(b => b._id);

            if (businessIds.length === 0) {
                return res.json({
                    success: true,
                    data: [],
                    pagination: {
                        total: 0,
                        page: parseInt(page),
                        limit: parseInt(limit),
                        pages: 0
                    }
                });
            }

            query.business = { $in: businessIds };

        } else if (userRole === 'manager') {
            // Manager sees notifications only from their business
            const manager = await Manager.findById(userId).populate('business');
            if (!manager || !manager.business) {
                return res.status(404).json({
                    success: false,
                    message: "Manager or business not found"
                });
            }
            query.business = manager.business._id;

            // Manager: Skip cache for real-time notifications
            // No cache check - always fetch fresh data
        } else {
            return res.status(403).json({
                success: false,
                message: "Unauthorized access"
            });
        }

        if (status) query.status = status;
        if (type) query.type = type;
        if (startDate && endDate) {
            query.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        const notifications = await Notification.find(query)
            .populate('sender', 'name username')
            .populate('business', 'name')
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .sort({ createdAt: -1 });

        const total = await Notification.countDocuments(query);

        const response = {
            success: true,
            data: notifications.map(n => n.toObject()),
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        };

        // Only cache for admin role
        // if (userRole === 'admin') {
        //     const cacheKey = `user:${userId}:notifications:${status}:${type}:${startDate}:${endDate}:${page}:${limit}`;
        //     await setCache(cacheKey, response, 120);
        // }

        return res.json(response);
    } catch (err) {
        next(err);
    }
};

// ================== Get Notification Analytics ==================
const getNotificationAnalytics = async (req, res, next) => {
    try {
        const { notificationId } = req.params;
        const managerId = req.user.id;

        const notification = await Notification.findById(notificationId)
            .populate('deliveries.customer', 'name email phone')
            .populate('sender', 'name username');

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: "Notification not found"
            });
        }

        // Check if manager has permission
        if (notification.sender._id.toString() !== managerId) {
            return res.status(403).json({
                success: false,
                message: "Access denied"
            });
        }

        // Get detailed analytics
        const analytics = {
            overview: {
                totalRecipients: notification.stats.totalRecipients,
                sent: notification.stats.sent,
                delivered: notification.stats.delivered,
                opened: notification.stats.opened,
                clicked: notification.stats.clicked,
                failed: notification.stats.failed,
                deliveryRate: notification.deliveryRate,
                engagementRate: notification.engagementRate
            },
            performance: {
                openRate: notification.analytics.openRate,
                clickRate: notification.analytics.clickRate,
                conversionRate: notification.analytics.conversionRate,
                revenue: notification.analytics.revenue,
                newBookings: notification.analytics.newBookings
            },
            deliveries: notification.deliveries.map(delivery => ({
                customer: delivery.customer,
                channel: delivery.channel,
                status: delivery.status,
                sentAt: delivery.sentAt,
                deliveredAt: delivery.deliveredAt,
                openedAt: delivery.openedAt,
                clickedAt: delivery.clickedAt,
                failureReason: delivery.failureReason
            }))
        };

        return res.json({
            success: true,
            data: analytics
        });
    } catch (err) {
        next(err);
    }
};

// ================== Create Campaign ==================
const createCampaign = async (req, res, next) => {
    try {
        const managerId = req.user.id;
        const {
            name,
            description,
            type,
            settings,
            targetAudience,
            content,
            abTesting
        } = req.body;

        // Get manager's business
        const manager = await Manager.findById(managerId).populate('business');
        if (!manager || !manager.business) {
            return res.status(404).json({
                success: false,
                message: "Manager or business not found"
            });
        }

        // Get target customer count
        let totalTargetCount = 0;
        for (const segment of targetAudience.segments) {
            const customers = await getTargetCustomers(manager.business._id, segment.criteria);
            totalTargetCount += customers.length;
        }

        if (totalTargetCount === 0) {
            return res.status(400).json({
                success: false,
                message: "No customers found matching the target criteria"
            });
        }

        // Create campaign
        const campaign = await Campaign.create({
            business: manager.business._id,
            createdBy: managerId,
            name,
            description,
            type,
            settings,
            targetAudience,
            content,
            abTesting,
            status: 'draft',
            performance: {
                totalSent: 0,
                totalDelivered: 0,
                totalOpened: 0,
                totalClicked: 0,
                totalConversions: 0,
                totalRevenue: 0,
                cost: 0,
                roi: 0
            }
        });

        // Cache Invalidation Removed
        // await deleteCache(`manager:${managerId}:campaigns`);
        // await deleteCache(`business:${manager.business._id}:campaigns`);

        return res.status(201).json({
            success: true,
            message: "Campaign created successfully",
            data: {
                campaign: campaign.toObject(),
                targetCount: totalTargetCount,
                estimatedCost: calculateCampaignCost(totalTargetCount, content.templates)
            }
        });
    } catch (err) {
        next(err);
    }
};

// ================== Get Campaigns ==================
const getCampaigns = async (req, res, next) => {
    try {
        const managerId = req.user.id;
        const {
            page = 1,
            limit = 10,
            status,
            type,
            startDate,
            endDate
        } = req.query;

        // Get manager's business
        const manager = await Manager.findById(managerId).populate('business');
        if (!manager || !manager.business) {
            return res.status(404).json({
                success: false,
                message: "Manager or business not found"
            });
        }

        // Cache Removed (User Request)
        // const cacheKey = `manager:${managerId}:campaigns:${status}:${type}:${startDate}:${endDate}:${page}:${limit}`;
        // const cachedData = await getCache(cacheKey);
        // if (cachedData) {
        //     return res.json({ success: true, source: "cache", ...cachedData });
        // }

        let query = { business: manager.business._id };

        if (status) query.status = status;
        if (type) query.type = type;
        if (startDate && endDate) {
            query['settings.startDate'] = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        const campaigns = await Campaign.find(query)
            .populate('createdBy', 'name username')
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .sort({ createdAt: -1 });

        const total = await Campaign.countDocuments(query);

        const response = {
            success: true,
            data: campaigns.map(c => c.toObject()),
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        };

        // Cache Removed (User Request)
        // await setCache(cacheKey, response, 120);
        return res.json(response);
    } catch (err) {
        next(err);
    }
};

// ================== Get Customer Analytics ==================
const getCustomerAnalyticsForNotifications = async (req, res, next) => {
    try {
        const managerId = req.user.id;
        const { startDate, endDate, groupBy } = req.query;

        // Get manager's business
        const manager = await Manager.findById(managerId).populate('business');
        if (!manager || !manager.business) {
            return res.status(404).json({
                success: false,
                message: "Manager or business not found"
            });
        }

        // Cache Removed (User Request)
        // const cacheKey = `manager:${managerId}:customer-analytics:${startDate}:${endDate}:${groupBy}`;
        // const cachedData = await getCache(cacheKey);
        // if (cachedData) {
        //     return res.json({ success: true, source: "cache", ...cachedData });
        // }

        const analytics = await getCustomerAnalytics(manager.business._id, {
            startDate,
            endDate,
            groupBy
        });

        // Cache Removed (User Request)
        // await setCache(cacheKey, analytics, 300);
        return res.json({
            success: true,
            data: analytics
        });
    } catch (err) {
        next(err);
    }
};

// ================== Helper Functions ==================

/**
 * Send notification to individual customer
 * @param {Object} notification - Notification object
 * @param {Object} customer - Customer object
 * @returns {Promise} - Send result
 */
const sendNotificationToCustomer = async (notification, customer) => {
    const { delivery, content, title, message } = notification;
    const results = [];

    for (const channel of delivery.channels) {
        try {
            switch (channel) {
                case 'email':
                    if (customer.email) {
                        await sendMail({
                            to: customer.email,
                            subject: title,
                            html: `
                                <h2>${title}</h2>
                                <p>${message}</p>
                                ${content.imageUrl ? `<img src="${content.imageUrl}" alt="Campaign Image" style="max-width: 100%;">` : ''}
                                ${content.actionUrl ? `<a href="${content.actionUrl}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">${content.actionText || 'Click Here'}</a>` : ''}
                            `
                        });
                        results.push({ channel, success: true });
                    } else {
                        results.push({ channel, success: false, error: 'No email address' });
                    }
                    break;

                case 'sms':
                    if (customer.phone) {
                        await sendSMS({
                            to: customer.phone,
                            message: `${title}\n\n${message}${content.actionUrl ? `\n\n${content.actionUrl}` : ''}`
                        });
                        results.push({ channel, success: true });
                    } else {
                        results.push({ channel, success: false, error: 'No phone number' });
                    }
                    break;

                case 'whatsapp':
                    if (customer.phone) {
                        // WhatsApp integration would go here
                        console.log(`WhatsApp message to ${customer.phone}: ${message}`);
                        results.push({ channel, success: true });
                    } else {
                        results.push({ channel, success: false, error: 'No phone number' });
                    }
                    break;

                case 'push':
                    // Push notification integration would go here
                    console.log(`Push notification to ${customer._id}: ${message}`);
                    results.push({ channel, success: true });
                    break;
            }
        } catch (error) {
            console.error(`Failed to send ${channel} to ${customer._id}:`, error.message);
            results.push({ channel, success: false, error: error.message });
        }
    }

    // Return success if at least one channel succeeded
    const hasSuccess = results.some(r => r.success);
    if (!hasSuccess) {
        throw new Error(`All channels failed: ${results.map(r => r.error).join(', ')}`);
    }

    return results;
};

/**
 * Calculate notification cost
 * @param {number} recipientCount - Number of recipients
 * @param {Array} channels - Delivery channels
 * @returns {number} - Estimated cost
 */
const calculateNotificationCost = (recipientCount, channels) => {
    const costs = {
        email: 0.01, // $0.01 per email
        sms: 0.05,   // $0.05 per SMS
        whatsapp: 0.02, // $0.02 per WhatsApp message
        push: 0.001  // $0.001 per push notification
    };

    return channels.reduce((total, channel) => {
        return total + (recipientCount * (costs[channel] || 0));
    }, 0);
};

/**
 * Calculate campaign cost
 * @param {number} recipientCount - Number of recipients
 * @param {Array} templates - Message templates
 * @returns {number} - Estimated cost
 */
const calculateCampaignCost = (recipientCount, templates) => {
    return templates.reduce((total, template) => {
        return total + calculateNotificationCost(recipientCount, [template.channel]);
    }, 0);
};

module.exports = {
    createNotification,
    sendNotification,
    getNotifications,
    getNotificationAnalytics,
    createCampaign,
    getCampaigns,
    getCustomerAnalytics: getCustomerAnalyticsForNotifications
};