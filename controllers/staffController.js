// staffController.js - Staff operations
const Staff = require("../models/Staff");
const Business = require("../models/Business");
const Transaction = require("../models/Transaction");
const Appointment = require("../models/Appointment");
const Customer = require("../models/Customer");
const Service = require("../models/Service");
const { deleteCache, setCache, getCache } = require("../utils/cache");

// ================== Get My Profile ==================
const getMyProfile = async (req, res, next) => {
    try {
        const staffId = req.user.id;

        // Get staff with full business details and manager info
        const staff = await Staff.findById(staffId)
            .select("-password -pin -__v")
            .populate("manager", "name username email phone")
            .populate("business", "name type branch address city state country phone email logo");

        if (!staff) {
            return res.status(404).json({ success: false, message: "Staff not found" });
        }

        // Convert to object and clean up
        const profile = staff.toObject();

        // Ensure attendance only contains the summary
        if (profile.attendance) {
            const summary = profile.attendance.summary || {};
            profile.attendance = { summary };
        }

        return res.json({ success: true, data: profile });
    } catch (err) {
        next(err);
    }
};

// ================== Update My Profile ==================
const updateMyProfile = async (req, res, next) => {
    try {
        const staffId = req.user.id;
        const {
            name,
            email,
            phone,
            address,
            specialization,
            experience,
            workingHours
        } = req.body;

        // Build update object only with allowed fields
        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (email !== undefined) updateData.email = email;
        if (phone !== undefined) updateData.phone = phone;
        if (address !== undefined) updateData.address = address;
        if (specialization !== undefined) updateData.specialization = specialization;
        if (experience !== undefined) updateData.experience = experience;
        if (workingHours !== undefined) updateData.workingHours = workingHours;

        const staff = await Staff.findByIdAndUpdate(
            staffId,
            { ...updateData, updatedAt: new Date() },
            { new: true, runValidators: true }
        )
            .select("-password -pin -__v")
            .populate("manager", "name username email phone")
            .populate("business", "name type branch address city state country phone email logo");

        if (!staff) {
            return res.status(404).json({ success: false, message: "Staff not found" });
        }

        // Convert to object and clean up attendance (keep summary only)
        const profile = staff.toObject();
        if (profile.attendance) {
            profile.attendance = { summary: profile.attendance.summary || {} };
        }

        // Invalidate caches
        await deleteCache(`staff:${staffId}:dashboard`);
        // Manager's staff list cache
        if (staff.manager) {
            await deleteCache(`manager:${staff.manager._id || staff.manager}:staff`);
        }
        // Business staff list cache
        if (staff.business) {
            await deleteCache(`business:${staff.business._id || staff.business}:staff`);
        }

        return res.json({
            success: true,
            message: "Profile updated successfully",
            data: profile
        });
    } catch (err) {
        next(err);
    }
};

// ================== Get My Business Info ==================
const getMyBusiness = async (req, res, next) => {
    try {
        const staffId = req.user.id;

        const staff = await Staff.findById(staffId).populate("business");
        if (!staff) {
            return res.status(404).json({ success: false, message: "Staff not found" });
        }

        return res.json({
            success: true,
            data: {
                business: staff.business,
                staff: {
                    id: staff._id,
                    name: staff.name,
                    role: staff.role,
                    specialization: staff.specialization
                }
            }
        });
    } catch (err) {
        next(err);
    }
};

// ================== Staff Dashboard ==================
const getStaffDashboard = async (req, res, next) => {
    try {
        const staffId = req.user.id;
        const cacheKey = `staff:${staffId}:dashboard`;

        // Try cache first
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            return res.json({ success: true, source: "cache", ...cachedData });
        }

        // Get staff with business and manager info
        const staff = await Staff.findById(staffId)
            .populate('business', 'name type branch address')
            .populate('manager', 'name username');

        if (!staff || !staff.business) {
            return res.status(404).json({ success: false, message: "Staff or business not found" });
        }

        const business = staff.business;

        // Get today's date range
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Get this month's date range
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        // Get today's appointments for this staff
        const todayAppointments = await Appointment.find({
            staff: staffId,
            appointmentDate: { $gte: today, $lt: tomorrow }
        }).populate('customer', 'name phone').populate('service', 'name price');

        // Get this month's appointments
        const monthlyAppointments = await Appointment.find({
            staff: staffId,
            appointmentDate: { $gte: startOfMonth }
        });

        // Get today's transactions for this staff
        const todayTransactions = await Transaction.find({
            business: business._id,
            staff: staffId,
            transactionDate: { $gte: today, $lt: tomorrow }
        });

        // Get this month's transactions
        const monthlyTransactions = await Transaction.find({
            business: business._id,
            staff: staffId,
            transactionDate: { $gte: startOfMonth }
        });

        // Calculate stats
        const todayRevenue = todayTransactions.reduce((sum, t) => sum + (t.finalPrice || 0), 0);
        const monthlyRevenue = monthlyTransactions.reduce((sum, t) => sum + (t.finalPrice || 0), 0);
        const todayCustomers = new Set(todayTransactions.map(t => t.customer?.toString())).size;
        const monthlyCustomers = new Set(monthlyTransactions.map(t => t.customer?.toString())).size;

        // Get upcoming appointments (next 5)
        const upcomingAppointments = await Appointment.find({
            staff: staffId,
            appointmentDate: { $gte: new Date() },
            status: { $in: ['confirmed', 'pending'] }
        })
            .populate('customer', 'name phone')
            .populate('service', 'name price')
            .sort({ appointmentDate: 1 })
            .limit(5);

        const dashboard = {
            staff: {
                id: staff._id,
                name: staff.name,
                username: staff.username,
                role: staff.role,
                specialization: staff.specialization
            },
            manager: staff.manager ? {
                name: staff.manager.name,
                username: staff.manager.username
            } : null,
            business: {
                id: business._id,
                name: business.name,
                type: business.type,
                branch: business.branch,
                address: business.address
            },
            stats: {
                todayAppointments: todayAppointments.length,
                todayRevenue,
                todayCustomers,
                monthlyAppointments: monthlyAppointments.length,
                monthlyRevenue,
                monthlyCustomers,
                totalTransactions: todayTransactions.length
            },
            attendance: {
                summary: staff.attendance?.summary || {},
                // Filter records for current month
                records: (staff.attendance?.records || []).filter(r => {
                    const recordDate = new Date(r.date);
                    return recordDate >= startOfMonth;
                })
            },
            performance: staff.performance || {},
            // Check if checked in today
            currentStatus: (() => {
                const todayRecord = (staff.attendance?.records || []).find(r => {
                    const d = new Date(r.date);
                    return d.toDateString() === today.toDateString();
                });
                return {
                    isCheckedIn: todayRecord?.status === 'present' && todayRecord?.checkIn && !todayRecord?.checkOut,
                    checkIn: todayRecord?.checkIn,
                    checkOut: todayRecord?.checkOut,
                    status: todayRecord?.status || 'inactive'
                };
            })(),
            upcomingAppointments: upcomingAppointments.map(apt => ({
                id: apt._id,
                customerName: apt.customer?.name || 'N/A',
                customerPhone: apt.customer?.phone || 'N/A',
                serviceName: apt.service?.name || 'N/A',
                servicePrice: apt.service?.price || 0,
                appointmentDate: apt.appointmentDate,
                appointmentTime: apt.appointmentTime,
                status: apt.status
            })),
            recentTransactions: todayTransactions.map(t => ({
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

// ================== Check In ==================
const checkIn = async (req, res, next) => {
    try {
        const staffId = req.user.id;
        const now = new Date();
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);

        const staff = await Staff.findById(staffId);
        if (!staff) {
            return res.status(404).json({ success: false, message: "Staff not found" });
        }

        // Check if already checked in today
        const existingRecordIndex = (staff.attendance?.records || []).findIndex(r => {
            const d = new Date(r.date);
            return d.toDateString() === today.toDateString();
        });

        if (existingRecordIndex !== -1) {
            const record = staff.attendance.records[existingRecordIndex];
            if (record.checkIn) {
                return res.status(400).json({ success: false, message: "Already checked in today" });
            }
            // Update existing record (e.g. if it was marked absent initially)
            record.status = 'present';
            record.checkIn = now;
        } else {
            // Create new record
            if (!staff.attendance) staff.attendance = { records: [], summary: {} };
            staff.attendance.records.push({
                date: today,
                status: 'present',
                checkIn: now
            });

            // Update summary
            staff.attendance.summary.presentDays = (staff.attendance.summary.presentDays || 0) + 1;
        }

        await staff.save();
        await deleteCache(`staff:${staffId}:dashboard`);

        return res.json({
            success: true,
            message: "Checked in successfully",
            data: { checkIn: now }
        });
    } catch (err) {
        next(err);
    }
};

// ================== Check Out ==================
const checkOut = async (req, res, next) => {
    try {
        const staffId = req.user.id;
        const now = new Date();
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);

        const staff = await Staff.findById(staffId);
        if (!staff) {
            return res.status(404).json({ success: false, message: "Staff not found" });
        }

        // Find today's record
        const recordIndex = (staff.attendance?.records || []).findIndex(r => {
            const d = new Date(r.date);
            return d.toDateString() === today.toDateString();
        });

        if (recordIndex === -1 || !staff.attendance.records[recordIndex].checkIn) {
            return res.status(400).json({ success: false, message: "You must check in first" });
        }

        const record = staff.attendance.records[recordIndex];
        if (record.checkOut) {
            return res.status(400).json({ success: false, message: "Already checked out today" });
        }

        record.checkOut = now;
        await staff.save();
        await deleteCache(`staff:${staffId}:dashboard`);

        return res.json({
            success: true,
            message: "Checked out successfully",
            data: { checkOut: now }
        });
    } catch (err) {
        next(err);
    }
};

// ================== Add Transaction ==================
const addTransaction = async (req, res, next) => {
    try {
        const staffId = req.user.id;
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
            notes,
            rating,
            source // Extract source
        } = req.body;

        // Get staff profile to derive business and manager
        const staff = await Staff.findById(staffId);
        if (!staff) {
            return res.status(404).json({ success: false, message: "Staff profile not found" });
        }

        let customerId = null;
        let serviceId = null;

        // 1. Link Customer (Robust Lookup & Auto-Create)
        if (customerPhone || customerEmail) {
            const customerCriteria = [];
            if (customerPhone) customerCriteria.push({ phone: customerPhone });
            if (customerEmail) customerCriteria.push({ email: customerEmail });

            let existingCustomer = await Customer.findOne({
                business: staff.business,
                $or: customerCriteria
            });

            if (existingCustomer) {
                customerId = existingCustomer._id;
            } else if (customerName && customerPhone) {
                // Auto-create new customer if not found (CRM Benefit)
                const newCustomer = await Customer.create({
                    business: staff.business,
                    firstName: customerName.split(' ')[0],
                    lastName: customerName.split(' ').slice(1).join(' ') || '',
                    phone: customerPhone,
                    email: customerEmail,
                    customerType: 'new',
                    source: 'walk-in',
                    createdBy: staffId,
                    createdByModel: 'Staff',
                    firstVisit: new Date()
                });
                customerId = newCustomer._id;
            }
        }

        // 2. Link Service (Improved Fuzzy Match)
        if (serviceName) {
            // Flexible regex: matches "Hair cut", "Haircut", "Hair-cut"
            const fuzzyName = serviceName.trim().replace(/\s+/g, '\\s*');
            const existingService = await Service.findOne({
                business: staff.business,
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
            business: staff.business,
            manager: staff.manager, // Automatically link the manager assigned to this staff
            staff: staffId,
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
            source: source || 'walk-in', // Save source
            transactionDate: new Date()
        });

        // Invalidate caches
        await deleteCache(`staff:${staffId}:dashboard`);
        await deleteCache(`manager:${staff.manager}:dashboard`);
        await deleteCache(`business:${staff.business}:transactions`);

        return res.status(201).json({
            success: true,
            message: "Transaction added successfully",
            data: transaction
        });
    } catch (err) {
        next(err);
    }
};

// ================== Get My Transactions ==================
const getMyTransactions = async (req, res, next) => {
    try {
        const staffId = req.user.id;
        const { page = 1, limit = 10, startDate, endDate, serviceType, search } = req.query;
        const cacheKey = `staff:${staffId}:transactions:${startDate}:${endDate}:${serviceType}:${search}:${page}:${limit}`;

        const cachedData = await getCache(cacheKey);
        if (cachedData) return res.json({ success: true, source: "cache", ...cachedData });

        const staff = await Staff.findById(staffId);
        if (!staff) {
            return res.status(404).json({ success: false, message: "Staff not found" });
        }

        let query = {
            business: staff.business,
            staff: staffId
        };

        if (startDate && endDate) {
            query.transactionDate = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        if (serviceType) {
            query.serviceType = serviceType;
        }

        if (search) {
            query.$or = [
                { customerName: { $regex: search, $options: 'i' } },
                { customerPhone: { $regex: search, $options: 'i' } },
                { serviceName: { $regex: search, $options: 'i' } }
            ];
        }

        const transactions = await Transaction.find(query)
            .populate('customer', 'firstName lastName phone')
            .populate('service', 'name price category')
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .sort({ transactionDate: -1 });

        const total = await Transaction.countDocuments(query);

        const response = {
            success: true,
            data: transactions,
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

module.exports = {
    getMyProfile,
    updateMyProfile,
    getMyBusiness,
    getStaffDashboard,
    checkIn,
    checkOut,
    addTransaction,
    getMyTransactions
};
