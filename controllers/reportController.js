// reportController.js - Reports, analytics, exports
const DailyBusiness = require("../models/DailyBusiness");
const Transaction = require("../models/Transaction");
const Customer = require("../models/Customer");
const Appointment = require("../models/Appointment");
const Invoice = require("../models/Invoice");
const Business = require("../models/Business");
const Manager = require("../models/Manager");
const { setCache, getCache } = require("../utils/cache");
const { exportToCSV, exportToPDF } = require("../utils/reportExport");

// ================== Get Manager Reports ==================
const getManagerReports = async (req, res, next) => {
    try {
        const managerId = req.user.id;
        const { page = 1, limit = 10 } = req.query;

        // Fetch manager's business
        const manager = await Manager.findById(managerId).select('business');
        if (!manager || !manager.business) {
            return res.json({
                success: true,
                data: [],
                pagination: { total: 0, page: parseInt(page), limit: parseInt(limit), pages: 0 }
            });
        }
        const businessId = manager.business;

        // AGGREGATION: Find unique dates with activity (Transactions) for this business
        const dateAggregation = await Transaction.aggregate([
            { $match: { business: businessId } },
            {
                $group: {
                    _id: {
                        date: { $dateToString: { format: "%Y-%m-%d", date: "$transactionDate" } },
                        business: "$business"
                    }
                }
            },
            { $sort: { "_id.date": -1 } },
            {
                $facet: {
                    metadata: [{ $count: "total" }],
                    data: [{ $skip: (page - 1) * parseInt(limit) }, { $limit: parseInt(limit) }]
                }
            }
        ]);

        const total = dateAggregation[0].metadata[0]?.total || 0;
        const entries = dateAggregation[0].data || [];

        // Hydrate Virtual Reports
        const virtualReports = await Promise.all(entries.map(async (entry) => {
            const dateStr = entry._id.date;
            const date = new Date(dateStr);
            const startOfDay = new Date(date); startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(date); endOfDay.setHours(23, 59, 59, 999);

            // 1. Transaction Metrics
            const transactions = await Transaction.find({
                business: businessId,
                transactionDate: { $gte: startOfDay, $lte: endOfDay }
            }).populate('manager', 'username name');

            const transactionRevenue = transactions.reduce((sum, t) => sum + (t.finalPrice || 0), 0);
            const transCustomerIds = transactions.map(t => t.customer?.toString()).filter(id => id);
            const walkInPhones = transactions.filter(t => !t.customer).map(t => t.customerPhone);

            // 2. Untracked Appts Metrics
            const appCustomerIds = await Appointment.distinct('customer', {
                business: businessId,
                appointmentDate: { $gte: startOfDay, $lte: endOfDay }
            });

            const uniqueCustomers = new Set([
                ...transCustomerIds,
                ...appCustomerIds.map(id => id.toString()),
                ...walkInPhones
            ]);

            // 3. Try to merge existing DailyBusiness
            const dailyRecord = await DailyBusiness.findOne({
                business: businessId,
                date: { $gte: startOfDay, $lte: endOfDay }
            }).populate('manager', 'username name');

            return {
                _id: dailyRecord?._id || `virt-${dateStr}-${businessId}`,
                date: date,
                manager: dailyRecord?.manager || transactions[0]?.manager || null,
                business: businessId,
                totalIncome: transactionRevenue,
                totalCustomers: uniqueCustomers.size,
                totalExpenses: dailyRecord?.totalExpenses || 0,
                isCompleted: dailyRecord?.isCompleted ?? true
            };
        }));

        const response = {
            success: true,
            data: virtualReports,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit),
            },
        };

        return res.json(response);
    } catch (err) {
        next(err);
    }
};

// ================== Get Admin Reports (All Businesses) ==================
const getAdminReports = async (req, res, next) => {
    try {
        const adminId = req.user.id;
        const { page = 1, limit = 10 } = req.query;

        // Get admin's businesses
        const businesses = await Business.find({ admin: adminId }).select('_id');
        const businessIds = businesses.map(b => b._id);

        // AGGREGATION: Find unique dates+business with activity (Transactions)
        const dateAggregation = await Transaction.aggregate([
            { $match: { business: { $in: businessIds } } },
            {
                $group: {
                    _id: {
                        date: { $dateToString: { format: "%Y-%m-%d", date: "$transactionDate" } },
                        business: "$business"
                    },
                    firstTransaction: { $first: "$$ROOT" } // Keep reference
                }
            },
            { $sort: { "_id.date": -1 } },
            {
                $facet: {
                    metadata: [{ $count: "total" }],
                    data: [{ $skip: (page - 1) * parseInt(limit) }, { $limit: parseInt(limit) }]
                }
            }
        ]);

        const total = dateAggregation[0].metadata[0]?.total || 0;
        const entries = dateAggregation[0].data || [];

        // Hydrate each entry into a full Report Object
        const virtualReports = await Promise.all(entries.map(async (entry) => {
            const dateStr = entry._id.date;
            const businessId = entry._id.business;
            const date = new Date(dateStr);
            const startOfDay = new Date(date); startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(date); endOfDay.setHours(23, 59, 59, 999);

            // 1. Fetch Metrics for this day/business
            const transactions = await Transaction.find({
                business: businessId,
                transactionDate: { $gte: startOfDay, $lte: endOfDay }
            }).populate('manager', 'username name');

            const transactionRevenue = transactions.reduce((sum, t) => sum + (t.finalPrice || 0), 0);
            const transCustomerIds = transactions.map(t => t.customer?.toString()).filter(id => id);
            const walkInPhones = transactions.filter(t => !t.customer).map(t => t.customerPhone);

            // 2. Untracked Appointments Metrics
            const appCustomerIds = await Appointment.distinct('customer', {
                business: businessId,
                appointmentDate: { $gte: startOfDay, $lte: endOfDay }
            });

            const uniqueCustomers = new Set([
                ...transCustomerIds,
                ...appCustomerIds.map(id => id.toString()),
                ...walkInPhones
            ]);

            // 3. Try to find existing DailyBusiness record (for Expenses/Status)
            const dailyRecord = await DailyBusiness.findOne({
                business: businessId,
                date: { $gte: startOfDay, $lte: endOfDay }
            }).populate('manager', 'username name');

            return {
                _id: dailyRecord?._id || `virt-${dateStr}-${businessId}`,
                date: date,
                manager: dailyRecord?.manager || transactions[0]?.manager || null,
                business: businessId,
                totalIncome: transactionRevenue,
                totalCustomers: uniqueCustomers.size,
                totalExpenses: dailyRecord?.totalExpenses || 0,
                isCompleted: dailyRecord?.isCompleted ?? true
            };
        }));

        const response = {
            success: true,
            data: virtualReports,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit),
            },
        };

        return res.json(response);
    } catch (err) {
        next(err);
    }
};

// ================== Revenue Trends ==================
const revenueTrends = async (req, res, next) => {
    try {
        const { role, id } = req.user;
        let match = {};

        if (role === 'admin') {
            const businesses = await Business.find({ admin: id }).select('_id');
            match.business = { $in: businesses.map(b => b._id) };
        } else if (role === 'manager') {
            match.manager = id; // Or find business linked to manager
            // Assuming direct link for simplicity or check Manager model
            // For now, if manager field exists in DailyBusiness:
            match.manager = id;
        }

        const data = await DailyBusiness.aggregate([
            { $match: match },
            { $group: { _id: "$date", totalIncome: { $sum: "$totalIncome" } } },
            { $sort: { _id: 1 } },
        ]);

        return res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
};

// ================== Staff Performance ==================
const staffPerformance = async (req, res, next) => {
    try {
        const managerId = req.user.id;

        const staffStats = await Transaction.aggregate([
            { $match: { manager: managerId } },
            { $group: { _id: "$staff", totalRevenue: { $sum: "$amount" }, customers: { $sum: 1 } } },
            { $sort: { totalRevenue: -1 } },
        ]);

        return res.json({ success: true, data: staffStats });
    } catch (err) {
        next(err);
    }
};

// ================== Export Reports ==================
const exportReports = async (req, res, next) => {
    try {
        const { format = "csv", scope = "manager" } = req.query;
        const userId = req.user.id;
        const userRole = req.user.role;

        console.log('Export request:', { format, scope, userId, userRole });

        let reports;

        if (userRole === "admin") {
            const businesses = await Business.find({ admin: userId }).select('_id name');
            let businessIds = businesses.map(b => b._id);
            if (scope !== "admin") {
                // If filtering by specific business (though scope paramenter usage is ambiguous in current frontend, assuming 'admin' means all)
                // If scope matches a business ID, filter by it? 
                // Current frontend passes scope='admin'.
            }

            // AGGREGATION: Find unique dates+business with activity (Transactions)
            const dateAggregation = await Transaction.aggregate([
                { $match: { business: { $in: businessIds } } },
                {
                    $group: {
                        _id: {
                            date: { $dateToString: { format: "%Y-%m-%d", date: "$transactionDate" } },
                            business: "$business"
                        }
                    }
                },
                { $sort: { "_id.date": -1 } }
            ]);

            // Hydrate each entry into a full Report Object
            reports = await Promise.all(dateAggregation.map(async (entry) => {
                const dateStr = entry._id.date;
                const businessId = entry._id.business;
                const date = new Date(dateStr);
                const startOfDay = new Date(date); startOfDay.setHours(0, 0, 0, 0);
                const endOfDay = new Date(date); endOfDay.setHours(23, 59, 59, 999);

                // 1. Fetch Metrics for this day/business
                const transactions = await Transaction.find({
                    business: businessId,
                    transactionDate: { $gte: startOfDay, $lte: endOfDay }
                }).populate('manager', 'username name');

                const transactionRevenue = transactions.reduce((sum, t) => sum + (t.finalPrice || 0), 0);
                const transCustomerIds = transactions.map(t => t.customer?.toString()).filter(id => id);
                const walkInPhones = transactions.filter(t => !t.customer).map(t => t.customerPhone);

                // 2. Untracked Appointments Metrics
                const appCustomerIds = await Appointment.distinct('customer', {
                    business: businessId,
                    appointmentDate: { $gte: startOfDay, $lte: endOfDay }
                });

                const uniqueCustomers = new Set([
                    ...transCustomerIds,
                    ...appCustomerIds.map(id => id.toString()),
                    ...walkInPhones
                ]);

                // 3. Try to find existing DailyBusiness record (for Expenses/Status)
                const dailyRecord = await DailyBusiness.findOne({
                    business: businessId,
                    date: { $gte: startOfDay, $lte: endOfDay }
                }).populate('manager', 'username name').populate('business', 'name');

                const businessName = businesses.find(b => b._id.toString() === businessId.toString())?.name || 'Unknown';

                return {
                    _id: dailyRecord?._id || `virt-${dateStr}-${businessId}`,
                    date: date,
                    manager: dailyRecord?.manager || transactions[0]?.manager || { name: 'System' },
                    business: dailyRecord?.business || { name: businessName },
                    totalIncome: transactionRevenue,
                    totalCustomers: uniqueCustomers.size,
                    totalExpenses: dailyRecord?.totalExpenses || 0,
                    isCompleted: dailyRecord?.isCompleted ?? true
                };
            }));

        } else if (userRole === "manager") {
            // Manager exporting their business only
            const manager = await Manager.findById(userId);
            if (!manager || !manager.business) {
                return res.status(404).json({ success: false, message: "Manager business not found" });
            }
            // Logic for manager should optimally be updated too, but keeping it simple for now or using same logic?
            // User only reported issue for Admin likely, but better to be safe.
            // Let's stick to replacing Admin block first as per request context.
            reports = await DailyBusiness.find({ business: manager.business })
                .populate("manager", "username name")
                .populate("business", "name")
                .lean();
        } else {
            return res.status(403).json({ success: false, message: "Unauthorized" });
        }

        console.log('Reports found:', reports.length);

        if (!reports.length) {
            return res.status(404).json({ success: false, message: "No reports found" });
        }

        // Add calculated netProfit field
        reports = reports.map(r => ({
            ...r,
            netProfit: (r.totalIncome || 0) - (r.totalExpenses || 0)
        }));

        if (format === "csv") {
            const csvFile = await exportToCSV(reports);
            res.header("Content-Type", "text/csv");
            res.attachment("reports.csv");
            return res.send(csvFile);
        }

        if (format === "pdf") {
            const pdfBuffer = await exportToPDF(reports);
            res.header("Content-Type", "application/pdf");
            res.attachment("reports.pdf");
            return res.send(pdfBuffer);
        }

        return res.status(400).json({ success: false, message: "Invalid format" });
    } catch (err) {
        console.error('Export error:', err);
        next(err);
    }
};


// ================== Get Reports (Unified) ==================
const getReports = async (req, res, next) => {
    try {
        if (req.user.role === "admin") {
            return getAdminReports(req, res, next);
        } else {
            return getManagerReports(req, res, next);
        }
    } catch (err) {
        next(err);
    }
};

// ================== Get Analytics (ENHANCED) ==================
const getAnalytics = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { startDate, endDate, businessId } = req.query;

        // Build date filter
        let dateFilter = {};
        if (startDate && endDate) {
            dateFilter = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        // Build business filter based on role
        let businessFilter = {};
        let businessOnlyFilter = {}; // For counts without date filter

        if (userRole === 'admin') {
            if (businessId) {
                // Admin viewing specific business
                businessFilter.business = businessId;
                businessOnlyFilter.business = businessId;
            } else {
                // Admin viewing all their businesses
                const businesses = await Business.find({ admin: userId }).select('_id');
                const businessIds = businesses.map(b => b._id);

                // CRITICAL FIX: Always apply filter, even if empty. An admin with no businesses should see nothing.
                businessFilter.business = { $in: businessIds };
                businessOnlyFilter.business = { $in: businessIds };
            }
        } else if (userRole === 'manager') {
            // Manager viewing their business only
            const manager = await Manager.findById(userId);
            if (manager && manager.business) {
                businessFilter.business = manager.business;
                businessOnlyFilter.business = manager.business;
            }
        }

        // Apply date filter ONLY to businessFilter (for revenue)
        if (Object.keys(dateFilter).length > 0) {
            businessFilter.createdAt = dateFilter;
        }

        //===== SUMMARY METRICS =====
        // Use businessFilter (WITH date filter) for counts
        const [
            totalCustomers,
            totalAppointments,
            completedAppointments,
            totalInvoices
        ] = await Promise.all([
            Customer.countDocuments(businessFilter),
            Appointment.countDocuments(businessFilter),
            Appointment.countDocuments({ ...businessFilter, status: 'completed' }),
            Invoice.countDocuments(businessFilter)
        ]);

        // Build match filter for revenue queries
        let revenueMatchFilter = {};
        if (businessFilter.business) {
            if (businessFilter.business.$in) {
                revenueMatchFilter.business = { $in: businessFilter.business.$in };
            } else {
                revenueMatchFilter.business = businessFilter.business;
            }
        }

        // Add date filter to revenue query
        if (Object.keys(dateFilter).length > 0) {
            revenueMatchFilter.date = {
                $gte: dateFilter.$gte,
                $lte: dateFilter.$lte
            };
        }

        // Revenue from DailyBusiness (manager daily summaries)
        const dailyBusinessAgg = await DailyBusiness.aggregate([
            { $match: revenueMatchFilter },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: "$totalIncome" },
                    totalExpenses: { $sum: "$totalExpenses" },
                    count: { $sum: 1 }
                }
            }
        ]);

        // =========== HYBRID REVENUE CALCULATION (Same as Dashboard) ===========

        // 1. Get Transactions
        let transactionMatchFilter = {};
        if (businessFilter.business) {
            if (businessFilter.business.$in) {
                transactionMatchFilter.business = { $in: businessFilter.business.$in };
            } else {
                transactionMatchFilter.business = businessFilter.business;
            }
        }

        // Add date filter for transactions
        if (Object.keys(dateFilter).length > 0) {
            transactionMatchFilter.transactionDate = {
                $gte: dateFilter.$gte,
                $lte: dateFilter.$lte
            };
        }

        const transactions = await Transaction.find(transactionMatchFilter).lean();
        const transactionRevenue = transactions.reduce((sum, t) => sum + (t.finalPrice || 0), 0);
        const transactionCount = transactions.length;

        // Get transaction-linked appointment IDs
        const transactionAppointmentIds = transactions
            .filter(t => t.appointment)
            .map(t => t.appointment.toString());

        // 2. Get Untracked Completed Appointments (completedAppointments without transactions)
        let untrackedAppointmentFilter = {};
        if (businessFilter.business) {
            if (businessFilter.business.$in) {
                untrackedAppointmentFilter.business = { $in: businessFilter.business.$in };
            } else {
                untrackedAppointmentFilter.business = businessFilter.business;
            }
        }
        untrackedAppointmentFilter.status = 'completed';
        untrackedAppointmentFilter._id = { $nin: transactionAppointmentIds };

        // Add date filter for untracked appointments
        if (Object.keys(dateFilter).length > 0) {
            untrackedAppointmentFilter.completedAt = {
                $gte: dateFilter.$gte,
                $lte: dateFilter.$lte
            };
        }

        const untrackedAppointments = await Appointment.find(untrackedAppointmentFilter).lean();
        const untrackedAppointmentRevenue = untrackedAppointments.reduce((sum, a) => sum + (a.totalAmount || 0), 0);

        // 3. Total Revenue = Transactions + Untracked Appointments
        const totalRevenue = transactionRevenue + untrackedAppointmentRevenue;
        const totalExpenses = dailyBusinessAgg[0]?.totalExpenses || 0;

        // =========== CUSTOMER COUNT (Include Walk-ins) ===========

        // Get walk-in customers from transactions without customer profile
        let walkInFilter = {};
        if (businessFilter.business) {
            if (businessFilter.business.$in) {
                walkInFilter.business = { $in: businessFilter.business.$in };
            } else {
                walkInFilter.business = businessFilter.business;
            }
        }
        walkInFilter.customer = null;

        const walkInCustomerPhones = await Transaction.distinct('customerPhone', walkInFilter);
        const walkInCustomerCount = walkInCustomerPhones.filter(p => p).length;

        // Total customers = registered + walk-ins
        const totalCustomersWithWalkIns = totalCustomers + walkInCustomerCount;

        const summary = {
            totalRevenue: totalRevenue,
            transactionRevenue: transactionRevenue,
            appointmentRevenue: untrackedAppointmentRevenue,
            transactionCount: transactionCount,
            totalExpenses: totalExpenses,
            netProfit: totalRevenue - totalExpenses,
            totalCustomers: totalCustomersWithWalkIns,
            registeredCustomers: totalCustomers,
            walkInCustomers: walkInCustomerCount,
            totalAppointments,
            completedAppointments,
            totalInvoices,
            appointmentCompletionRate: totalAppointments > 0
                ? ((completedAppointments / totalAppointments) * 100).toFixed(2)
                : 0,
            avgOrderValue: transactionCount > 0
                ? (transactionRevenue / transactionCount).toFixed(2)
                : 0
        };

        // ===== REVENUE TRENDS (Using Transactions - matches Dashboard) =====
        let trendBusinessMatch = {};
        if (businessFilter.business) {
            if (businessFilter.business.$in) {
                trendBusinessMatch.business = { $in: businessFilter.business.$in };
            } else {
                trendBusinessMatch.business = businessFilter.business;
            }
        }

        const revenueTrends = await Transaction.aggregate([
            { $match: trendBusinessMatch },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$transactionDate" } },
                    totalIncome: { $sum: "$finalPrice" },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } },
            { $limit: 30 },
            {
                $project: {
                    _id: 1,
                    totalIncome: 1,
                    count: 1,
                    totalExpenses: { $literal: 0 },
                    netProfit: "$totalIncome"
                }
            }
        ]);

        // ===== CUSTOMER ANALYTICS =====
        const customerMatch = {};
        if (businessFilter.business) {
            if (businessFilter.business.$in) {
                customerMatch.business = { $in: businessFilter.business.$in };
            } else {
                customerMatch.business = businessFilter.business;
            }
        }

        // Add date filter for customers
        if (Object.keys(dateFilter).length > 0) {
            customerMatch.createdAt = {
                $gte: dateFilter.$gte,
                $lte: dateFilter.$lte
            };
        }

        const customerStats = await Customer.aggregate([
            { $match: customerMatch },
            {
                $facet: {
                    byTier: [
                        { $group: { _id: "$membershipTier", count: { $sum: 1 } } },
                        { $sort: { count: -1 } }
                    ],
                    topSpenders: [
                        { $sort: { totalSpent: -1 } },
                        { $limit: 50 },
                        {
                            $project: {
                                fullName: {
                                    $trim: {
                                        input: { $concat: ["$firstName", " ", { $ifNull: ["$lastName", ""] }] }
                                    }
                                },
                                email: 1,
                                phone: 1,
                                totalSpent: 1,
                                totalVisits: 1
                            }
                        }
                    ],
                    recentSignups: [
                        { $sort: { createdAt: -1 } },
                        { $limit: 50 },
                        {
                            $project: {
                                fullName: {
                                    $trim: {
                                        input: { $concat: ["$firstName", " ", { $ifNull: ["$lastName", ""] }] }
                                    }
                                },
                                email: 1,
                                createdAt: 1
                            }
                        }
                    ]
                }
            }
        ]);

        // ===== APPOINTMENT ANALYTICS =====
        // Use businessFilter WITH date filter for appointments
        const appointmentMatch = businessFilter.business
            ? { business: businessFilter.business }
            : businessFilter.business?.$in
                ? { business: { $in: businessFilter.business.$in } }
                : {};

        // Add createdAt date filter for appointments
        if (Object.keys(dateFilter).length > 0) {
            appointmentMatch.createdAt = {
                $gte: dateFilter.$gte,
                $lte: dateFilter.$lte
            };
        }

        const appointmentStats = await Appointment.aggregate([
            { $match: appointmentMatch },
            {
                $group: {
                    _id: "$status",
                    count: { $sum: 1 }
                }
            }
        ]);

        // ===== STAFF PERFORMANCE (Manager only) =====
        let staffPerformance = [];
        if (userRole === 'manager') {
            staffPerformance = await Transaction.aggregate([
                { $match: { manager: userId } },
                {
                    $group: {
                        _id: "$staff",
                        totalRevenue: { $sum: "$amount" },
                        totalTransactions: { $sum: 1 }
                    }
                },
                { $sort: { totalRevenue: -1 } },
                { $limit: 10 }
            ]);
        }

        // Get walk-in customer count for distribution
        let walkInDistFilter = {};
        if (businessFilter.business) {
            if (businessFilter.business.$in) {
                walkInDistFilter.business = { $in: businessFilter.business.$in };
            } else {
                walkInDistFilter.business = businessFilter.business;
            }
        }
        walkInDistFilter.customer = null;

        const walkInPhones = await Transaction.distinct('customerPhone', walkInDistFilter);
        const walkInCount = walkInPhones.filter(p => p).length;

        // Combine customer tiers with walk-in count
        const combinedByTier = [
            ...(customerStats[0]?.byTier || []),
            { _id: 'walkin', count: walkInCount }
        ].filter(t => t.count > 0);

        // Build response
        const response = {
            success: true,
            data: {
                summary,
                revenue: revenueTrends,
                customers: {
                    byTier: combinedByTier,
                    topSpenders: customerStats[0]?.topSpenders || [],
                    recentSignups: customerStats[0]?.recentSignups || []
                },
                appointments: {
                    byStatus: appointmentStats,
                    total: totalAppointments,
                    completed: completedAppointments,
                    completionRate: summary.appointmentCompletionRate
                },
                staff: staffPerformance
            }
        };

        return res.json(response);
    } catch (err) {
        console.error('Analytics Error:', err);
        next(err);
    }
};

// ================== Get Summary (NEW) ==================
const getSummary = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { businessId } = req.query;

        // Build business filter
        let businessFilter = {};
        if (userRole === 'admin') {
            if (businessId) {
                businessFilter.business = businessId;
            } else {
                const businesses = await Business.find({ admin: userId }).select('_id');
                businessFilter.business = { $in: businesses.map(b => b._id) };
            }
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            if (manager?.business) {
                businessFilter.business = manager.business;
            }
        }

        // =========== HYBRID REVENUE CALCULATION (Same as Dashboard) ===========

        // 1. Get all transactions (for hybrid calculation)
        let transactionFilter = {};
        if (businessFilter.business) {
            transactionFilter.business = businessFilter.business;
        }

        // Parallel queries for all data sources
        const [dailyBusinessData, transactions, customerCount, appointmentCount] = await Promise.all([
            DailyBusiness.aggregate([
                { $match: businessFilter.business ? { business: businessFilter.business } : {} },
                {
                    $group: {
                        _id: null,
                        totalRevenue: { $sum: "$totalIncome" },
                        totalExpenses: { $sum: "$totalExpenses" }
                    }
                }
            ]),
            Transaction.find(transactionFilter).lean(),
            Customer.countDocuments(businessFilter),
            Appointment.countDocuments(businessFilter)
        ]);

        // Calculate transaction revenue
        const transactionRevenue = transactions.reduce((sum, t) => sum + (t.finalPrice || 0), 0);
        const transactionCount = transactions.length;

        // Get transaction-linked appointment IDs
        const transactionAppointmentIds = transactions
            .filter(t => t.appointment)
            .map(t => t.appointment.toString());

        // 2. Get Untracked Completed Appointments
        let untrackedFilter = {};
        if (businessFilter.business) {
            untrackedFilter.business = businessFilter.business;
        }
        untrackedFilter.status = 'completed';
        untrackedFilter._id = { $nin: transactionAppointmentIds };

        const untrackedAppointments = await Appointment.find(untrackedFilter).lean();
        const untrackedRevenue = untrackedAppointments.reduce((sum, a) => sum + (a.totalAmount || 0), 0);

        // 3. Total Revenue = Transactions + Untracked Appointments
        const totalRevenue = transactionRevenue + untrackedRevenue;
        const totalExpenses = dailyBusinessData[0]?.totalExpenses || 0;

        // 4. Get walk-in customers
        let walkInFilter = {};
        if (businessFilter.business) {
            walkInFilter.business = businessFilter.business;
        }
        walkInFilter.customer = null;
        const walkInPhones = await Transaction.distinct('customerPhone', walkInFilter);
        const walkInCount = walkInPhones.filter(p => p).length;

        const response = {
            success: true,
            data: {
                revenue: totalRevenue,
                transactionRevenue: transactionRevenue,
                appointmentRevenue: untrackedRevenue,
                transactionCount: transactionCount,
                expenses: totalExpenses,
                profit: totalRevenue - totalExpenses,
                customers: customerCount + walkInCount,
                registeredCustomers: customerCount,
                walkInCustomers: walkInCount,
                appointments: appointmentCount
            }
        };

        return res.json(response);
    } catch (err) {
        next(err);
    }
};

// ================== Get Trends (FIXED - Uses Transaction data) ==================
const getTrends = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { type = 'revenue', period = 'daily', businessId, limit = 30 } = req.query;

        // Build business filter
        let businessIds = [];
        if (userRole === 'admin') {
            if (businessId) {
                businessIds = [businessId];
            } else {
                const businesses = await Business.find({ admin: userId }).select('_id');
                businessIds = businesses.map(b => b._id);
            }
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            if (manager?.business) {
                businessIds = [manager.business];
            }
        }

        const businessFilter = businessIds.length === 1
            ? { business: businessIds[0] }
            : { business: { $in: businessIds } };

        let trends = [];

        if (type === 'revenue') {
            // Use Transaction data for revenue trends (matches Dashboard)
            trends = await Transaction.aggregate([
                { $match: businessFilter },
                {
                    $group: {
                        _id: { $dateToString: { format: "%Y-%m-%d", date: "$transactionDate" } },
                        value: { $sum: "$finalPrice" },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { _id: -1 } },
                { $limit: parseInt(limit) },
                {
                    $project: {
                        date: "$_id",
                        value: 1,
                        count: 1,
                        _id: 0
                    }
                },
                { $sort: { date: 1 } }
            ]);

            // Also get expenses from DailyBusiness for profit calculation
            const expenseTrends = await DailyBusiness.aggregate([
                { $match: businessIds.length === 1 ? { business: businessIds[0] } : { business: { $in: businessIds } } },
                {
                    $group: {
                        _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
                        expenses: { $sum: "$totalExpenses" }
                    }
                },
                { $project: { date: "$_id", expenses: 1, _id: 0 } }
            ]);

            // Merge expenses into trends
            const expenseMap = {};
            expenseTrends.forEach(e => expenseMap[e.date] = e.expenses);

            trends = trends.map(t => ({
                ...t,
                expenses: expenseMap[t.date] || 0,
                profit: t.value - (expenseMap[t.date] || 0)
            }));

        } else if (type === 'customers') {
            // Count unique customers by date (registered + walk-ins from transactions)
            const registeredTrends = await Customer.aggregate([
                { $match: businessFilter },
                {
                    $group: {
                        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                        registered: { $sum: 1 }
                    }
                },
                { $project: { date: "$_id", registered: 1, _id: 0 } }
            ]);

            const walkInTrends = await Transaction.aggregate([
                { $match: { ...businessFilter, customer: null } },
                {
                    $group: {
                        _id: { $dateToString: { format: "%Y-%m-%d", date: "$transactionDate" } },
                        phones: { $addToSet: "$customerPhone" }
                    }
                },
                { $project: { date: "$_id", walkIns: { $size: "$phones" }, _id: 0 } }
            ]);

            // Merge both sources
            const dateMap = {};
            registeredTrends.forEach(r => {
                dateMap[r.date] = { date: r.date, registered: r.registered, walkIns: 0 };
            });
            walkInTrends.forEach(w => {
                if (dateMap[w.date]) {
                    dateMap[w.date].walkIns = w.walkIns;
                } else {
                    dateMap[w.date] = { date: w.date, registered: 0, walkIns: w.walkIns };
                }
            });

            trends = Object.values(dateMap)
                .map(d => ({ date: d.date, value: d.registered + d.walkIns, registered: d.registered, walkIns: d.walkIns }))
                .sort((a, b) => a.date.localeCompare(b.date))
                .slice(-parseInt(limit));

        } else if (type === 'appointments') {
            trends = await Appointment.aggregate([
                { $match: businessFilter },
                {
                    $group: {
                        _id: { $dateToString: { format: "%Y-%m-%d", date: "$appointmentDate" } },
                        value: { $sum: 1 },
                        completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
                        pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
                        cancelled: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] } }
                    }
                },
                { $sort: { _id: -1 } },
                { $limit: parseInt(limit) },
                { $project: { date: "$_id", value: 1, completed: 1, pending: 1, cancelled: 1, _id: 0 } },
                { $sort: { date: 1 } }
            ]);
        }

        const response = {
            success: true,
            data: trends
        };

        return res.json(response);
    } catch (err) {
        next(err);
    }
};

module.exports = {
    getReports,
    getManagerReports,
    getAdminReports,
    getAnalytics,
    revenueTrends,
    staffPerformance,
    exportReports,
    getSummary,
    getTrends
};