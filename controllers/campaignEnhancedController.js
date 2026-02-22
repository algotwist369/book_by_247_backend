// campaignEnhancedController.js - Enhanced campaign features
const Campaign = require("../models/Campaign");
const CampaignTemplate = require("../models/CampaignTemplate");
const AutomatedCampaign = require("../models/AutomatedCampaign");
const DripCampaign = require("../models/DripCampaign");
const Customer = require("../models/Customer");
const Business = require("../models/Business");
const Manager = require("../models/Manager");
const Appointment = require("../models/Appointment");
const Invoice = require("../models/Invoice");
const { setCache, getCache, deleteCache } = require("../utils/cache");

// ================== CAMPAIGN TEMPLATES ==================

// Create Template
const createTemplate = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const templateData = req.body;

        // Determine business
        let business = null;
        if (templateData.businessId) {
            if (userRole === 'admin') {
                business = await Business.findOne({ _id: templateData.businessId, admin: userId });
            } else if (userRole === 'manager') {
                const manager = await Manager.findById(userId);
                if (manager.business.toString() === templateData.businessId) {
                    business = await Business.findById(manager.business);
                }
            }
        }

        const template = await CampaignTemplate.create({
            ...templateData,
            business: business?._id || null,
            createdBy: userId,
            createdByModel: userRole === 'admin' ? 'Admin' : 'Manager'
        });

        return res.status(201).json({
            success: true,
            message: "Template created successfully",
            data: template
        });
    } catch (err) {
        next(err);
    }
};

// Get Templates
const getTemplates = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { businessId, category, type, search, page = 1, limit = 20 } = req.query;

        let business = null;
        if (businessId) {
            if (userRole === 'admin') {
                business = await Business.findOne({ _id: businessId, admin: userId });
            } else if (userRole === 'manager') {
                const manager = await Manager.findById(userId);
                if (manager && manager.business) {
                    business = await Business.findById(manager.business);
                }
            }
        }

        // Build query - Fixed $or operator usage
        const query = { isActive: true };

        // Business filter with proper $or syntax
        if (business) {
            query.$or = [
                { business: business._id },
                { business: null, isPublic: true }
            ];
        } else {
            query.$or = [
                { business: null, isPublic: true }
            ];
        }

        // Category filter
        if (category) {
            query.category = category;
        }

        // Type filter
        if (type) {
            query.campaignType = type;
        }

        // Search filter
        if (search) {
            query.$and = query.$and || [];
            query.$and.push({
                $or: [
                    { name: { $regex: search, $options: 'i' } },
                    { description: { $regex: search, $options: 'i' } }
                ]
            });
        }

        const templates = await CampaignTemplate.find(query)
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .sort({ 'stats.timesUsed': -1 })
            .lean();

        const total = await CampaignTemplate.countDocuments(query);

        return res.json({
            success: true,
            data: templates,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        next(err);
    }
};

// Get Popular Templates
const getPopularTemplates = async (req, res, next) => {
    try {
        const { limit = 10 } = req.query;

        const templates = await CampaignTemplate.getPopular(parseInt(limit));

        return res.json({
            success: true,
            data: templates
        });
    } catch (err) {
        next(err);
    }
};

// Get Template by ID
const getTemplateById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const userRole = req.user.role;

        const template = await CampaignTemplate.findById(id);

        if (!template) {
            return res.status(404).json({
                success: false,
                message: "Template not found"
            });
        }

        // Check access - user can access if:
        // 1. Template is public
        // 2. Template belongs to their business (for managers)
        // 3. They are admin and template belongs to one of their businesses
        if (!template.isPublic && template.business) {
            if (userRole === 'manager') {
                const manager = await Manager.findById(userId);
                if (!manager || manager.business.toString() !== template.business.toString()) {
                    return res.status(403).json({
                        success: false,
                        message: "Access denied to this template"
                    });
                }
            } else if (userRole === 'admin') {
                const business = await Business.findOne({ _id: template.business, admin: userId });
                if (!business) {
                    return res.status(403).json({
                        success: false,
                        message: "Access denied to this template"
                    });
                }
            }
        }

        return res.json({
            success: true,
            data: template
        });
    } catch (err) {
        next(err);
    }
};

// ================== AUTOMATED CAMPAIGNS ==================

// Create Automated Campaign
const createAutomatedCampaign = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const campaignData = req.body;

        // Determine business
        let business;
        if (userRole === 'admin') {
            if (!campaignData.businessId) {
                return res.status(400).json({
                    success: false,
                    message: "Business ID is required"
                });
            }
            business = await Business.findOne({ _id: campaignData.businessId, admin: userId });
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            business = await Business.findById(manager.business);
        }

        if (!business) {
            return res.status(404).json({
                success: false,
                message: "Business not found or access denied"
            });
        }

        const automatedCampaign = await AutomatedCampaign.create({
            ...campaignData,
            business: business._id,
            createdBy: userId,
            createdByModel: userRole === 'admin' ? 'Admin' : 'Manager'
        });

        return res.status(201).json({
            success: true,
            message: "Automated campaign created successfully",
            data: automatedCampaign
        });
    } catch (err) {
        next(err);
    }
};

// Get Automated Campaigns
const getAutomatedCampaigns = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { businessId, triggerType, isActive, page = 1, limit = 20 } = req.query;

        // Determine business
        let business;
        if (userRole === 'admin') {
            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: "Business ID is required"
                });
            }
            business = await Business.findOne({ _id: businessId, admin: userId });
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            business = await Business.findById(manager.business);
        }

        if (!business) {
            return res.status(404).json({
                success: false,
                message: "Business not found or access denied"
            });
        }

        const query = { business: business._id };
        if (triggerType) query.triggerType = triggerType;
        if (isActive !== undefined) query.isActive = isActive === 'true';

        const campaigns = await AutomatedCampaign.find(query)
            .populate('template')
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .sort({ createdAt: -1 })
            .lean();

        const total = await AutomatedCampaign.countDocuments(query);

        return res.json({
            success: true,
            data: campaigns,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        next(err);
    }
};

// Trigger Automated Campaign Manually
const triggerAutomatedCampaign = async (req, res, next) => {
    try {
        const { id } = req.params;

        const automatedCampaign = await AutomatedCampaign.findById(id)
            .populate('business')
            .populate('template');

        if (!automatedCampaign) {
            return res.status(404).json({
                success: false,
                message: "Automated campaign not found"
            });
        }

        // Execute the automated campaign logic
        const result = await executeAutomatedCampaign(automatedCampaign);

        return res.json({
            success: true,
            message: "Automated campaign triggered successfully",
            data: result
        });
    } catch (err) {
        next(err);
    }
};

// Get Automated Campaign by ID
const getAutomatedCampaignById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const userRole = req.user.role;

        const campaign = await AutomatedCampaign.findById(id)
            .populate('template')
            .populate('business', 'name');

        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: "Automated campaign not found"
            });
        }

        // Check access
        if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            if (!manager || manager.business.toString() !== campaign.business._id.toString()) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied"
                });
            }
        } else if (userRole === 'admin') {
            const business = await Business.findOne({ _id: campaign.business._id, admin: userId });
            if (!business) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied"
                });
            }
        }

        return res.json({
            success: true,
            data: campaign
        });
    } catch (err) {
        next(err);
    }
};

// Update Automated Campaign
const updateAutomatedCampaign = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const userRole = req.user.role;
        const updateData = req.body;

        const campaign = await AutomatedCampaign.findById(id);

        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: "Automated campaign not found"
            });
        }

        // Check access
        if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            if (!manager || manager.business.toString() !== campaign.business.toString()) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied"
                });
            }
        } else if (userRole === 'admin') {
            const business = await Business.findOne({ _id: campaign.business, admin: userId });
            if (!business) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied"
                });
            }
        }

        // Update campaign
        Object.assign(campaign, updateData);
        await campaign.save();

        return res.json({
            success: true,
            message: "Automated campaign updated successfully",
            data: campaign
        });
    } catch (err) {
        next(err);
    }
};

// Delete Automated Campaign
const deleteAutomatedCampaign = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const userRole = req.user.role;

        const campaign = await AutomatedCampaign.findById(id);

        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: "Automated campaign not found"
            });
        }

        // Check access
        if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            if (!manager || manager.business.toString() !== campaign.business.toString()) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied"
                });
            }
        } else if (userRole === 'admin') {
            const business = await Business.findOne({ _id: campaign.business, admin: userId });
            if (!business) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied"
                });
            }
        }

        await campaign.deleteOne();

        return res.json({
            success: true,
            message: "Automated campaign deleted successfully"
        });
    } catch (err) {
        next(err);
    }
};

// Helper function to execute automated campaign
async function executeAutomatedCampaign(automatedCampaign) {
    try {
        // Build query based on trigger type
        let customerQuery = {
            business: automatedCampaign.business._id,
            isActive: true
        };

        const now = new Date();
        const triggerType = automatedCampaign.triggerType;
        const triggerConfig = automatedCampaign.triggerConfig;

        switch (triggerType) {
            case 'customer_birthday':
                const today = new Date();
                customerQuery.dateOfBirth = {
                    $exists: true
                };
                // We'll filter by month/day in code
                break;

            case 'customer_anniversary':
                // Customer anniversary (account creation date)
                customerQuery.createdAt = {
                    $exists: true
                };
                // We'll filter by month/day in code (similar to birthday)
                break;

            case 'days_since_last_visit':
                const lastVisitDate = new Date(now.getTime() - (triggerConfig.days * 24 * 60 * 60 * 1000));
                customerQuery.lastVisit = {
                    $gte: new Date(lastVisitDate.getTime() - 24 * 60 * 60 * 1000),
                    $lte: new Date(lastVisitDate.getTime() + 24 * 60 * 60 * 1000)
                };
                break;

            case 'days_of_inactivity':
                const inactiveDate = new Date(now.getTime() - (triggerConfig.days * 24 * 60 * 60 * 1000));
                customerQuery.lastVisit = {
                    $lt: inactiveDate
                };
                break;

            case 'new_customer_signup':
                const signupDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                customerQuery.createdAt = {
                    $gte: signupDate
                };
                break;

            case 'first_purchase':
                // Customers who made their first purchase recently
                customerQuery.totalPurchases = 1;
                if (triggerConfig.days) {
                    const firstPurchaseDate = new Date(now.getTime() - (triggerConfig.days * 24 * 60 * 60 * 1000));
                    customerQuery.lastPurchaseDate = {
                        $gte: firstPurchaseDate
                    };
                }
                break;

            case 'after_appointment':
                // Customers who had an appointment X days ago
                // We'll need to query appointments separately and get customer IDs
                if (triggerConfig.days) {
                    const appointmentDate = new Date(now.getTime() - (triggerConfig.days * 24 * 60 * 60 * 1000));
                    const appointments = await Appointment.find({
                        business: automatedCampaign.business._id,
                        status: 'completed',
                        appointmentDate: {
                            $gte: new Date(appointmentDate.getTime() - 24 * 60 * 60 * 1000),
                            $lte: new Date(appointmentDate.getTime() + 24 * 60 * 60 * 1000)
                        }
                    }).distinct('customer');
                    customerQuery._id = { $in: appointments };
                }
                break;

            case 'after_purchase':
                // Customers who made a purchase X days ago
                if (triggerConfig.days) {
                    const purchaseDate = new Date(now.getTime() - (triggerConfig.days * 24 * 60 * 60 * 1000));
                    const invoices = await Invoice.find({
                        business: automatedCampaign.business._id,
                        status: 'paid',
                        paidAt: {
                            $gte: new Date(purchaseDate.getTime() - 24 * 60 * 60 * 1000),
                            $lte: new Date(purchaseDate.getTime() + 24 * 60 * 60 * 1000)
                        }
                    }).distinct('customer');
                    customerQuery._id = { $in: invoices };
                }
                break;

            case 'loyalty_tier_upgrade':
                // Customers who recently upgraded their loyalty tier
                if (triggerConfig.toTier) {
                    customerQuery.membershipTier = triggerConfig.toTier;
                    // Filter by customers who changed tier recently (if tierUpgradedAt exists)
                    if (triggerConfig.days) {
                        const upgradeDate = new Date(now.getTime() - (triggerConfig.days * 24 * 60 * 60 * 1000));
                        customerQuery.tierUpgradedAt = {
                            $gte: upgradeDate
                        };
                    }
                }
                break;

            case 'points_expiring':
                // Customers whose loyalty points are expiring soon
                if (triggerConfig.daysBeforeExpiry) {
                    const expiryDate = new Date(now.getTime() + (triggerConfig.daysBeforeExpiry * 24 * 60 * 60 * 1000));
                    customerQuery['loyaltyPoints.expiryDate'] = {
                        $exists: true,
                        $lte: expiryDate,
                        $gte: now
                    };
                    customerQuery['loyaltyPoints.balance'] = { $gt: 0 };
                }
                break;

            case 'subscription_expiring':
                // Customers whose subscription is expiring soon
                if (triggerConfig.daysBeforeExpiration) {
                    const expirationDate = new Date(now.getTime() + (triggerConfig.daysBeforeExpiration * 24 * 60 * 60 * 1000));
                    customerQuery['subscription.endDate'] = {
                        $exists: true,
                        $lte: expirationDate,
                        $gte: now
                    };
                    customerQuery['subscription.status'] = 'active';
                }
                break;

            case 'abandoned_cart':
                // Customers who have items in cart but haven't purchased
                if (triggerConfig.days) {
                    const abandonedDate = new Date(now.getTime() - (triggerConfig.days * 24 * 60 * 60 * 1000));
                    customerQuery['cart.items'] = { $exists: true, $ne: [] };
                    customerQuery['cart.updatedAt'] = {
                        $gte: new Date(abandonedDate.getTime() - 24 * 60 * 60 * 1000),
                        $lte: new Date(abandonedDate.getTime() + 24 * 60 * 60 * 1000)
                    };
                }
                break;

            case 'review_request':
                // Request review after appointment/purchase
                if (triggerConfig.days) {
                    const targetDate = new Date(now.getTime() - (triggerConfig.days * 24 * 60 * 60 * 1000));
                    // Get customers from recent appointments
                    const recentAppointments = await Appointment.find({
                        business: automatedCampaign.business._id,
                        status: 'completed',
                        appointmentDate: {
                            $gte: new Date(targetDate.getTime() - 24 * 60 * 60 * 1000),
                            $lte: new Date(targetDate.getTime() + 24 * 60 * 60 * 1000)
                        },
                        reviewRequested: { $ne: true }
                    }).distinct('customer');
                    customerQuery._id = { $in: recentAppointments };
                }
                break;
        }

        // Apply additional filters
        if (triggerConfig.customerType && triggerConfig.customerType.length > 0) {
            customerQuery.customerType = { $in: triggerConfig.customerType };
        }
        if (triggerConfig.membershipTier && triggerConfig.membershipTier.length > 0) {
            customerQuery.membershipTier = { $in: triggerConfig.membershipTier };
        }
        if (triggerConfig.minTotalSpent) {
            customerQuery.totalSpent = { $gte: triggerConfig.minTotalSpent };
        }
        if (triggerConfig.tags && triggerConfig.tags.length > 0) {
            customerQuery.tags = { $in: triggerConfig.tags };
        }

        // Get eligible customers
        let customers = await Customer.find(customerQuery);

        // Special handling for birthday
        if (triggerType === 'customer_birthday') {
            customers = customers.filter(c => {
                if (!c.dateOfBirth) return false;
                const dob = new Date(c.dateOfBirth);
                return dob.getMonth() === now.getMonth() && dob.getDate() === now.getDate();
            });
        }

        // Special handling for customer anniversary
        if (triggerType === 'customer_anniversary') {
            customers = customers.filter(c => {
                if (!c.createdAt) return false;
                const createdDate = new Date(c.createdAt);
                return createdDate.getMonth() === now.getMonth() && createdDate.getDate() === now.getDate();
            });
        }

        // Filter out customers who already received this campaign (frequency control)
        const eligibleCustomers = customers.filter(c =>
            !automatedCampaign.hasReceivedCampaign(c._id)
        );

        let sent = 0;

        // Create and send campaigns for each customer
        for (const customer of eligibleCustomers) {
            // Get message content
            let messageContent;
            if (automatedCampaign.useTemplate && automatedCampaign.template) {
                const variables = {
                    customerName: `${customer.firstName} ${customer.lastName}`,
                    businessName: automatedCampaign.business.name,
                    offerValue: automatedCampaign.offer?.offerValue || 0,
                    promoCode: automatedCampaign.offer?.promoCode || ''
                };
                messageContent = automatedCampaign.template.render(variables);
            } else {
                messageContent = {
                    subject: automatedCampaign.message?.subject || '',
                    body: automatedCampaign.message?.body || ''
                };
            }

            // Check marketing consent
            const channels = automatedCampaign.channels.filter(channel => {
                if (channel === 'email') return customer.email && customer.marketingConsent?.email;
                if (channel === 'sms') return customer.phone && customer.marketingConsent?.sms;
                if (channel === 'whatsapp') return customer.phone && customer.marketingConsent?.whatsapp;
                return false;
            });

            if (channels.length === 0) continue;

            // Create campaign instance
            const campaign = await Campaign.create({
                business: automatedCampaign.business._id,
                name: `${automatedCampaign.name} - ${customer.firstName}`,
                type: 'automated',
                channels: channels,
                message: {
                    subject: messageContent.subject,
                    body: messageContent.body
                },
                targetAudience: 'specific',
                targetCustomers: [customer._id],
                offer: automatedCampaign.offer,
                status: 'completed',
                stats: {
                    totalRecipients: 1,
                    sent: 1
                },
                createdBy: automatedCampaign.createdBy,
                createdByModel: automatedCampaign.createdByModel
            });

            // Mark as sent in automated campaign
            await automatedCampaign.markAsSent(customer._id, campaign._id);
            sent++;
        }

        // Log execution
        await automatedCampaign.logExecution(
            eligibleCustomers.length,
            sent,
            sent > 0 ? 'success' : 'failed',
            sent === 0 ? 'No eligible customers found' : null
        );

        return {
            customersTargeted: eligibleCustomers.length,
            campaignsSent: sent
        };
    } catch (err) {
        await automatedCampaign.logExecution(0, 0, 'failed', err.message);
        throw err;
    }
}

// ================== DRIP CAMPAIGNS ==================

// Create Drip Campaign
const createDripCampaign = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const dripData = req.body;

        // Determine business
        let business;
        if (userRole === 'admin') {
            if (!dripData.businessId) {
                return res.status(400).json({
                    success: false,
                    message: "Business ID is required"
                });
            }
            business = await Business.findOne({ _id: dripData.businessId, admin: userId });
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            business = await Business.findById(manager.business);
        }

        if (!business) {
            return res.status(404).json({
                success: false,
                message: "Business not found or access denied"
            });
        }

        const dripCampaign = await DripCampaign.create({
            ...dripData,
            business: business._id,
            createdBy: userId,
            createdByModel: userRole === 'admin' ? 'Admin' : 'Manager'
        });

        return res.status(201).json({
            success: true,
            message: "Drip campaign created successfully",
            data: dripCampaign
        });
    } catch (err) {
        next(err);
    }
};

// Get Drip Campaigns
const getDripCampaigns = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { businessId, type, isActive, page = 1, limit = 20 } = req.query;

        // Determine business
        let business;
        if (userRole === 'admin') {
            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: "Business ID is required"
                });
            }
            business = await Business.findOne({ _id: businessId, admin: userId });
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            business = await Business.findById(manager.business);
        }

        if (!business) {
            return res.status(404).json({
                success: false,
                message: "Business not found or access denied"
            });
        }

        const query = { business: business._id };
        if (type) query.type = type;
        if (isActive !== undefined) query.isActive = isActive === 'true';

        const campaigns = await DripCampaign.find(query)
            .select('-enrollments') // Exclude enrollments for list view
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .sort({ createdAt: -1 })
            .lean();

        const total = await DripCampaign.countDocuments(query);

        return res.json({
            success: true,
            data: campaigns,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        next(err);
    }
};

// Enroll Customer in Drip Campaign
const enrollInDrip = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { customerId } = req.body;

        const dripCampaign = await DripCampaign.findById(id);

        if (!dripCampaign) {
            return res.status(404).json({
                success: false,
                message: "Drip campaign not found"
            });
        }

        const enrollment = await dripCampaign.enrollCustomer(customerId);

        return res.json({
            success: true,
            message: "Customer enrolled successfully",
            data: enrollment
        });
    } catch (err) {
        next(err);
    }
};

// Get Drip Campaign Enrollments
const getDripEnrollments = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status, page = 1, limit = 50 } = req.query;

        const dripCampaign = await DripCampaign.findById(id)
            .populate('enrollments.customer', 'firstName lastName email phone');

        if (!dripCampaign) {
            return res.status(404).json({
                success: false,
                message: "Drip campaign not found"
            });
        }

        let enrollments = dripCampaign.enrollments;

        if (status) {
            enrollments = enrollments.filter(e => e.status === status);
        }

        const total = enrollments.length;
        const start = (page - 1) * limit;
        const paginatedEnrollments = enrollments.slice(start, start + parseInt(limit));

        return res.json({
            success: true,
            data: paginatedEnrollments,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        next(err);
    }
};

// ================== CAMPAIGN CLONE ==================

const cloneCampaign = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const userRole = req.user.role;

        const originalCampaign = await Campaign.findById(id).lean();

        if (!originalCampaign) {
            return res.status(404).json({
                success: false,
                message: "Campaign not found"
            });
        }

        // Remove fields that shouldn't be cloned
        const { _id, recipients, stats, executionStartedAt, executionCompletedAt, createdAt, updatedAt, ...clonedData } = originalCampaign;

        // Create new campaign
        const newCampaign = await Campaign.create({
            ...clonedData,
            name: `${originalCampaign.name} (Copy)`,
            status: 'draft',
            stats: {
                totalRecipients: 0,
                sent: 0,
                delivered: 0,
                failed: 0,
                opened: 0,
                clicked: 0,
                converted: 0,
                unsubscribed: 0,
                bounced: 0
            },
            createdBy: userId,
            createdByModel: userRole === 'admin' ? 'Admin' : 'Manager'
        });

        return res.status(201).json({
            success: true,
            message: "Campaign cloned successfully",
            data: newCampaign
        });
    } catch (err) {
        next(err);
    }
};

// ================== A/B TESTING ==================

const startABTest = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { variants, splitPercentage } = req.body;

        const campaign = await Campaign.findById(id);

        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: "Campaign not found"
            });
        }

        if (campaign.status !== 'draft') {
            return res.status(400).json({
                success: false,
                message: "Can only start A/B test on draft campaigns"
            });
        }

        // Setup A/B test
        campaign.abTest.enabled = true;
        campaign.abTest.variants = variants.map((v, index) => ({
            name: v.name || `Variant ${String.fromCharCode(65 + index)}`,
            message: v.message,
            recipients: 0,
            sent: 0,
            opened: 0,
            clicked: 0,
            converted: 0
        }));

        await campaign.save();

        return res.json({
            success: true,
            message: "A/B test started successfully",
            data: campaign.abTest
        });
    } catch (err) {
        next(err);
    }
};

const getABTestResults = async (req, res, next) => {
    try {
        const { id } = req.params;

        const campaign = await Campaign.findById(id);

        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: "Campaign not found"
            });
        }

        if (!campaign.abTest.enabled) {
            return res.status(400).json({
                success: false,
                message: "This campaign is not running an A/B test"
            });
        }

        // Calculate performance metrics for each variant
        const results = campaign.abTest.variants.map(v => {
            const openRate = v.sent > 0 ? (v.opened / v.sent) * 100 : 0;
            const clickRate = v.opened > 0 ? (v.clicked / v.opened) * 100 : 0;
            const conversionRate = v.sent > 0 ? (v.converted / v.sent) * 100 : 0;

            return {
                name: v.name,
                sent: v.sent,
                opened: v.opened,
                clicked: v.clicked,
                converted: v.converted,
                openRate: Math.round(openRate * 100) / 100,
                clickRate: Math.round(clickRate * 100) / 100,
                conversionRate: Math.round(conversionRate * 100) / 100
            };
        });

        // Find winner (highest conversion rate)
        const winner = results.reduce((prev, current) =>
            (current.conversionRate > prev.conversionRate) ? current : prev
        );

        return res.json({
            success: true,
            data: {
                variants: results,
                winner: winner.name,
                recommendation: `Variant "${winner.name}" has the highest conversion rate at ${winner.conversionRate}%`
            }
        });
    } catch (err) {
        next(err);
    }
};

// ================== LINK TRACKING ==================

const generateTrackingLink = async (req, res, next) => {
    try {
        const { url, campaignId, source, medium, campaign } = req.body;

        if (!url) {
            return res.status(400).json({
                success: false,
                message: "URL is required"
            });
        }

        // Generate UTM parameters
        const utmParams = new URLSearchParams();
        if (source) utmParams.append('utm_source', source);
        if (medium) utmParams.append('utm_medium', medium);
        if (campaign) utmParams.append('utm_campaign', campaign);
        if (campaignId) utmParams.append('utm_id', campaignId);

        const separator = url.includes('?') ? '&' : '?';
        const trackingUrl = `${url}${separator}${utmParams.toString()}`;

        return res.json({
            success: true,
            data: {
                originalUrl: url,
                trackingUrl,
                utmParameters: Object.fromEntries(utmParams)
            }
        });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    // Templates
    createTemplate,
    getTemplates,
    getPopularTemplates,
    getTemplateById,

    // Automated Campaigns
    createAutomatedCampaign,
    getAutomatedCampaigns,
    getAutomatedCampaignById,
    updateAutomatedCampaign,
    deleteAutomatedCampaign,
    triggerAutomatedCampaign,

    // Drip Campaigns
    createDripCampaign,
    getDripCampaigns,
    enrollInDrip,
    getDripEnrollments,

    // Campaign Clone
    cloneCampaign,

    // A/B Testing
    startABTest,
    getABTestResults,

    // Link Tracking
    generateTrackingLink
};
