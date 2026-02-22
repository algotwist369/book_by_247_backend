const Appointment = require("../models/Appointment");
const Customer = require("../models/Customer");
const Service = require("../models/Service");
const Business = require("../models/Business");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const PDFDocument = require("pdfkit");
const Manager = require("../models/Manager");
const Transaction = require("../models/Transaction");
const AdminNotification = require("../models/AdminNotification");
const ManagerNotification = require("../models/ManagerNotification");
const { setCache, getCache, deleteCache } = require("../utils/cache");
const { emitToUser } = require("../config/socket");
const Otp = require("../models/OTP");
const { createAndSendOTP, verifyOTP } = require("../utils/sendOTP");
const { sendTemplateSMS, sendTemplateWhatsApp } = require("../utils/sendSMS");
const { encryptResponse } = require("../utils/encryptionUtils");
const { sendTemplateMail } = require("../utils/sendMail");
const { validateAppointmentBooking } = require("../utils/appointmentUtils");
// Calculate pricing (handle both old format and new pricingOptions)
const { getServicePriceAndDuration } = require("../utils/appointmentUtils");

// Helper to notify all relevant users of a business (Admin + Managers)
const notifyBusinessStaff = async (businessId, event, data, notificationData = null) => {
    try {
        const business = await Business.findById(businessId);
        const managers = await Manager.find({ business: businessId, isActive: true });

        console.log(`[NotifyStaff] Found ${managers.length} managers for business ${businessId}`);

        // 1. Create persistent notification for managers FIRST (to avoid race condition)
        if (notificationData && managers.length > 0) {
            console.log('[NotifyStaff] Creating persistent notifications for managers:', notificationData.title);
            const promises = managers.map(async (manager) => {
                try {
                    const notif = await ManagerNotification.createNotification(
                        manager._id,
                        businessId,
                        notificationData.title,
                        notificationData.message,
                        {
                            type: notificationData.type || 'appointment',
                            priority: notificationData.priority || 'normal',
                            relatedAppointment: notificationData.relatedAppointment,
                            actionUrl: notificationData.actionUrl,
                            metadata: notificationData.metadata
                        }
                    );
                    return notif;
                } catch (err) {
                    console.error(`[NotifyStaff] FAILED to create notification for manager ${manager._id}:`, err);
                    return null;
                }
            });
            await Promise.all(promises);
            console.log('[NotifyStaff] All persistent notifications created.');
        } else {
            console.log('[NotifyStaff] Skipping persistent notification: No notificationData or no managers');
        }

        // 2. Notify managers via Socket
        managers.forEach(manager => {
            console.log(`[NotifyStaff] Emitting socket to manager: ${manager._id}`);
            emitToUser(manager._id, event, data);
        });

        // 3. Notify Admin via Socket
        if (business && business.admin) {
            emitToUser(business.admin, event, data);
        }

    } catch (error) {
        console.error('Error notifying business staff:', error);
    }
};

// ================== Create Appointment ==================
const createAppointment = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        let {
            businessId,
            customerId,
            serviceId,
            staffId,
            appointmentDate,
            startTime,
            endTime,
            customerNotes,
            specialRequests,
            bookingSource = "walk-in",
            paymentMethod = "cash",
            advanceAmount = 0
        } = req.body;

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

        // Verify customer
        const customer = await Customer.findOne({
            _id: customerId,
            business: business._id
        });

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: "Customer not found"
            });
        }

        // Verify service
        const service = await Service.findOne({
            _id: serviceId,
            business: business._id,
            isActive: true
        });

        if (!service) {
            return res.status(404).json({
                success: false,
                message: "Service not found or inactive"
            });
        }

        // Check staff availability if staffId provided
        if (staffId) {
            const isAvailable = await Appointment.checkAvailability(
                business._id,
                staffId,
                new Date(appointmentDate),
                startTime,
                endTime
            );

            if (!isAvailable) {
                return res.status(400).json({
                    success: false,
                    message: "Staff is not available at the selected time"
                });
            }
        }

        const { price: servicePrice, duration: serviceDuration } = getServicePriceAndDuration(service);
        const discount = 0; // Can be calculated based on loyalty, membership, etc.
        const tax = servicePrice * 0.18; // 18% GST (can be configurable)
        const totalAmount = servicePrice + tax - discount;

        // Create appointment
        const appointment = await Appointment.create({
            business: business._id,
            customer: customerId,
            service: serviceId,
            staff: staffId,
            appointmentDate: new Date(appointmentDate),
            startTime,
            endTime,
            duration: serviceDuration,
            servicePrice,
            tax,
            discount,
            totalAmount,
            customerNotes,
            specialRequests,
            bookingSource,
            paymentMethod,
            advanceAmount,
            paidAmount: advanceAmount,
            paymentStatus: advanceAmount >= totalAmount ? 'paid' : advanceAmount > 0 ? 'partial' : 'pending',
            createdBy: userId,
            createdByModel: userRole === 'admin' ? 'Admin' : 'Manager'
        });

        // Update service stats
        await service.updateStats(totalAmount);

        // Invalidate cache
        await deleteCache(`business:${business._id}:appointments*`);
        await deleteCache(`business:${business._id}:appointment:stats*`);

        // Notify business admin
        // Notify business staff (Admin + Managers)
        // Notify business staff (Admin + Managers)
        await notifyBusinessStaff(business._id, 'new_appointment', {
            message: `New appointment booked for ${customer.firstName} ${customer.lastName}`,
            appointmentId: appointment._id,
            customerName: `${customer.firstName} ${customer.lastName}`,
            serviceName: service.name,
            time: `${appointmentDate} at ${startTime}`,
            data: appointment
        }, {
            // Persistent notification data
            title: 'New Appointment',
            message: `New appointment: ${customer.firstName} ${customer.lastName} - ${service.name} at ${startTime}`,
            type: 'appointment',
            relatedAppointment: appointment._id,
            actionUrl: `/manager/appointments/${appointment._id}`,
            metadata: {
                source: 'system',
                eventId: appointment._id.toString(),
                category: 'appointment'
            }
        });

        // Create persistent notification for Admin
        if (business.admin) {
            await AdminNotification.createSystemNotification(
                business.admin,
                'New Appointment',
                `New appointment booked for ${customer.firstName} ${customer.lastName} - ${service.name}`,
                {
                    type: 'business',
                    priority: 'normal',
                    actionUrl: `/admin/appointments/${appointment._id}`,
                    actionText: 'View Appointment',
                    metadata: {
                        source: 'internal',
                        eventId: appointment._id,
                        category: 'appointment'
                    }
                }
            );
        }

        // ================== SEND EMAIL NOTIFICATIONS ==================
        // Execute asynchronously to not block response
        (async () => {
            try {
                // Fetch full business details for emails (Admin & Managers)
                const businessDetails = await Business.findById(business._id)
                    .populate('admin', 'email name')
                    .populate('managers', 'email name isActive');

                // Prepare common data
                const dateObj = new Date(appointmentDate);
                const formattedDate = dateObj.toLocaleDateString('en-US', {
                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                });

                const commonData = {
                    businessName: business.name,
                    customerName: `${customer.firstName} ${customer.lastName}`,
                    customerEmail: customer.email,
                    customerPhone: customer.phone,
                    appointmentDate: formattedDate,
                    startTime: startTime,
                    endTime: endTime,
                    services: service.name,
                    confirmationCode: appointment.bookingNumber,
                    staffInfo: staffId ? `<p><strong>Assigned Staff:</strong> Staff ID ${staffId}</p>` : '',
                    customerNotesInfo: customerNotes ? `<p><strong>Customer Notes:</strong> ${customerNotes}</p>` : '',
                    actionUrl: `${process.env.FRONTEND_URL || 'https://spaadvisor.in'}/admin/appointments/${appointment._id}`
                };

                // Track sent emails to prevent duplicates
                const sentEmails = new Set();

                // 1. Notify Admin
                const adminEmail = businessDetails?.admin?.email || businessDetails?.email;
                if (adminEmail && !sentEmails.has(adminEmail.toLowerCase())) {
                    await sendTemplateMail({
                        to: adminEmail,
                        template: 'new_booking_admin',
                        data: {
                            ...commonData,
                            actionUrl: `${process.env.FRONTEND_URL || 'https://spaadvisor.in'}/admin/appointments/${appointment._id}`
                        }
                    });
                    sentEmails.add(adminEmail.toLowerCase());
                }

                // 2. Notify Managers
                if (businessDetails?.managers?.length > 0) {
                    for (const manager of businessDetails.managers) {
                        if (manager.isActive && manager.email && !sentEmails.has(manager.email.toLowerCase())) {
                            await sendTemplateMail({
                                to: manager.email,
                                template: 'new_booking_manager',
                                data: {
                                    ...commonData,
                                    actionUrl: `${process.env.FRONTEND_URL || 'https://spaadvisor.in'}/manager/appointments/${appointment._id}`
                                }
                            });
                            sentEmails.add(manager.email.toLowerCase());
                        }
                    }
                }

                // 3. Notify Customer
                if (customer.email && !sentEmails.has(customer.email.toLowerCase())) {
                    await sendTemplateMail({
                        to: customer.email,
                        template: 'appointment_confirmation',
                        data: {
                            ...commonData,
                            customerName: customer.firstName, // Use first name for friendlier greeting
                            actionUrl: `${process.env.FRONTEND_URL || 'https://spaadvisor.in'}/appointment/${appointment.confirmationCode}` // Customer view link
                        }
                    });
                    sentEmails.add(customer.email.toLowerCase());
                }

            } catch (emailError) {
                console.error('EMAIL: Failed to send appointment creation emails:', emailError);
                // Do not throw, finding is non-critical to flow
            }
        })();
        // ==============================================================

        return res.status(201).json({
            success: true,
            message: "Appointment created successfully",
            data: {
                bookingNumber: appointment.bookingNumber,
                appointmentDate: appointment.appointmentDate,
                startTime: appointment.startTime,
                totalAmount: appointment.totalAmount,
                status: appointment.status
            }
        });
    } catch (err) {
        next(err);
    }
};

// ================== Get Appointments ==================
const getAppointments = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        let {
            businessId,
            page = 1,
            limit = 20,
            status,
            startDate,
            endDate,
            customerId,
            staffId,
            serviceId,
            search
        } = req.query;

        // Determine business scope
        let query = {};

        if (userRole === 'admin') {
            if (businessId) {
                const business = await Business.findOne({ _id: businessId, admin: userId });
                if (!business) {
                    return res.status(404).json({
                        success: false,
                        message: "Business not found or access denied"
                    });
                }
                query.business = business._id;
            } else {
                // If no businessId provided, fetch for all businesses owned by admin
                const businesses = await Business.find({ admin: userId }).select('_id');
                const businessIds = businesses.map(b => b._id);
                query.business = { $in: businessIds };
            }
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            if (!manager) {
                return res.status(404).json({
                    success: false,
                    message: "Manager not found"
                });
            }
            query.business = manager.business;
            // Explicitly set businessId for cache key consistent with the query
            businessId = manager.business.toString();
        }

        // Cache key needs to handle multiple businesses or specific business
        const businessKey = businessId ? `business:${businessId}` : `admin:${userId}:all_businesses`;
        const cacheKey = `${businessKey}:appointments:v2:${page}:${limit}:${status}:${startDate}:${endDate}:${customerId}:${staffId}:${serviceId}:${search}`;

        // Try cache first
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            return res.json({ success: true, source: "cache", ...cachedData });
        }


        if (status) {
            query.status = status;
        }

        if (startDate && endDate) {
            query.appointmentDate = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        } else if (startDate) {
            query.appointmentDate = { $gte: new Date(startDate) };
        } else if (endDate) {
            query.appointmentDate = { $lte: new Date(endDate) };
        }

        if (customerId) {
            query.customer = customerId;
        }

        if (staffId) {
            query.staff = staffId;
        }

        if (serviceId) {
            query.service = serviceId;
        }

        if (search) {
            const searchRegex = new RegExp(search.trim(), 'i');

            // Find matching customers
            const matchingCustomers = await Customer.find({
                $or: [
                    { firstName: searchRegex },
                    { lastName: searchRegex },
                    { phone: searchRegex },
                    { email: searchRegex }
                ]
            }).select('_id');

            const customerIds = matchingCustomers.map(c => c._id);

            // Search by booking number, appointment ID, or customer
            query.$or = [
                { bookingNumber: searchRegex },
                { customer: { $in: customerIds } }
            ];

            if (search.match(/^[0-9a-fA-F]{24}$/)) {
                query.$or.push({ _id: search });
            }
        }

        const appointments = await Appointment.find(query)
            .populate('business', 'name  branch ')
            .populate('customer', 'firstName lastName phone email')
            .populate('service', 'name price duration')
            .populate('staff', 'name role phone')
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .sort({ [req.query.sortBy || 'createdAt']: req.query.sortOrder === 'asc' ? 1 : -1 })
            .lean();

        // Mark new bookings (created within last 24h)
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        appointments.forEach(appointment => {
            if (new Date(appointment.createdAt) > twentyFourHoursAgo) {
                appointment.new = true;
            } else {
                appointment.new = false;
            }
        });

        const total = await Appointment.countDocuments(query);

        // ===========================================
        // Add Revenue Stats (Requested Feature)
        // ===========================================
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        startOfMonth.setHours(0, 0, 0, 0);

        const startOfDay = new Date(now);
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(now);
        endOfDay.setHours(23, 59, 59, 999);

        // Transaction Match Query (Scope: Business Only)
        // We use query.business which is already determined above
        const statsMatch = {
            business: query.business,
            paymentStatus: 'completed',
            isRefunded: false
        };

        const [totalRevStats, monthlyRevStats, todayRevStats] = await Promise.all([
            // Total Revenue
            Transaction.aggregate([
                { $match: statsMatch },
                { $group: { _id: null, total: { $sum: "$finalPrice" } } }
            ]),
            // Monthly Revenue
            Transaction.aggregate([
                { $match: { ...statsMatch, transactionDate: { $gte: startOfMonth } } },
                { $group: { _id: null, total: { $sum: "$finalPrice" } } }
            ]),
            // Today Revenue
            Transaction.aggregate([
                { $match: { ...statsMatch, transactionDate: { $gte: startOfDay, $lte: endOfDay } } },
                { $group: { _id: null, total: { $sum: "$finalPrice" } } }
            ])
        ]);

        const revenueStats = {
            totalRevenue: totalRevStats[0]?.total || 0,
            monthlyRevenue: monthlyRevStats[0]?.total || 0,
            todayRevenue: todayRevStats[0]?.total || 0
        };

        const response = {
            success: true,
            data: appointments,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            },
            revenueStats // Include in response
        };

        // Cache for 2 minutes
        await setCache(cacheKey, response, 120);

        return res.json(response);
    } catch (err) {
        next(err);
    }
};

// ================== Get Appointment by ID ==================
const getAppointmentById = async (req, res, next) => {
    try {
        const { id } = req.params;

        const appointment = await Appointment.findById(id)
            .populate('business', 'name type branch phone email')
            .populate('customer', 'firstName lastName phone email address')
            .populate('service', 'name description price duration category')
            .populate('staff', 'name role phone email')
            .populate('createdBy')
            .populate('cancelledBy')
            .populate('rescheduledBy');

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: "Appointment not found"
            });
        }

        return res.json({
            success: true,
            data: appointment
        });
    } catch (err) {
        next(err);
    }
};

// ================== Update Appointment ==================
const updateAppointment = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { id } = req.params;
        const updates = req.body;

        const appointment = await Appointment.findById(id);

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: "Appointment not found"
            });
        }

        // Verify access
        if (userRole === 'admin') {
            const business = await Business.findOne({
                _id: appointment.business,
                admin: userId
            });
            if (!business) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied"
                });
            }
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            if (manager.business.toString() !== appointment.business.toString()) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied"
                });
            }
        }

        // Update appointment
        Object.assign(appointment, updates);
        appointment.updatedBy = userId;
        appointment.updatedByModel = userRole === 'admin' ? 'Admin' : 'Manager';

        await appointment.save();

        // Invalidate cache
        await deleteCache(`business:${appointment.business}:appointments*`);
        await deleteCache(`business:${appointment.business}:appointment:stats*`);

        return res.json({
            success: true,
            message: "Appointment updated successfully",
            data: appointment
        });

        // Notify staff
        notifyBusinessStaff(appointment.business, 'appointment_updated', {
            appointmentId: appointment._id,
            status: appointment.status,
            message: `Appointment updated`,
            data: appointment
        });
    } catch (err) {
        next(err);
    }
};

// ================== Confirm Appointment ==================
const confirmAppointment = async (req, res, next) => {
    try {
        const { id } = req.params;

        const appointment = await Appointment.findById(id);

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: "Appointment not found"
            });
        }

        await appointment.confirm();

        // Invalidate cache
        // Invalidate cache
        await deleteCache(`business:${appointment.business}:appointments*`);
        await deleteCache(`business:${appointment.business}:appointment:stats*`);

        // Notify staff
        notifyBusinessStaff(appointment.business, 'appointment_updated', {
            appointmentId: appointment._id,
            status: 'confirmed',
            message: `Appointment confirmed`,
            data: appointment
        });

        // ================== SEND EMAIL ==================
        (async () => {
            try {
                const fullAppt = await Appointment.findById(appointment._id)
                    .populate('business')
                    .populate('customer')
                    .populate('service');

                if (fullAppt?.customer?.email) {
                    const formattedDate = new Date(fullAppt.appointmentDate).toLocaleDateString('en-US', {
                        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                    });

                    await sendTemplateMail({
                        to: fullAppt.customer.email,
                        template: 'appointment_confirmation',
                        data: {
                            businessName: fullAppt.business.name,
                            customerName: fullAppt.customer.firstName,
                            appointmentDate: formattedDate,
                            startTime: fullAppt.startTime,
                            endTime: fullAppt.endTime,
                            services: fullAppt.service?.name || 'Service',
                            confirmationCode: fullAppt.bookingNumber,
                            actionUrl: `${process.env.FRONTEND_URL || 'https://spaadvisor.in'}/appointment/${fullAppt.bookingNumber}`
                        }
                    });
                }
            } catch (e) { console.error('Email error:', e); }
        })();
        // ================================================

        return res.json({
            success: true,
            message: "Appointment confirmed successfully"
        });
    } catch (err) {
        next(err);
    }
};

// ================== Start Appointment ==================
const startAppointment = async (req, res, next) => {
    try {
        const { id } = req.params;

        const appointment = await Appointment.findById(id);

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: "Appointment not found"
            });
        }

        await appointment.start();

        // Invalidate cache
        // Invalidate cache
        await deleteCache(`business:${appointment.business}:appointments*`);
        await deleteCache(`business:${appointment.business}:appointment:stats*`);

        // Notify staff
        notifyBusinessStaff(appointment.business, 'appointment_updated', {
            appointmentId: appointment._id,
            status: 'in_progress',
            message: `Appointment started`,
            data: appointment
        });

        return res.json({
            success: true,
            message: "Appointment started successfully",
            checkInTime: appointment.checkInTime
        });
    } catch (err) {
        next(err);
    }
};

// ================== Complete Appointment ==================
const completeAppointment = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { loyaltyPoints = 0 } = req.body;

        const appointment = await Appointment.findById(id)
            .populate('customer');

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: "Appointment not found"
            });
        }

        if (appointment.status !== 'completed') {
            await appointment.complete();

            // =========================================================
            // AUTO-CREATE TRANSACTION (REVENUE FIX)
            // =========================================================
            // Check if transaction already exists to prevent duplicates
            const existingTransaction = await Transaction.findOne({ appointment: appointment._id });

            if (!existingTransaction) {
                // Find a default manager (admin of business or first manager) - simplified to business owner for now
                // Ideally, we should track which manager/staff completed it.
                // For now, we use the business owner (admin) as manager reference or find a manager.
                // Since this is a critical fix, we'll try to find a manager associated with the business.
                const manager = await Manager.findOne({ business: appointment.business });

                // Create transaction regardless of whether manager is found (Schema now allows optional manager)
                await Transaction.create({
                    business: appointment.business,
                    manager: manager ? manager._id : undefined, // Optional
                    appointment: appointment._id,
                    customer: appointment.customer ? appointment.customer._id : undefined,
                    staff: appointment.staff,

                    customerName: appointment.customer ? appointment.customer.name : (appointment.customerName || 'Walk-in'),
                    customerPhone: appointment.customer ? appointment.customer.phone : (appointment.customerPhone || ''),
                    customerEmail: appointment.customer ? appointment.customer.email : '',

                    serviceName: appointment.serviceName || 'Service',
                    serviceType: appointment.serviceType || 'other',
                    serviceCategory: 'Appointment',

                    basePrice: appointment.totalAmount || 0,
                    finalPrice: appointment.totalAmount || 0,

                    paymentStatus: 'completed',
                    source: 'appointment', // Source as 'appointment'
                    transactionDate: new Date()
                });
            }
            // =========================================================
            // Invalidate ALL managers' dashboard cache for this business
            // This ensures every manager sees the real-time revenue update
            const managers = await Manager.find({ business: appointment.business });
            for (const mgr of managers) {
                await deleteCache(`manager:${mgr._id}:dashboard`);
                await deleteCache(`manager:${mgr._id}:stats`);
            }
            // =========================================================
        }

        // Update customer stats
        if (appointment.customer) {
            await appointment.customer.updateAfterVisit(appointment.totalAmount);

            // Add loyalty points if provided
            if (loyaltyPoints > 0) {
                await appointment.customer.addLoyaltyPoints(loyaltyPoints);
                appointment.loyaltyPointsEarned = loyaltyPoints;
                await appointment.save();
            }
        }

        // Invalidate cache
        // Invalidate cache
        await deleteCache(`business:${appointment.business}:appointments*`);
        await deleteCache(`business:${appointment.business}:appointment:stats*`);
        await deleteCache(`business:${appointment.business}:customers`);

        // Notify staff
        notifyBusinessStaff(appointment.business, 'appointment_updated', {
            appointmentId: appointment._id,
            status: 'completed',
            message: `Appointment completed`,
            data: appointment
        });

        return res.json({
            success: true,
            message: "Appointment completed successfully",
            completedAt: appointment.completedAt,
            actualDuration: appointment.actualDuration
        });
    } catch (err) {
        next(err);
    }
};

// ================== Cancel Appointment ==================
const cancelAppointment = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { id } = req.params;
        const { reason, cancellationFee = 0 } = req.body;

        const appointment = await Appointment.findById(id);

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: "Appointment not found"
            });
        }

        await appointment.cancel(
            reason,
            userId,
            userRole === 'admin' ? 'Admin' : 'Manager',
            cancellationFee
        );

        // Invalidate cache
        // Invalidate cache
        await deleteCache(`business:${appointment.business}:appointments*`);
        await deleteCache(`business:${appointment.business}:appointment:stats*`);

        // Notify staff
        notifyBusinessStaff(appointment.business, 'appointment_cancelled', {
            appointmentId: appointment._id,
            status: 'cancelled',
            message: `Appointment cancelled`,
            data: appointment
        });

        // ================== SEND EMAIL ==================
        (async () => {
            try {
                const fullAppt = await Appointment.findById(appointment._id)
                    .populate('business')
                    .populate('customer')
                    .populate('service');

                if (fullAppt) {
                    const formattedDate = new Date(fullAppt.appointmentDate).toLocaleDateString('en-US', {
                        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                    });

                    // Fetch admin/managers for notifications
                    const businessDetails = await Business.findById(fullAppt.business._id)
                        .populate('admin', 'email name')
                        .populate('managers', 'email name isActive');

                    const commonData = {
                        businessName: fullAppt.business.name,
                        customerName: `${fullAppt.customer.firstName} ${fullAppt.customer.lastName}`,
                        appointmentDate: formattedDate,
                        startTime: fullAppt.startTime,
                        endTime: fullAppt.endTime,
                        services: fullAppt.service?.name || 'Service',
                        reason: reason || 'Requested by user',
                        actionUrl: `${process.env.FRONTEND_URL || 'https://spaadvisor.in'}/admin/appointments/${fullAppt._id}`
                    };

                    // Track sent emails to prevent duplicates
                    const sentEmails = new Set();

                    // 1. Notify Customer
                    if (fullAppt.customer?.email && !sentEmails.has(fullAppt.customer.email.toLowerCase())) {
                        await sendTemplateMail({
                            to: fullAppt.customer.email,
                            template: 'appointment_cancelled',
                            data: {
                                ...commonData,
                                customerName: fullAppt.customer.firstName,
                                actionUrl: `${process.env.FRONTEND_URL || 'https://spaadvisor.in'}/book/${fullAppt.business.businessLink}` // Rebook link
                            }
                        });
                        sentEmails.add(fullAppt.customer.email.toLowerCase());
                    }

                    // 2. Notify Admin
                    const adminEmail = businessDetails?.admin?.email || businessDetails?.email;
                    if (adminEmail && !sentEmails.has(adminEmail.toLowerCase())) {
                        await sendTemplateMail({
                            to: adminEmail,
                            template: 'appointment_cancelled',
                            data: {
                                ...commonData,
                                customerName: "Admin", // Generic greeting for admin context
                                reason: `Cancelled by ${userRole}: ${reason || 'No reason provided'}`
                            }
                        });
                        sentEmails.add(adminEmail.toLowerCase());
                    }

                    // 3. Notify Managers
                    if (businessDetails?.managers?.length > 0) {
                        for (const manager of businessDetails.managers) {
                            if (manager.isActive && manager.email && !sentEmails.has(manager.email.toLowerCase())) {
                                await sendTemplateMail({
                                    to: manager.email,
                                    template: 'appointment_cancelled',
                                    data: {
                                        ...commonData,
                                        customerName: "Manager",
                                        reason: `Cancelled by ${userRole}: ${reason || 'No reason provided'}`
                                    }
                                });
                                sentEmails.add(manager.email.toLowerCase());
                            }
                        }
                    }
                }
            } catch (e) { console.error('Email error:', e); }
        })();
        // ================================================

        return res.json({
            success: true,
            message: "Appointment cancelled successfully"
        });
    } catch (err) {
        next(err);
    }
};

// ================== Reschedule Appointment ==================
const rescheduleAppointment = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { id } = req.params;
        const { newDate, newStartTime, newEndTime, reason } = req.body;

        if (!newDate || !newStartTime || !newEndTime) {
            return res.status(400).json({
                success: false,
                message: "New date and time are required"
            });
        }

        const appointment = await Appointment.findById(id);

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: "Appointment not found"
            });
        }

        // Check availability for new time
        if (appointment.staff) {
            const isAvailable = await Appointment.checkAvailability(
                appointment.business,
                appointment.staff,
                new Date(newDate),
                newStartTime,
                newEndTime
            );

            if (!isAvailable) {
                return res.status(400).json({
                    success: false,
                    message: "Staff is not available at the selected time"
                });
            }
        }

        await appointment.reschedule(
            new Date(newDate),
            newStartTime,
            newEndTime,
            reason,
            userId,
            userRole === 'admin' ? 'Admin' : 'Manager'
        );

        // Invalidate cache
        // Invalidate cache
        await deleteCache(`business:${appointment.business}:appointments*`);
        await deleteCache(`business:${appointment.business}:appointment:stats*`);

        // Notify staff
        notifyBusinessStaff(appointment.business, 'appointment_updated', {
            appointmentId: appointment._id,
            status: appointment.status,
            message: `Appointment rescheduled`,
            data: appointment
        });

        // ================== SEND EMAIL ==================
        (async () => {
            try {
                const fullAppt = await Appointment.findById(appointment._id)
                    .populate('business')
                    .populate('customer')
                    .populate('service');

                if (fullAppt?.customer?.email) {
                    const formattedDate = new Date(fullAppt.appointmentDate).toLocaleDateString('en-US', {
                        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                    });

                    await sendTemplateMail({
                        to: fullAppt.customer.email,
                        template: 'appointment_rescheduled',
                        data: {
                            businessName: fullAppt.business.name,
                            customerName: fullAppt.customer.firstName,
                            appointmentDate: formattedDate,
                            startTime: fullAppt.startTime,
                            endTime: fullAppt.endTime,
                            services: fullAppt.service?.name || 'Service',
                            actionUrl: `${process.env.FRONTEND_URL || 'https://spaadvisor.in'}/appointment/${fullAppt.bookingNumber}`
                        }
                    });
                }
            } catch (e) { console.error('Email error:', e); }
        })();
        // ================================================

        return res.json({
            success: true,
            message: "Appointment rescheduled successfully",
            data: {
                newDate: appointment.appointmentDate,
                newStartTime: appointment.startTime,
                newEndTime: appointment.endTime
            }
        });
    } catch (err) {
        next(err);
    }
};

// ================== Mark No Show ==================
const markNoShow = async (req, res, next) => {
    try {
        const { id } = req.params;

        const appointment = await Appointment.findById(id);

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: "Appointment not found"
            });
        }

        await appointment.markNoShow();

        // Invalidate cache
        // Invalidate cache
        await deleteCache(`business:${appointment.business}:appointments*`);
        await deleteCache(`business:${appointment.business}:appointment:stats*`);

        // Notify staff
        notifyBusinessStaff(appointment.business, 'appointment_updated', {
            appointmentId: appointment._id,
            status: 'no_show',
            message: `Appointment marked as no-show`,
            data: appointment
        });

        return res.json({
            success: true,
            message: "Appointment marked as no-show"
        });
    } catch (err) {
        next(err);
    }
};

// ================== Add Review ==================
const addReview = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { rating, review } = req.body;

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({
                success: false,
                message: "Valid rating (1-5) is required"
            });
        }

        const appointment = await Appointment.findById(id).populate('service');

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: "Appointment not found"
            });
        }

        if (appointment.status !== 'completed') {
            return res.status(400).json({
                success: false,
                message: "Can only review completed appointments"
            });
        }

        await appointment.addReview(rating, review);

        // Update service rating
        if (appointment.service) {
            await appointment.service.updateRating(rating);
        }

        return res.json({
            success: true,
            message: "Review added successfully"
        });
    } catch (err) {
        next(err);
    }
};

// ================== Get Appointment Statistics ==================
const getAppointmentStats = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        let { businessId, startDate, endDate } = req.query;

        // Determine business scope
        let baseFilter = {};

        if (userRole === 'admin') {
            if (businessId) {
                const business = await Business.findOne({ _id: businessId, admin: userId });
                if (!business) {
                    return res.status(404).json({
                        success: false,
                        message: "Business not found or access denied"
                    });
                }
                baseFilter.business = business._id;
            } else {
                // If no businessId provided, fetch for all businesses owned by admin
                const businesses = await Business.find({ admin: userId }).select('_id');
                const businessIds = businesses.map(b => b._id);
                baseFilter.business = { $in: businessIds };
            }
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            if (!manager) {
                return res.status(404).json({
                    success: false,
                    message: "Manager not found"
                });
            }
            baseFilter.business = manager.business;
            // Explicitly set businessId for cache key
            businessId = manager.business.toString();
        }

        const businessKey = businessId ? `business:${businessId}` : `admin:${userId}:all_businesses`;
        const cacheKey = `${businessKey}:appointment:stats:v3:${startDate}:${endDate}`;

        // Try cache first
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            return res.json({
                success: true,
                source: "cache",
                cacheAge: cachedData.cacheTimestamp ? Math.floor((Date.now() - cachedData.cacheTimestamp) / 1000) : null,
                lastUpdated: cachedData.cacheTimestamp,
                data: cachedData
            });
        }

        // Calculate date ranges for today and this month
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        // Build date filter for custom range
        let dateFilter = { ...baseFilter };
        if (startDate && endDate) {
            dateFilter.appointmentDate = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        // 1. Overall stats (with custom date range if provided)
        const overallStats = await Appointment.aggregate([
            { $match: dateFilter },
            {
                $group: {
                    _id: null,
                    totalAppointments: { $sum: 1 },
                    pending: {
                        $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
                    },
                    confirmed: {
                        $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, 1, 0] }
                    },
                    completed: {
                        $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                    },
                    cancelled: {
                        $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
                    },
                    noShows: {
                        $sum: { $cond: [{ $eq: ['$status', 'no_show'] }, 1, 0] }
                    },
                    inProgress: {
                        $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] }
                    },
                    // Paid Revenue: Only from completed appointments with paid status
                    paidRevenue: {
                        $sum: {
                            $cond: [
                                { $eq: ['$paymentStatus', 'paid'] },
                                '$totalAmount',
                                0
                            ]
                        }
                    },
                    // Pending Revenue: All other statuses
                    pendingRevenue: {
                        $sum: {
                            $cond: [
                                { $ne: ['$paymentStatus', 'paid'] },
                                { $subtract: ['$totalAmount', '$paidAmount'] },
                                0
                            ]
                        }
                    },
                    totalRevenue: { $sum: '$totalAmount' },
                    totalPaid: { $sum: '$paidAmount' },
                    averageRevenue: { $avg: '$totalAmount' },
                    averageAppointmentValue: { $avg: '$totalAmount' }
                }
            }
        ]);

        // 2. Today's stats
        const todayStats = await Appointment.aggregate([
            {
                $match: {
                    ...baseFilter,
                    appointmentDate: { $gte: todayStart, $lte: todayEnd }
                }
            },
            {
                $group: {
                    _id: null,
                    todayAppointments: { $sum: 1 },
                    todayCompleted: {
                        $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                    },
                    todayPending: {
                        $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
                    },
                    todayConfirmed: {
                        $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, 1, 0] }
                    },
                    todayCancelled: {
                        $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
                    },
                    // Today's Paid Revenue
                    todayPaidRevenue: {
                        $sum: {
                            $cond: [
                                { $eq: ['$paymentStatus', 'paid'] },
                                '$totalAmount',
                                0
                            ]
                        }
                    },
                    // Today's Pending Revenue
                    todayPendingRevenue: {
                        $sum: {
                            $cond: [
                                { $ne: ['$paymentStatus', 'paid'] },
                                { $subtract: ['$totalAmount', '$paidAmount'] },
                                0
                            ]
                        }
                    },
                    todayRevenue: { $sum: '$totalAmount' }
                }
            }
        ]);

        // 3. This month's stats
        const monthStats = await Appointment.aggregate([
            {
                $match: {
                    ...baseFilter,
                    appointmentDate: { $gte: monthStart, $lte: monthEnd }
                }
            },
            {
                $group: {
                    _id: null,
                    thisMonthAppointments: { $sum: 1 },
                    thisMonthCompleted: {
                        $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                    },
                    thisMonthPending: {
                        $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
                    },
                    thisMonthConfirmed: {
                        $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, 1, 0] }
                    },
                    thisMonthCancelled: {
                        $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
                    },
                    // This Month's Paid Revenue
                    thisMonthPaidRevenue: {
                        $sum: {
                            $cond: [
                                { $eq: ['$paymentStatus', 'paid'] },
                                '$totalAmount',
                                0
                            ]
                        }
                    },
                    // This Month's Pending Revenue
                    thisMonthPendingRevenue: {
                        $sum: {
                            $cond: [
                                { $ne: ['$paymentStatus', 'paid'] },
                                { $subtract: ['$totalAmount', '$paidAmount'] },
                                0
                            ]
                        }
                    },
                    thisMonthRevenue: { $sum: '$totalAmount' }
                }
            }
        ]);

        // 4. Upcoming appointments (future appointments that are not cancelled/no_show)
        const upcomingCount = await Appointment.countDocuments({
            ...baseFilter,
            appointmentDate: { $gte: now },
            status: { $nin: ['cancelled', 'no_show', 'completed'] }
        });

        // 5. Overdue appointments (past appointments still pending/confirmed)
        const overdueCount = await Appointment.countDocuments({
            ...baseFilter,
            appointmentDate: { $lt: todayStart },
            status: { $in: ['pending', 'confirmed'] }
        });

        // 6. Payment breakdown
        const paymentStats = await Appointment.aggregate([
            { $match: dateFilter },
            {
                $group: {
                    _id: '$paymentStatus',
                    count: { $sum: 1 },
                    amount: { $sum: '$totalAmount' }
                }
            }
        ]);

        // Build payment breakdown object
        const paymentBreakdown = {
            paid: { count: 0, amount: 0 },
            partial: { count: 0, amount: 0 },
            pending: { count: 0, amount: 0 },
            failed: { count: 0, amount: 0 },
            refunded: { count: 0, amount: 0 }
        };

        paymentStats.forEach(stat => {
            if (stat._id && paymentBreakdown[stat._id] !== undefined) {
                paymentBreakdown[stat._id] = {
                    count: stat.count,
                    amount: stat.amount || 0
                };
            }
        });

        // Compile final result
        const overall = overallStats[0] || {};
        const today = todayStats[0] || {};
        const month = monthStats[0] || {};

        const result = {
            // Overall Metrics
            totalAppointments: overall.totalAppointments || 0,
            pending: overall.pending || 0,
            confirmed: overall.confirmed || 0,
            completed: overall.completed || 0,
            cancelled: overall.cancelled || 0,
            noShows: overall.noShows || 0,
            inProgress: overall.inProgress || 0,

            // Today's Metrics
            todayAppointments: today.todayAppointments || 0,
            todayCompleted: today.todayCompleted || 0,
            todayPending: today.todayPending || 0,
            todayConfirmed: today.todayConfirmed || 0,
            todayCancelled: today.todayCancelled || 0,

            // This Month's Metrics
            thisMonthAppointments: month.thisMonthAppointments || 0,
            thisMonthCompleted: month.thisMonthCompleted || 0,
            thisMonthPending: month.thisMonthPending || 0,
            thisMonthConfirmed: month.thisMonthConfirmed || 0,
            thisMonthCancelled: month.thisMonthCancelled || 0,

            // Revenue Metrics (Paid vs Pending)
            paidRevenue: overall.paidRevenue || 0, // Only paid appointments
            pendingRevenue: overall.pendingRevenue || 0, // All unpaid/partially paid
            totalRevenue: overall.totalRevenue || 0, // Total (paid + pending)
            totalPaid: overall.totalPaid || 0, // Amount actually received
            averageRevenue: overall.averageRevenue || 0,
            averageAppointmentValue: overall.averageAppointmentValue || 0,

            // Today's Revenue
            todayPaidRevenue: today.todayPaidRevenue || 0,
            todayPendingRevenue: today.todayPendingRevenue || 0,
            todayRevenue: today.todayRevenue || 0,

            // This Month's Revenue
            thisMonthPaidRevenue: month.thisMonthPaidRevenue || 0,
            thisMonthPendingRevenue: month.thisMonthPendingRevenue || 0,
            thisMonthRevenue: month.thisMonthRevenue || 0,

            // Additional Analytics
            upcomingAppointments: upcomingCount,
            overdueAppointments: overdueCount,

            // Payment Status Breakdown
            paymentBreakdown,

            // Conversion Rates
            completionRate: overall.totalAppointments > 0
                ? ((overall.completed || 0) / overall.totalAppointments * 100).toFixed(2)
                : 0,
            cancellationRate: overall.totalAppointments > 0
                ? ((overall.cancelled || 0) / overall.totalAppointments * 100).toFixed(2)
                : 0,
            noShowRate: overall.totalAppointments > 0
                ? ((overall.noShows || 0) / overall.totalAppointments * 100).toFixed(2)
                : 0,

            // Payment Collection Rate
            paymentCollectionRate: overall.totalRevenue > 0
                ? ((overall.totalPaid || 0) / overall.totalRevenue * 100).toFixed(2)
                : 0,

            // Cache metadata
            cacheTimestamp: Date.now(),
            lastUpdated: new Date().toISOString()
        };

        // Cache for 5 minutes
        await setCache(cacheKey, result, 300);

        return res.json({
            success: true,
            source: "live",
            data: result
        });
    } catch (err) {
        next(err);
    }
};

// ================== PUBLIC APPOINTMENT ROUTES (No Authentication) ==================

// Get available slots (authenticated or public with businessId)
const getAvailableSlots = async (req, res, next) => {
    try {
        const { date, businessId, staffId, serviceId } = req.query;

        if (!date || !businessId) {
            return res.status(400).json({
                success: false,
                message: "Date and businessId are required"
            });
        }

        const business = await Business.findById(businessId).lean();

        if (!business) {
            return res.status(404).json({
                success: false,
                message: "Business not found"
            });
        }

        const appointmentDate = new Date(date);
        const startOfDay = new Date(appointmentDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(appointmentDate);
        endOfDay.setHours(23, 59, 59, 999);

        // Get existing appointments
        const query = {
            business: business._id,
            appointmentDate: { $gte: startOfDay, $lte: endOfDay },
            status: { $nin: ['cancelled', 'no_show'] }
        };

        if (staffId) query.staff = staffId;

        const existingAppointments = await Appointment.find(query)
            .select('startTime endTime staff')
            .lean();

        // Generate slots
        const { generateAvailableSlots } = require("../utils/appointmentUtils");
        const slots = generateAvailableSlots(
            business,
            appointmentDate,
            existingAppointments,
            staffId
        );

        return res.json({
            success: true,
            data: slots
        });

    } catch (err) {
        next(err);
    }
};

// Get business info for booking (by slug)
const getBusinessInfoForBooking = async (req, res, next) => {
    try {
        const { slug } = req.params;

        const business = await Business.findOne({ slug, isActive: true })
            .select('name type branch address city state country phone email website description settings businessLink slug images google360ImageUrl videos socialMedia location googleMapsUrl ratings features amenities category tags _id paymentMethods')
            .lean();

        if (!business) {
            return res.status(404).json({
                success: false,
                message: "Business not found"
            });
        }

        // Check if online booking is allowed
        if (!business.settings?.appointmentSettings?.allowOnlineBooking) {
            return res.status(403).json({
                success: false,
                message: "Online booking is not available for this business"
            });
        }

        // Fetch services separately
        const services = await Service.find({
            business: business._id,
            isActive: true,
            isAvailableOnline: true
        })
            .select('name category serviceType description images pricingOptions')
            .sort({ displayOrder: 1, name: 1 })
            .lean();

        // Simple obfuscation/encryption function
        // Uses shared utility


        const onlineDiscount = process.env.ONLINE_DISCOUNT ? parseInt(process.env.ONLINE_DISCOUNT) : 0;

        const responseData = {
            ...business,
            services: services || [],
            workingHours: business.settings?.workingHours,
            appointmentSettings: business.settings?.appointmentSettings,
            onlineDiscount
        };

        return res.json({
            success: true,
            message: "Fetched successfully",
            payload: encryptResponse(responseData)
        });
    } catch (err) {
        next(err);
    }
};

// Get available time slots (by slug)
const getAvailableSlotsForBooking = async (req, res, next) => {
    try {
        const { slug } = req.params;
        const { date, staffId } = req.query;

        if (!date) {
            return res.status(400).json({
                success: false,
                message: "Date is required"
            });
        }

        const business = await Business.findOne({ slug, isActive: true })
            .select('settings slug')
            .lean();

        if (!business) {
            return res.status(404).json({
                success: false,
                message: "Business not found"
            });
        }

        if (!business.settings?.appointmentSettings?.allowOnlineBooking) {
            return res.status(403).json({
                success: false,
                message: "Online booking is not available"
            });
        }

        const appointmentDate = new Date(date);
        const startOfDay = new Date(appointmentDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(appointmentDate);
        endOfDay.setHours(23, 59, 59, 999);

        // Get existing appointments for the date
        const query = {
            business: business._id,
            appointmentDate: { $gte: startOfDay, $lte: endOfDay },
            status: { $nin: ['cancelled', 'no_show'] }
        };

        if (staffId) {
            query.staff = staffId;
        }

        const existingAppointments = await Appointment.find(query)
            .select('startTime endTime staff')
            .lean();

        // Generate available slots
        const { generateAvailableSlots } = require("../utils/appointmentUtils");
        const allSlots = generateAvailableSlots(
            business,
            appointmentDate,
            existingAppointments,
            staffId || null
        );

        // Filter slots based on advance booking hours and current time
        const settings = business.settings.appointmentSettings;
        const minAdvanceBookingHours = settings.minAdvanceBookingHours || 0;
        const now = new Date();

        // Helper function to convert time string to minutes
        const timeToMinutes = (timeStr) => {
            const [hours, minutes] = timeStr.split(':').map(Number);
            return hours * 60 + minutes;
        };

        // Helper function to parse time string to 24-hour format
        const parseTimeTo24Hour = (timeStr) => {
            if (!timeStr) return { hours: 0, minutes: 0 };
            let time = timeStr.trim();
            let isPM = false;

            if (time.includes('PM') || time.includes('pm')) {
                isPM = true;
                time = time.replace(/PM|pm/gi, '').trim();
            } else if (time.includes('AM') || time.includes('am')) {
                time = time.replace(/AM|am/gi, '').trim();
            }

            const parts = time.split(':');
            if (parts.length < 2) return { hours: 0, minutes: 0 };

            let hours = parseInt(parts[0], 10) || 0;
            const minutes = parseInt(parts[1], 10) || 0;

            if (isPM && hours !== 12) {
                hours += 12;
            } else if (!isPM && hours === 12) {
                hours = 0;
            }

            return { hours, minutes };
        };

        // Filter slots to only include truly available ones
        const availableSlots = allSlots.filter(slot => {
            // Check if slot is in the past
            const slotDate = new Date(appointmentDate);
            const timeParts = parseTimeTo24Hour(slot.startTime);
            const slotDateTime = new Date(
                slotDate.getFullYear(),
                slotDate.getMonth(),
                slotDate.getDate(),
                timeParts.hours,
                timeParts.minutes,
                0,
                0
            );

            // Check if slot is in the past
            if (slotDateTime <= now) {
                return false;
            }

            // Check advance booking hours requirement
            const hoursUntilSlot = (slotDateTime - now) / (1000 * 60 * 60);
            if (hoursUntilSlot < minAdvanceBookingHours) {
                return false;
            }

            // Slot is available
            return true;
        });

        return res.json({
            success: true,
            data: {
                date: date,
                availableSlots: availableSlots.map(slot => slot.startTime),
                slots: availableSlots // Only return available slots
            }
        });
    } catch (err) {
        next(err);
    }
};

// Helper: Execute Booking Logic (Refactored)
const executeBooking = async (bookingData, slug) => {
    const {
        customerInfo,
        appointmentDate,
        startTime,
        endTime,
        services,
        staffId,
        paymentMethod
    } = bookingData;

    // Validate required fields
    if (!customerInfo || !customerInfo.name || !customerInfo.phone) {
        return { success: false, status: 400, message: "Customer information (name, phone) is required" };
    }

    if (!appointmentDate || !startTime || !endTime) {
        return { success: false, status: 400, message: "Appointment date, start time, and end time are required" };
    }

    if (!services || services.length === 0) {
        return { success: false, status: 400, message: "At least one service is required" };
    }

    // Validate payment method if provided
    const validPaymentMethods = ['cash', 'card', 'upi', 'netbanking', 'wallet', 'online'];
    if (paymentMethod && !validPaymentMethods.includes(paymentMethod)) {
        return { success: false, status: 400, message: `Invalid payment method. Must be one of: ${validPaymentMethods.join(', ')}` };
    }

    // Get business
    const business = await Business.findOne({ slug, isActive: true });

    if (!business) {
        return { success: false, status: 404, message: "Business not found" };
    }

    if (!business.settings?.appointmentSettings?.allowOnlineBooking) {
        return { success: false, status: 403, message: "Online booking is not available for this business" };
    }

    // Find or create customer
    const customerQuery = {
        business: business._id,
        $or: [
            { phone: customerInfo.phone }
        ]
    };

    if (customerInfo.email) {
        customerQuery.$or.push({ email: customerInfo.email });
    }

    let customer = await Customer.findOne(customerQuery);

    // Helper function to parse address string into object
    const parseAddress = (addressString) => {
        if (!addressString) return undefined;

        if (typeof addressString === 'object' && addressString !== null) {
            return addressString;
        }

        if (typeof addressString === 'string') {
            const zipMatch = addressString.match(/\b(\d{6})\b/);
            const zipCode = zipMatch ? zipMatch[1] : undefined;

            const states = ['Maharashtra', 'Delhi', 'Karnataka', 'Tamil Nadu', 'Gujarat', 'Rajasthan',
                'West Bengal', 'Uttar Pradesh', 'Punjab', 'Haryana', 'Andhra Pradesh',
                'Telangana', 'Kerala', 'Madhya Pradesh', 'Bihar', 'Odisha', 'Assam'];
            let state = undefined;
            for (const s of states) {
                if (addressString.includes(s)) {
                    state = s;
                    break;
                }
            }

            let city = undefined;
            if (state) {
                const stateIndex = addressString.indexOf(state);
                const beforeState = addressString.substring(0, stateIndex).trim();
                const parts = beforeState.split(',').map(p => p.trim()).filter(p => p);
                if (parts.length > 0) {
                    city = parts[parts.length - 1];
                }
            }

            return {
                street: addressString,
                city: city,
                state: state,
                country: 'India',
                zipCode: zipCode
            };
        }

        return undefined;
    };

    if (!customer) {
        const [firstName, ...lastNameParts] = customerInfo.name.split(' ');
        customer = await Customer.create({
            business: business._id,
            firstName: firstName,
            lastName: lastNameParts.join(' ') || '',
            email: customerInfo.email,
            phone: customerInfo.phone,
            dateOfBirth: customerInfo.dateOfBirth ? new Date(customerInfo.dateOfBirth) : undefined,
            gender: customerInfo.gender || undefined,
            address: parseAddress(customerInfo.address),
            preferences: customerInfo.preferences || {},
            customerType: 'new',
            source: 'online',
            marketingConsent: {
                email: customerInfo.marketingConsent?.email || false,
                sms: customerInfo.marketingConsent?.sms || false
            }
        });
    } else {
        if (customerInfo.address) {
            customer.address = parseAddress(customerInfo.address);
        }
        if (customerInfo.dateOfBirth) customer.dateOfBirth = new Date(customerInfo.dateOfBirth);
        if (customerInfo.gender) customer.gender = customerInfo.gender;
        await customer.save();
    }

    const serviceData = services[0];
    let service = null;

    if (serviceData.serviceId || serviceData._id || serviceData.id) {
        const serviceId = serviceData.serviceId || serviceData._id || serviceData.id;
        service = await Service.findOne({
            _id: serviceId,
            business: business._id,
            isActive: true
        });
    }

    if (!service && serviceData.serviceName) {
        service = await Service.findOne({
            business: business._id,
            name: serviceData.serviceName,
            isActive: true
        });
    }

    if (!service && serviceData.serviceName) {
        const servicePayload = {
            business: business._id,
            name: serviceData.serviceName,
            category: serviceData.serviceCategory || 'General',
            serviceType: serviceData.serviceType || 'service',
            isActive: true
        };

        if (serviceData.pricingOptions && Array.isArray(serviceData.pricingOptions) && serviceData.pricingOptions.length > 0) {
            servicePayload.pricingOptions = serviceData.pricingOptions;
            servicePayload.pricingType = 'variable';
        } else {
            servicePayload.price = serviceData.price || 0;
            servicePayload.duration = serviceData.duration || 60;
            servicePayload.pricingType = 'fixed';
        }

        service = await Service.create(servicePayload);
    }

    if (!service) {
        return { success: false, status: 400, message: "Service not found or could not be created" };
    }

    const { getServicePriceAndDuration, validateAppointmentBooking } = require("../utils/appointmentUtils");
    const totalPrice = services.reduce((sum, s) => {
        const { price } = getServicePriceAndDuration(s);
        return sum + price;
    }, 0);
    const totalDuration = services.reduce((sum, s) => {
        const { duration } = getServicePriceAndDuration(s);
        return sum + duration;
    }, 0);

    const appointmentDateObj = new Date(appointmentDate);
    const startOfDay = new Date(appointmentDateObj);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(appointmentDateObj);
    endOfDay.setHours(23, 59, 59, 999);

    const existingAppointments = await Appointment.find({
        business: business._id,
        appointmentDate: { $gte: startOfDay, $lte: endOfDay },
        status: { $nin: ['cancelled', 'no_show'] }
    });

    const validation = validateAppointmentBooking({
        appointmentDate,
        startTime,
        endTime,
        staff: staffId
    }, business, existingAppointments);

    if (!validation.isValid) {
        return { success: false, status: 400, message: validation.errors.join(', ') };
    }

    // Store services data for later retrieval (store in internalNotes as JSON)
    const servicesData = services.map(s => ({
        serviceId: s.serviceId || s._id || s.id,
        serviceName: s.serviceName || s.name,
        price: s.price,
        duration: s.duration,
        category: s.serviceCategory || s.category,
        serviceType: s.serviceType,
        pricingOptionId: s.pricingOptionId,
        optionLabel: s.optionLabel || s.pricingOptionLabel,
        currency: s.currency
    }));

    // Verify Payment Signature logic
    let verifiedPaymentStatus = bookingData.paymentStatus || 'pending';
    if (verifiedPaymentStatus === 'paid' && bookingData.paymentDetails) {
        try {
            const { orderId, paymentId, signature } = bookingData.paymentDetails;
            if (orderId && paymentId && signature) {
                // 1. Verify Signature
                const generated_signature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
                    .update(orderId + "|" + paymentId)
                    .digest('hex');

                console.log(`[PaymentDebug] Order: ${orderId}, Payment: ${paymentId}`);
                console.log(`[PaymentDebug] Frontend Signature: ${signature}`);
                console.log(`[PaymentDebug] Backend Generated:  ${generated_signature}`);

                if (generated_signature !== signature) {
                    console.error("⚠️ Payment Signature Verification FAILED for booking");
                    verifiedPaymentStatus = 'pending';
                } else {
                    // 2. Fetch Payment Status from Razorpay (Double Check)
                    const instance = new Razorpay({
                        key_id: process.env.RAZORPAY_KEY_ID,
                        key_secret: process.env.RAZORPAY_KEY_SECRET,
                    });

                    const payment = await instance.payments.fetch(paymentId);
                    console.log(`[PaymentDebug] Razorpay API Status: ${payment.status}`);

                    if (payment.status === 'captured' || payment.status === 'authorized') {
                        verifiedPaymentStatus = 'paid';
                    } else {
                        console.error(`⚠️ Payment status mismatch. Razorpay status: ${payment.status}`);
                        verifiedPaymentStatus = 'pending';
                    }
                }
            } else {
                verifiedPaymentStatus = 'pending';
            }
        } catch (err) {
        }
    }

    // Use the paidAmount from bookingData if available (for online payments)
    const paidAmount = bookingData.paidAmount ? Number(bookingData.paidAmount) : (verifiedPaymentStatus === 'paid' ? totalPrice : 0);
    const discount = bookingData.discount ? Number(bookingData.discount) : 0;

    // If discount was applied, the totalAmount stored should be the discounted price?
    // Or we keep totalAmount as Original and Paid as Discounted?
    // Usually Total = Service + Charges - Discount.
    // So let's calculate Total based on that.

    const finalTotalAmount = totalPrice - discount;

    const appointment = await Appointment.create({
        business: business._id,
        customer: customer._id,
        service: service._id,
        staff: staffId || undefined,
        appointmentDate: appointmentDateObj,
        startTime: startTime,
        endTime: endTime,
        duration: totalDuration,
        servicePrice: totalPrice, // Original Price
        additionalCharges: 0,
        discount: discount,       // Discount Amount
        tax: 0,
        totalAmount: finalTotalAmount, // Discounted Total
        paidAmount: verifiedPaymentStatus === 'paid' ? paidAmount : 0, // Paid Amount
        paymentStatus: verifiedPaymentStatus,
        paymentMethod: bookingData.paymentMethod || 'cash',
        bookingSource: 'online',
        bookingType: 'regular',
        customerNotes: bookingData.customerNotes,
        internalNotes: JSON.stringify({ services: bookingData.services }),
        paymentDetails: verifiedPaymentStatus === 'paid' ? bookingData.paymentDetails : undefined,
        status: 'pending',
        createdBy: customer._id,
        createdByModel: 'Customer',
        // Store services array in internalNotes as JSON string for retrieval
        // internalNotes: JSON.stringify({ services: servicesData }) // This line is now redundant as internalNotes is set above
    });

    const confirmationCode = appointment.bookingNumber || `CONF${Date.now()}${Math.floor(Math.random() * 1000)}`;
    appointment.bookingNumber = confirmationCode;
    await appointment.save();

    await notifyBusinessStaff(business._id, 'new_appointment', {
        message: `New online booking: ${customer.firstName} ${customer.lastName}`,
        appointmentId: appointment._id,
        customerName: `${customer.firstName} ${customer.lastName}`,
        serviceName: service.name,
        time: `${appointmentDate} at ${startTime}`,
        source: 'online',
        data: appointment
    }, {
        title: 'New Online Booking',
        message: `New online booking: ${customer.firstName} ${customer.lastName} - ${service.name} at ${startTime}`,
        type: 'appointment',
        priority: 'high',
        relatedAppointment: appointment._id,
        actionUrl: `/manager/appointments/${appointment._id}`,
        metadata: {
            source: 'online',
            eventId: appointment._id.toString(),
            category: 'appointment'
        }
    });

    if (business.admin) {
        await AdminNotification.createSystemNotification(
            business.admin,
            'New Online Booking',
            `New online booking received from ${customer.firstName} ${customer.lastName} for ${service.name}`,
            {
                type: 'business',
                priority: 'high',
                actionUrl: `/admin/appointments/${appointment._id}`,
                actionText: 'View Booking',
                metadata: {
                    source: 'online',
                    eventId: appointment._id,
                    category: 'appointment'
                }
            }
        );
    }

    await appointment.populate('business', 'name branch address phone');
    await appointment.populate('service', 'name price duration category serviceType description pricingType pricingOptions currency originalPrice');
    if (appointment.staff) {
        await appointment.populate('staff', 'name role');
    }
    await appointment.populate('customer', 'firstName lastName email phone');

    // Fetch all services from internalNotes for response
    let allServices = [];
    try {
        if (appointment.internalNotes) {
            const parsedNotes = JSON.parse(appointment.internalNotes);
            if (parsedNotes.services && Array.isArray(parsedNotes.services) && parsedNotes.services.length > 0) {
                const serviceIds = parsedNotes.services
                    .map(s => s.serviceId)
                    .filter(Boolean);

                if (serviceIds.length > 0) {
                    const fetchedServices = await Service.find({
                        _id: { $in: serviceIds },
                        business: business._id
                    })
                        .select('name price duration category serviceType description pricingType pricingOptions currency originalPrice')
                        .lean();

                    // Map fetched services with booking data
                    allServices = parsedNotes.services.map(bookingService => {
                        const fetchedService = fetchedServices.find(
                            fs => fs._id.toString() === bookingService.serviceId?.toString()
                        );

                        if (fetchedService) {
                            return {
                                ...fetchedService,
                                price: bookingService.price !== undefined ? bookingService.price : fetchedService.price,
                                duration: bookingService.duration !== undefined ? bookingService.duration : fetchedService.duration,
                                optionLabel: bookingService.optionLabel,
                                pricingOptionId: bookingService.pricingOptionId,
                                currency: bookingService.currency || fetchedService.currency
                            };
                        } else {
                            // Fallback: use booking data if service not found
                            return {
                                name: bookingService.serviceName || 'Service',
                                price: bookingService.price || 0,
                                duration: bookingService.duration || 0,
                                category: bookingService.category || 'General',
                                serviceType: bookingService.serviceType || 'service',
                                currency: bookingService.currency || 'INR'
                            };
                        }
                    });
                }
            }
        }
    } catch (parseError) {
        console.error('[Booking] Error parsing services from internalNotes:', parseError);
    }

    // If no services array found, use single service
    if (allServices.length === 0 && appointment.service) {
        allServices = [appointment.service];
    }

    // Convert appointment to plain object and add services array
    const appointmentObj = appointment.toObject ? appointment.toObject() : appointment;
    appointmentObj.services = allServices;

    return {
        success: true,
        message: "Appointment booked successfully",
        data: {
            appointment: appointmentObj,
            confirmationCode: confirmationCode
        }
    };
};

// Book appointment (public - by slug) - STEP 1 (OTP Request)
const bookAppointmentPublic = async (req, res, next) => {
    try {
        const { slug } = req.params;
        const bookingData = req.body;
        const { customerInfo, appointmentDate, startTime, endTime, services } = bookingData;

        if (!customerInfo || !customerInfo.name || !customerInfo.phone) {
            return res.status(400).json({ success: false, message: "Customer information required" });
        }
        if (!appointmentDate || !startTime || !endTime) {
            return res.status(400).json({ success: false, message: "Date and time required" });
        }
        if (!services || services.length === 0) {
            return res.status(400).json({ success: false, message: "Service required" });
        }

        const business = await Business.findOne({ slug, isActive: true });
        if (!business) return res.status(404).json({ success: false, message: "Business not found" });

        // Validate booking slot availability before sending OTP
        const appointmentDateObj = new Date(appointmentDate);
        const startOfDay = new Date(appointmentDateObj);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(appointmentDateObj);
        endOfDay.setHours(23, 59, 59, 999);

        // Get existing appointments for the date
        const query = {
            business: business._id,
            appointmentDate: { $gte: startOfDay, $lte: endOfDay },
            status: { $nin: ['cancelled', 'no_show'] }
        };

        if (bookingData.staffId) {
            query.staff = bookingData.staffId;
        }

        const existingAppointments = await Appointment.find(query)
            .select('startTime endTime staff')
            .lean();

        // Validate appointment booking
        const validation = validateAppointmentBooking({
            appointmentDate,
            startTime,
            endTime,
            staff: bookingData.staffId
        }, business, existingAppointments);

        if (!validation.isValid) {
            return res.status(400).json({
                success: false,
                message: validation.errors.join(', ')
            });
        }

        // Check for Online Payment (Skip OTP)
        if (bookingData.paymentStatus === 'paid' && bookingData.paymentDetails) {
            const { orderId, paymentId, signature } = bookingData.paymentDetails;
            if (orderId && paymentId && signature) {
                // Verify Signature
                const generated_signature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
                    .update(orderId + "|" + paymentId)
                    .digest('hex');

                if (generated_signature === signature) {
                    console.log(`[Booking] Online payment verified for ${slug}. Skipping OTP.`);

                    const result = await executeBooking(bookingData, slug);

                    if (result.success) {
                        // Send notifications (using helper)
                        const appointmentId = result.data.appointment._id || result.data.appointment.id;
                        // Fire and forget notifications
                        sendConfirmationNotifications(appointmentId, bookingData);

                        return res.json({
                            success: true,
                            message: "Booking confirmed successfully!",
                            requiresOTP: false,
                            data: result.data
                        });
                    } else {
                        return res.status(result.status || 400).json(result);
                    }
                } else {
                    console.error('[Booking] Payment signature verification failed');
                    return res.status(400).json({ success: false, message: "Payment verification failed" });
                }
            }
        }

        const phone = customerInfo.phone;
        let response;
        try {
            response = await createAndSendOTP({ mode: 'whatsapp', to: phone });
        } catch (err) {
            console.error("OTP Send Failed:", err);
            // Return proper error for client handling
            return res.status(500).json({ success: false, message: "Failed to send OTP. Please check the number or try again." });
        }

        await Otp.create({
            phone: phone,
            otp: response.otpHash,
            metadata: {
                bookingData,
                slug
            },
            expiresAt: new Date(response.expiresAt)
        });

        return res.json({
            success: true,
            message: "OTP sent to your mobile number. Please verify to complete booking.",
            requiresOTP: true,
            phone: phone,
            expiresAt: response.expiresAt
        });

    } catch (err) {
        next(err);
    }
};

// Verify OTP and Complete Booking - STEP 2
const verifyBookingOTP = async (req, res, next) => {
    try {
        const { slug } = req.params;
        const { phone, otp } = req.body;

        if (!phone || !otp) {
            return res.status(400).json({ success: false, message: "Phone and OTP required" });
        }

        const otpRecord = await Otp.findOne({
            phone,
            expiresAt: { $gt: new Date() }
        }).sort({ createdAt: -1 });

        if (!otpRecord) {
            return res.status(400).json({ success: false, message: "OTP not found or expired" });
        }

        const isValid = verifyOTP(otp, otpRecord.otp, otpRecord.expiresAt);
        if (!isValid) {
            return res.status(400).json({ success: false, message: "Invalid OTP" });
        }

        const { bookingData } = otpRecord.metadata || {};
        if (!bookingData) {
            return res.status(400).json({ success: false, message: "Session expired or invalid data" });
        }

        const result = await executeBooking(bookingData, slug);

        if (!result.success) {
            return res.status(result.status || 400).json(result);
        }

        await Otp.findByIdAndDelete(otpRecord._id);

        // Send confirmation notifications (Async)
        // Use helper function to prevent duplication
        const appointmentId = result.data.appointment._id || result.data.appointment.id;
        sendConfirmationNotifications(appointmentId, bookingData);

        // Ensure services array is included in the response
        if (result.data && result.data.appointment) {
            const appointment = result.data.appointment;
            // Parse services from internalNotes if not already included
            if (!result.data.appointment.services || result.data.appointment.services.length === 0) {
                try {
                    if (appointment.internalNotes) {
                        const parsedNotes = JSON.parse(appointment.internalNotes);
                        if (parsedNotes.services && Array.isArray(parsedNotes.services) && parsedNotes.services.length > 0) {
                            const Service = require('../models/Service');
                            const serviceIds = parsedNotes.services
                                .map(s => s.serviceId)
                                .filter(Boolean);

                            if (serviceIds.length > 0) {
                                const businessId = appointment.business?._id || appointment.business;
                                const fetchedServices = await Service.find({
                                    _id: { $in: serviceIds },
                                    business: businessId
                                })
                                    .select('name price duration category serviceType description pricingType pricingOptions currency originalPrice')
                                    .lean();

                                // Map fetched services with booking data
                                const allServices = parsedNotes.services.map(bookingService => {
                                    const fetchedService = fetchedServices.find(
                                        fs => fs._id.toString() === bookingService.serviceId?.toString()
                                    );

                                    if (fetchedService) {
                                        return {
                                            ...fetchedService,
                                            price: bookingService.price !== undefined ? bookingService.price : fetchedService.price,
                                            duration: bookingService.duration !== undefined ? bookingService.duration : fetchedService.duration,
                                            optionLabel: bookingService.optionLabel,
                                            pricingOptionId: bookingService.pricingOptionId,
                                            currency: bookingService.currency || fetchedService.currency
                                        };
                                    } else {
                                        return {
                                            name: bookingService.serviceName || 'Service',
                                            price: bookingService.price || 0,
                                            duration: bookingService.duration || 0,
                                            category: bookingService.category || 'General',
                                            serviceType: bookingService.serviceType || 'service',
                                            currency: bookingService.currency || 'INR'
                                        };
                                    }
                                });

                                result.data.appointment.services = allServices;
                            }
                        }
                    }
                } catch (parseError) {
                    console.error('[Response] Error parsing services from internalNotes:', parseError);
                }
            }
        }


        // ================== SEND EMAIL NOTIFICATIONS ==================
        (async () => {
            try {
                const appointmentRaw = result.data.appointment;
                if (!appointmentRaw) return;

                const appointmentId = appointmentRaw._id || appointmentRaw.id;

                // Repopulate for full details
                const appointment = await Appointment.findById(appointmentId)
                    .populate('business')
                    .populate('customer')
                    .populate('service');

                if (!appointment || !appointment.business || !appointment.customer) return;

                // Fetch proper business admin/managers
                const businessDetails = await Business.findById(appointment.business._id)
                    .populate('admin', 'email name')
                    .populate('managers', 'email name isActive');

                // Prepare data
                const dateObj = new Date(appointment.appointmentDate);
                const formattedDate = dateObj.toLocaleDateString('en-US', {
                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                });

                const commonData = {
                    businessName: appointment.business.name,
                    customerName: `${appointment.customer.firstName} ${appointment.customer.lastName}`,
                    customerEmail: appointment.customer.email,
                    customerPhone: appointment.customer.phone,
                    appointmentDate: formattedDate,
                    startTime: appointment.startTime,
                    endTime: appointment.endTime,
                    services: appointment.service?.name || 'Service',
                    confirmationCode: appointment.bookingNumber,
                    staffInfo: appointment.staff ? `<p><strong>Assigned Staff:</strong> ${appointment.staff}</p>` : '', // Staff might be ID or populated
                    customerNotesInfo: '<p><strong>Booking Source:</strong> Online</p>',
                    actionUrl: `${process.env.FRONTEND_URL}/admin/appointments/${appointment._id}`
                };

                // 1. Notify Admin
                const adminEmail = businessDetails?.admin?.email || businessDetails?.email;
                if (adminEmail) {
                    await sendTemplateMail({
                        to: adminEmail,
                        template: 'new_booking_admin',
                        data: {
                            ...commonData,
                            actionUrl: `${process.env.FRONTEND_URL || ''}/admin/appointments/${appointment._id}`
                        }
                    });
                }

                // 2. Notify Managers
                if (businessDetails?.managers?.length > 0) {
                    for (const manager of businessDetails.managers) {
                        if (manager.isActive && manager.email) {
                            await sendTemplateMail({
                                to: manager.email,
                                template: 'new_booking_manager',
                                data: {
                                    ...commonData,
                                    actionUrl: `${process.env.FRONTEND_URL || ''}/manager/appointments/${appointment._id}`
                                }
                            });
                        }
                    }
                }

                // 3. Notify Customer
                if (appointment.customer.email) {
                    await sendTemplateMail({
                        to: appointment.customer.email,
                        template: 'appointment_confirmation',
                        data: {
                            ...commonData,
                            customerName: appointment.customer.firstName,
                            actionUrl: `${process.env.FRONTEND_URL || 'https://spaadvisor.in'}/appointment/${appointment.bookingNumber}`
                        }
                    });
                }
            } catch (emailError) {
                console.error('❌ EMAIL: Failed to send public booking emails:', emailError);
            }
        })();
        // ==============================================================

        return res.status(201).json(result);

    } catch (err) {
        next(err);
    }
};

// Get appointment by confirmation code (public)
const getAppointmentByConfirmationCode = async (req, res, next) => {
    try {
        const { confirmationCode } = req.params;

        const appointment = await Appointment.findOne({ bookingNumber: confirmationCode })
            .populate('business', 'name branch address city state country phone email website')
            .populate('service', 'name price duration category serviceType description pricingType pricingOptions currency originalPrice')
            .populate('staff', 'name role specialization phone email')
            .populate('customer', 'firstName lastName email phone address dateOfBirth gender')
            .lean();

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: "Appointment not found"
            });
        }

        // Parse services from internalNotes if available (for multiple services)
        let servicesArray = [];
        let serviceData = appointment.service;

        try {
            if (appointment.internalNotes) {
                const parsedNotes = JSON.parse(appointment.internalNotes);
                if (parsedNotes.services && Array.isArray(parsedNotes.services) && parsedNotes.services.length > 0) {
                    // Fetch all services from the stored service IDs
                    const serviceIds = parsedNotes.services
                        .map(s => s.serviceId)
                        .filter(Boolean);

                    if (serviceIds.length > 0) {
                        const Service = require('../models/Service');
                        // Handle business ID (could be ObjectId or populated object)
                        const businessId = appointment.business?._id || appointment.business;

                        const fetchedServices = await Service.find({
                            _id: { $in: serviceIds },
                            business: businessId
                        })
                            .select('name price duration category serviceType description pricingType pricingOptions currency originalPrice')
                            .lean();

                        // Map fetched services with booking data (price, duration from booking)
                        servicesArray = parsedNotes.services.map(bookingService => {
                            const fetchedService = fetchedServices.find(
                                fs => fs._id.toString() === bookingService.serviceId?.toString()
                            );

                            if (fetchedService) {
                                return {
                                    ...fetchedService,
                                    // Use booking price/duration if available (might be different due to pricing options)
                                    price: bookingService.price !== undefined ? bookingService.price : fetchedService.price,
                                    duration: bookingService.duration !== undefined ? bookingService.duration : fetchedService.duration,
                                    optionLabel: bookingService.optionLabel,
                                    pricingOptionId: bookingService.pricingOptionId,
                                    currency: bookingService.currency || fetchedService.currency
                                };
                            } else {
                                // Fallback: use booking data if service not found
                                return {
                                    name: bookingService.serviceName || 'Service',
                                    price: bookingService.price || 0,
                                    duration: bookingService.duration || 0,
                                    category: bookingService.category || 'General',
                                    serviceType: bookingService.serviceType || 'service',
                                    currency: bookingService.currency || 'INR',
                                    optionLabel: bookingService.optionLabel,
                                    pricingOptionId: bookingService.pricingOptionId
                                };
                            }
                        });
                    }
                }
            }
        } catch (parseError) {
            console.error('Error parsing services from internalNotes:', parseError);
        }

        // If no services array found, use single service
        if (servicesArray.length === 0) {
            if (serviceData) {
                // If service is populated but missing key fields, ensure defaults
                if (!serviceData.name && appointment.serviceName) {
                    serviceData.name = appointment.serviceName;
                }
                // Ensure price is available (use servicePrice from appointment if service price is missing)
                if (!serviceData.price && appointment.servicePrice) {
                    serviceData.price = appointment.servicePrice;
                }
                // Ensure duration is available
                if (!serviceData.duration && appointment.duration) {
                    serviceData.duration = appointment.duration;
                }
                servicesArray = [serviceData];
            } else if (appointment.serviceName) {
                // Fallback: create service object from appointment data if service not populated
                servicesArray = [{
                    name: appointment.serviceName,
                    price: appointment.servicePrice || 0,
                    duration: appointment.duration || 0,
                    category: appointment.serviceCategory || 'General',
                    serviceType: appointment.serviceType || 'service'
                }];
            } else {
                servicesArray = [];
            }
        }

        return res.json({
            success: true,
            data: {
                ...appointment,
                service: servicesArray.length > 0 ? servicesArray[0] : null, // Keep single service for backward compatibility
                services: servicesArray, // Add services array for multiple services
                confirmationCode: appointment.bookingNumber
            }
        });
    } catch (err) {
        next(err);
    }
};

// Cancel appointment by confirmation code (public)
const cancelAppointmentByCode = async (req, res, next) => {
    try {
        const { confirmationCode } = req.params;
        const { reason } = req.body;

        const appointment = await Appointment.findOne({ bookingNumber: confirmationCode })
            .populate('business');

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: "Appointment not found"
            });
        }

        if (appointment.status === 'cancelled') {
            return res.status(400).json({
                success: false,
                message: "Appointment is already cancelled"
            });
        }

        if (appointment.status === 'completed') {
            return res.status(400).json({
                success: false,
                message: "Cannot cancel a completed appointment"
            });
        }

        // Check cancellation policy
        const { canCancelAppointment } = require("../utils/appointmentUtils");
        const cancellationCheck = canCancelAppointment(appointment, appointment.business);

        if (!cancellationCheck.canCancel) {
            return res.status(400).json({
                success: false,
                message: cancellationCheck.reason
            });
        }

        // Cancel appointment
        appointment.status = 'cancelled';
        appointment.cancellationReason = reason || 'Cancelled by customer';
        appointment.cancelledAt = new Date();
        appointment.cancelledBy = appointment.customer;
        appointment.cancelledByModel = 'Customer';
        await appointment.save();

        // Invalidate cache
        await deleteCache(`business:${appointment.business}:appointments*`);
        await deleteCache(`business:${appointment.business}:appointment:stats*`);

        return res.json({
            success: true,
            message: "Appointment cancelled successfully",
            data: {
                appointment: appointment,
                refundAmount: cancellationCheck.refundAmount || 0
            }
        });
    } catch (err) {
        next(err);
    }
};

// ================== Update Appointment Status ==================
const updateAppointmentStatus = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { id } = req.params;
        const { status, notes } = req.body;

        const appointment = await Appointment.findById(id);

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: "Appointment not found"
            });
        }

        // Verify access (same as updateAppointment)
        if (userRole === 'admin') {
            const business = await Business.findOne({
                _id: appointment.business,
                admin: userId
            });
            if (!business) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied"
                });
            }
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            if (manager.business.toString() !== appointment.business.toString()) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied"
                });
            }
        }

        // Update status logic
        const oldStatus = appointment.status;
        appointment.status = status;

        // Handle specific status logic if needed (e.g., setting completedAt)
        if (status === 'completed' && !appointment.completedAt) {
            appointment.completedAt = new Date();
            appointment.paymentStatus = 'paid'; // Assume paid if completed via quick update
        } else if (status === 'cancelled' && !appointment.cancelledAt) {
            appointment.cancelledAt = new Date();
            appointment.cancelledBy = userId;
            appointment.cancelledByModel = userRole === 'admin' ? 'Admin' : 'Manager';
        } else if (status === 'in_progress' && !appointment.checkInTime) {
            appointment.checkInTime = new Date();
        }

        if (notes) {
            appointment.staffNotes = notes;
        }

        appointment.updatedBy = userId;
        appointment.updatedByModel = userRole === 'admin' ? 'Admin' : 'Manager';

        await appointment.save();

        // Invalidate cache
        await deleteCache(`business:${appointment.business}:appointments*`);
        await deleteCache(`business:${appointment.business}:appointment:stats*`);
        if (status === 'completed') {
            await deleteCache(`business:${appointment.business}:customers`);
        }

        // Notify staff
        notifyBusinessStaff(appointment.business, 'appointment_updated', {
            appointmentId: appointment._id,
            status: status,
            message: `Appointment status updated to ${status}`,
            data: appointment
        });

        // ================== SEND EMAIL ==================
        (async () => {
            try {
                const fullAppt = await Appointment.findById(appointment._id)
                    .populate('business')
                    .populate('customer')
                    .populate('service');

                if (fullAppt) {
                    const formattedDate = new Date(fullAppt.appointmentDate).toLocaleDateString('en-US', {
                        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                    });

                    const commonData = {
                        businessName: fullAppt.business.name,
                        customerName: `${fullAppt.customer.firstName} ${fullAppt.customer.lastName}`,
                        appointmentDate: formattedDate,
                        startTime: fullAppt.startTime,
                        endTime: fullAppt.endTime,
                        services: fullAppt.service?.name || 'Service',
                        status: status,
                        year: new Date().getFullYear(),
                        businessLink: `${process.env.FRONTEND_URL || ''}/book/${fullAppt.business.businessLink}/reviews`
                    };

                    let templateName = 'appointment_status_update';
                    let emailData = {
                        ...commonData,
                        actionUrl: `${process.env.FRONTEND_URL || 'https://spaadvisor.in'}/appointment/${fullAppt.bookingNumber}`
                    };

                    // ---- 1. Determine Template & Data ----
                    if (status === 'completed') {
                        templateName = 'appointment_completed';
                        emailData.actionUrl = commonData.businessLink; // Main action is review
                    } else if (status === 'cancelled') {
                        templateName = 'appointment_cancelled';
                        emailData.reason = notes || 'Update by staff';
                        emailData.actionUrl = `${process.env.FRONTEND_URL || ''}/book/${fullAppt.business.businessLink}`; // Re-book
                    } else if (status === 'confirmed') {
                        templateName = 'appointment_confirmation';
                        emailData.confirmationCode = fullAppt.bookingNumber;
                    }

                    // Track sent emails to prevent duplicates
                    const sentEmails = new Set();

                    // ---- 2. Send to Customer ----
                    if (fullAppt.customer?.email && !sentEmails.has(fullAppt.customer.email.toLowerCase())) {
                        await sendTemplateMail({
                            to: fullAppt.customer.email,
                            template: templateName,
                            data: {
                                ...emailData,
                                customerName: fullAppt.customer.firstName
                            }
                        });
                        sentEmails.add(fullAppt.customer.email.toLowerCase());
                    }

                    // ---- 3. Send to Admin/Managers (ONLY IF CANCELLED) ----
                    if (status === 'cancelled') {
                        const businessDetails = await Business.findById(fullAppt.business._id)
                            .populate('admin', 'email name')
                            .populate('managers', 'email name isActive');

                        const adminEmail = businessDetails?.admin?.email || businessDetails?.email;
                        if (adminEmail && !sentEmails.has(adminEmail.toLowerCase())) {
                            await sendTemplateMail({
                                to: adminEmail,
                                template: 'appointment_cancelled',
                                data: {
                                    ...commonData,
                                    customerName: "Admin",
                                    reason: `Cancelled via Status Update: ${notes || 'No reason provided'}`
                                }
                            });
                            sentEmails.add(adminEmail.toLowerCase());
                        }

                        if (businessDetails?.managers?.length > 0) {
                            for (const manager of businessDetails.managers) {
                                if (manager.isActive && manager.email && !sentEmails.has(manager.email.toLowerCase())) {
                                    await sendTemplateMail({
                                        to: manager.email,
                                        template: 'appointment_cancelled',
                                        data: {
                                            ...commonData,
                                            customerName: "Manager",
                                            reason: `Cancelled via Status Update: ${notes || 'No reason provided'}`
                                        }
                                    });
                                    sentEmails.add(manager.email.toLowerCase());
                                }
                            }
                        }
                    }
                }
            } catch (e) { console.error('Email error:', e); }
        })();
        // ================================================

        return res.json({
            success: true,
            message: "Appointment status updated successfully",
            data: appointment
        });
    } catch (err) {
        next(err);
    }
};

// Helper: Download Invoice PDF
const downloadInvoice = async (req, res) => {
    try {
        const appointmentId = req.params.id;
        const appointment = await Appointment.findById(appointmentId)
            .populate('business')
            .populate('customer')
            .populate('service')
            .populate('staff');

        if (!appointment) {
            return res.status(404).json({ success: false, message: "Appointment not found" });
        }

        // Extract Razorpay ID safely
        let razorpayPaymentId = '';
        if (appointment.paymentDetails) {
            // If it's a Mongoose Map
            if (typeof appointment.paymentDetails.get === 'function') {
                razorpayPaymentId = appointment.paymentDetails.get('razorpay_payment_id');
            } else {
                razorpayPaymentId = appointment.paymentDetails.razorpay_payment_id;
            }
        }

        // Create a document
        const doc = new PDFDocument({ margin: 50 });

        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=invoice-${appointment.bookingNumber}.pdf`);

        doc.pipe(res);

        // --- PDF CONTENT GENERATION ---

        // 1. Header
        doc.fontSize(20).text('INVOICE', { align: 'right' });
        doc.fontSize(10).text(`Booking Ref: ${appointment.bookingNumber}`, { align: 'right' });
        if (appointment.confirmationCode) {
            doc.text(`Confirmation Code: ${appointment.confirmationCode}`, { align: 'right' });
        }
        doc.text(`Date: ${new Date().toLocaleDateString()}`, { align: 'right' });

        doc.moveDown();

        // Business Details (Top Left)
        doc.fontSize(14).font('Helvetica-Bold').text(appointment.business.name);
        doc.fontSize(10).font('Helvetica').text(appointment.business.address || '');
        doc.text(`Phone: ${appointment.business.phone || ''}`);
        doc.text(`Email: ${appointment.business.email || ''}`);

        doc.moveDown();
        doc.text('---------------------------------------------------------', { align: 'center' });
        doc.moveDown();

        // Customer Details
        doc.fontSize(12).font('Helvetica-Bold').text('Bill To:');
        doc.fontSize(10).font('Helvetica').text(`${appointment.customer.firstName} ${appointment.customer.lastName}`);
        doc.text(appointment.customer.phone || '');
        doc.text(appointment.customer.email || '');

        doc.moveDown();

        // Service Table Header
        const tableTop = doc.y;
        const col1 = 50;
        const col2 = 250;
        const col3 = 350;
        const col4 = 450;

        doc.font('Helvetica-Bold');
        doc.text('Service', col1, tableTop);
        doc.text('Date', col2, tableTop);
        doc.text('Duration', col3, tableTop);
        doc.text('Amount', col4, tableTop);

        doc.moveTo(col1, tableTop + 15).lineTo(550, tableTop + 15).stroke();

        // Service Rows
        let yPosition = tableTop + 25;
        doc.font('Helvetica');

        // Parse internal services if available, else use single service
        let services = [];
        try {
            if (appointment.internalNotes) {
                const notes = JSON.parse(appointment.internalNotes);
                if (notes.services) services = notes.services;
            }
        } catch (e) { }

        if (services.length === 0 && appointment.service) {
            services.push({
                serviceName: appointment.service.name,
                price: appointment.servicePrice || 0,
                duration: appointment.duration || 0
            });
        }

        services.forEach(svc => {
            doc.text(svc.serviceName || svc.name || 'Service', col1, yPosition);
            doc.text(new Date(appointment.appointmentDate).toLocaleDateString(), col2, yPosition);
            doc.text(`${svc.duration || 0} min`, col3, yPosition);
            doc.text(`Rs. ${svc.price}`, col4, yPosition);
            yPosition += 20;
        });

        doc.moveTo(col1, yPosition).lineTo(550, yPosition).stroke();
        yPosition += 10;

        // Totals
        const total = appointment.totalAmount || 0;
        const paid = appointment.paidAmount || 0;
        const due = total - paid;

        doc.font('Helvetica-Bold');
        doc.text(`Total Amount: Rs. ${total}`, col4 - 50, yPosition, { align: 'right', width: 150 });
        yPosition += 15;

        if (appointment.paymentStatus === 'paid') {
            doc.fillColor('green').text(`PAID: Rs. ${paid}`, col4 - 50, yPosition, { align: 'right', width: 150 });
            doc.fillColor('black');

            if (razorpayPaymentId) {
                yPosition += 15;
                doc.fontSize(9).text(`Razorpay ID: ${razorpayPaymentId}`, col4 - 50, yPosition, { align: 'right', width: 150 });
                doc.fontSize(10); // Reset
            }
        } else {
            doc.text(`Paid Amount: Rs. ${paid}`, col4 - 50, yPosition, { align: 'right', width: 150 });
            yPosition += 15;
            doc.fillColor('red').text(`Balance Due: Rs. ${due}`, col4 - 50, yPosition, { align: 'right', width: 150 });
            doc.fillColor('black');
        }

        // Footer
        doc.moveDown(4);
        doc.fontSize(10).text('Thank you for your business!', { align: 'center' });
        doc.fontSize(8).text('This is a computer generated invoice.', { align: 'center' });

        doc.end();

    } catch (error) {
        console.error("Invoice generation error:", error);
        res.status(500).json({ success: false, message: "Could not generate invoice" });
    }
};

// Helper: Send Confirmation Notifications (Email, SMS, WhatsApp)
const sendConfirmationNotifications = async (appointmentId, bookingData) => {
    try {
        let appointment = await Appointment.findById(appointmentId)
            .populate('business', 'name branch address city state country phone email website')
            .populate('service', 'name price duration category serviceType description pricingType pricingOptions currency originalPrice')
            .populate('staff', 'name role specialization phone email')
            .populate('customer', 'firstName lastName email phone address dateOfBirth gender')
            .lean();

        if (!appointment) {
            console.error('[Email] Appointment not found after repopulation');
            return;
        }

        // Get business ID (handle both ObjectId and populated object)
        const businessId = appointment.business?._id || appointment.business;

        // Repopulate business with admin and managers for email
        const business = await Business.findById(businessId)
            .populate('admin', 'email name')
            .populate('managers', 'email name isActive');

        if (!business) {
            console.error('[Email] Business not found for email notifications');
        } else {
            // Update appointment business reference
            appointment.business = business;
        }

        // Prepare email data with conditional fields
        const staffInfo = appointment.staff?.name
            ? `<p><strong>Assigned Staff:</strong> ${appointment.staff.name}</p>`
            : '';
        const customerNotesInfo = bookingData.customerNotes
            ? `<p><strong>Customer Notes:</strong> ${bookingData.customerNotes}</p>`
            : '';

        // Get business name (fallback if business not populated)
        const businessName = business?.name || appointment.business?.name || 'Business';

        // Extract and format services (handle multiple services)
        let servicesText = '';
        let servicesArray = [];

        try {
            // Try to parse services from internalNotes (for multiple services)
            if (appointment.internalNotes) {
                const parsedNotes = JSON.parse(appointment.internalNotes);
                if (parsedNotes.services && Array.isArray(parsedNotes.services) && parsedNotes.services.length > 0) {
                    servicesArray = parsedNotes.services;
                }
            }
        } catch (parseError) {
            console.error('[Email] Error parsing services from internalNotes:', parseError);
        }

        // If no services array found, use single service
        if (servicesArray.length === 0) {
            if (appointment.service) {
                // Handle populated service object
                const serviceName = appointment.service.name || appointment.service.serviceName || 'Service';
                const servicePrice = appointment.service.price || appointment.servicePrice || 0;
                const serviceDuration = appointment.service.duration || appointment.duration || 0;
                servicesArray = [{
                    serviceName: serviceName,
                    price: servicePrice,
                    duration: serviceDuration,
                    optionLabel: appointment.service.optionLabel || ''
                }];
            } else if (bookingData.services && Array.isArray(bookingData.services)) {
                // Fallback to bookingData services
                servicesArray = bookingData.services.map(s => ({
                    serviceName: s.serviceName || s.name || 'Service',
                    price: s.price || 0,
                    duration: s.duration || 0,
                    optionLabel: s.optionLabel || s.pricingOptionLabel || ''
                }));
            } else {
                servicesArray = [{
                    serviceName: appointment.serviceName || 'Service',
                    price: appointment.servicePrice || 0,
                    duration: appointment.duration || 0
                }];
            }
        }

        // Format services text for email
        if (servicesArray.length === 1) {
            const service = servicesArray[0];
            servicesText = service.optionLabel
                ? `${service.serviceName} (${service.optionLabel})`
                : service.serviceName;
        } else {
            // Multiple services - format with details
            servicesText = servicesArray.map((service, index) => {
                const name = service.serviceName || service.name || `Service ${index + 1}`;
                const option = service.optionLabel || service.pricingOptionLabel || '';
                const duration = service.duration || 0;
                const price = service.price || 0;

                let serviceText = `${index + 1}. ${name}`;
                if (option) serviceText += ` (${option})`;
                if (duration) serviceText += ` - ${duration} min`;
                if (price) serviceText += ` - ${price.toFixed(2)}`;

                return serviceText;
            }).join('<br>');
        }

        const notificationData = {
            customerName: appointment.customer?.firstName || bookingData.customerInfo?.name || 'Customer',
            businessName: businessName,
            appointmentDate: new Date(appointment.appointmentDate).toLocaleDateString('en-IN'),
            startTime: appointment.startTime,
            endTime: appointment.endTime,
            services: servicesText,
            confirmationCode: appointment.bookingNumber,
            customerEmail: appointment.customer?.email || bookingData.customerInfo?.email || '',
            customerPhone: appointment.customer?.phone || bookingData.customerInfo?.phone || '',
            staffInfo: staffInfo,
            customerNotesInfo: customerNotesInfo
        };

        const phone = appointment.customer?.phone || bookingData.customerInfo?.phone;

        // Send Booking Confirmation (DoubleTick.io → Twilio WhatsApp → SMS Fallback)
        if (phone) {
            const { sendAppointmentConfirmation } = require('../utils/whatsappSender');
            (async () => {
                try {
                    console.log(`[Notification] Sending appointment confirmation to ${phone}...`);
                    const result = await sendAppointmentConfirmation({
                        phone: phone,
                        confirmationCode: appointment.bookingNumber
                    });

                    if (result.success) {
                        console.log(`[Notification] ✅ Confirmation sent via ${result.provider}: ${result.messageId}`);
                    } else {
                        console.error('[Notification] ❌ All delivery methods failed:', result.error);
                    }
                } catch (err) {
                    console.error('[Notification] Critical error sending confirmation:', err.message);
                }
            })();
        }

        // Track sent emails to prevent duplicates
        const sentEmails = new Set();

        // Send Email to Customer
        if (notificationData.customerEmail && !sentEmails.has(notificationData.customerEmail.toLowerCase())) {
            console.log(`[Email] Sending confirmation email to customer: ${notificationData.customerEmail}...`);
            sendTemplateMail({
                to: notificationData.customerEmail,
                template: 'appointment_confirmation',
                data: notificationData
            })
                .then(res => console.log(`[Email] Customer email sent:`, res.messageId))
                .catch(err => console.error('[Email] Customer email failed:', err.message));
            sentEmails.add(notificationData.customerEmail.toLowerCase());
        }

        // Send Email to Admin
        const adminEmail = business?.admin?.email;
        if (adminEmail && !sentEmails.has(adminEmail.toLowerCase())) {
            console.log(`[Email] Sending confirmation email to admin: ${adminEmail}...`);
            sendTemplateMail({
                to: adminEmail,
                template: 'appointment_notification', // You might want a different template for admin
                data: { ...notificationData, role: 'Admin' }
            })
                .then(res => console.log(`[Email] Admin email sent:`, res.messageId))
                .catch(err => console.error('[Email] Admin email failed:', err.message));
            sentEmails.add(adminEmail.toLowerCase());
        }

        // Send Email to Managers
        const managers = business?.managers || [];
        for (const manager of managers) {
            if (manager.isActive && manager.email && !sentEmails.has(manager.email.toLowerCase())) {
                console.log(`[Email] Sending confirmation email to manager: ${manager.email}...`);
                sendTemplateMail({
                    to: manager.email,
                    template: 'appointment_notification',
                    data: { ...notificationData, role: 'Manager' }
                })
                    .then(res => console.log(`[Email] Manager email sent:`, res.messageId))
                    .catch(err => console.error('[Email] Manager email failed:', err.message));
                sentEmails.add(manager.email.toLowerCase());
            }
        }

    } catch (error) {
        console.error("Error sending confirmation notifications:", error);
    }
};

module.exports = {
    // Public routes
    getBusinessInfoForBooking,
    getAvailableSlotsForBooking,
    getAvailableSlots,
    bookAppointmentPublic,
    verifyBookingOTP,
    getAppointmentByConfirmationCode,
    cancelAppointmentByCode,
    // Protected routes
    createAppointment,
    getAppointments,
    getAppointmentById,
    updateAppointment,
    confirmAppointment,
    startAppointment,
    completeAppointment,
    cancelAppointment,
    rescheduleAppointment,
    markNoShow,
    addReview,
    getAppointmentStats,
    updateAppointmentStatus,
    downloadInvoice
};
