// customerAnalytics.js - Customer analytics and segmentation utilities

const Customer = require("../models/Customer");
const Appointment = require("../models/Appointment");
const Transaction = require("../models/Transaction");

/**
 * Get customer analytics for a business
 * @param {string} businessId - Business ID
 * @param {Object} filters - Date range and other filters
 * @returns {Object} - Customer analytics data
 */
const getCustomerAnalytics = async (businessId, filters = {}) => {
    const { startDate, endDate } = filters;
    
    // Get customer segments (without date filter - segments should always show all customers)
    const segments = await getCustomerSegments(businessId);
    
    // Get total customers (always count all customers for the business, not filtered by date)
    const totalCustomers = await Customer.countDocuments({ business: businessId });
    
    // Get new customers in date range (if date filter provided)
    let newCustomersInRange = segments.new;
    if (startDate && endDate) {
        newCustomersInRange = await Customer.countDocuments({
            business: businessId,
            'stats.totalVisits': 1,
            createdAt: {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            }
        });
    }
    
    // Get customer lifecycle data
    const lifecycleData = await getCustomerLifecycleData(businessId, filters);
    
    // Get customer value analysis
    const valueAnalysis = await getCustomerValueAnalysis(businessId, filters);
    
    // Get customer retention data
    const retentionData = await getCustomerRetentionData(businessId, filters);
    
    // Get customer preferences
    const preferences = await getCustomerPreferences(businessId);
    
    // Get customer growth over time
    const growthData = await getCustomerGrowthData(businessId, filters);
    
    return {
        overview: {
            totalCustomers,
            newCustomers: newCustomersInRange,
            returningCustomers: segments.returning,
            loyalCustomers: segments.loyal,
            inactiveCustomers: segments.inactive
        },
        segments,
        lifecycle: lifecycleData,
        value: valueAnalysis,
        retention: retentionData,
        preferences,
        growth: growthData
    };
};

/**
 * Get customer segments
 * @param {string} businessId - Business ID
 * @returns {Object} - Customer segments
 */
const getCustomerSegments = async (businessId) => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    const ninetyDaysAgo = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));
    
    // Check if business has any customers first
    const totalCustomers = await Customer.countDocuments({ business: businessId });
    
    if (totalCustomers === 0) {
        return {
            new: 0,
            returning: 0,
            loyal: 0,
            inactive: 0,
            highValue: 0,
            recent: 0
        };
    }
    
    const segments = {
        new: await Customer.countDocuments({
            business: businessId,
            'stats.totalVisits': { $exists: true, $eq: 1 }
        }),
        returning: await Customer.countDocuments({
            business: businessId,
            'stats.totalVisits': { $gte: 2, $lte: 4 }
        }),
        loyal: await Customer.countDocuments({
            business: businessId,
            'stats.totalVisits': { $gte: 5 }
        }),
        inactive: await Customer.countDocuments({
            business: businessId,
            $or: [
                { 'stats.lastVisit': { $exists: false } },
                { 'stats.lastVisit': { $lt: ninetyDaysAgo } }
            ]
        }),
        highValue: await Customer.countDocuments({
            business: businessId,
            'stats.totalSpent': { $gte: 5000 }
        }),
        recent: await Customer.countDocuments({
            business: businessId,
            'stats.lastVisit': { $gte: thirtyDaysAgo }
        })
    };
    
    return segments;
};

/**
 * Get customer lifecycle data
 * @param {string} businessId - Business ID
 * @param {Object} filters - Date filters
 * @returns {Object} - Lifecycle data
 */
const getCustomerLifecycleData = async (businessId, filters = {}) => {
    const { startDate, endDate } = filters;
    
    let matchQuery = { business: businessId };
    if (startDate && endDate) {
        matchQuery.createdAt = {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
        };
    }
    
    const lifecycleData = await Customer.aggregate([
        { $match: matchQuery },
        {
            $group: {
                _id: null,
                avgFirstVisit: { $avg: { $ifNull: ['$stats.totalVisits', 0] } },
                avgTotalSpent: { $avg: { $ifNull: ['$stats.totalSpent', 0] } },
                avgLoyaltyPoints: { $avg: { $ifNull: ['$stats.loyaltyPoints', 0] } },
                avgRating: { $avg: { $ifNull: ['$stats.averageRating', 0] } },
                totalRevenue: { $sum: { $ifNull: ['$stats.totalSpent', 0] } }
            }
        }
    ]);
    
    return lifecycleData[0] || {
        avgFirstVisit: 0,
        avgTotalSpent: 0,
        avgLoyaltyPoints: 0,
        avgRating: 0,
        totalRevenue: 0
    };
};

/**
 * Get customer value analysis
 * @param {string} businessId - Business ID
 * @param {Object} filters - Date filters
 * @returns {Object} - Value analysis
 */
const getCustomerValueAnalysis = async (businessId, filters = {}) => {
    const customers = await Customer.find({ business: businessId })
        .select('stats.totalSpent stats.totalVisits stats.loyaltyPoints stats.averageRating');
    
    if (customers.length === 0) {
        return {
            avgFirstVisit: 0,
            avgTotalSpent: 0,
            totalRevenue: 0,
            avgRating: 0,
            avgLoyaltyPoints: 0,
            topCustomers: [],
            valueDistribution: {},
            averageValue: 0
        };
    }
    
    // Calculate averages from customer stats
    const totalSpent = customers.reduce((sum, c) => sum + (c.stats.totalSpent || 0), 0);
    const totalVisits = customers.reduce((sum, c) => sum + (c.stats.totalVisits || 0), 0);
    const totalRating = customers.reduce((sum, c) => sum + (c.stats.averageRating || 0), 0);
    const totalLoyaltyPoints = customers.reduce((sum, c) => sum + (c.stats.loyaltyPoints || 0), 0);
    
    // Get top 10 customers
    const topCustomers = customers
        .slice()
        .sort((a, b) => (b.stats.totalSpent || 0) - (a.stats.totalSpent || 0))
        .slice(0, 10)
        .map(customer => ({
            id: customer._id,
            totalSpent: customer.stats.totalSpent || 0,
            totalVisits: customer.stats.totalVisits || 0,
            loyaltyPoints: customer.stats.loyaltyPoints || 0,
            averageSpent: customer.stats.totalVisits > 0 
                ? (customer.stats.totalSpent || 0) / customer.stats.totalVisits 
                : 0
        }));
    
    // Value distribution
    const valueRanges = {
        low: customers.filter(c => (c.stats.totalSpent || 0) < 1000).length,
        medium: customers.filter(c => (c.stats.totalSpent || 0) >= 1000 && (c.stats.totalSpent || 0) < 5000).length,
        high: customers.filter(c => (c.stats.totalSpent || 0) >= 5000).length
    };
    
    const averageValue = customers.length > 0 ? totalSpent / customers.length : 0;
    const avgFirstVisit = customers.length > 0 ? totalVisits / customers.length : 0;
    const avgTotalSpent = customers.length > 0 ? totalSpent / customers.length : 0;
    const avgRating = customers.length > 0 ? totalRating / customers.length : 0;
    const avgLoyaltyPoints = customers.length > 0 ? totalLoyaltyPoints / customers.length : 0;
    
    return {
        avgFirstVisit,
        avgTotalSpent,
        totalRevenue: totalSpent,
        avgRating,
        avgLoyaltyPoints,
        topCustomers,
        valueDistribution: valueRanges,
        averageValue
    };
};

/**
 * Get customer retention data
 * @param {string} businessId - Business ID
 * @param {Object} filters - Date filters
 * @returns {Object} - Retention data
 */
const getCustomerRetentionData = async (businessId, filters = {}) => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    const sixtyDaysAgo = new Date(now.getTime() - (60 * 24 * 60 * 60 * 1000));
    const ninetyDaysAgo = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));
    
    const retentionData = {
        last30Days: await Customer.countDocuments({
            business: businessId,
            'stats.lastVisit': { $gte: thirtyDaysAgo }
        }),
        last60Days: await Customer.countDocuments({
            business: businessId,
            'stats.lastVisit': { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo }
        }),
        last90Days: await Customer.countDocuments({
            business: businessId,
            'stats.lastVisit': { $gte: ninetyDaysAgo, $lt: sixtyDaysAgo }
        }),
        over90Days: await Customer.countDocuments({
            business: businessId,
            'stats.lastVisit': { $lt: ninetyDaysAgo }
        })
    };
    
    return retentionData;
};

/**
 * Get customer preferences
 * @param {string} businessId - Business ID
 * @returns {Object} - Customer preferences
 */
const getCustomerPreferences = async (businessId) => {
    const preferences = await Customer.aggregate([
        { $match: { business: businessId } },
        { $unwind: { path: '$preferences.preferredServices', preserveNullAndEmptyArrays: true } },
        {
            $group: {
                _id: '$preferences.preferredServices',
                count: { $sum: 1 }
            }
        },
        { $sort: { count: -1 } },
        { $limit: 10 }
    ]);
    
    const genderDistribution = await Customer.aggregate([
        { $match: { business: businessId } },
        {
            $group: {
                _id: '$gender',
                count: { $sum: 1 }
            }
        }
    ]);
    
    return {
        preferredServices: preferences.filter(p => p._id),
        genderDistribution
    };
};

/**
 * Get customer growth over time
 * @param {string} businessId - Business ID
 * @param {Object} filters - Date filters
 * @returns {Array} - Growth data
 */
const getCustomerGrowthData = async (businessId, filters = {}) => {
    const { startDate, endDate, groupBy = 'month' } = filters;
    
    let dateFormat = '%Y-%m';
    if (groupBy === 'weekly' || groupBy === 'week') dateFormat = '%Y-%U';
    if (groupBy === 'daily' || groupBy === 'day') dateFormat = '%Y-%m-%d';
    if (groupBy === 'yearly' || groupBy === 'year') dateFormat = '%Y';
    if (groupBy === 'monthly' || groupBy === 'month') dateFormat = '%Y-%m';
    
    const matchQuery = { business: businessId };
    if (startDate && endDate) {
        matchQuery.createdAt = {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
        };
    }
    
    const growthData = await Customer.aggregate([
        { $match: matchQuery },
        {
            $group: {
                _id: {
                    $dateToString: {
                        format: dateFormat,
                        date: '$createdAt'
                    }
                },
                count: { $sum: 1 },
                totalSpent: { $sum: { $ifNull: ['$stats.totalSpent', 0] } }
            }
        },
        { $sort: { _id: 1 } }
    ]);
    
    // Calculate cumulative total
    let cumulativeTotal = 0;
    const growthWithTotal = growthData.map(item => {
        cumulativeTotal += item.count;
        return {
            ...item,
            period: item._id,
            total: cumulativeTotal
        };
    });
    
    return growthWithTotal;
};

/**
 * Get customers for targeting
 * @param {string} businessId - Business ID
 * @param {Object} criteria - Targeting criteria
 * @returns {Array} - List of customer IDs
 */
const getTargetCustomers = async (businessId, criteria) => {
    let query = { business: businessId };
    
    // Apply targeting criteria
    if (criteria.customerType) {
        switch (criteria.customerType) {
            case 'new':
                query['stats.totalVisits'] = 1;
                break;
            case 'returning':
                query['stats.totalVisits'] = { $gte: 2, $lte: 4 };
                break;
            case 'loyalty':
                query['stats.totalVisits'] = { $gte: 5 };
                break;
            case 'inactive':
                const ninetyDaysAgo = new Date(Date.now() - (90 * 24 * 60 * 60 * 1000));
                query['stats.lastVisit'] = { $lt: ninetyDaysAgo };
                break;
            case 'high_value':
                query['stats.totalSpent'] = { $gte: 5000 };
                break;
        }
    }
    
    if (criteria.minVisits) query['stats.totalVisits'] = { $gte: criteria.minVisits };
    if (criteria.maxVisits) query['stats.totalVisits'] = { ...query['stats.totalVisits'], $lte: criteria.maxVisits };
    if (criteria.minSpent) query['stats.totalSpent'] = { $gte: criteria.minSpent };
    if (criteria.maxSpent) query['stats.totalSpent'] = { ...query['stats.totalSpent'], $lte: criteria.maxSpent };
    if (criteria.lastVisitDays) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - criteria.lastVisitDays);
        query['stats.lastVisit'] = { $gte: cutoffDate };
    }
    if (criteria.preferredServices?.length) {
        query['preferences.preferredServices'] = { $in: criteria.preferredServices };
    }
    if (criteria.gender?.length) {
        query.gender = { $in: criteria.gender };
    }
    if (criteria.ageRange) {
        const now = new Date();
        if (criteria.ageRange.min) {
            const maxBirthDate = new Date(now.getFullYear() - criteria.ageRange.min, now.getMonth(), now.getDate());
            query.dateOfBirth = { $lte: maxBirthDate };
        }
        if (criteria.ageRange.max) {
            const minBirthDate = new Date(now.getFullYear() - criteria.ageRange.max, now.getMonth(), now.getDate());
            query.dateOfBirth = { ...query.dateOfBirth, $gte: minBirthDate };
        }
    }
    if (criteria.location?.city) query['address.city'] = criteria.location.city;
    if (criteria.location?.state) query['address.state'] = criteria.location.state;
    if (criteria.location?.pincode) query['address.pincode'] = criteria.location.pincode;
    
    // Get customers with additional details for better targeting
    const customers = await Customer.find(query)
        .select('_id name email phone dateOfBirth gender address stats.totalVisits stats.totalSpent stats.lastVisit preferences.preferredServices')
        .lean();
    
    // Sort by relevance for targeting (by default, sort by total spent descending)
    customers.sort((a, b) => {
        const aSpent = a.stats?.totalSpent || 0;
        const bSpent = b.stats?.totalSpent || 0;
        return bSpent - aSpent;
    });
    
    return customers;
};

/**
 * Get customer insights and recommendations
 * @param {string} businessId - Business ID
 * @returns {Object} - Insights and recommendations
 */
const getCustomerInsights = async (businessId) => {
    const analytics = await getCustomerAnalytics(businessId);
    const insights = [];
    const recommendations = [];
    
    // Analyze customer segments
    const { segments } = analytics;
    const totalCustomers = segments.new + segments.returning + segments.loyal + segments.inactive;
    
    if (totalCustomers === 0) {
        insights.push("No customer data available");
        recommendations.push("Start acquiring customers through marketing campaigns");
        return {
            insights,
            recommendations,
            analytics
        };
    }
    
    // Segment-based insights
    const inactivePercentage = (segments.inactive / totalCustomers) * 100;
    if (inactivePercentage > 30) {
        insights.push(`High percentage of inactive customers (${inactivePercentage.toFixed(1)}%)`);
        recommendations.push("Launch a win-back campaign for inactive customers with special offers");
    } else if (segments.inactive > 0) {
        insights.push(`${segments.inactive} inactive customers identified (${inactivePercentage.toFixed(1)}%)`);
        recommendations.push("Consider sending personalized offers to re-engage inactive customers");
    }
    
    const newPercentage = (segments.new / totalCustomers) * 100;
    const returningPercentage = (segments.returning / totalCustomers) * 100;
    
    if (segments.new > segments.returning && segments.new > 0) {
        insights.push(`Good customer acquisition (${newPercentage.toFixed(1)}% new customers) but low retention (${returningPercentage.toFixed(1)}% returning)`);
        recommendations.push("Focus on improving customer retention strategies - follow up with new customers after first visit");
    }
    
    const loyalPercentage = (segments.loyal / totalCustomers) * 100;
    if (loyalPercentage < 10 && segments.loyal > 0) {
        insights.push(`Low percentage of loyal customers (${loyalPercentage.toFixed(1)}%)`);
        recommendations.push("Implement a loyalty program with rewards to increase customer retention");
    } else if (loyalPercentage >= 10) {
        insights.push(`Strong loyalty base with ${loyalPercentage.toFixed(1)}% loyal customers`);
        recommendations.push("Reward loyal customers with exclusive offers and VIP treatment");
    }
    
    // Analyze customer value
    const { value } = analytics;
    if (value && value.averageValue !== undefined) {
        if (value.averageValue < 1000) {
            insights.push(`Low average customer value (${value.averageValue.toFixed(0)} per customer)`);
            recommendations.push("Create upselling campaigns and bundle offers to increase customer value");
        } else if (value.averageValue >= 1000 && value.averageValue < 3000) {
            insights.push(`Moderate customer value (₹${value.averageValue.toFixed(0)} per customer)`);
            recommendations.push("Continue upselling strategies and introduce premium service packages");
        } else {
            insights.push(`Strong customer value (₹${value.averageValue.toFixed(0)} per customer)`);
            recommendations.push("Maintain premium offerings and consider introducing VIP membership tiers");
        }
    }
    
    // Analyze retention
    const { retention } = analytics;
    if (retention) {
        const retentionRate = totalCustomers > 0 ? ((retention.last30Days / totalCustomers) * 100) : 0;
        if (retentionRate < 20) {
            insights.push(`Low customer retention rate (${retentionRate.toFixed(1)}% active in last 30 days)`);
            recommendations.push("Improve customer engagement through regular communication and personalized offers");
        }
    }
    
    // Growth insights
    const { growth } = analytics;
    if (growth && growth.length > 0) {
        const recentGrowth = growth[growth.length - 1];
        const previousGrowth = growth.length > 1 ? growth[growth.length - 2] : null;
        
        if (previousGrowth && recentGrowth.count > previousGrowth.count) {
            const growthRate = ((recentGrowth.count - previousGrowth.count) / previousGrowth.count) * 100;
            insights.push(`Positive customer growth trend: ${growthRate.toFixed(1)}% increase`);
            recommendations.push("Leverage growth momentum by expanding marketing channels and referral programs");
        } else if (previousGrowth && recentGrowth.count < previousGrowth.count) {
            insights.push("Declining customer acquisition detected");
            recommendations.push("Review marketing strategies and customer acquisition channels");
        }
    }
    
    // Preferences insights
    const { preferences } = analytics;
    if (preferences && preferences.preferredServices && preferences.preferredServices.length > 0) {
        const topService = preferences.preferredServices[0];
        insights.push(`Most popular service: ${topService._id || topService.name || 'N/A'} (${topService.count || 0} customers)`);
        recommendations.push(`Promote ${topService._id || topService.name || 'top services'} more aggressively in marketing campaigns`);
    }
    
    // Default recommendations if none generated
    if (recommendations.length === 0) {
        recommendations.push("Continue monitoring customer behavior and engagement metrics");
        recommendations.push("Regularly review and update marketing strategies based on customer feedback");
    }
    
    // Default insights if none generated
    if (insights.length === 0) {
        insights.push(`Total customer base: ${totalCustomers} customers`);
        insights.push(`Customer segments are well balanced`);
    }
    
    return {
        insights,
        recommendations,
        analytics
    };
};

module.exports = {
    getCustomerAnalytics,
    getCustomerSegments,
    getCustomerLifecycleData,
    getCustomerValueAnalysis,
    getCustomerRetentionData,
    getCustomerPreferences,
    getCustomerGrowthData,
    getTargetCustomers,
    getCustomerInsights
};
