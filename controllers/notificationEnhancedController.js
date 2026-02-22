// notificationEnhancedController.js - Enhanced notification system with automation
const Notification = require("../models/Notification");
const Customer = require("../models/Customer");
const Appointment = require("../models/Appointment");
const Business = require("../models/Business");
const Manager = require("../models/Manager");
const { setCache, getCache, deleteCache } = require("../utils/cache");

// ================== Send Birthday Wishes ==================
const sendBirthdayWishes = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { businessId } = req.body;

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

        // Find customers with birthday today
        const today = new Date();
        const todayMonth = today.getMonth() + 1;
        const todayDate = today.getDate();

        const birthdayCustomers = await Customer.find({
            business: business._id,
            isActive: true,
            dateOfBirth: { $exists: true }
        });

        const customersWithBirthdayToday = birthdayCustomers.filter(customer => {
            const dob = new Date(customer.dateOfBirth);
            return dob.getMonth() + 1 === todayMonth && dob.getDate() === todayDate;
        });

        if (customersWithBirthdayToday.length === 0) {
            return res.json({
                success: true,
                message: "No birthdays today",
                data: { count: 0 }
            });
        }

        // Create birthday notification
        const notification = await Notification.create({
            business: business._id,
            sender: userId,
            title: "🎉 Happy Birthday!",
            message: `Wishing you a wonderful birthday! Enjoy 20% off on your next visit. Use code: BDAY20`,
            type: "offer",
            targetAudience: {
                type: "individual",
                individualCustomers: customersWithBirthdayToday.map(c => c._id)
            },
            content: {
                actionText: "Book Now",
                discountCode: "BDAY20",
                discountPercentage: 20,
                expiryDate: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000) // 7 days validity
            },
            delivery: {
                channels: ["sms", "email", "whatsapp"],
                scheduledAt: new Date(),
                priority: "high"
            },
            campaign: {
                name: "Birthday Wishes",
                tags: ["birthday", "automated"]
            },
            status: "scheduled"
        });

        // Add delivery records
        customersWithBirthdayToday.forEach(customer => {
            if (customer.phone && customer.marketingConsent?.sms) {
                notification.addDelivery(customer._id, "sms", "pending");
            }
            if (customer.email && customer.marketingConsent?.email) {
                notification.addDelivery(customer._id, "email", "pending");
            }
            if (customer.phone && customer.marketingConsent?.whatsapp) {
                notification.addDelivery(customer._id, "whatsapp", "pending");
            }
        });

        await notification.save();

        return res.json({
            success: true,
            message: "Birthday wishes scheduled",
            data: {
                notificationId: notification._id,
                recipientCount: customersWithBirthdayToday.length,
                customers: customersWithBirthdayToday.map(c => ({
                    name: c.fullName,
                    phone: c.phone,
                    email: c.email
                }))
            }
        });
    } catch (err) {
        next(err);
    }
};

// ================== Send Anniversary Wishes ==================
const sendAnniversaryWishes = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { businessId } = req.body;

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

        // Find customers with anniversary today
        const today = new Date();
        const todayMonth = today.getMonth() + 1;
        const todayDate = today.getDate();

        const anniversaryCustomers = await Customer.find({
            business: business._id,
            isActive: true,
            anniversary: { $exists: true }
        });

        const customersWithAnniversaryToday = anniversaryCustomers.filter(customer => {
            const anniversary = new Date(customer.anniversary);
            return anniversary.getMonth() + 1 === todayMonth && anniversary.getDate() === todayDate;
        });

        if (customersWithAnniversaryToday.length === 0) {
            return res.json({
                success: true,
                message: "No anniversaries today",
                data: { count: 0 }
            });
        }

        // Create anniversary notification
        const notification = await Notification.create({
            business: business._id,
            sender: userId,
            title: "💐 Happy Anniversary!",
            message: `Wishing you a wonderful anniversary! Celebrate with 25% off. Use code: ANNIV25`,
            type: "offer",
            targetAudience: {
                type: "individual",
                individualCustomers: customersWithAnniversaryToday.map(c => c._id)
            },
            content: {
                actionText: "Book Now",
                discountCode: "ANNIV25",
                discountPercentage: 25,
                expiryDate: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
            },
            delivery: {
                channels: ["sms", "email", "whatsapp"],
                scheduledAt: new Date(),
                priority: "high"
            },
            campaign: {
                name: "Anniversary Wishes",
                tags: ["anniversary", "automated"]
            },
            status: "scheduled"
        });

        // Add delivery records
        customersWithAnniversaryToday.forEach(customer => {
            if (customer.phone && customer.marketingConsent?.sms) {
                notification.addDelivery(customer._id, "sms", "pending");
            }
            if (customer.email && customer.marketingConsent?.email) {
                notification.addDelivery(customer._id, "email", "pending");
            }
        });

        await notification.save();

        return res.json({
            success: true,
            message: "Anniversary wishes scheduled",
            data: {
                notificationId: notification._id,
                recipientCount: customersWithAnniversaryToday.length
            }
        });
    } catch (err) {
        next(err);
    }
};

// ================== Send Appointment Reminders ==================
const sendAppointmentReminders = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { businessId, hoursBefore = 24 } = req.body;

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

        // Find appointments in next X hours
        const now = new Date();
        const futureTime = new Date(now.getTime() + hoursBefore * 60 * 60 * 1000);

        const upcomingAppointments = await Appointment.find({
            business: business._id,
            appointmentDate: { $gte: now, $lte: futureTime },
            status: { $in: ['pending', 'confirmed'] },
            reminderSent: false
        })
        .populate('customer', 'firstName lastName phone email marketingConsent')
        .populate('service', 'name')
        .populate('staff', 'name');

        if (upcomingAppointments.length === 0) {
            return res.json({
                success: true,
                message: "No appointments to remind",
                data: { count: 0 }
            });
        }

        let remindersScheduled = 0;

        // Send reminder for each appointment
        for (const appointment of upcomingAppointments) {
            const customer = appointment.customer;
            const date = new Date(appointment.appointmentDate).toLocaleDateString();
            const time = appointment.startTime;

            const notification = await Notification.create({
                business: business._id,
                sender: userId,
                title: "📅 Appointment Reminder",
                message: `Reminder: You have an appointment for ${appointment.service?.name} on ${date} at ${time}${appointment.staff ? ` with ${appointment.staff.name}` : ''}.`,
                type: "reminder",
                targetAudience: {
                    type: "individual",
                    individualCustomers: [customer._id]
                },
                content: {
                    actionText: "View Details",
                    actionUrl: `/appointments/${appointment._id}`
                },
                delivery: {
                    channels: ["sms", "email"],
                    scheduledAt: new Date(),
                    priority: "high"
                },
                campaign: {
                    name: "Appointment Reminders",
                    tags: ["appointment", "reminder", "automated"]
                },
                status: "scheduled"
            });

            if (customer.phone && customer.marketingConsent?.sms) {
                notification.addDelivery(customer._id, "sms", "pending");
            }
            if (customer.email && customer.marketingConsent?.email) {
                notification.addDelivery(customer._id, "email", "pending");
            }

            await notification.save();

            // Mark reminder as sent in appointment
            await appointment.sendReminder();

            remindersScheduled++;
        }

        return res.json({
            success: true,
            message: "Appointment reminders scheduled",
            data: {
                remindersSent: remindersScheduled,
                totalAppointments: upcomingAppointments.length
            }
        });
    } catch (err) {
        next(err);
    }
};

// ================== Send Inactive Customer Reactivation ==================
const sendReactivationCampaign = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { businessId, inactiveDays = 90 } = req.body;

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

        // Find inactive customers
        const inactiveDate = new Date(Date.now() - inactiveDays * 24 * 60 * 60 * 1000);

        const inactiveCustomers = await Customer.find({
            business: business._id,
            isActive: true,
            lastVisit: { $lte: inactiveDate }
        });

        if (inactiveCustomers.length === 0) {
            return res.json({
                success: true,
                message: "No inactive customers found",
                data: { count: 0 }
            });
        }

        // Create reactivation notification
        const notification = await Notification.create({
            business: business._id,
            sender: userId,
            title: "💝 We Miss You!",
            message: `It's been a while! Come back and enjoy 30% off your next visit. Use code: COMEBACK30`,
            type: "offer",
            targetAudience: {
                type: "individual",
                individualCustomers: inactiveCustomers.map(c => c._id)
            },
            content: {
                actionText: "Book Now",
                discountCode: "COMEBACK30",
                discountPercentage: 30,
                expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days validity
            },
            delivery: {
                channels: ["sms", "email", "whatsapp"],
                scheduledAt: new Date(),
                priority: "normal"
            },
            campaign: {
                name: "Reactivation Campaign",
                tags: ["reactivation", "inactive", "automated"]
            },
            status: "scheduled"
        });

        // Add delivery records
        inactiveCustomers.forEach(customer => {
            if (customer.phone && customer.marketingConsent?.sms) {
                notification.addDelivery(customer._id, "sms", "pending");
            }
            if (customer.email && customer.marketingConsent?.email) {
                notification.addDelivery(customer._id, "email", "pending");
            }
        });

        await notification.save();

        return res.json({
            success: true,
            message: "Reactivation campaign scheduled",
            data: {
                notificationId: notification._id,
                recipientCount: inactiveCustomers.length
            }
        });
    } catch (err) {
        next(err);
    }
};

// ================== Send Review Request ==================
const sendReviewRequest = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { businessId, daysSinceVisit = 2 } = req.body;

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

        // Find completed appointments without reviews
        const targetDate = new Date(Date.now() - daysSinceVisit * 24 * 60 * 60 * 1000);

        const appointmentsWithoutReviews = await Appointment.find({
            business: business._id,
            status: 'completed',
            completedAt: { $gte: targetDate },
            rating: { $exists: false }
        })
        .populate('customer', 'firstName lastName phone email marketingConsent')
        .limit(50); // Limit to 50 at a time

        if (appointmentsWithoutReviews.length === 0) {
            return res.json({
                success: true,
                message: "No appointments need review requests",
                data: { count: 0 }
            });
        }

        const uniqueCustomers = [...new Map(
            appointmentsWithoutReviews.map(apt => [apt.customer._id.toString(), apt.customer])
        ).values()];

        // Create review request notification
        const notification = await Notification.create({
            business: business._id,
            sender: userId,
            title: "⭐ Share Your Experience",
            message: `Thank you for choosing us! We'd love to hear about your experience. Share your feedback and get 100 loyalty points!`,
            type: "general",
            targetAudience: {
                type: "individual",
                individualCustomers: uniqueCustomers.map(c => c._id)
            },
            content: {
                actionText: "Write Review",
                actionUrl: `/review`
            },
            delivery: {
                channels: ["sms", "email"],
                scheduledAt: new Date(),
                priority: "normal"
            },
            campaign: {
                name: "Review Requests",
                tags: ["review", "feedback", "automated"]
            },
            status: "scheduled"
        });

        // Add delivery records
        uniqueCustomers.forEach(customer => {
            if (customer.phone && customer.marketingConsent?.sms) {
                notification.addDelivery(customer._id, "sms", "pending");
            }
            if (customer.email && customer.marketingConsent?.email) {
                notification.addDelivery(customer._id, "email", "pending");
            }
        });

        await notification.save();

        return res.json({
            success: true,
            message: "Review requests scheduled",
            data: {
                notificationId: notification._id,
                recipientCount: uniqueCustomers.length
            }
        });
    } catch (err) {
        next(err);
    }
};

// ================== Get Automated Notifications Summary ==================
const getAutomatedNotificationsSummary = async (req, res, next) => {
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

        const today = new Date();
        const todayMonth = today.getMonth() + 1;
        const todayDate = today.getDate();

        // Count opportunities
        const [
            birthdaysToday,
            anniversariesToday,
            upcomingAppointments,
            inactiveCustomers,
            completedAppointmentsNeedingReview
        ] = await Promise.all([
            Customer.countDocuments({
                business: business._id,
                isActive: true,
                $expr: {
                    $and: [
                        { $eq: [{ $month: "$dateOfBirth" }, todayMonth] },
                        { $eq: [{ $dayOfMonth: "$dateOfBirth" }, todayDate] }
                    ]
                }
            }),
            Customer.countDocuments({
                business: business._id,
                isActive: true,
                $expr: {
                    $and: [
                        { $eq: [{ $month: "$anniversary" }, todayMonth] },
                        { $eq: [{ $dayOfMonth: "$anniversary" }, todayDate] }
                    ]
                }
            }),
            Appointment.countDocuments({
                business: business._id,
                appointmentDate: { 
                    $gte: new Date(),
                    $lte: new Date(Date.now() + 24 * 60 * 60 * 1000)
                },
                status: { $in: ['pending', 'confirmed'] },
                reminderSent: false
            }),
            Customer.countDocuments({
                business: business._id,
                isActive: true,
                lastVisit: { $lte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) }
            }),
            Appointment.countDocuments({
                business: business._id,
                status: 'completed',
                completedAt: { $gte: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
                rating: { $exists: false }
            })
        ]);

        return res.json({
            success: true,
            data: {
                opportunities: {
                    birthdaysToday,
                    anniversariesToday,
                    upcomingAppointments,
                    inactiveCustomers,
                    completedAppointmentsNeedingReview
                }
            }
        });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    sendBirthdayWishes,
    sendAnniversaryWishes,
    sendAppointmentReminders,
    sendReactivationCampaign,
    sendReviewRequest,
    getAutomatedNotificationsSummary
};

