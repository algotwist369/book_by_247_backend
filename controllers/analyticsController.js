// analyticsController.js - Advanced analytics and reporting
const Business = require("../models/Business");
const Customer = require("../models/Customer");
const Appointment = require("../models/Appointment");
const Invoice = require("../models/Invoice");
const Review = require("../models/Review");
const Service = require("../models/Service");
const Campaign = require("../models/Campaign");
const Manager = require("../models/Manager");
const { setCache, getCache, deleteCache } = require("../utils/cache");

// ================== Dashboard Overview ==================
const getDashboardOverview = async (req, res, next) => {
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

        const cacheKey = `business:${business._id}:dashboard:overview`;
        
        // Try cache first
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            return res.json({ success: true, source: "cache", data: cachedData });
        }

        const today = new Date();
        const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

        // Get all metrics
        const [
            totalCustomers,
            newCustomersLast30Days,
            totalAppointments,
            upcomingAppointments,
            completedAppointmentsLast30Days,
            totalRevenue,
            revenueLast30Days,
            pendingInvoices,
            averageRating,
            totalReviews
        ] = await Promise.all([
            Customer.countDocuments({ business: business._id, isActive: true }),
            Customer.countDocuments({ 
                business: business._id, 
                createdAt: { $gte: thirtyDaysAgo },
                isActive: true
            }),
            Appointment.countDocuments({ business: business._id }),
            Appointment.countDocuments({ 
                business: business._id,
                appointmentDate: { $gte: today },
                status: { $in: ['pending', 'confirmed'] }
            }),
            Appointment.countDocuments({
                business: business._id,
                completedAt: { $gte: thirtyDaysAgo },
                status: 'completed'
            }),
            Invoice.aggregate([
                { 
                    $match: { 
                        business: business._id,
                        status: { $ne: 'cancelled' }
                    } 
                },
                { $group: { _id: null, total: { $sum: '$total' } } }
            ]),
            Invoice.aggregate([
                { 
                    $match: { 
                        business: business._id,
                        invoiceDate: { $gte: thirtyDaysAgo },
                        status: { $ne: 'cancelled' }
                    } 
                },
                { $group: { _id: null, total: { $sum: '$total' } } }
            ]),
            Invoice.countDocuments({
                business: business._id,
                paymentStatus: { $in: ['unpaid', 'partial', 'overdue'] }
            }),
            Review.aggregate([
                {
                    $match: {
                        business: business._id,
                        isPublished: true
                    }
                },
                {
                    $group: {
                        _id: null,
                        avgRating: { $avg: '$rating' },
                        count: { $sum: 1 }
                    }
                }
            ]),
            Review.countDocuments({ business: business._id, isPublished: true })
        ]);

        const reviewStats = averageRating[0] || { avgRating: 0, count: 0 };

        const overview = {
            customers: {
                total: totalCustomers,
                new: newCustomersLast30Days,
                growthRate: totalCustomers > 0 
                    ? Math.round((newCustomersLast30Days / totalCustomers) * 100) 
                    : 0
            },
            appointments: {
                total: totalAppointments,
                upcoming: upcomingAppointments,
                completedLast30Days: completedAppointmentsLast30Days
            },
            revenue: {
                total: totalRevenue[0]?.total || 0,
                last30Days: revenueLast30Days[0]?.total || 0,
                pendingInvoices: pendingInvoices
            },
            reviews: {
                averageRating: parseFloat((reviewStats.avgRating || 0).toFixed(1)),
                totalReviews: totalReviews
            }
        };

        // Cache for 5 minutes
        await setCache(cacheKey, overview, 300);

        return res.json({
            success: true,
            data: overview
        });
    } catch (err) {
        next(err);
    }
};

// ================== Revenue Analytics ==================
const getRevenueAnalytics = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { businessId, startDate, endDate, groupBy = 'day' } = req.query;

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

        const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const end = endDate ? new Date(endDate) : new Date();

        const cacheKey = `business:${business._id}:revenue:${start}:${end}:${groupBy}`;
        
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            return res.json({ success: true, source: "cache", data: cachedData });
        }

        // Grouping format
        let dateFormat;
        if (groupBy === 'day') {
            dateFormat = { $dateToString: { format: "%Y-%m-%d", date: "$invoiceDate" } };
        } else if (groupBy === 'week') {
            dateFormat = { $dateToString: { format: "%Y-W%U", date: "$invoiceDate" } };
        } else if (groupBy === 'month') {
            dateFormat = { $dateToString: { format: "%Y-%m", date: "$invoiceDate" } };
        } else {
            dateFormat = { $dateToString: { format: "%Y", date: "$invoiceDate" } };
        }

        const revenueData = await Invoice.aggregate([
            {
                $match: {
                    business: business._id,
                    invoiceDate: { $gte: start, $lte: end },
                    status: { $ne: 'cancelled' }
                }
            },
            {
                $group: {
                    _id: dateFormat,
                    totalRevenue: { $sum: '$total' },
                    paidRevenue: { $sum: '$paidAmount' },
                    pendingRevenue: { $sum: { $subtract: ['$total', '$paidAmount'] } },
                    invoiceCount: { $sum: 1 },
                    averageInvoiceValue: { $avg: '$total' }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const summary = await Invoice.aggregate([
            {
                $match: {
                    business: business._id,
                    invoiceDate: { $gte: start, $lte: end },
                    status: { $ne: 'cancelled' }
                }
            },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: '$total' },
                    paidRevenue: { $sum: '$paidAmount' },
                    pendingRevenue: { $sum: { $subtract: ['$total', '$paidAmount'] } },
                    totalInvoices: { $sum: 1 },
                    averageInvoiceValue: { $avg: '$total' }
                }
            }
        ]);

        const result = {
            summary: summary[0] || {
                totalRevenue: 0,
                paidRevenue: 0,
                pendingRevenue: 0,
                totalInvoices: 0,
                averageInvoiceValue: 0
            },
            timeline: revenueData,
            period: { start, end, groupBy }
        };

        await setCache(cacheKey, result, 300);

        return res.json({
            success: true,
            data: result
        });
    } catch (err) {
        next(err);
    }
};

// ================== Customer Analytics ==================
const getCustomerAnalytics = async (req, res, next) => {
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

        const cacheKey = `business:${business._id}:customer:analytics`;
        
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            return res.json({ success: true, source: "cache", data: cachedData });
        }

        // Customer segmentation
        const segmentation = await Customer.aggregate([
            { $match: { business: business._id, isActive: true } },
            {
                $group: {
                    _id: '$customerType',
                    count: { $sum: 1 },
                    totalSpent: { $sum: '$totalSpent' },
                    averageSpent: { $avg: '$totalSpent' },
                    totalVisits: { $sum: '$totalVisits' }
                }
            }
        ]);

        // Top customers by spending
        const topCustomers = await Customer.find({
            business: business._id,
            isActive: true
        })
        .sort({ totalSpent: -1 })
        .limit(10)
        .select('firstName lastName email phone totalSpent totalVisits customerType membershipTier');

        // Customer lifetime value
        const lifetimeValue = await Customer.aggregate([
            { $match: { business: business._id, isActive: true } },
            {
                $group: {
                    _id: null,
                    averageLifetimeValue: { $avg: '$totalSpent' },
                    totalCustomers: { $sum: 1 },
                    totalRevenue: { $sum: '$totalSpent' }
                }
            }
        ]);

        // New customers trend (last 12 months)
        const twelveMonthsAgo = new Date();
        twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

        const customerGrowth = await Customer.aggregate([
            {
                $match: {
                    business: business._id,
                    createdAt: { $gte: twelveMonthsAgo }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
                    newCustomers: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // Customer retention rate
        const retentionData = await Customer.aggregate([
            { $match: { business: business._id, isActive: true, totalVisits: { $gt: 1 } } },
            {
                $group: {
                    _id: null,
                    returningCustomers: { $sum: 1 }
                }
            }
        ]);

        const totalCustomers = await Customer.countDocuments({ business: business._id, isActive: true });
        const retentionRate = totalCustomers > 0 
            ? Math.round(((retentionData[0]?.returningCustomers || 0) / totalCustomers) * 100)
            : 0;

        const result = {
            segmentation,
            topCustomers,
            lifetimeValue: lifetimeValue[0] || {
                averageLifetimeValue: 0,
                totalCustomers: 0,
                totalRevenue: 0
            },
            growth: customerGrowth,
            retention: {
                rate: retentionRate,
                returningCustomers: retentionData[0]?.returningCustomers || 0,
                totalCustomers
            }
        };

        await setCache(cacheKey, result, 600);

        return res.json({
            success: true,
            data: result
        });
    } catch (err) {
        next(err);
    }
};

// ================== Service Performance ==================
const getServicePerformance = async (req, res, next) => {
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

        const cacheKey = `business:${business._id}:service:performance`;
        
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            return res.json({ success: true, source: "cache", data: cachedData });
        }

        // Get all services with their stats
        const services = await Service.find({ business: business._id })
            .select('name category serviceType price stats ratings isActive')
            .sort({ 'stats.totalRevenue': -1 })
            .lean();

        // Top performing services
        const topServices = services
            .filter(s => s.isActive)
            .slice(0, 10)
            .map(s => ({
                id: s._id,
                name: s.name,
                category: s.category,
                revenue: s.stats.totalRevenue,
                bookings: s.stats.totalBookings,
                rating: s.ratings.average,
                popularity: s.stats.popularity
            }));

        // Service category performance
        const categoryPerformance = await Service.aggregate([
            { $match: { business: business._id, isActive: true } },
            {
                $group: {
                    _id: '$category',
                    totalRevenue: { $sum: '$stats.totalRevenue' },
                    totalBookings: { $sum: '$stats.totalBookings' },
                    averagePrice: { $avg: '$price' },
                    serviceCount: { $sum: 1 }
                }
            },
            { $sort: { totalRevenue: -1 } }
        ]);

        const result = {
            topServices,
            categoryPerformance,
            totalServices: services.length,
            activeServices: services.filter(s => s.isActive).length
        };

        await setCache(cacheKey, result, 600);

        return res.json({
            success: true,
            data: result
        });
    } catch (err) {
        next(err);
    }
};

// ================== Appointment Analytics ==================
const getAppointmentAnalytics = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { businessId, startDate, endDate } = req.query;

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

        const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const end = endDate ? new Date(endDate) : new Date();

        const cacheKey = `business:${business._id}:appointment:analytics:${start}:${end}`;
        
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            return res.json({ success: true, source: "cache", data: cachedData });
        }

        // Status breakdown
        const statusBreakdown = await Appointment.aggregate([
            {
                $match: {
                    business: business._id,
                    appointmentDate: { $gte: start, $lte: end }
                }
            },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    totalRevenue: { $sum: '$totalAmount' }
                }
            }
        ]);

        // Booking source analysis
        const bookingSourceAnalysis = await Appointment.aggregate([
            {
                $match: {
                    business: business._id,
                    appointmentDate: { $gte: start, $lte: end }
                }
            },
            {
                $group: {
                    _id: '$bookingSource',
                    count: { $sum: 1 }
                }
            }
        ]);

        // Peak hours analysis
        const peakHours = await Appointment.aggregate([
            {
                $match: {
                    business: business._id,
                    appointmentDate: { $gte: start, $lte: end },
                    status: 'completed'
                }
            },
            {
                $group: {
                    _id: { $substr: ['$startTime', 0, 2] },
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } }
        ]);

        // Cancellation rate
        const totalAppointments = await Appointment.countDocuments({
            business: business._id,
            appointmentDate: { $gte: start, $lte: end }
        });

        const cancelledAppointments = await Appointment.countDocuments({
            business: business._id,
            appointmentDate: { $gte: start, $lte: end },
            status: { $in: ['cancelled', 'no_show'] }
        });

        const cancellationRate = totalAppointments > 0 
            ? Math.round((cancelledAppointments / totalAppointments) * 100)
            : 0;

        const result = {
            statusBreakdown,
            bookingSourceAnalysis,
            peakHours,
            cancellationRate,
            totalAppointments,
            cancelledAppointments
        };

        await setCache(cacheKey, result, 300);

        return res.json({
            success: true,
            data: result
        });
    } catch (err) {
        next(err);
    }
};

// ================== Staff Performance ==================
const getStaffPerformance = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { businessId, startDate, endDate } = req.query;

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

        const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const end = endDate ? new Date(endDate) : new Date();

        const cacheKey = `business:${business._id}:staff:performance:${start}:${end}`;
        
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            return res.json({ success: true, source: "cache", data: cachedData });
        }

        // Staff appointment stats
        const staffStats = await Appointment.aggregate([
            {
                $match: {
                    business: business._id,
                    appointmentDate: { $gte: start, $lte: end },
                    staff: { $exists: true, $ne: null }
                }
            },
            {
                $group: {
                    _id: '$staff',
                    totalAppointments: { $sum: 1 },
                    completedAppointments: {
                        $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                    },
                    totalRevenue: { $sum: '$totalAmount' },
                    averageRating: { $avg: '$rating' }
                }
            },
            { $sort: { totalRevenue: -1 } }
        ]);

        // Populate staff details
        const Staff = require("../models/Staff");
        const staffWithDetails = await Promise.all(
            staffStats.map(async (stat) => {
                const staff = await Staff.findById(stat._id).select('name role phone');
                return {
                    ...stat,
                    staffDetails: staff
                };
            })
        );

        const result = {
            staffPerformance: staffWithDetails,
            totalStaff: staffStats.length
        };

        await setCache(cacheKey, result, 300);

        return res.json({
            success: true,
            data: result
        });
    } catch (err) {
        next(err);
    }
};

// ================== Trends & Predictions ==================
const getTrendsAndPredictions = async (req, res, next) => {
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

        const cacheKey = `business:${business._id}:trends`;
        
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            return res.json({ success: true, source: "cache", data: cachedData });
        }

        // Revenue trend (last 6 months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const revenueTrend = await Invoice.aggregate([
            {
                $match: {
                    business: business._id,
                    invoiceDate: { $gte: sixMonthsAgo },
                    status: { $ne: 'cancelled' }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m", date: "$invoiceDate" } },
                    revenue: { $sum: '$total' }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // Customer acquisition trend
        const customerTrend = await Customer.aggregate([
            {
                $match: {
                    business: business._id,
                    createdAt: { $gte: sixMonthsAgo }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
                    newCustomers: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // Simple growth prediction (based on last 3 months average)
        const revenueGrowth = revenueTrend.length >= 3 
            ? ((revenueTrend[revenueTrend.length - 1].revenue - revenueTrend[revenueTrend.length - 3].revenue) / revenueTrend[revenueTrend.length - 3].revenue) * 100
            : 0;

        const result = {
            revenueTrend,
            customerTrend,
            predictions: {
                revenueGrowthRate: Math.round(revenueGrowth),
                nextMonthRevenuePrediction: revenueTrend.length > 0 
                    ? Math.round(revenueTrend[revenueTrend.length - 1].revenue * (1 + (revenueGrowth / 100)))
                    : 0
            }
        };

        await setCache(cacheKey, result, 600);

        return res.json({
            success: true,
            data: result
        });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    getDashboardOverview,
    getRevenueAnalytics,
    getCustomerAnalytics,
    getServicePerformance,
    getAppointmentAnalytics,
    getStaffPerformance,
    getTrendsAndPredictions
};

