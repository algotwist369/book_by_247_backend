// campaignController.js - Marketing campaign management
const Campaign = require("../models/Campaign");
const Customer = require("../models/Customer");
const Business = require("../models/Business");
const Manager = require("../models/Manager");
const mongoose = require("mongoose");
const { setCache, getCache, deleteCache } = require("../utils/cache");

// Helper function to validate MongoDB ObjectId
const isValidObjectId = (id) => {
    if (!id || id === 'undefined' || id === 'null') {
        return false;
    }
    return mongoose.Types.ObjectId.isValid(id);
};

// ================== Create Campaign ==================
const createCampaign = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const campaignData = req.body;

        // Determine business
        let business;
        if (userRole === 'admin') {
            if (!campaignData.businessId || !isValidObjectId(campaignData.businessId)) {
                return res.status(400).json({
                    success: false,
                    message: "Valid Business ID is required"
                });
            }
            business = await Business.findOne({ _id: campaignData.businessId, admin: userId });
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            if (!manager || !manager.business) {
                return res.status(404).json({
                    success: false,
                    message: "Manager not found or business not assigned"
                });
            }
            if (!isValidObjectId(manager.business)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid business ID for manager"
                });
            }
            business = await Business.findById(manager.business);
        }

        if (!business) {
            return res.status(404).json({
                success: false,
                message: "Business not found or access denied"
            });
        }

        // Get target customers based on audience selection
        let targetCustomers = [];
        let totalRecipients = 0;

        if (campaignData.targetAudience === 'all') {
            totalRecipients = await Customer.countDocuments({
                business: business._id,
                isActive: true
            });
        } else if (campaignData.targetAudience === 'specific') {
            targetCustomers = campaignData.targetCustomers || [];
            // Validate that all target customers belong to this business
            if (targetCustomers.length > 0) {
                const validCount = await Customer.countDocuments({
                    _id: { $in: targetCustomers },
                    business: business._id,
                    isActive: true
                });
                if (validCount !== targetCustomers.length) {
                    return res.status(400).json({
                        success: false,
                        message: "One or more selected customers are invalid or do not belong to this business"
                    });
                }
            }
            totalRecipients = targetCustomers.length;
        } else if (campaignData.targetAudience === 'segment') {
            // Build query based on segment filters
            const query = { business: business._id, isActive: true };
            const filters = campaignData.segmentFilters;

            if (filters) {
                // Customer Type
                if (filters.customerType && filters.customerType.length > 0) {
                    query.customerType = { $in: filters.customerType };
                }

                // Membership Tier
                if (filters.membershipTier && filters.membershipTier.length > 0) {
                    query.membershipTier = { $in: filters.membershipTier };
                }

                // Spending
                if (filters.minTotalSpent !== undefined || filters.maxTotalSpent !== undefined) {
                    query.totalSpent = {};
                    if (filters.minTotalSpent !== undefined) query.totalSpent.$gte = filters.minTotalSpent;
                    if (filters.maxTotalSpent !== undefined) query.totalSpent.$lte = filters.maxTotalSpent;
                }

                // Visits
                if (filters.minVisits !== undefined || filters.maxVisits !== undefined) {
                    query.totalVisits = {};
                    if (filters.minVisits !== undefined) query.totalVisits.$gte = filters.minVisits;
                    if (filters.maxVisits !== undefined) query.totalVisits.$lte = filters.maxVisits;
                }

                // Last Visit
                if (filters.lastVisitBefore || filters.lastVisitAfter) {
                    query.lastVisit = {};
                    if (filters.lastVisitAfter) query.lastVisit.$gte = new Date(filters.lastVisitAfter);
                    if (filters.lastVisitBefore) query.lastVisit.$lte = new Date(filters.lastVisitBefore);
                }

                // Tags
                if (filters.tags && filters.tags.length > 0) {
                    query.tags = { $in: filters.tags };
                }

                // Contact Info Presence
                if (filters.hasEmail) {
                    query.email = { $exists: true, $ne: '' };
                }
                if (filters.hasPhone) {
                    query.phone = { $exists: true, $ne: '' };
                }

                // Marketing Consent
                if (filters.marketingConsent) {
                    if (filters.marketingConsent.email) query['marketingConsent.email'] = true;
                    if (filters.marketingConsent.sms) query['marketingConsent.sms'] = true;
                    if (filters.marketingConsent.whatsapp) query['marketingConsent.whatsapp'] = true;
                }
            }

            const customers = await Customer.find(query).select('_id');
            targetCustomers = customers.map(c => c._id);
            totalRecipients = targetCustomers.length;
        }

        // Create campaign
        const campaign = await Campaign.create({
            ...campaignData,
            business: business._id,
            targetCustomers: campaignData.targetAudience === 'all' ? [] : targetCustomers, // Don't store IDs for 'all' to save space
            stats: {
                totalRecipients
            },
            createdBy: userId,
            createdByModel: userRole === 'admin' ? 'Admin' : 'Manager'
        });

        // Invalidate cache
        await deleteCache(`business:${business._id}:campaigns`);
        if (userRole === 'admin') {
            await deleteCache(`admin:${userId}:all_businesses:campaigns*`);
        }

        return res.status(201).json({
            success: true,
            message: "Campaign created successfully",
            data: {
                id: campaign._id,
                name: campaign.name,
                type: campaign.type,
                status: campaign.status,
                totalRecipients: campaign.stats.totalRecipients
            }
        });
    } catch (err) {
        next(err);
    }
};

// ================== Get Campaigns ==================
const getCampaigns = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const {
            businessId,
            page = 1,
            limit = 20,
            status,
            type,
            startDate,
            endDate,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        // Determine business(es)
        let businessIds = [];

        if (userRole === 'admin') {
            if (businessId && isValidObjectId(businessId)) {
                const business = await Business.findOne({ _id: businessId, admin: userId });
                if (!business) {
                    return res.status(404).json({
                        success: false,
                        message: "Business not found or access denied"
                    });
                }
                businessIds = [business._id];
            } else {
                // Fetch all businesses for admin
                const businesses = await Business.find({ admin: userId }).select('_id');
                businessIds = businesses.map(b => b._id);
            }
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            if (!manager || !manager.business) {
                return res.status(404).json({
                    success: false,
                    message: "Manager not found or business not assigned"
                });
            }
            businessIds = [manager.business];
        }

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

        const cacheKeyPrefix = businessId ? `business:${businessId}` : `admin:${userId}:all_businesses`;
        const cacheKey = `${cacheKeyPrefix}:campaigns:${page}:${limit}:${status}:${type}:${startDate}:${endDate}:${sortBy}:${sortOrder}`;

        // Try cache first
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            return res.json({ success: true, source: "cache", ...cachedData });
        }

        // Build query
        let query = { business: { $in: businessIds } };

        if (status) {
            query.status = status;
        }

        if (type) {
            query.type = type;
        }

        if (startDate && endDate) {
            query.scheduledDate = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        // Sort options
        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

        const campaigns = await Campaign.find(query)
            .populate('business', 'name') // Populate business name for list view
            .select('-recipients') // Exclude detailed recipients array for list view
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .sort(sortOptions)
            .lean();

        const total = await Campaign.countDocuments(query);

        const response = {
            success: true,
            data: campaigns,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        };

        // Cache for 2 minutes
        await setCache(cacheKey, response, 120);

        return res.json(response);
    } catch (err) {
        next(err);
    }
};

// ================== Get Campaign by ID ==================
const getCampaignById = async (req, res, next) => {
    try {
        const { id } = req.params;

        const campaign = await Campaign.findById(id)
            .populate('business', 'name email phone')
            .populate('targetCustomers', 'firstName lastName phone email')
            .populate('recipients.customer', 'firstName lastName phone email');

        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: "Campaign not found"
            });
        }

        return res.json({
            success: true,
            data: campaign
        });
    } catch (err) {
        next(err);
    }
};

// ================== Update Campaign ==================
const updateCampaign = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { id } = req.params;
        const updates = req.body;

        const campaign = await Campaign.findById(id);

        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: "Campaign not found"
            });
        }

        // Cannot update campaigns that are in progress or completed
        if (['in_progress', 'completed'].includes(campaign.status)) {
            return res.status(400).json({
                success: false,
                message: "Cannot update campaign that is in progress or completed"
            });
        }

        // Update campaign
        Object.assign(campaign, updates);
        campaign.updatedBy = userId;
        campaign.updatedByModel = userRole === 'admin' ? 'Admin' : 'Manager';

        await campaign.save();

        // Invalidate cache
        await deleteCache(`business:${campaign.business}:campaigns`);
        // Also invalidate admin all businesses cache
        if (userRole === 'admin') {
            await deleteCache(`admin:${userId}:all_businesses:campaigns*`);
        }

        return res.json({
            success: true,
            message: "Campaign updated successfully",
            data: campaign
        });
    } catch (err) {
        next(err);
    }
};

// ================== Launch Campaign ==================
const launchCampaign = async (req, res, next) => {
    try {
        const { id } = req.params;

        const campaign = await Campaign.findById(id).populate('business');

        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: "Campaign not found"
            });
        }

        if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
            return res.status(400).json({
                success: false,
                message: "Campaign can only be launched from draft or scheduled status"
            });
        }

        // Fetch target customers
        let customers = [];
        if (campaign.targetAudience === 'all') {
            customers = await Customer.find({
                business: campaign.business._id,
                isActive: true
            });
        } else if (campaign.targetAudience === 'specific') {
            customers = await Customer.find({
                _id: { $in: campaign.targetCustomers },
                isActive: true
            });
        }

        // Create recipients array
        const recipients = [];
        for (const customer of customers) {
            for (const channel of campaign.channels) {
                // Check if customer has opted in for this channel
                let canSend = false;

                if (channel === 'email' && customer.email && customer.marketingConsent?.email) {
                    canSend = true;
                } else if (channel === 'sms' && customer.phone && customer.marketingConsent?.sms) {
                    canSend = true;
                } else if (channel === 'whatsapp' && customer.phone && customer.marketingConsent?.whatsapp) {
                    canSend = true;
                }

                if (canSend) {
                    recipients.push({
                        customer: customer._id,
                        channel,
                        status: 'pending'
                    });
                }
            }
        }

        campaign.recipients = recipients;
        campaign.stats.totalRecipients = recipients.length;
        await campaign.start();

        // TODO: Implement actual sending logic here
        // This would integrate with email/SMS providers
        // For now, we'll just mark as completed

        // Simulate campaign execution
        setTimeout(async () => {
            campaign.stats.sent = recipients.length;
            campaign.stats.delivered = Math.floor(recipients.length * 0.95);
            campaign.stats.opened = Math.floor(recipients.length * 0.40);
            campaign.stats.clicked = Math.floor(recipients.length * 0.10);
            await campaign.complete();
        }, 1000);

        // Invalidate cache
        await deleteCache(`business:${campaign.business._id}:campaigns`);
        // We can't easily invalidate "all" cache here without userId, but it expires quickly (2m)

        return res.json({
            success: true,
            message: "Campaign launched successfully",
            data: {
                campaignId: campaign._id,
                status: campaign.status,
                totalRecipients: campaign.stats.totalRecipients
            }
        });
    } catch (err) {
        next(err);
    }
};

// ================== Cancel Campaign ==================
const cancelCampaign = async (req, res, next) => {
    try {
        const { id } = req.params;

        const campaign = await Campaign.findById(id);

        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: "Campaign not found"
            });
        }

        if (campaign.status === 'completed') {
            return res.status(400).json({
                success: false,
                message: "Cannot cancel completed campaign"
            });
        }

        await campaign.cancel();

        // Invalidate cache
        await deleteCache(`business:${campaign.business}:campaigns`);

        return res.json({
            success: true,
            message: "Campaign cancelled successfully"
        });
    } catch (err) {
        next(err);
    }
};

// ================== Get Campaign Statistics ==================
const getCampaignStats = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { businessId, startDate, endDate } = req.query;

        // Determine business(es)
        let businessIds = [];

        if (userRole === 'admin') {
            if (businessId && isValidObjectId(businessId)) {
                const business = await Business.findOne({ _id: businessId, admin: userId });
                if (!business) {
                    return res.status(404).json({
                        success: false,
                        message: "Business not found or access denied"
                    });
                }
                businessIds = [business._id];
            } else {
                // Fetch all businesses for admin
                const businesses = await Business.find({ admin: userId }).select('_id');
                businessIds = businesses.map(b => b._id);
            }
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            if (!manager || !manager.business) {
                return res.status(404).json({
                    success: false,
                    message: "Manager not found or business not assigned"
                });
            }
            businessIds = [manager.business];
        }

        if (businessIds.length === 0) {
            return res.json({
                success: true,
                data: {
                    totalSent: 0,
                    totalDelivered: 0,
                    totalOpened: 0,
                    totalClicked: 0,
                    totalConverted: 0,
                    totalRevenue: 0,
                    totalCost: 0,
                    deliveryRate: 0,
                    openRate: 0,
                    clickRate: 0,
                    conversionRate: 0,
                    roi: 0
                }
            });
        }

        const cacheKeyPrefix = businessId ? `business:${businessId}` : `admin:${userId}:all_businesses`;
        const cacheKey = `${cacheKeyPrefix}:campaign:stats:${startDate}:${endDate}`;

        // Try cache first
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            return res.json({ success: true, source: "cache", data: cachedData });
        }

        // Aggregate stats across all selected businesses
        // Note: Campaign.getPerformanceStats likely takes a single businessId. 
        // We might need to loop or update the model method. 
        // For now, let's assume we iterate and sum up if multiple businesses.

        let aggregatedStats = {
            totalSent: 0,
            totalDelivered: 0,
            totalOpened: 0,
            totalClicked: 0,
            totalConverted: 0,
            totalRevenue: 0,
            totalCost: 0
        };

        for (const bId of businessIds) {
            const stats = await Campaign.getPerformanceStats(
                bId,
                new Date(startDate),
                new Date(endDate)
            );

            aggregatedStats.totalSent += stats.totalSent || 0;
            aggregatedStats.totalDelivered += stats.totalDelivered || 0;
            aggregatedStats.totalOpened += stats.totalOpened || 0;
            aggregatedStats.totalClicked += stats.totalClicked || 0;
            aggregatedStats.totalConverted += stats.totalConverted || 0;
            aggregatedStats.totalRevenue += stats.totalRevenue || 0;
            aggregatedStats.totalCost += stats.totalCost || 0;
        }

        const stats = aggregatedStats;

        // Calculate rates
        stats.deliveryRate = stats.totalSent > 0
            ? Math.round((stats.totalDelivered / stats.totalSent) * 100)
            : 0;
        stats.openRate = stats.totalDelivered > 0
            ? Math.round((stats.totalOpened / stats.totalDelivered) * 100)
            : 0;
        stats.clickRate = stats.totalOpened > 0
            ? Math.round((stats.totalClicked / stats.totalOpened) * 100)
            : 0;
        stats.conversionRate = stats.totalDelivered > 0
            ? Math.round((stats.totalConverted / stats.totalDelivered) * 100)
            : 0;
        stats.roi = stats.totalCost > 0
            ? Math.round(((stats.totalRevenue - stats.totalCost) / stats.totalCost) * 100)
            : 0;

        // Cache for 5 minutes
        await setCache(cacheKey, stats, 300);

        return res.json({
            success: true,
            data: stats
        });
    } catch (err) {
        next(err);
    }
};

// ================== Get Target Audience Count ==================
const getTargetAudienceCount = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { businessId, targetAudience, segmentFilters, targetCustomers } = req.body;

        // Determine business
        let business;
        if (userRole === 'admin') {
            if (!businessId || !isValidObjectId(businessId)) {
                return res.status(400).json({
                    success: false,
                    message: "Valid Business ID is required"
                });
            }
            business = await Business.findOne({ _id: businessId, admin: userId });
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            if (!manager || !manager.business) {
                return res.status(404).json({
                    success: false,
                    message: "Manager not found or business not assigned"
                });
            }
            if (!isValidObjectId(manager.business)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid business ID for manager"
                });
            }
            business = await Business.findById(manager.business);
        }

        if (!business) {
            return res.status(404).json({
                success: false,
                message: "Business not found or access denied"
            });
        }

        let count = 0;

        if (targetAudience === 'all') {
            count = await Customer.countDocuments({
                business: business._id,
                isActive: true
            });
        } else if (targetAudience === 'specific') {
            count = targetCustomers?.length || 0;
        } else if (targetAudience === 'segment') {
            const query = { business: business._id, isActive: true };

            if (segmentFilters) {
                if (segmentFilters.customerType) {
                    query.customerType = { $in: segmentFilters.customerType };
                }
                if (segmentFilters.membershipTier) {
                    query.membershipTier = { $in: segmentFilters.membershipTier };
                }
                if (segmentFilters.minTotalSpent) {
                    query.totalSpent = { $gte: segmentFilters.minTotalSpent };
                }
                if (segmentFilters.tags && segmentFilters.tags.length > 0) {
                    query.tags = { $in: segmentFilters.tags };
                }
            }

            count = await Customer.countDocuments(query);
        }

        return res.json({
            success: true,
            data: { count }
        });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    createCampaign,
    getCampaigns,
    getCampaignById,
    updateCampaign,
    launchCampaign,
    cancelCampaign,
    getCampaignStats,
    getTargetAudienceCount
};

