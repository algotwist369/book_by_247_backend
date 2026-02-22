// loyaltyController.js - Loyalty rewards and membership management
const LoyaltyReward = require("../models/LoyaltyReward");
const LoyaltyTransaction = require("../models/LoyaltyTransaction");
const MembershipPlan = require("../models/MembershipPlan");
const CustomerMembership = require("../models/CustomerMembership");
const Customer = require("../models/Customer");
const Business = require("../models/Business");
const Manager = require("../models/Manager");
const Invoice = require("../models/Invoice");
const { setCache, getCache, deleteCache } = require("../utils/cache");

// ================== REWARDS MANAGEMENT ==================

// Create Reward
const createReward = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const rewardData = req.body;

        // Determine business
        let business;
        if (userRole === 'admin') {
            if (!rewardData.businessId) {
                return res.status(400).json({
                    success: false,
                    message: "Business ID is required"
                });
            }
            business = await Business.findOne({ _id: rewardData.businessId, admin: userId });
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

        const reward = await LoyaltyReward.create({
            ...rewardData,
            business: business._id,
            createdBy: userId,
            createdByModel: userRole === 'admin' ? 'Admin' : 'Manager'
        });

        await deleteCache(`business:${business._id}:rewards`);

        return res.status(201).json({
            success: true,
            message: "Reward created successfully",
            data: reward
        });
    } catch (err) {
        next(err);
    }
};

// Get Rewards
const getRewards = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const {
            businessId,
            page = 1,
            limit = 20,
            type,
            isActive,
            minPoints,
            maxPoints
        } = req.query;

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

        const cacheKey = `business:${business._id}:rewards:${page}:${limit}:${type}:${isActive}:${minPoints}:${maxPoints}`;
        
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            return res.json({ success: true, source: "cache", ...cachedData });
        }

        // Build query
        let query = { business: business._id };

        if (type) query.type = type;
        if (isActive !== undefined) query.isActive = isActive === 'true';
        if (minPoints || maxPoints) {
            query.pointsCost = {};
            if (minPoints) query.pointsCost.$gte = Number(minPoints);
            if (maxPoints) query.pointsCost.$lte = Number(maxPoints);
        }

        const rewards = await LoyaltyReward.find(query)
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .sort({ displayOrder: 1 })
            .lean();

        const total = await LoyaltyReward.countDocuments(query);

        const response = {
            success: true,
            data: rewards,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        };

        await setCache(cacheKey, response, 300);

        return res.json(response);
    } catch (err) {
        next(err);
    }
};

// Update Reward
const updateReward = async (req, res, next) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const reward = await LoyaltyReward.findByIdAndUpdate(
            id,
            { ...updates, updatedBy: req.user.id, updatedByModel: req.user.role === 'admin' ? 'Admin' : 'Manager' },
            { new: true }
        );

        if (!reward) {
            return res.status(404).json({
                success: false,
                message: "Reward not found"
            });
        }

        await deleteCache(`business:${reward.business}:rewards`);

        return res.json({
            success: true,
            message: "Reward updated successfully",
            data: reward
        });
    } catch (err) {
        next(err);
    }
};

// Delete Reward
const deleteReward = async (req, res, next) => {
    try {
        const { id } = req.params;

        const reward = await LoyaltyReward.findById(id);

        if (!reward) {
            return res.status(404).json({
                success: false,
                message: "Reward not found"
            });
        }

        reward.isActive = false;
        await reward.save();

        await deleteCache(`business:${reward.business}:rewards`);

        return res.json({
            success: true,
            message: "Reward deleted successfully"
        });
    } catch (err) {
        next(err);
    }
};

// Redeem Reward
const redeemReward = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { customerId } = req.body;

        const reward = await LoyaltyReward.findById(id);
        const customer = await Customer.findById(customerId);

        if (!reward || !customer) {
            return res.status(404).json({
                success: false,
                message: "Reward or customer not found"
            });
        }

        // Check if customer can redeem
        const canRedeem = reward.canRedeem(customer);
        if (!canRedeem.canRedeem) {
            return res.status(400).json({
                success: false,
                message: canRedeem.reason
            });
        }

        // Redeem reward
        await customer.redeemPoints(reward.pointsCost);
        await reward.redeem();

        // Create transaction
        await LoyaltyTransaction.createRedeemedTransaction({
            business: reward.business,
            customer,
            points: reward.pointsCost,
            reward: reward._id,
            rewardName: reward.name,
            rewardValue: reward.value,
            description: `Redeemed reward: ${reward.name}`
        });

        await deleteCache(`business:${reward.business}:rewards`);

        return res.json({
            success: true,
            message: "Reward redeemed successfully",
            data: {
                remainingPoints: customer.loyaltyPoints,
                reward: {
                    name: reward.name,
                    value: reward.value
                }
            }
        });
    } catch (err) {
        next(err);
    }
};

// ================== MEMBERSHIP PLANS MANAGEMENT ==================

// Create Membership Plan
const createMembershipPlan = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const planData = req.body;

        // Determine business
        let business;
        if (userRole === 'admin') {
            if (!planData.businessId) {
                return res.status(400).json({
                    success: false,
                    message: "Business ID is required"
                });
            }
            business = await Business.findOne({ _id: planData.businessId, admin: userId });
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

        const plan = await MembershipPlan.create({
            ...planData,
            business: business._id,
            createdBy: userId,
            createdByModel: userRole === 'admin' ? 'Admin' : 'Manager'
        });

        await deleteCache(`business:${business._id}:membership-plans`);

        return res.status(201).json({
            success: true,
            message: "Membership plan created successfully",
            data: plan
        });
    } catch (err) {
        next(err);
    }
};

// Get Membership Plans
const getMembershipPlans = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { businessId, isActive } = req.query;

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

        const cacheKey = `business:${business._id}:membership-plans:${isActive}`;
        
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            return res.json({ success: true, source: "cache", data: cachedData });
        }

        let query = { business: business._id };
        if (isActive !== undefined) query.isActive = isActive === 'true';

        const plans = await MembershipPlan.find(query)
            .populate('inclusions.freeServices.service', 'name price')
            .sort({ displayOrder: 1 })
            .lean();

        await setCache(cacheKey, plans, 600);

        return res.json({
            success: true,
            data: plans
        });
    } catch (err) {
        next(err);
    }
};

// Update Membership Plan
const updateMembershipPlan = async (req, res, next) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const plan = await MembershipPlan.findByIdAndUpdate(
            id,
            { ...updates, updatedBy: req.user.id, updatedByModel: req.user.role === 'admin' ? 'Admin' : 'Manager' },
            { new: true }
        );

        if (!plan) {
            return res.status(404).json({
                success: false,
                message: "Membership plan not found"
            });
        }

        await deleteCache(`business:${plan.business}:membership-plans`);

        return res.json({
            success: true,
            message: "Membership plan updated successfully",
            data: plan
        });
    } catch (err) {
        next(err);
    }
};

// Delete Membership Plan
const deleteMembershipPlan = async (req, res, next) => {
    try {
        const { id } = req.params;

        const plan = await MembershipPlan.findById(id);

        if (!plan) {
            return res.status(404).json({
                success: false,
                message: "Membership plan not found"
            });
        }

        plan.isActive = false;
        await plan.save();

        await deleteCache(`business:${plan.business}:membership-plans`);

        return res.json({
            success: true,
            message: "Membership plan deleted successfully"
        });
    } catch (err) {
        next(err);
    }
};

// ================== LOYALTY TRANSACTIONS ==================

// Get Customer Loyalty History
const getCustomerLoyaltyHistory = async (req, res, next) => {
    try {
        const { customerId } = req.params;
        const { limit = 50 } = req.query;

        const transactions = await LoyaltyTransaction.getCustomerHistory(customerId, parseInt(limit));

        return res.json({
            success: true,
            data: transactions
        });
    } catch (err) {
        next(err);
    }
};

// Get Available Rewards for Customer
const getAvailableRewardsForCustomer = async (req, res, next) => {
    try {
        const { customerId } = req.params;

        const customer = await Customer.findById(customerId);

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: "Customer not found"
            });
        }

        const rewards = await LoyaltyReward.getAvailableForCustomer(customer.business, customer);

        return res.json({
            success: true,
            data: {
                customerPoints: customer.loyaltyPoints,
                customerTier: customer.membershipTier,
                rewards
            }
        });
    } catch (err) {
        next(err);
    }
};

// ================== CUSTOMER SUBSCRIPTIONS ==================

// Purchase/Subscribe to Membership
const subscribeMembership = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { customerId, membershipPlanId, paymentMethod, transactionId, autoRenew = false } = req.body;

        const customer = await Customer.findById(customerId);
        const membershipPlan = await MembershipPlan.findById(membershipPlanId);

        if (!customer || !membershipPlan) {
            return res.status(404).json({
                success: false,
                message: "Customer or membership plan not found"
            });
        }

        // Check if customer is eligible
        const eligibility = membershipPlan.isEligible(customer);
        if (!eligibility.eligible) {
            return res.status(400).json({
                success: false,
                message: eligibility.reason
            });
        }

        // Check if customer already has active subscription
        const existingSubscription = await CustomerMembership.getActiveSubscription(customerId);
        if (existingSubscription) {
            return res.status(400).json({
                success: false,
                message: "Customer already has an active subscription"
            });
        }

        // Calculate end date based on plan duration
        const startDate = new Date();
        const endDate = new Date(startDate);
        
        if (membershipPlan.duration.unit === 'days') {
            endDate.setDate(endDate.getDate() + membershipPlan.duration.value);
        } else if (membershipPlan.duration.unit === 'months') {
            endDate.setMonth(endDate.getMonth() + membershipPlan.duration.value);
        } else if (membershipPlan.duration.unit === 'years') {
            endDate.setFullYear(endDate.getFullYear() + membershipPlan.duration.value);
        }

        // Create subscription
        const subscription = await CustomerMembership.create({
            customer: customerId,
            business: membershipPlan.business,
            membershipPlan: membershipPlanId,
            startDate,
            endDate,
            price: membershipPlan.price,
            currency: membershipPlan.currency,
            autoRenew,
            paymentDetails: {
                paymentMethod,
                transactionId,
                paidDate: new Date()
            },
            createdBy: userId,
            createdByModel: userRole === 'admin' ? 'Admin' : 'Manager'
        });

        // Update customer membership tier
        customer.membershipTier = membershipPlan.tier;
        customer.membershipStartDate = startDate;
        customer.membershipExpiryDate = endDate;
        await customer.save();

        // Add bonus points if configured
        if (membershipPlan.pointsBenefits.bonusPointsOnSignup > 0) {
            await customer.addLoyaltyPoints(membershipPlan.pointsBenefits.bonusPointsOnSignup);
            
            await LoyaltyTransaction.create({
                business: membershipPlan.business,
                customer: customerId,
                type: 'bonus',
                points: membershipPlan.pointsBenefits.bonusPointsOnSignup,
                pointsBefore: customer.loyaltyPoints - membershipPlan.pointsBenefits.bonusPointsOnSignup,
                pointsAfter: customer.loyaltyPoints,
                description: `Bonus points for ${membershipPlan.name} subscription`,
                status: 'completed',
                createdBy: 'System',
                createdByModel: 'System'
            });
        }

        // Update membership plan stats
        membershipPlan.stats.totalSubscribers += 1;
        membershipPlan.stats.activeSubscribers += 1;
        membershipPlan.stats.revenue += membershipPlan.price;
        await membershipPlan.save();

        await deleteCache(`business:${membershipPlan.business}:subscriptions`);

        return res.status(201).json({
            success: true,
            message: "Membership subscribed successfully",
            data: {
                subscriptionNumber: subscription.subscriptionNumber,
                tier: membershipPlan.tier,
                startDate: subscription.startDate,
                endDate: subscription.endDate,
                bonusPoints: membershipPlan.pointsBenefits.bonusPointsOnSignup
            }
        });
    } catch (err) {
        next(err);
    }
};

// Get Customer Active Subscription
const getCustomerSubscription = async (req, res, next) => {
    try {
        const { customerId } = req.params;

        const subscription = await CustomerMembership.getActiveSubscription(customerId);

        if (!subscription) {
            return res.json({
                success: true,
                data: null,
                message: "No active subscription"
            });
        }

        return res.json({
            success: true,
            data: subscription
        });
    } catch (err) {
        next(err);
    }
};

// Get All Subscriptions for Business
const getSubscriptions = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { businessId, status, page = 1, limit = 20 } = req.query;

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

        let query = { business: business._id };
        if (status) query.status = status;

        const subscriptions = await CustomerMembership.find(query)
            .populate('customer', 'firstName lastName email phone')
            .populate('membershipPlan', 'name tier price')
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .sort({ createdAt: -1 })
            .lean();

        const total = await CustomerMembership.countDocuments(query);

        return res.json({
            success: true,
            data: subscriptions,
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

// Renew Subscription
const renewSubscription = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { paymentMethod, transactionId, invoiceId } = req.body;

        const subscription = await CustomerMembership.findById(id).populate('membershipPlan');

        if (!subscription) {
            return res.status(404).json({
                success: false,
                message: "Subscription not found"
            });
        }

        await subscription.renew(
            subscription.membershipPlan.duration,
            subscription.membershipPlan.price,
            invoiceId
        );

        // Update customer membership expiry date
        const customer = await Customer.findById(subscription.customer);
        customer.membershipExpiryDate = subscription.endDate;
        await customer.save();

        await deleteCache(`business:${subscription.business}:subscriptions`);

        return res.json({
            success: true,
            message: "Subscription renewed successfully",
            data: {
                newEndDate: subscription.endDate,
                daysExtended: subscription.membershipPlan.duration.value * 30
            }
        });
    } catch (err) {
        next(err);
    }
};

// Cancel Subscription
const cancelSubscription = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { id } = req.params;
        const { reason, refundAmount = 0 } = req.body;

        const subscription = await CustomerMembership.findById(id);

        if (!subscription) {
            return res.status(404).json({
                success: false,
                message: "Subscription not found"
            });
        }

        await subscription.cancel(
            userId,
            userRole === 'admin' ? 'Admin' : 'Manager',
            reason,
            refundAmount
        );

        // Update customer tier to none
        const customer = await Customer.findById(subscription.customer);
        customer.membershipTier = 'none';
        await customer.save();

        // Update membership plan stats
        const membershipPlan = await MembershipPlan.findById(subscription.membershipPlan);
        if (membershipPlan) {
            membershipPlan.stats.activeSubscribers -= 1;
            await membershipPlan.save();
        }

        await deleteCache(`business:${subscription.business}:subscriptions`);

        return res.json({
            success: true,
            message: "Subscription cancelled successfully",
            data: {
                refundAmount: refundAmount
            }
        });
    } catch (err) {
        next(err);
    }
};

// Get Subscription Benefits
const getSubscriptionBenefits = async (req, res, next) => {
    try {
        const { id } = req.params;

        const subscription = await CustomerMembership.findById(id)
            .populate('membershipPlan')
            .populate('benefits.freeServicesUsed.service', 'name price');

        if (!subscription) {
            return res.status(404).json({
                success: false,
                message: "Subscription not found"
            });
        }

        const membershipPlan = subscription.membershipPlan;
        
        // Calculate available benefits
        const totalFreeServices = membershipPlan.inclusions.freeServices.length;
        const usedFreeServices = subscription.benefits.freeServicesUsed.length;
        const remainingFreeServices = totalFreeServices - usedFreeServices;

        return res.json({
            success: true,
            data: {
                subscription: {
                    subscriptionNumber: subscription.subscriptionNumber,
                    status: subscription.status,
                    daysRemaining: subscription.daysRemaining,
                    isExpiringSoon: subscription.isExpiringSoon
                },
                benefits: {
                    discountPercentage: membershipPlan.discounts.percentageDiscount,
                    pointsMultiplier: membershipPlan.pointsBenefits.pointsMultiplier,
                    priorityBooking: membershipPlan.inclusions.priorityBooking,
                    dedicatedSupport: membershipPlan.inclusions.dedicatedSupport
                },
                freeServices: {
                    total: totalFreeServices,
                    used: usedFreeServices,
                    remaining: remainingFreeServices,
                    details: membershipPlan.inclusions.freeServices
                },
                usage: {
                    totalVisits: subscription.stats.totalVisits,
                    totalSpent: subscription.stats.totalSpent,
                    totalSaved: subscription.stats.totalSaved,
                    discountAvailed: subscription.benefits.totalDiscountAvailed
                }
            }
        });
    } catch (err) {
        next(err);
    }
};

// Get Subscription Statistics
const getSubscriptionStats = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { businessId } = req.query;

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

        const stats = await CustomerMembership.getStats(business._id);

        return res.json({
            success: true,
            data: stats
        });
    } catch (err) {
        next(err);
    }
};

// Get Expiring Subscriptions (for reminders)
const getExpiringSoonSubscriptions = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { businessId, days = 7 } = req.query;

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

        const subscriptions = await CustomerMembership.getExpiringSoon(business._id, parseInt(days));

        return res.json({
            success: true,
            data: subscriptions
        });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    // Rewards
    createReward,
    getRewards,
    updateReward,
    deleteReward,
    redeemReward,
    
    // Membership Plans
    createMembershipPlan,
    getMembershipPlans,
    updateMembershipPlan,
    deleteMembershipPlan,
    
    // Transactions
    getCustomerLoyaltyHistory,
    getAvailableRewardsForCustomer,
    
    // Subscriptions
    subscribeMembership,
    getCustomerSubscription,
    getSubscriptions,
    renewSubscription,
    cancelSubscription,
    getSubscriptionBenefits,
    getSubscriptionStats,
    getExpiringSoonSubscriptions
};

