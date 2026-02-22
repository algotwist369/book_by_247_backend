const Business = require("../models/Business");
const Manager = require("../models/Manager");
const mongoose = require("mongoose");
const { setCache, getCache, deleteCache } = require("../utils/cache");
const { getFileUrl } = require("../middleware/uploadMiddleware");

// Helper function to validate MongoDB ObjectId
const isValidObjectId = (id) => {
    if (!id || id === 'undefined' || id === 'null') {
        return false;
    }
    return mongoose.Types.ObjectId.isValid(id);
};

// ================== Get Business Settings ==================
const getBusinessSettings = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { businessId } = req.query;

        // Determine business
        let business;
        if (userRole === 'admin') {
            if (!businessId || !isValidObjectId(businessId)) {
                return res.status(400).json({
                    success: false,
                    message: "Valid Business ID is required"
                });
            }
            business = await Business.findOne({ _id: businessId, admin: userId });
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            if (!manager || !manager.business) {
                return res.status(404).json({
                    success: false,
                    message: "Manager not found or business not assigned"
                });
            }
            if (!isValidObjectId(manager.business)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid business ID for manager"
                });
            }
            business = await Business.findById(manager.business);
        }

        if (!business) {
            return res.status(404).json({
                success: false,
                message: "Business not found or access denied"
            });
        }

        // Convert businessHours Map/Object to plain object for response
        let hoursObj = {};
        if (business.businessHours) {
            if (business.businessHours instanceof Map) {
                // Convert Map to object
                business.businessHours.forEach((value, key) => {
                    hoursObj[key] = value;
                });
            } else {
                // Already an object
                hoursObj = business.businessHours;
            }
        }

        return res.json({
            success: true,
            data: {
                profile: {
                    name: business.name,
                    type: business.type,
                    branch: business.branch,
                    address: business.address,
                    city: business.city,
                    state: business.state,
                    country: business.country,
                    zipCode: business.zipCode,
                    phone: business.phone,
                    alternatePhone: business.alternatePhone,
                    email: business.email,
                    website: business.website,
                    description: business.description,
                    googleMapsUrl: business.googleMapsUrl,
                    socialMedia: business.socialMedia || {},
                    images: business.images || {}
                },
                settings: business.settings || {},
                businessHours: hoursObj,
                holidays: business.holidays || [],
                notifications: business.notificationPreferences || {}
            }
        });
    } catch (err) {
        next(err);
    }
};

// ================== Update Business Hours ==================
const updateBusinessHours = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { businessId, businessHours } = req.body;

        // Determine business
        let business;
        if (userRole === 'admin') {
            if (!businessId || !isValidObjectId(businessId)) {
                return res.status(400).json({
                    success: false,
                    message: "Valid Business ID is required"
                });
            }
            business = await Business.findOne({ _id: businessId, admin: userId });
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            if (!manager || !manager.business) {
                return res.status(404).json({
                    success: false,
                    message: "Manager not found or business not assigned"
                });
            }
            if (!isValidObjectId(manager.business)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid business ID for manager"
                });
            }
            business = await Business.findById(manager.business);
        }

        if (!business) {
            return res.status(404).json({
                success: false,
                message: "Business not found or access denied"
            });
        }

        // Validate and format business hours
        const daysOfWeek = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        const formattedHours = {};

        for (const day of daysOfWeek) {
            if (businessHours[day]) {
                const { isOpen, openTime, closeTime } = businessHours[day];
                if (isOpen !== false && (!openTime || !closeTime)) {
                    return res.status(400).json({
                        success: false,
                        message: `Invalid hours for ${day}. Please provide both openTime and closeTime.`
                    });
                }
                // Format and store hours for this day
                formattedHours[day] = {
                    isOpen: isOpen !== undefined ? isOpen : true,
                    openTime: openTime || '09:00',
                    closeTime: closeTime || '18:00'
                };
            }
        }

        business.businessHours = formattedHours;
        business.markModified('businessHours'); // Required for Mixed type fields in Mongoose
        await business.save();

        console.log('✅ Business hours saved successfully for business:', business._id);

        // Invalidate cache
        await deleteCache(`business:${business._id}`);

        return res.json({
            success: true,
            message: "Business hours updated successfully",
            data: { businessHours: business.businessHours }
        });
    } catch (err) {
        next(err);
    }
};

// ================== Update Appointment Settings ==================
const updateAppointmentSettings = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { businessId, appointmentSettings } = req.body;

        // Determine business
        let business;
        if (userRole === 'admin') {
            if (!businessId || !isValidObjectId(businessId)) {
                return res.status(400).json({
                    success: false,
                    message: "Valid Business ID is required"
                });
            }
            business = await Business.findOne({ _id: businessId, admin: userId });
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            if (!manager || !manager.business) {
                return res.status(404).json({
                    success: false,
                    message: "Manager not found or business not assigned"
                });
            }
            if (!isValidObjectId(manager.business)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid business ID for manager"
                });
            }
            business = await Business.findById(manager.business);
        }

        if (!business) {
            return res.status(404).json({
                success: false,
                message: "Business not found or access denied"
            });
        }

        if (!business.settings) {
            business.settings = {};
        }

        business.settings.appointmentSettings = {
            ...business.settings.appointmentSettings,
            ...appointmentSettings
        };

        business.markModified('settings'); // Required for nested objects
        await business.save();

        // Invalidate cache
        await deleteCache(`business:${business._id}`);

        return res.json({
            success: true,
            message: "Appointment settings updated successfully",
            data: { appointmentSettings: business.settings.appointmentSettings }
        });
    } catch (err) {
        next(err);
    }
};

// ================== Update Notification Preferences ==================
const updateNotificationPreferences = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { businessId, notificationPreferences } = req.body;

        // Determine business
        let business;
        if (userRole === 'admin') {
            if (!businessId || !isValidObjectId(businessId)) {
                return res.status(400).json({
                    success: false,
                    message: "Valid Business ID is required"
                });
            }
            business = await Business.findOne({ _id: businessId, admin: userId });
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            if (!manager || !manager.business) {
                return res.status(404).json({
                    success: false,
                    message: "Manager not found or business not assigned"
                });
            }
            if (!isValidObjectId(manager.business)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid business ID for manager"
                });
            }
            business = await Business.findById(manager.business);
        }

        if (!business) {
            return res.status(404).json({
                success: false,
                message: "Business not found or access denied"
            });
        }

        business.notificationPreferences = {
            ...business.notificationPreferences,
            ...notificationPreferences
        };

        business.markModified('notificationPreferences'); // Ensure changes are saved
        await business.save();

        // Invalidate cache
        await deleteCache(`business:${business._id}`);

        return res.json({
            success: true,
            message: "Notification preferences updated successfully",
            data: { notificationPreferences: business.notificationPreferences }
        });
    } catch (err) {
        next(err);
    }
};

// ================== Add Holiday ==================
const addHoliday = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { businessId, date, reason } = req.body;

        if (!date) {
            return res.status(400).json({
                success: false,
                message: "Date is required"
            });
        }

        // Determine business
        let business;
        if (userRole === 'admin') {
            if (!businessId || !isValidObjectId(businessId)) {
                return res.status(400).json({
                    success: false,
                    message: "Valid Business ID is required"
                });
            }
            business = await Business.findOne({ _id: businessId, admin: userId });
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            if (!manager || !manager.business) {
                return res.status(404).json({
                    success: false,
                    message: "Manager not found or business not assigned"
                });
            }
            if (!isValidObjectId(manager.business)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid business ID for manager"
                });
            }
            business = await Business.findById(manager.business);
        }

        if (!business) {
            return res.status(404).json({
                success: false,
                message: "Business not found or access denied"
            });
        }

        if (!business.holidays) {
            business.holidays = [];
        }

        // Check if holiday already exists
        const holidayExists = business.holidays.some(
            h => new Date(h.date).toDateString() === new Date(date).toDateString()
        );

        if (holidayExists) {
            return res.status(400).json({
                success: false,
                message: "Holiday already exists for this date"
            });
        }

        business.holidays.push({
            date: new Date(date),
            reason: reason || "Holiday"
        });

        business.markModified('holidays'); // Required for arrays
        await business.save();

        // Invalidate cache
        await deleteCache(`business:${business._id}`);

        return res.json({
            success: true,
            message: "Holiday added successfully",
            data: { holidays: business.holidays }
        });
    } catch (err) {
        next(err);
    }
};

// ================== Remove Holiday ==================
const removeHoliday = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { businessId, date } = req.body;

        if (!date) {
            return res.status(400).json({
                success: false,
                message: "Date is required"
            });
        }

        // Determine business
        let business;
        if (userRole === 'admin') {
            if (!businessId || !isValidObjectId(businessId)) {
                return res.status(400).json({
                    success: false,
                    message: "Valid Business ID is required"
                });
            }
            business = await Business.findOne({ _id: businessId, admin: userId });
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            if (!manager || !manager.business) {
                return res.status(404).json({
                    success: false,
                    message: "Manager not found or business not assigned"
                });
            }
            if (!isValidObjectId(manager.business)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid business ID for manager"
                });
            }
            business = await Business.findById(manager.business);
        }

        if (!business) {
            return res.status(404).json({
                success: false,
                message: "Business not found or access denied"
            });
        }

        business.holidays = business.holidays.filter(
            h => new Date(h.date).toDateString() !== new Date(date).toDateString()
        );

        business.markModified('holidays'); // Required for arrays
        await business.save();

        // Invalidate cache
        await deleteCache(`business:${business._id}`);

        return res.json({
            success: true,
            message: "Holiday removed successfully",
            data: { holidays: business.holidays }
        });
    } catch (err) {
        next(err);
    }
};

// ================== Update Payment Settings ==================
const updatePaymentSettings = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { businessId, paymentMethods, bankDetails } = req.body;

        // Determine business
        let business;
        if (userRole === 'admin') {
            if (!businessId || !isValidObjectId(businessId)) {
                return res.status(400).json({
                    success: false,
                    message: "Valid Business ID is required"
                });
            }
            business = await Business.findOne({ _id: businessId, admin: userId });
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            if (!manager || !manager.business) {
                return res.status(404).json({
                    success: false,
                    message: "Manager not found or business not assigned"
                });
            }
            if (!isValidObjectId(manager.business)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid business ID for manager"
                });
            }
            business = await Business.findById(manager.business);
        }

        if (!business) {
            return res.status(404).json({
                success: false,
                message: "Business not found or access denied"
            });
        }

        if (paymentMethods) {
            business.paymentMethods = paymentMethods;
            business.markModified('paymentMethods');
        }

        if (bankDetails) {
            business.bankDetails = {
                ...business.bankDetails,
                ...bankDetails
            };
            business.markModified('bankDetails');
        }

        await business.save();

        // Invalidate cache
        await deleteCache(`business:${business._id}`);

        return res.json({
            success: true,
            message: "Payment settings updated successfully",
            data: {
                paymentMethods: business.paymentMethods,
                bankDetails: business.bankDetails
            }
        });
    } catch (err) {
        next(err);
    }
};

// ================== Update Tax Settings ==================
const updateTaxSettings = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { businessId, taxSettings } = req.body;

        // Determine business
        let business;
        if (userRole === 'admin') {
            if (!businessId || !isValidObjectId(businessId)) {
                return res.status(400).json({
                    success: false,
                    message: "Valid Business ID is required"
                });
            }
            business = await Business.findOne({ _id: businessId, admin: userId });
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            if (!manager || !manager.business) {
                return res.status(404).json({
                    success: false,
                    message: "Manager not found or business not assigned"
                });
            }
            if (!isValidObjectId(manager.business)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid business ID for manager"
                });
            }
            business = await Business.findById(manager.business);
        }

        if (!business) {
            return res.status(404).json({
                success: false,
                message: "Business not found or access denied"
            });
        }

        if (!business.settings) {
            business.settings = {};
        }

        business.settings.taxSettings = {
            ...business.settings.taxSettings,
            ...taxSettings
        };

        business.markModified('settings'); // Required for nested objects
        await business.save();

        // Invalidate cache
        await deleteCache(`business:${business._id}`);

        return res.json({
            success: true,
            message: "Tax settings updated successfully",
            data: { taxSettings: business.settings.taxSettings }
        });
    } catch (err) {
        next(err);
    }
};

// ================== Update General Settings ==================
const updateGeneralSettings = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { businessId, generalSettings } = req.body;

        // Determine business
        let business;
        if (userRole === 'admin') {
            if (!businessId || !isValidObjectId(businessId)) {
                return res.status(400).json({
                    success: false,
                    message: "Valid Business ID is required"
                });
            }
            business = await Business.findOne({ _id: businessId, admin: userId });
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            if (!manager || !manager.business) {
                return res.status(404).json({
                    success: false,
                    message: "Manager not found or business not assigned"
                });
            }
            if (!isValidObjectId(manager.business)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid business ID for manager"
                });
            }
            business = await Business.findById(manager.business);
        }

        if (!business) {
            return res.status(404).json({
                success: false,
                message: "Business not found or access denied"
            });
        }

        if (!business.settings) {
            business.settings = {};
        }

        business.settings = {
            ...business.settings,
            ...generalSettings
        };

        business.markModified('settings'); // Required for nested objects
        await business.save();

        // Invalidate cache
        await deleteCache(`business:${business._id}`);

        return res.json({
            success: true,
            message: "General settings updated successfully",
            data: { settings: business.settings }
        });
    } catch (err) {
        next(err);
    }
};

// ================== Update Business Profile ==================
const updateBusinessProfile = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const {
            businessId,
            name,
            type,
            branch,
            address,
            city,
            state,
            country,
            zipCode,
            phone,
            alternatePhone,
            email,
            website,
            description,
            googleMapsUrl,
            socialMedia
        } = req.body;

        // Determine business
        let business;
        if (userRole === 'admin') {
            if (!businessId || !isValidObjectId(businessId)) {
                return res.status(400).json({
                    success: false,
                    message: "Valid Business ID is required"
                });
            }
            business = await Business.findOne({ _id: businessId, admin: userId });
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            if (!manager || !manager.business) {
                return res.status(404).json({
                    success: false,
                    message: "Manager not found or business not assigned"
                });
            }
            business = await Business.findById(manager.business);
        }

        if (!business) {
            return res.status(404).json({
                success: false,
                message: "Business not found or access denied"
            });
        }

        // Update fields
        if (name) business.name = name;
        if (type) business.type = type;
        if (branch) business.branch = branch;
        if (address) business.address = address;
        if (city) business.city = city;
        if (state) business.state = state;
        if (country) business.country = country;
        if (zipCode) business.zipCode = zipCode;
        if (phone) business.phone = phone;
        if (alternatePhone) business.alternatePhone = alternatePhone;
        if (email) business.email = email;
        if (website) business.website = website;
        if (description) business.description = description;
        if (googleMapsUrl) business.googleMapsUrl = googleMapsUrl;

        if (socialMedia) {
            business.socialMedia = {
                ...business.socialMedia,
                ...socialMedia
            };
        }

        await business.save();

        // Invalidate cache
        await deleteCache(`business:${business._id}`);
        await deleteCache(`business:${business._id}:info`);

        return res.json({
            success: true,
            message: "Business profile updated successfully",
            data: business
        });
    } catch (err) {
        next(err);
    }
};

// ================== Update Loyalty Settings ==================
const updateLoyaltySettings = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { businessId, loyaltySettings } = req.body;

        // Determine business
        let business;
        if (userRole === 'admin') {
            if (!businessId || !isValidObjectId(businessId)) {
                return res.status(400).json({
                    success: false,
                    message: "Valid Business ID is required"
                });
            }
            business = await Business.findOne({ _id: businessId, admin: userId });
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            if (!manager || !manager.business) {
                return res.status(404).json({
                    success: false,
                    message: "Manager not found or business not assigned"
                });
            }
            if (!isValidObjectId(manager.business)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid business ID for manager"
                });
            }
            business = await Business.findById(manager.business);
        }

        if (!business) {
            return res.status(404).json({
                success: false,
                message: "Business not found or access denied"
            });
        }

        if (!business.settings) {
            business.settings = {};
        }

        business.settings.loyaltySettings = {
            enabled: loyaltySettings.enabled || false,
            pointsPerRupee: loyaltySettings.pointsPerRupee || 1,
            pointsExpiry: loyaltySettings.pointsExpiry || 365, // days
            tierMultipliers: {
                bronze: loyaltySettings.tierMultipliers?.bronze || 1,
                silver: loyaltySettings.tierMultipliers?.silver || 1.5,
                gold: loyaltySettings.tierMultipliers?.gold || 2,
                platinum: loyaltySettings.tierMultipliers?.platinum || 3
            },
            minPointsToRedeem: loyaltySettings.minPointsToRedeem || 100,
            ...loyaltySettings
        };

        business.markModified('settings'); // Required for nested objects
        await business.save();

        // Invalidate cache
        await deleteCache(`business:${business._id}`);

        return res.json({
            success: true,
            message: "Loyalty settings updated successfully",
            data: { loyaltySettings: business.settings.loyaltySettings }
        });
    } catch (err) {
        next(err);
    }
};

/**
 * Update business images (URLs)
 */
const updateBusinessImages = async (req, res, next) => {
    try {
        const { businessId, logo, banner, gallery } = req.body;
        const role = req.user.role;
        const userId = req.user.id;

        let business;
        if (role === 'admin') {
            if (!businessId || !isValidObjectId(businessId)) {
                return res.status(400).json({ success: false, message: "Valid Business ID is required for admins" });
            }
            business = await Business.findOne({ _id: businessId, admin: userId });
        } else {
            // Manager - can only update their own business
            const manager = await Manager.findById(userId);
            if (!manager) return res.status(404).json({ success: false, message: "Manager not found" });
            business = await Business.findById(manager.business);
        }

        if (!business) {
            return res.status(404).json({ success: false, message: "Business not found or access denied" });
        }

        // Initialize images object if it doesn't exist
        if (!business.images) {
            business.images = {};
        }

        // Update image URLs from request body
        if (logo !== undefined) business.images.logo = logo;
        if (banner !== undefined) business.images.banner = banner;
        if (gallery !== undefined && Array.isArray(gallery)) {
            business.images.gallery = gallery;
        }

        business.markModified('images');
        await business.save();

        // Invalidate cache
        await deleteCache(`business:${business._id}`);
        await deleteCache(`business:${business._id}:info`);

        return res.json({
            success: true,
            message: "Business images updated successfully",
            data: business.images
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getBusinessSettings,
    updateBusinessHours,
    updateAppointmentSettings,
    updateNotificationPreferences,
    addHoliday,
    removeHoliday,
    updatePaymentSettings,
    updateTaxSettings,
    updateGeneralSettings,
    updateLoyaltySettings,
    updateBusinessProfile,
    updateBusinessImages
};

