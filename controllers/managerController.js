// managerController.js - Manager operations (staff CRUD, daily business entry)
const Staff = require("../models/Staff");
const DailyBusiness = require("../models/DailyBusiness");
const Transaction = require("../models/Transaction");
const Business = require("../models/Business");
const Manager = require("../models/Manager");
const ManagerNotification = require("../models/ManagerNotification");
const Customer = require("../models/Customer");
const Service = require("../models/Service"); // Added for Transaction linking
const Appointment = require("../models/Appointment");
const { setCache, getCache, deleteCache } = require("../utils/cache");

// ================== Manager Dashboard ==================
const getManagerDashboard = async (req, res, next) => {
    try {
        const managerId = req.user.id;
        const cacheKey = `manager:${managerId}:dashboard`;

        // Try cache first
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            return res.json({ success: true, source: "cache", ...cachedData });
        }

        // Get manager and business info
        const manager = await Manager.findById(managerId).populate('business');
        if (!manager || !manager.business) {
            return res.status(404).json({ success: false, message: "Manager or business not found" });
        }

        const business = manager.business;


        // Date Helpers
        const now = new Date();
        const today = new Date(now); today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

        // Get today's transactions (For Recent Transactions List only)
        const todayTransactions = await Transaction.find({
            business: business._id,
            transactionDate: { $gte: today, $lt: tomorrow }
        }).sort({ transactionDate: -1 });

        const dashboard = {
            manager: {
                name: manager.name,
                username: manager.username,
                business: business.name,
                businessType: business.type
            },
            business: {
                id: business._id,
                name: business.name,
                type: business.type,
                branch: business.branch,
                address: business.address
            },
            // stats object removed - frontend now uses getManagerStats API
            recentTransactions: todayTransactions.slice(0, 5).map(t => ({
                id: t._id,
                customerName: t.customerName,
                serviceName: t.serviceName,
                finalPrice: t.finalPrice,
                transactionDate: t.transactionDate
            }))
        };

        // Cache for 5 minutes
        await setCache(cacheKey, dashboard, 300);

        return res.json({ success: true, data: dashboard });
    } catch (err) {
        next(err);
    }
};

// ================== Add Staff ==================
const addStaff = async (req, res, next) => {
    try {
        const managerId = req.user.id;
        const {
            name,
            email,
            phone,
            role,
            specialization,
            experience,
            salary,
            commission,
            username,
            pin
        } = req.body;

        // Get manager's business
        const manager = await Manager.findById(managerId);
        if (!manager) {
            return res.status(404).json({ success: false, message: "Manager not found" });
        }

        const staff = await Staff.create({
            business: manager.business,
            manager: managerId,
            name,
            email,
            phone,
            role: role || 'stylist',
            username,
            pin,
            specialization,
            experience: experience || 0,
            salary,
            commission: commission || 0
        });

        // Add staff to business
        await Business.findByIdAndUpdate(manager.business, {
            $push: { staff: staff._id }
        });

        // Invalidate caches
        await deleteCache(`manager:${managerId}:staff`);
        await deleteCache(`business:${manager.business}:staff`);

        return res.status(201).json({
            success: true,
            message: "Staff added successfully",
            data: staff,
        });
    } catch (err) {
        next(err);
    }
};

// ================== Get Staff ==================
const getStaff = async (req, res, next) => {
    try {
        const managerId = req.user.id;
        const { page = 1, limit = 10, role, search } = req.query;
        const cacheKey = `manager:${managerId}:staff:${role}:${search}:${page}:${limit}`;

        const cachedData = await getCache(cacheKey);
        if (cachedData) return res.json({ success: true, source: "cache", ...cachedData });

        // Get manager's business
        const manager = await Manager.findById(managerId);
        if (!manager) {
            return res.status(404).json({ success: false, message: "Manager not found" });
        }

        let query = { business: manager.business, status: 'active' };

        if (role) {
            query.role = role;
        }

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } }
            ];
        }

        const staff = await Staff.find(query)
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .sort({ createdAt: -1 });

        const total = await Staff.countDocuments(query);

        const response = {
            success: true,
            data: staff.map(s => s.toObject()),
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit),
            },
        };

        await setCache(cacheKey, response, 120);
        return res.json(response);
    } catch (err) {
        next(err);
    }
};

// ================== Get Staff By ID ==================
const getStaffById = async (req, res, next) => {
    try {
        const managerId = req.user.id;
        const staffId = req.params.id;
        const cacheKey = `manager:${managerId}:staff:${staffId}:detailed`;

        const cachedData = await getCache(cacheKey);
        if (cachedData) return res.json({ success: true, source: "cache", ...cachedData });

        // Get manager's business
        const manager = await Manager.findById(managerId);
        if (!manager) {
            return res.status(404).json({ success: false, message: "Manager not found" });
        }

        const staff = await Staff.findOne({
            _id: staffId,
            business: manager.business
        }).populate('business', 'name type branch address')
            .populate('manager', 'name username');

        if (!staff) {
            return res.status(404).json({ success: false, message: "Staff member not found" });
        }

        // Calculate Real Performance Stats from Transactions
        const performanceStats = await Transaction.aggregate([
            { $match: { staff: staff._id } },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: "$finalPrice" },
                    totalAppointments: { $sum: 1 },
                    completedAppointments: { $sum: { $cond: [{ $eq: ["$paymentStatus", "completed"] }, 1, 0] } },
                    totalCommissionEarned: { $sum: "$staffCommission" },
                    averageRating: { $avg: "$rating" },
                    totalReviews: { $sum: { $cond: [{ $gt: ["$rating", 0] }, 1, 0] } }
                }
            }
        ]);

        const stats = performanceStats[0] || {};

        // Merge real-time stats into performance object for the frontend
        const staffObj = staff.toObject();
        staffObj.performance = {
            ...staffObj.performance,
            totalRevenue: stats.totalRevenue || 0,
            totalAppointments: stats.totalAppointments || 0,
            completedAppointments: stats.completedAppointments || 0,
            totalCommissionEarned: stats.totalCommissionEarned || 0,
            averageRating: stats.averageRating ? parseFloat(stats.averageRating.toFixed(1)) : (staffObj.performance?.averageRating || 0),
            totalReviews: stats.totalReviews || (staffObj.performance?.totalReviews || 0)
        };

        const response = {
            success: true,
            data: staffObj
        };

        await setCache(cacheKey, response, 30); // Lower cache time for accurate performance
        return res.json(response);
    } catch (err) {
        next(err);
    }
};

// ================== Update Staff ==================
const updateStaff = async (req, res, next) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const managerId = req.user.id;

        // Get manager's business
        const manager = await Manager.findById(managerId);
        if (!manager) {
            return res.status(404).json({ success: false, message: "Manager not found" });
        }

        const staff = await Staff.findOneAndUpdate(
            { _id: id, business: manager.business },
            { ...updates, updatedAt: new Date() },
            { new: true }
        );

        if (!staff) {
            return res.status(404).json({ success: false, message: "Staff not found" });
        }

        // Invalidate caches
        await deleteCache(`manager:${managerId}:staff`);
        await deleteCache(`business:${manager.business}:staff`);

        return res.json({ success: true, message: "Staff updated successfully", data: staff });
    } catch (err) {
        next(err);
    }
};

// ================== Delete Staff ==================
const deleteStaff = async (req, res, next) => {
    try {
        const { id } = req.params;
        const managerId = req.user.id;

        // Get manager's business
        const manager = await Manager.findById(managerId);
        if (!manager) {
            return res.status(404).json({ success: false, message: "Manager not found" });
        }

        const staff = await Staff.findOneAndUpdate(
            { _id: id, business: manager.business },
            { status: 'inactive' },
            { new: true }
        );

        if (!staff) {
            return res.status(404).json({ success: false, message: "Staff not found" });
        }

        // Remove from business staff array
        await Business.findByIdAndUpdate(manager.business, {
            $pull: { staff: staff._id }
        });

        // Invalidate caches
        await deleteCache(`manager:${managerId}:staff`);
        await deleteCache(`business:${manager.business}:staff`);

        return res.json({ success: true, message: "Staff deleted successfully" });
    } catch (err) {
        next(err);
    }
};

// ================== Add Transaction ==================
const addTransaction = async (req, res, next) => {
    try {
        const managerId = req.user.id;
        const {
            customerName,
            customerPhone,
            customerEmail,
            serviceName,
            serviceType,
            serviceCategory,
            basePrice,
            discount,
            tax,
            paymentMethod,
            staff,
            notes,
            rating,
            source,
            staffCommission,
            serviceStartTime,
            serviceEndTime,
            duration
        } = req.body;

        // Get manager's business
        const manager = await Manager.findById(managerId);
        if (!manager) {
            return res.status(404).json({ success: false, message: "Manager not found" });
        }

        let customerId = null;
        let serviceId = null;

        // 1. Link Customer (Robust Lookup & Auto-Create)
        if (customerPhone || customerEmail) {
            const customerCriteria = [];
            if (customerPhone) customerCriteria.push({ phone: customerPhone });
            if (customerEmail) customerCriteria.push({ email: customerEmail });

            let existingCustomer = await Customer.findOne({
                business: manager.business,
                $or: customerCriteria
            });

            if (existingCustomer) {
                customerId = existingCustomer._id;
            } else if (customerName && customerPhone) {
                // Auto-create new customer if not found
                const newCustomer = await Customer.create({
                    business: manager.business,
                    firstName: customerName.split(' ')[0],
                    lastName: customerName.split(' ').slice(1).join(' ') || '',
                    phone: customerPhone,
                    email: customerEmail,
                    customerType: 'new',
                    source: 'walk-in',
                    createdBy: managerId,
                    createdByModel: 'Manager',
                    firstVisit: new Date()
                });
                customerId = newCustomer._id;
            }
        }

        // 2. Link Service (Improved Fuzzy Match)
        if (serviceName) {
            const fuzzyName = serviceName.trim().replace(/\s+/g, '\\s*');
            const existingService = await Service.findOne({
                business: manager.business,
                name: { $regex: new RegExp(`^${fuzzyName}$`, 'i') }
            });
            if (existingService) {
                serviceId = existingService._id;
            }
        }

        // 3. Final Price Calculation (Allow Override)
        let finalPrice = req.body.finalPrice;
        if (finalPrice === undefined || finalPrice === null) {
            finalPrice = (parseFloat(basePrice) || 0) - (parseFloat(discount) || 0) + (parseFloat(tax) || 0);
        }

        const transaction = await Transaction.create({
            business: manager.business,
            manager: managerId,
            staff,
            customer: customerId, // Linked Ref
            service: serviceId,   // Linked Ref
            customerName,
            customerPhone,
            customerEmail,
            isNewCustomer: !customerId, // logic: if we found them, they aren't new
            serviceName,
            serviceType,
            serviceCategory,
            basePrice,
            discount: discount || 0,
            tax: tax || 0,
            finalPrice,
            paymentMethod: paymentMethod || 'cash',
            paymentStatus: 'completed',
            notes,
            rating,
            source: source || 'walk-in',
            staffCommission: staffCommission || 0,
            serviceStartTime,
            serviceEndTime,
            duration,
            transactionDate: new Date()
        });

        // Invalidate caches
        await deleteCache(`manager:${managerId}:dashboard`);
        await deleteCache(`business:${manager.business}:transactions`);

        return res.status(201).json({
            success: true,
            message: "Transaction added successfully",
            data: transaction
        });
    } catch (err) {
        next(err);
    }
};

// ================== Get Transactions ==================
const getTransactions = async (req, res, next) => {
    try {
        const managerId = req.user.id;
        const { page = 1, limit = 10, startDate, endDate, serviceType } = req.query;

        // Get manager's business
        const manager = await Manager.findById(managerId);
        if (!manager) {
            return res.status(404).json({ success: false, message: "Manager not found" });
        }

        let query = { business: manager.business };

        if (startDate && endDate) {
            query.transactionDate = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        if (serviceType) {
            query.serviceType = serviceType;
        }

        const transactions = await Transaction.find(query)
            .populate('staff', 'name role')
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .sort({ transactionDate: -1 });

        const total = await Transaction.countDocuments(query);

        const response = {
            success: true,
            data: transactions.map(t => t.toObject()),
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        };

        await setCache(cacheKey, response, 120);
        return res.json(response);
    } catch (err) {
        next(err);
    }
};

// ================== Update Business (Manager can update their own business) ==================
const updateBusiness = async (req, res, next) => {
    try {
        const managerId = req.user.id;
        const updates = req.body;

        // Get manager's business
        const manager = await Manager.findById(managerId).populate('business');
        if (!manager || !manager.business) {
            return res.status(404).json({ success: false, message: "Manager or business not found" });
        }

        const businessId = manager.business._id;

        // Validate business type if being updated
        if (updates.type) {
            const validTypes = ["salon", "spa", "hotel", "restaurant", "retail", "gym", "clinic", "cafe", "studio", "education", "automotive", "others"];
            if (!validTypes.includes(updates.type)) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid business type. Must be one of: ${validTypes.join(', ')}`
                });
            }
        }

        // Managers cannot change certain fields
        delete updates.admin; // Cannot change business owner
        delete updates.isActive; // Cannot deactivate business
        delete updates.businessLink; // Cannot change business link

        // Update business - pre-save hook will extract lat/lng from googleMapsUrl if changed
        const updatedBusiness = await Business.findByIdAndUpdate(
            businessId,
            { ...updates, updatedAt: new Date() },
            { new: true, runValidators: true }
        ).populate('managers', 'name username email phone isActive');

        if (!updatedBusiness) {
            return res.status(404).json({ success: false, message: "Business not found" });
        }

        // Invalidate caches
        await deleteCache(`manager:${managerId}:dashboard`);
        await deleteCache(`business:${businessId}:info`);

        return res.json({
            success: true,
            message: "Business updated successfully",
            data: {
                id: updatedBusiness._id,
                name: updatedBusiness.name,
                type: updatedBusiness.type,
                branch: updatedBusiness.branch,
                address: updatedBusiness.address,
                city: updatedBusiness.city,
                state: updatedBusiness.state,
                phone: updatedBusiness.phone,
                email: updatedBusiness.email,
                website: updatedBusiness.website,
                businessLink: updatedBusiness.businessLink,
                location: updatedBusiness.location,
                googleMapsUrl: updatedBusiness.googleMapsUrl,
                images: updatedBusiness.images,
                socialMedia: updatedBusiness.socialMedia,
                registration: updatedBusiness.registration,
                category: updatedBusiness.category,
                tags: updatedBusiness.tags,
                features: updatedBusiness.features,
                amenities: updatedBusiness.amenities,
                paymentMethods: updatedBusiness.paymentMethods,
                bankDetails: updatedBusiness.bankDetails,
                settings: updatedBusiness.settings,
                isActive: updatedBusiness.isActive,
                managers: updatedBusiness.managers,
                updatedAt: updatedBusiness.updatedAt
            }
        });
    } catch (err) {
        next(err);
    }
};

// ================== Get Business Info (Manager can view their own business) ==================
const getBusinessInfo = async (req, res, next) => {
    try {
        const managerId = req.user.id;
        const cacheKey = `manager:${managerId}:business:info`;

        // Try cache first
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            return res.json({ success: true, source: "cache", data: cachedData });
        }

        // Get manager's business
        const manager = await Manager.findById(managerId).populate({
            path: 'business',
            populate: [
                { path: 'managers', select: 'name username email phone isActive' },
                { path: 'staff', select: 'name role phone email isActive' }
            ]
        });

        if (!manager || !manager.business) {
            return res.status(404).json({ success: false, message: "Manager or business not found" });
        }

        const business = manager.business;

        // Cache for 10 minutes
        await setCache(cacheKey, business, 600);

        return res.json({ success: true, data: business });
    } catch (err) {
        next(err);
    }
};
// ================== Get Manager Alerts ==================
const getAlerts = async (req, res, next) => {
    try {
        const managerId = req.user.id;
        console.log(`[GetAlerts] Fetching alerts for manager: ${managerId}`);
        const { page = 1, limit = 20, isRead } = req.query;

        const query = { manager: managerId };
        if (isRead !== undefined) {
            query.isRead = isRead === 'true';
        }

        const alerts = await ManagerNotification.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        console.log(`[GetAlerts] Found ${alerts.length} alerts for manager ${managerId}`);

        const total = await ManagerNotification.countDocuments(query);
        const unreadCount = await ManagerNotification.countDocuments({ manager: managerId, isRead: false });

        return res.json({
            success: true,
            data: alerts,
            unreadCount,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        console.error('[GetAlerts] Error:', err);
        next(err);
    }
};

// ================== Mark Alert as Read ==================
const markAlertAsRead = async (req, res, next) => {
    try {
        const { id } = req.params;
        const managerId = req.user.id;

        const alert = await ManagerNotification.findOne({ _id: id, manager: managerId });
        if (!alert) {
            return res.status(404).json({ success: false, message: "Notification not found" });
        }

        await alert.markAsRead();

        return res.json({ success: true, message: "Marked as read" });
    } catch (err) {
        next(err);
    }
};

// ================== Mark All Alerts as Read ==================
const markAllAlertsAsRead = async (req, res, next) => {
    try {
        const managerId = req.user.id;

        await ManagerNotification.updateMany(
            { manager: managerId, isRead: false },
            { isRead: true, readAt: new Date() }
        );

        return res.json({ success: true, message: "All marked as read" });
    } catch (err) {
        next(err);
    }
};

// ================== Create Test Notification (Debug) ==================
const createTestNotification = async (req, res, next) => {
    try {
        const managerId = req.user.id;
        const manager = await Manager.findById(managerId);

        console.log(`[TestNotif] Creating test notification for manager ${managerId}`);

        const notif = await ManagerNotification.createNotification(
            managerId,
            manager.business,
            "Test Notification",
            "This is a test notification to verify persistence.",
            {
                type: "system",
                priority: "high",
                metadata: { source: "test_endpoint" }
            }
        );

        console.log(`[TestNotif] Success! Created ${notif._id}`);

        return res.json({ success: true, message: "Test notification created", data: notif });
    } catch (err) {
        console.error('[TestNotif] Failed:', err);
        return res.status(500).json({ success: false, message: err.message, stack: err.stack });
    }
};

// ================== Get Manager Stats ==================
const getManagerStats = async (req, res, next) => {
    try {
        const managerId = req.user.id;
        const cacheKey = `manager:${managerId}:stats`;
        const { refresh } = req.query;

        // Try to get from cache (skip if refresh=true)
        if (refresh !== 'true') {
            const cachedData = await getCache(cacheKey);
            if (cachedData) {
                return res.json({ success: true, source: "cache", data: cachedData });
            }
        }

        const manager = await Manager.findById(managerId);
        if (!manager) {
            return res.status(404).json({ success: false, message: "Manager not found" });
        }
        const businessId = manager.business;

        // Helper for Date Ranges
        const now = new Date();
        const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59, 999);
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1); startOfMonth.setHours(0, 0, 0, 0);

        // 1. Total Staff
        const totalStaff = await Staff.countDocuments({ business: businessId, status: 'active' });

        // helper function for Hybrid Data by Date Range
        const getHybridData = async (query = {}) => {
            // A. Transactions (Revenue + Customers)
            const transactions = await Transaction.find({
                business: businessId,
                paymentStatus: 'completed',
                isRefunded: false,
                ...query
            }).select('finalPrice customer customerPhone');

            const revenueFromTxns = transactions.reduce((sum, t) => sum + (t.finalPrice || 0), 0);
            const txnCustomerIds = transactions.map(t => t.customer?.toString()).filter(id => id);
            const walkInPhones = transactions.filter(t => !t.customer).map(t => t.customerPhone);

            // B. Untracked Appointments (Ghost Revenue + Customers)
            // Logic: Completed appointments that do NOT have a transaction
            // Note: For revenue, we only want untracked. For customers, we want ALL appt customers to dedupe.

            // 1. Get ALL completed appointments for customers check
            const appointments = await Appointment.find({
                business: businessId,
                status: 'completed',
                ...(query.transactionDate ? { appointmentDate: query.transactionDate } : {}) // Map transactionDate query to appointmentDate
            }).select('totalAmount customer');

            const appCustomerIds = appointments.map(a => a.customer?.toString()).filter(id => id);

            // 2. Identify untracked appointments for Revenue addition
            // We need to check if these appointments are linked to any transaction.
            // Since we already fetched transactions, we can check if any transaction has 'appointment' field? 
            // The transactions list above didn't select 'appointment'. Let's optimize.
            // Actually, fetching all transactions for 'All Time' might be heavy.
            // But this is Manager Dashboard, usually limited data volume compared to Admin.
            // For safety, let's keep using Aggregation for Revenue to avoid loading all docs if possible, 
            // BUT we need distinct customers. loading IDs is cheap.

            // Let's stick to the previous robust Aggregation for Revenue, but fix the Customer Logic.
            return {
                txnCustomerIds,
                walkInPhones,
                appCustomerIds
            };
        };

        // --- Execute Calculations ---

        // A. REVENUE (Using efficient Aggregation)
        const calculateRevenue = async (dateMatch = {}) => {
            // 1. Transaction Revenue
            const txnAgg = await Transaction.aggregate([
                { $match: { business: businessId, paymentStatus: 'completed', isRefunded: false, ...dateMatch } },
                { $group: { _id: null, total: { $sum: "$finalPrice" }, count: { $sum: 1 } } }
            ]);
            const txnRevenue = txnAgg[0]?.total || 0;
            const txnCount = txnAgg[0]?.count || 0;

            // 2. Untracked Appointment Revenue
            // Need to match appointments in date range that have NO transactions
            const apptQuery = { business: businessId, status: 'completed' };
            if (dateMatch.transactionDate) {
                apptQuery.appointmentDate = dateMatch.transactionDate;
            }

            const apptAgg = await Appointment.aggregate([
                { $match: apptQuery },
                {
                    $lookup: {
                        from: "transactions",
                        localField: "_id",
                        foreignField: "appointment",
                        as: "existingTxn"
                    }
                },
                { $match: { existingTxn: { $size: 0 } } },
                { $group: { _id: null, total: { $sum: "$totalAmount" }, count: { $sum: 1 } } }
            ]);

            const apptRevenue = apptAgg[0]?.total || 0;
            const apptCount = apptAgg[0]?.count || 0;

            return {
                revenue: txnRevenue + apptRevenue,
                txnCount: txnCount + apptCount // Hybrid transaction count
            };
        };

        // B. CUSTOMERS (Using Distinct Queries - more efficient than loading all docs)
        const countUniqueCustomers = async (dateMatch = {}) => {
            const apptQuery = { business: businessId }; // Include pending? No, usually 'active' means visited. Let's stick to general interaction.
            // Dashboard typically shows "Total Customers" = Database size or Active? 
            // "Total Customers" typically means Registry size. 
            // "Monthly Customers" means Active in that month.

            if (dateMatch.transactionDate) {
                apptQuery.appointmentDate = dateMatch.transactionDate;
            }

            // 1. Transaction Customers (Registered)
            const txnCusts = await Transaction.distinct('customer', { business: businessId, ...dateMatch });
            // 2. Transaction Walk-ins (Phones)
            const walkIns = await Transaction.distinct('customerPhone', { business: businessId, customer: null, ...dateMatch });
            // 3. Appointment Customers
            const apptCusts = await Appointment.distinct('customer', apptQuery);

            const unique = new Set([
                ...txnCusts.filter(id => id).map(id => id.toString()),
                ...apptCusts.filter(id => id).map(id => id.toString()),
                ...walkIns.filter(phone => phone) // Also good practice to filter empty phones
            ]);
            return unique.size;
        };

        // Parallelize for Performance
        const [
            totalData,
            todayData,
            monthlyData,
            totalUniqueCustomers, // Global Customer Count (Registry)
            todayUniqueCustomers,
            monthlyUniqueCustomers
        ] = await Promise.all([
            calculateRevenue({}),
            calculateRevenue({ transactionDate: { $gte: startOfDay, $lte: endOfDay } }),
            calculateRevenue({ transactionDate: { $gte: startOfMonth } }),
            // For global 'Total Customers', we basically want everyone who ever visited OR is in Customer List?
            // Usually dashboard "Total Customers" is just Customer.countDocuments({ business }) + WalkIns.
            // Let's stick to "Active" set for consistency with logic, or rely on Registry?
            // Previous code: online + walkin. 
            // Let's use the Robust Unique Set for "All Time" Interaction.
            countUniqueCustomers({}),
            countUniqueCustomers({ transactionDate: { $gte: startOfDay, $lte: endOfDay } }),
            countUniqueCustomers({ transactionDate: { $gte: startOfMonth } })
        ]);

        const stats = {
            totalStaff,
            totalCustomers: totalUniqueCustomers,
            totalRevenue: totalData.revenue,
            totalTransactions: totalData.txnCount,
            check: "verified",
            todayRevenue: todayData.revenue,
            todayCustomers: todayUniqueCustomers,
            monthlyRevenue: monthlyData.revenue,
            monthlyCustomers: monthlyUniqueCustomers
        };

        // Cache for 5 minutes
        await setCache(cacheKey, stats, 300);

        // Obfuscate data for response (Base64)
        const encodedStats = Buffer.from(JSON.stringify(stats)).toString('base64');

        return res.json({ success: true, data: encodedStats });
    } catch (err) {
        next(err);
    }
};

// ================== Get Manager Appointment Stats ==================
const getManagerAppointmentStats = async (req, res, next) => {
    try {
        const managerId = req.user.id;
        const { startDate, endDate, filter } = req.query;

        const manager = await Manager.findById(managerId);
        if (!manager) {
            return res.status(404).json({ success: false, message: "Manager not found" });
        }

        let start, end;
        const now = new Date();

        if (filter === 'tomorrow') {
            const tmr = new Date(now);
            tmr.setDate(tmr.getDate() + 1);
            start = new Date(tmr);
            start.setHours(0, 0, 0, 0);

            end = new Date(tmr);
            end.setHours(23, 59, 59, 999);
        } else if (filter === 'custom' && startDate && endDate) {
            start = new Date(startDate);
            start.setHours(0, 0, 0, 0);

            end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
        } else {
            // Default to Today
            start = new Date(now);
            start.setHours(0, 0, 0, 0);

            end = new Date(now);
            end.setHours(23, 59, 59, 999);
        }

        const stats = await Appointment.aggregate([
            {
                $match: {
                    business: manager.business,
                    appointmentDate: { $gte: start, $lte: end }
                }
            },
            {
                $group: {
                    _id: "$status",
                    count: { $sum: 1 }
                }
            }
        ]);

        const result = {
            total: 0, // Added total
            pending: 0,
            confirmed: 0,
            completed: 0,
            cancelled: 0,
            no_show: 0,
            in_progress: 0,
            rescheduled: 0
        };

        stats.forEach(s => {
            if (result[s._id] !== undefined) {
                result[s._id] = s.count;
                result.total += s.count; // Accumulate total
            }
        });

        return res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

// ================== Update Transaction ==================
const updateTransaction = async (req, res, next) => {
    try {
        const { id } = req.params;
        const managerId = req.user.id;
        const updates = req.body;

        // Get manager's business
        const manager = await Manager.findById(managerId);
        if (!manager) {
            return res.status(404).json({ success: false, message: "Manager not found" });
        }

        // Find transaction first to verify ownership
        const transaction = await Transaction.findOne({ _id: id, business: manager.business });
        if (!transaction) {
            console.log(`[UpdateTransaction] Transaction not found or unauthorized for ID: ${id}`);
            return res.status(404).json({ success: false, message: "Transaction not found" });
        }

        console.log(`[UpdateTransaction] Processing update for TXN ${id}`);
        console.log(`[UpdateTransaction] Payload:`, JSON.stringify(updates, null, 2));

        // --- Logic to re-link Customer/Service if changed ---

        // 1. Try to link Customer (if phone/email provided and changed)
        if (updates.customerPhone || updates.customerEmail) {
            const customerQuery = { business: manager.business };
            if (updates.customerPhone) customerQuery.phone = updates.customerPhone;
            else if (updates.customerEmail) customerQuery.email = updates.customerEmail;

            const existingCustomer = await Customer.findOne(customerQuery);
            if (existingCustomer) {
                updates.customer = existingCustomer._id;
                updates.isNewCustomer = false; // Linked
            } else {
                // If specific phone entered but no customer found, unlink previous customer if names mismatch? 
                // Safer: If user explicitly updates phone, we try to match. If no match, maybe they are indeed new or unlinked.
                // We allow 'customer' to be set to null if we want to unlink, but usually we just leave it or set it if found.
            }
        }

        // 2. Try to link Service (if name provided)
        if (updates.serviceName) {
            const existingService = await Service.findOne({
                business: manager.business,
                name: { $regex: new RegExp(`^${updates.serviceName}$`, 'i') }
            });
            if (existingService) {
                updates.service = existingService._id;
            }
        }

        // 3. Recalculate Final Price if not provided but components are
        // (If user edits basePrice but clears finalPrice, we recalc. If they send finalPrice, we use it)
        if (updates.finalPrice === undefined && (updates.basePrice || updates.discount || updates.tax)) {
            const base = parseFloat(updates.basePrice !== undefined ? updates.basePrice : transaction.basePrice);
            const disc = parseFloat(updates.discount !== undefined ? updates.discount : transaction.discount);
            const tax = parseFloat(updates.tax !== undefined ? updates.tax : transaction.tax);
            updates.finalPrice = base - disc + tax;
        }

        // Perform Update
        const updatedTransaction = await Transaction.findByIdAndUpdate(
            id,
            { ...updates, updatedAt: new Date() },
            { new: true, runValidators: true }
        ).populate('staff', 'name role');

        // Invalidate caches
        await deleteCache(`manager:${managerId}:dashboard`);
        await deleteCache(`business:${manager.business}:transactions`);
        // Also invalidate specific transaction cache if any (though we usually cache lists)

        return res.json({
            success: true,
            message: "Transaction updated successfully",
            data: updatedTransaction
        });

    } catch (err) {
        next(err);
    }
};

// ================== Get Single Transaction ==================
const getTransaction = async (req, res, next) => {
    try {
        const { id } = req.params;
        const managerId = req.user.id;

        // Get manager's business
        const manager = await Manager.findById(managerId);
        if (!manager) {
            return res.status(404).json({ success: false, message: "Manager not found" });
        }

        // Find transaction with business ownership check
        const transaction = await Transaction.findOne({ _id: id, business: manager.business })
            .populate('staff', 'name role')
            .populate('customer', 'firstName lastName email phone')
            .populate('service', 'name type');

        if (!transaction) {
            return res.status(404).json({ success: false, message: "Transaction not found" });
        }

        return res.json({ success: true, data: transaction });
    } catch (err) {
        next(err);
    }
};

// ================== Get Manager Profile ==================
const getManagerProfile = async (req, res, next) => {
    try {
        const managerId = req.user.id;
        const manager = await Manager.findById(managerId).populate('business', 'name');

        if (!manager) {
            return res.status(404).json({ success: false, message: "Manager not found" });
        }

        return res.json({
            success: true,
            data: {
                id: manager._id,
                name: manager.name,
                username: manager.username,
                email: manager.email,
                phone: manager.phone,
                companyName: manager.business?.name || ""
            }
        });
    } catch (err) {
        next(err);
    }
};

// ================== Update Manager Profile ==================
const updateManagerProfile = async (req, res, next) => {
    try {
        const managerId = req.user.id;
        const { name, email, phone } = req.body;

        const manager = await Manager.findById(managerId);
        if (!manager) {
            return res.status(404).json({ success: false, message: "Manager not found" });
        }

        // Update fields
        if (name !== undefined) manager.name = name;
        if (email !== undefined) manager.email = email;
        if (phone !== undefined) manager.phone = phone;

        await manager.save();

        return res.json({
            success: true,
            message: "Profile updated successfully",
            data: {
                id: manager._id,
                name: manager.name,
                username: manager.username,
                email: manager.email,
                phone: manager.phone
            }
        });
    } catch (err) {
        next(err);
    }
};

// ================== Update Manager Password (PIN) ==================
const updateManagerPassword = async (req, res, next) => {
    try {
        const managerId = req.user.id;
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: "Current PIN and new PIN are required"
            });
        }

        const manager = await Manager.findById(managerId);
        if (!manager) {
            return res.status(404).json({ success: false, message: "Manager not found" });
        }

        // Check current PIN (Managers use plain PIN in this system as per authController)
        if (manager.pin !== currentPassword) {
            return res.status(400).json({ success: false, message: "Incorrect current PIN" });
        }

        // Update PIN
        manager.pin = newPassword;
        await manager.save();

        return res.json({
            success: true,
            message: "PIN updated successfully"
        });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    getManagerStats,
    getManagerDashboard,
    addStaff,
    getStaff,
    getStaffById,
    updateStaff,
    deleteStaff,
    addTransaction,
    updateTransaction,
    getTransactions,
    getTransaction, // Added
    updateBusiness,
    getBusinessInfo,
    getAlerts,
    markAlertAsRead,
    markAllAlertsAsRead,
    createTestNotification,
    getManagerAppointmentStats,
    getManagerProfile,
    updateManagerProfile,
    updateManagerPassword
};
