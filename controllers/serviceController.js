// serviceController.js - Service/Product catalog management
const Service = require("../models/Service");
const Business = require("../models/Business");
const Manager = require("../models/Manager");
const Appointment = require("../models/Appointment");
const { setCache, getCache, deleteCache } = require("../utils/cache");
const { getServicePriceAndDuration } = require("../utils/appointmentUtils");

// ================== Create Service ==================
const createService = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const serviceData = req.body;

        // Determine business ID
        let business;
        if (userRole === 'admin') {
            if (!serviceData.businessId) {
                return res.status(400).json({
                    success: false,
                    message: "Business ID is required"
                });
            }
            business = await Business.findOne({ _id: serviceData.businessId, admin: userId });
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            if (!manager) {
                return res.status(404).json({
                    success: false,
                    message: "Manager not found"
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

        // Remove businessId from serviceData to prevent override
        const { businessId, ...cleanServiceData } = serviceData;

        // Create service
        const service = await Service.create({
            ...cleanServiceData,
            business: business._id,
            createdBy: userId,
            createdByModel: userRole === 'admin' ? 'Admin' : 'Manager'
        });

        // Invalidate cache
        await deleteCache(`business:${business._id}:services`);

        return res.status(201).json({
            success: true,
            message: "Service created successfully",
            data: service
        });
    } catch (err) {
        next(err);
    }
};

// ================== Get Services ==================
const getServices = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const {
            businessId,
            page = 1,
            limit = 20,
            search,
            category,
            serviceType,
            isActive,
            minPrice,
            maxPrice,
            sortBy = 'displayOrder',
            sortOrder = 'asc'
        } = req.query;

        // Determine business ID
        let businessIds = [];
        let business;

        if (userRole === 'admin') {
            if (businessId) {
                business = await Business.findOne({ _id: businessId, admin: userId });
                if (business) businessIds = [business._id];
            } else {
                const businesses = await Business.find({ admin: userId }).select('_id');
                businessIds = businesses.map(b => b._id);
            }
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            if (manager) {
                business = await Business.findById(manager.business);
                if (business) businessIds = [business._id];
            }
        }

        if (businessIds.length === 0) {
            if (userRole === 'admin' && !businessId) {
                return res.json({
                    success: true,
                    data: [],
                    pagination: {
                        total: 0,
                        page: parseInt(page),
                        limit: parseInt(limit),
                        pages: 0
                    }
                });
            }
            return res.status(404).json({
                success: false,
                message: "Business not found or access denied"
            });
        }

        const cacheKeyPrefix = businessId ? `business:${businessId}` : `admin:${userId}`;
        const cacheKey = `${cacheKeyPrefix}:services:${page}:${limit}:${search}:${category}:${serviceType}:${isActive}:${minPrice}:${maxPrice}:${sortBy}:${sortOrder}`;

        // Try cache first
        // NOTE: Caching is disabled to ensure real-time booking stats are accurate.
        // const cachedData = await getCache(cacheKey);
        // if (cachedData) {
        //     return res.json({ success: true, source: "cache", ...cachedData });
        // }

        // Build query
        let query = {};
        if (businessIds.length === 1) {
            query.business = businessIds[0];
        } else {
            query.business = { $in: businessIds };
        }

        if (isActive !== undefined) {
            query.isActive = isActive === 'true';
        }

        if (category) {
            query.category = category;
        }

        if (serviceType) {
            query.serviceType = serviceType;
        }

        // Search
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { tags: { $regex: search, $options: 'i' } }
            ];
        }

        // Price filtering - handle both old format (price) and new format (pricingOptions)
        // Note: We'll filter in memory after fetching to handle both formats properly
        // WARNING: This in-memory filtering breaks pagination consistency.
        const minPriceFilter = minPrice ? Number(minPrice) : null;
        const maxPriceFilter = maxPrice ? Number(maxPrice) : null;

        // Sort options
        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

        let services = await Service.find(query)
            .populate('business', 'name')
            .populate('category', 'name')
            .populate('assignedStaff', 'name role')
            .populate('packageDetails.includedServices.service', 'name price')
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .sort(sortOptions)
            .lean();

        // Calculate real-time stats for these services
        const serviceIds = services.map(s => s._id);
        const bookingStats = await Appointment.aggregate([
            { $match: { service: { $in: serviceIds } } },
            {
                $group: {
                    _id: "$service",
                    count: { $sum: 1 },
                    revenue: { $sum: "$totalAmount" }
                }
            }
        ]);

        const statsMap = {};
        bookingStats.forEach(stat => {
            statsMap[stat._id.toString()] = {
                count: stat.count,
                revenue: stat.revenue || 0
            };
        });

        services.forEach(service => {
            if (!service.stats) service.stats = {};
            const stats = statsMap[service._id.toString()] || { count: 0, revenue: 0 };
            service.stats.totalBookings = stats.count;
            service.stats.totalRevenue = stats.revenue;
        });

        // Filter by price if minPrice or maxPrice specified (handle both old and new format)
        if (minPriceFilter !== null || maxPriceFilter !== null) {
            services = services.filter(service => {
                const { price } = getServicePriceAndDuration(service);
                if (minPriceFilter !== null && price < minPriceFilter) return false;
                if (maxPriceFilter !== null && price > maxPriceFilter) return false;
                return true;
            });
        }

        // Get total count (need to recalculate if price filtering was applied)
        let total;
        if (minPriceFilter !== null || maxPriceFilter !== null) {
            // If price filtering, we need to count after filtering
            const allServices = await Service.find(query).lean();
            total = allServices.filter(service => {
                const { price } = getServicePriceAndDuration(service);
                if (minPriceFilter !== null && price < minPriceFilter) return false;
                if (maxPriceFilter !== null && price > maxPriceFilter) return false;
                return true;
            }).length;
        } else {
            total = await Service.countDocuments(query);
        }

        const response = {
            success: true,
            data: services,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        };

        // Cache for 5 minutes
        // await setCache(cacheKey, response, 300);

        return res.json(response);
    } catch (err) {
        next(err);
    }
};

// ================== Get Service by ID ==================
const getServiceById = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { id } = req.params;

        const service = await Service.findById(id)
            .populate('business', 'name type branch')
            .populate('assignedStaff', 'name role phone email')
            .populate('packageDetails.includedServices.service')
            .populate('membershipDetails.includedServices.service')
            .lean();

        if (!service) {
            return res.status(404).json({
                success: false,
                message: "Service not found"
            });
        }

        // Get business ID (handle both populated and unpopulated)
        const businessId = service.business?._id || service.business;

        // Verify access
        if (userRole === 'admin') {
            const business = await Business.findOne({
                _id: businessId,
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
            if (manager.business.toString() !== businessId.toString()) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied"
                });
            }
        }

        // Calculate real-time stats
        const bookingStats = await Appointment.aggregate([
            { $match: { service: service._id } },
            {
                $group: {
                    _id: "$service",
                    count: { $sum: 1 },
                    revenue: { $sum: "$totalAmount" }
                }
            }
        ]);

        if (!service.stats) service.stats = {};
        service.stats.totalBookings = bookingStats.length > 0 ? bookingStats[0].count : 0;
        service.stats.totalRevenue = bookingStats.length > 0 ? bookingStats[0].revenue : 0;

        return res.json({
            success: true,
            data: service
        });
    } catch (err) {
        next(err);
    }
};

// ================== Update Service ==================
const updateService = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { id } = req.params;
        const updates = req.body;

        const service = await Service.findById(id);

        if (!service) {
            return res.status(404).json({
                success: false,
                message: "Service not found"
            });
        }

        // Verify access
        if (userRole === 'admin') {
            const business = await Business.findOne({
                _id: service.business,
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
            if (manager.business.toString() !== service.business.toString()) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied"
                });
            }
        }

        // Remove protected fields from updates (cannot be changed)
        const { business, businessId, createdBy, createdByModel, _id, __v, ...allowedUpdates } = updates;

        // Update service
        Object.assign(service, allowedUpdates);
        service.updatedBy = userId;
        service.updatedByModel = userRole === 'admin' ? 'Admin' : 'Manager';

        await service.save();

        // Invalidate cache
        await deleteCache(`business:${service.business}:services`);

        return res.json({
            success: true,
            message: "Service updated successfully",
            data: service
        });
    } catch (err) {
        next(err);
    }
};

// ================== Delete Service ==================
const deleteService = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { id } = req.params;

        const service = await Service.findById(id);

        if (!service) {
            return res.status(404).json({
                success: false,
                message: "Service not found"
            });
        }

        // Store business ID for cache invalidation before deletion
        const businessId = service.business;

        // Verify access
        if (userRole === 'admin') {
            const business = await Business.findOne({
                _id: businessId,
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
            if (manager.business.toString() !== businessId.toString()) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied"
                });
            }
        }

        // Hard delete - remove from database
        await Service.findByIdAndDelete(id);

        // Invalidate cache
        await deleteCache(`business:${businessId}:services`);

        return res.json({
            success: true,
            message: "Service deleted successfully"
        });
    } catch (err) {
        next(err);
    }
};

// ================== Public Business Services (for booking) ==================
const getPublicBusinessServices = async (req, res, next) => {
    try {
        const { identifier } = req.params;
        if (!identifier) {
            return res.status(400).json({
                success: false,
                message: "Business identifier is required"
            });
        }

        const isObjectId = /^[a-f\d]{24}$/i.test(identifier);
        const business = await Business.findOne({
            isActive: true,
            $or: [
                { businessLink: identifier },
                ...(isObjectId ? [{ _id: identifier }] : [])
            ]
        })
            .select("_id name branch description phone email website images settings appointmentSettings")
            .lean();

        if (!business) {
            return res.status(404).json({
                success: false,
                message: "Business not found"
            });
        }

        const services = await Service.find({
            business: business._id,
            isActive: true,
            $or: [
                { allowOnlineBooking: { $ne: false } },
                { allowOnlineBooking: { $exists: false } }
            ]
        })
            .select("name description category serviceType pricingType price duration bufferTime currency pricingOptions allowOnlineBooking availableDays tags images thumbnail stats ratings displayOrder")
            .sort({ displayOrder: 1, name: 1 })
            .lean();

        const { getServicePriceAndDuration } = require("../utils/appointmentUtils");

        const normalizedServices = services.map((service) => {
            const { price, duration } = getServicePriceAndDuration(service);

            return {
                _id: service._id,
                name: service.name,
                description: service.description,
                category: service.category,
                serviceType: service.serviceType,
                pricingType: service.pricingType,
                price: service.price,
                duration: service.duration,
                bufferTime: service.bufferTime,
                currency: service.currency || business.settings?.currency || "INR",
                allowOnlineBooking: service.allowOnlineBooking !== false,
                availableDays: service.availableDays || [],
                tags: service.tags || [],
                thumbnail: service.thumbnail || service.images?.thumbnail || null,
                images: service.images || {},
                stats: service.stats || {},
                ratings: service.ratings || {},
                defaultPrice: price,
                defaultDuration: duration,
                pricingOptions: (service.pricingOptions || []).map((option) => ({
                    _id: option._id,
                    name: option.name,
                    label: option.name || (option.duration ? `${option.duration} min` : "Option"),
                    duration: option.duration,
                    price: option.price,
                    originalPrice: option.originalPrice || null,
                    isActive: option.isActive !== false
                }))
            };
        });

        return res.json({
            success: true,
            data: {
                business: {
                    _id: business._id,
                    name: business.name,
                    branch: business.branch,
                    description: business.description,
                    phone: business.phone,
                    email: business.email,
                    website: business.website,
                    images: business.images || {},
                    appointmentSettings: business.settings?.appointmentSettings || {},
                    currency: business.settings?.currency || "INR",
                    allowOnlineBooking:
                        business.settings?.appointmentSettings?.allowOnlineBooking !== false,
                    onlineDiscount: process.env.ONLINE_DISCOUNT ? parseInt(process.env.ONLINE_DISCOUNT) : 0
                },
                services: normalizedServices
            }
        });
    } catch (err) {
        next(err);
    }
};

// ================== Get Popular Services ==================
const getPopularServices = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { businessId, limit = 10 } = req.query;

        // Determine business ID
        let businessIds = [];
        let business;

        if (userRole === 'admin') {
            if (businessId) {
                business = await Business.findOne({ _id: businessId, admin: userId });
                if (business) businessIds = [business._id];
            } else {
                const businesses = await Business.find({ admin: userId }).select('_id');
                businessIds = businesses.map(b => b._id);
            }
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            if (manager) {
                business = await Business.findById(manager.business);
                if (business) businessIds = [business._id];
            }
        }

        if (businessIds.length === 0) {
            if (userRole === 'admin' && !businessId) {
                return res.json({
                    success: true,
                    data: []
                });
            }
            return res.status(404).json({
                success: false,
                message: "Business not found or access denied"
            });
        }

        let services = [];
        // If specific business or manager, use the model method (which might be optimized for single business)
        // However, the model method likely takes a single ID.
        // If we have multiple businesses, we might need to aggregate or loop.
        // For simplicity and performance, if multiple businesses, we might need a custom query here or update the model method.
        // Let's check if we can just use Service.find with sort for popular.

        if (businessIds.length === 1) {
            services = await Service.getPopularServices(businessIds[0], parseInt(limit));
        } else {
            // Manual implementation for multiple businesses
            services = await Service.find({
                business: { $in: businessIds },
                isActive: true
            })
                .sort({ 'stats.totalBookings': -1, 'ratings.average': -1 })
                .limit(parseInt(limit))
                .populate('business', 'name')
                .lean();
        }

        // Ensure we have plain objects and calculate real-time stats
        const plainServices = services.map(s => s.toObject ? s.toObject() : s);

        const serviceIds = plainServices.map(s => s._id);
        if (serviceIds.length > 0) {
            const bookingStats = await Appointment.aggregate([
                { $match: { service: { $in: serviceIds } } },
                { $group: { _id: "$service", count: { $sum: 1 } } }
            ]);

            const statsMap = {};
            bookingStats.forEach(stat => {
                statsMap[stat._id.toString()] = stat.count;
            });

            plainServices.forEach(service => {
                if (!service.stats) service.stats = {};
                service.stats.totalBookings = statsMap[service._id.toString()] || 0;
            });
        }

        return res.json({
            success: true,
            data: plainServices
        });
    } catch (err) {
        next(err);
    }
};

// ================== Get Featured Services ==================
const getFeaturedServices = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { businessId } = req.query;

        // Determine business ID
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

        const services = await Service.getFeaturedServices(business._id);

        // Ensure we have plain objects and calculate real-time stats
        const plainServices = services.map(s => s.toObject ? s.toObject() : s);

        const serviceIds = plainServices.map(s => s._id);
        if (serviceIds.length > 0) {
            const bookingStats = await Appointment.aggregate([
                { $match: { service: { $in: serviceIds } } },
                { $group: { _id: "$service", count: { $sum: 1 } } }
            ]);

            const statsMap = {};
            bookingStats.forEach(stat => {
                statsMap[stat._id.toString()] = stat.count;
            });

            plainServices.forEach(service => {
                if (!service.stats) service.stats = {};
                service.stats.totalBookings = statsMap[service._id.toString()] || 0;
            });
        }

        return res.json({
            success: true,
            data: plainServices
        });
    } catch (err) {
        next(err);
    }
};

// ================== Get Service Categories ==================
const getServiceCategories = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { businessId } = req.query;

        // Determine business ID
        let businessIds = [];
        let business;

        if (userRole === 'admin') {
            if (businessId) {
                business = await Business.findOne({ _id: businessId, admin: userId });
                if (business) businessIds = [business._id];
            } else {
                const businesses = await Business.find({ admin: userId }).select('_id');
                businessIds = businesses.map(b => b._id);
            }
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            if (manager) {
                business = await Business.findById(manager.business);
                if (business) businessIds = [business._id];
            }
        }

        if (businessIds.length === 0) {
            if (userRole === 'admin' && !businessId) {
                return res.json({
                    success: true,
                    data: []
                });
            }
            return res.status(404).json({
                success: false,
                message: "Business not found or access denied"
            });
        }

        // Get unique categories with service count
        // First get all services to calculate average price (handling both old and new format)
        let query = { isActive: true };
        if (businessIds.length === 1) {
            query.business = businessIds[0];
        } else {
            query.business = { $in: businessIds };
        }

        const allServices = await Service.find(query).lean();
        const { getServicePriceAndDuration } = require("../utils/appointmentUtils");

        // Group by category and calculate averages
        const categoryMap = {};
        allServices.forEach(service => {
            const category = service.category;
            const { price } = getServicePriceAndDuration(service);

            if (!categoryMap[category]) {
                categoryMap[category] = { count: 0, totalPrice: 0 };
            }
            categoryMap[category].count += 1;
            categoryMap[category].totalPrice += price;
        });

        const categories = Object.entries(categoryMap)
            .map(([category, data]) => ({
                category,
                serviceCount: data.count,
                averagePrice: Math.round(data.totalPrice / data.count)
            }))
            .sort((a, b) => b.serviceCount - a.serviceCount);

        return res.json({
            success: true,
            data: categories
        });
    } catch (err) {
        next(err);
    }
};

// ================== Update Inventory ==================
const updateInventory = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { quantity, action } = req.body; // action: 'add' or 'reduce'

        if (!quantity || quantity <= 0) {
            return res.status(400).json({
                success: false,
                message: "Valid quantity is required"
            });
        }

        const service = await Service.findById(id);

        if (!service) {
            return res.status(404).json({
                success: false,
                message: "Service not found"
            });
        }

        if (!service.inventory.trackInventory) {
            return res.status(400).json({
                success: false,
                message: "Inventory tracking is not enabled for this service"
            });
        }

        let success = false;
        if (action === 'add') {
            await service.addInventory(quantity);
            success = true;
        } else if (action === 'reduce') {
            success = await service.reduceInventory(quantity);
        }

        if (!success) {
            return res.status(400).json({
                success: false,
                message: "Insufficient inventory"
            });
        }

        return res.json({
            success: true,
            message: `Inventory ${action === 'add' ? 'added' : 'reduced'} successfully`,
            data: {
                currentStock: service.inventory.currentStock,
                isLowStock: service.isLowStock
            }
        });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    createService,
    getServices,
    getServiceById,
    updateService,
    deleteService,
    getPublicBusinessServices,
    getPopularServices,
    getFeaturedServices,
    getServiceCategories,
    updateInventory
};

