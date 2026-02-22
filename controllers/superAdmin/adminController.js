const Admin = require("../../models/Admin");
const Business = require("../../models/Business");
const Manager = require("../../models/Manager");
const Staff = require("../../models/Staff");
const Appointment = require("../../models/Appointment");
const Transaction = require("../../models/Transaction");

// Get all Admins with pagination, filtering and searching
const getAllAdmins = async (req, res, next) => {
    try {
        const { page = 1, limit = 10, search = "", status } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        // Build Query
        const query = {};

        // Search Condition
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
                { companyName: { $regex: search, $options: "i" } },
                { phone: { $regex: search, $options: "i" } }
            ];
        }

        // Filter by Status
        if (status !== undefined && status !== "") {
            query.isActive = status === "true";
        }

        // Fetch Admins with pagination
        const totalAdmins = await Admin.countDocuments(query);
        const admins = await Admin.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean();

        const enrichedAdmins = await Promise.all(admins.map(async (admin) => {
            // Get all businesses for this admin
            const businesses = await Business.find({ admin: admin._id }).select('_id').lean();
            const businessIds = businesses.map(b => b._id);

            // Calculate total bookings and revenue for these businesses
            const [appointmentStats, transactionStats] = await Promise.all([
                Appointment.aggregate([
                    { $match: { business: { $in: businessIds } } },
                    {
                        $group: {
                            _id: null,
                            totalBooking: { $sum: 1 },
                            totalRevenue: { $sum: "$totalAmount" }
                        }
                    }
                ]),
                Transaction.aggregate([
                    { $match: { business: { $in: businessIds }, paymentStatus: 'completed' } },
                    {
                        $group: {
                            _id: null,
                            totalTransaction: { $sum: 1 },
                            totalRevenue: { $sum: "$finalPrice" }
                        }
                    }
                ])
            ]);

            const totalBooking = appointmentStats.length > 0 ? appointmentStats[0].totalBooking : 0;
            const apptRevenue = appointmentStats.length > 0 ? appointmentStats[0].totalRevenue : 0;

            const totalTransaction = transactionStats.length > 0 ? transactionStats[0].totalTransaction : 0;
            const txnRevenue = transactionStats.length > 0 ? transactionStats[0].totalRevenue : 0;

            const totalRevenue = apptRevenue + txnRevenue;

            return {
                admin_id: admin._id,
                company_name: admin.companyName,
                admin_name: admin.name,
                email: admin.email,
                phone: admin.phone,
                total_business: businesses.length,
                is_active: admin.isActive,
                joined_data: admin.createdAt,
                total_booking: totalBooking,
                total_transaction: totalTransaction,
                total_revenue: totalRevenue,
                remark: admin.superAdminRemark || ""
            };
        }));

        return res.json({
            success: true,
            total: totalAdmins,
            page: pageNum,
            totalPages: Math.ceil(totalAdmins / limitNum),
            count: enrichedAdmins.length,
            data: enrichedAdmins
        });
    } catch (err) {
        next(err);
    }
};

// Update Admin Status (Active/Deactive)
const updateAdminStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { isActive, remark } = req.body;

        if (typeof isActive !== 'boolean') {
            return res.status(400).json({ success: false, message: "isActive (boolean) is required" });
        }

        const admin = await Admin.findByIdAndUpdate(
            id,
            { isActive, superAdminRemark: remark || "" },
            { new: true }
        ).select("-password -refreshToken");

        if (!admin) return res.status(404).json({ success: false, message: "Admin not found" });

        // Propagation: If admin status changes, update all their businesses
        await Business.updateMany(
            { admin: id },
            {
                isActive: isActive,
                isActiveFromSuperAdmin: isActive,
                superAdminRemark: remark || `Admin ${isActive ? 'activated' : 'deactivated'} by Super Admin`
            }
        );

        return res.json({
            success: true,
            message: `Admin and associated businesses ${isActive ? "activated" : "deactivated"} successfully`,
            data: {
                id: admin._id,
                isActive: admin.isActive
            }
        });
    } catch (err) {
        next(err);
    }
};

// Get Admin Profile and all associated Businesses with details (Paginated & Searchable)
const getAdminAllBusiness = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 10, search = "", status } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const admin = await Admin.findById(id).lean();
        if (!admin) return res.status(404).json({ success: false, message: "Admin not found" });

        // Build Business Query
        const busQuery = { admin: id };
        if (search) {
            busQuery.$or = [
                { name: { $regex: search, $options: "i" } },
                { branch: { $regex: search, $options: "i" } },
                { type: { $regex: search, $options: "i" } }
            ];
        }
        if (status !== undefined && status !== "") {
            busQuery.isActiveFromSuperAdmin = status === "true";
        }

        // Total businesses for the profile (unfiltered)
        const totalBusinessesForAdmin = await Business.countDocuments({ admin: id });

        // Filtered businesses for the list (with pagination)
        const totalFilteredBusinesses = await Business.countDocuments(busQuery);
        const businesses = await Business.find(busQuery)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean();

        // Calculate Global Admin Stats (Always total for the admin)
        const allBusinessesRaw = await Business.find({ admin: id }).select('_id').lean();
        const allBusinessIds = allBusinessesRaw.map(b => b._id);

        const [globalApptStats, globalTxnStats] = await Promise.all([
            Appointment.aggregate([
                { $match: { business: { $in: allBusinessIds } } },
                {
                    $group: {
                        _id: null,
                        totalBooking: { $sum: 1 },
                        totalRevenue: { $sum: "$totalAmount" }
                    }
                }
            ]),
            Transaction.aggregate([
                { $match: { business: { $in: allBusinessIds }, paymentStatus: 'completed' } },
                {
                    $group: {
                        _id: null,
                        totalTransaction: { $sum: 1 },
                        totalRevenue: { $sum: "$finalPrice" }
                    }
                }
            ])
        ]);

        const globalBooking = globalApptStats.length > 0 ? globalApptStats[0].totalBooking : 0;
        const globalApptRev = globalApptStats.length > 0 ? globalApptStats[0].totalRevenue : 0;
        const globalTransaction = globalTxnStats.length > 0 ? globalTxnStats[0].totalTransaction : 0;
        const globalTxnRev = globalTxnStats.length > 0 ? globalTxnStats[0].totalRevenue : 0;

        const globalTotalRevenue = globalApptRev + globalTxnRev;

        const admin_profile = {
            admin_id: admin._id,
            company_name: admin.companyName,
            admin_name: admin.name,
            email: admin.email,
            phone: admin.phone,
            total_business: totalBusinessesForAdmin,
            is_active: admin.isActive,
            joined_data: admin.createdAt,
            total_booking: globalBooking,
            total_transaction: globalTransaction,
            total_revenue: globalTotalRevenue,
            remark: admin.superAdminRemark || ""
        };

        // Enrich each business with managers, staff, and bookings
        const business_list = await Promise.all(businesses.map(async (bus) => {
            // Managers (Multiple)
            const managers = await Manager.find({ business: bus._id }).select('name pin sidebarSettings').lean();

            // Staff
            const staffList = await Staff.find({ business: bus._id }).select('email phone').lean();

            // Stats per business
            const [busApptStats, busTxnStats] = await Promise.all([
                Appointment.aggregate([
                    { $match: { business: bus._id } },
                    {
                        $group: {
                            _id: null,
                            totalBooking: { $sum: 1 },
                            totalRevenue: { $sum: "$totalAmount" }
                        }
                    }
                ]),
                Transaction.aggregate([
                    { $match: { business: bus._id, paymentStatus: 'completed' } },
                    {
                        $group: {
                            _id: null,
                            totalTransaction: { $sum: 1 },
                            totalRevenue: { $sum: "$finalPrice" }
                        }
                    }
                ])
            ]);

            const busBooking = busApptStats.length > 0 ? busApptStats[0].totalBooking : 0;
            const busApptRev = busApptStats.length > 0 ? busApptStats[0].totalRevenue : 0;
            const busTransaction = busTxnStats.length > 0 ? busTxnStats[0].totalTransaction : 0;
            const busTxnRev = busTxnStats.length > 0 ? busTxnStats[0].totalRevenue : 0;

            const busTotalRevenue = busApptRev + busTxnRev;

            return {
                business_id: bus._id,
                business_name: bus.name,
                business_type: bus.type,
                branch: bus.branch,
                managers_list: managers.map(m => ({ manager_id: m._id, name: m.name, pin: m.pin, sidebarSettings: m.sidebarSettings })),
                staff_contact: staffList.map(s => ({ email: s.email, phone: s.phone })),
                total_staff: staffList.length,
                total_booking: busBooking,
                total_transaction: busTransaction,
                total_revenue: busTotalRevenue,
                plan: bus.plan || "free",
                plan_duration: bus.planDuration || "none",
                is_active: bus.isActive && bus.isActiveFromSuperAdmin,
                join_at: bus.createdAt,
                expire_at: bus.expireAt || null,
                remark: bus.superAdminRemark || "",
                sidebarSettings: bus.sidebarSettings
            };
        }));

        return res.json({
            success: true,
            total: totalFilteredBusinesses,
            page: pageNum,
            totalPages: Math.ceil(totalFilteredBusinesses / limitNum),
            count: business_list.length,
            admin_profile,
            business_list
        });
    } catch (err) {
        next(err);
    }
};

// Toggle Business status from Super Admin
const updateAdminBusinessStatus = async (req, res, next) => {
    try {
        const { adminId, businessId } = req.params;
        const { isActive, remark } = req.body;

        if (typeof isActive !== 'boolean') {
            return res.status(400).json({ success: false, message: "isActive (boolean) is required" });
        }

        const business = await Business.findOneAndUpdate(
            { admin: adminId, _id: businessId },
            {
                isActive: isActive,
                isActiveFromSuperAdmin: isActive,
                superAdminRemark: remark || `Business ${isActive ? 'activated' : 'deactivated'} by Super Admin`
            },
            { new: true }
        );

        if (!business) return res.status(404).json({ success: false, message: "Business not found" });

        return res.json({
            success: true,
            message: `Business ${isActive ? "activated" : "deactivated"} successfully`,
            data: {
                id: business._id,
                status: business.isActive && business.isActiveFromSuperAdmin ? 'active' : 'inactive'
            }
        });
    } catch (err) {
        next(err);
    }
};

// Update Admin's business Plan
const updateAdminBusinessPlan = async (req, res, next) => {
    try {
        const { adminId, businessId } = req.params;
        const { planType, duration, expireAt } = req.body;

        if (!planType || !duration || !expireAt) {
            return res.status(400).json({ success: false, message: "planType, duration and expireAt are required" });
        }

        // Normalize duration to match enum in Business model if needed (e.g., 3_month -> 3 month)
        const normalizedDuration = duration.replace('_', ' ');

        // Parse date from DD/MM/YYYY
        const [day, month, year] = expireAt.split('/');
        const parsedExpiryDate = new Date(year, month - 1, day);

        const business = await Business.findOneAndUpdate(
            { admin: adminId, _id: businessId },
            {
                plan: planType,
                planDuration: normalizedDuration,
                expireAt: parsedExpiryDate,
                superAdminRemark: `Plan updated to ${planType} (${normalizedDuration}) by Super Admin. New expiry: ${expireAt}`,
                $push: {
                    planHistory: {
                        planType,
                        duration: normalizedDuration,
                        expireAt: parsedExpiryDate,
                        remark: `Updated by Super Admin on ${new Date().toLocaleDateString()}`
                    }
                }
            },
            { new: true }
        );

        if (!business) return res.status(404).json({ success: false, message: "Business not found" });

        return res.json({
            success: true,
            message: "Business plan updated successfully",
            data: {
                business_id: business._id,
                plan: business.plan,
                planDuration: business.planDuration,
                expireAt: business.expireAt
            }
        });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    getAllAdmins,
    getAdminAllBusiness,
    updateAdminStatus,
    updateAdminBusinessStatus,
    updateAdminBusinessPlan
};
