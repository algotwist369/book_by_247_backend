// reviewController.js - Review and rating management
const Review = require("../models/Review");
const Customer = require("../models/Customer");
const Business = require("../models/Business");
const Manager = require("../models/Manager");
const { setCache, getCache, deleteCache } = require("../utils/cache");

// ================== Create Review ==================
const createReview = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const {
            businessId,
            customerId,
            appointmentId,
            serviceId,
            staffId,
            rating,
            title,
            review,
            ratings,
            images,
            source = "website"
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

        // Create customer snapshot
        const customerSnapshot = {
            name: customer.fullName,
            email: customer.email,
            totalVisits: customer.totalVisits
        };

        // Create review
        const newReview = await Review.create({
            business: business._id,
            customer: customerId,
            appointment: appointmentId,
            service: serviceId,
            staff: staffId,
            rating,
            title,
            review,
            ratings,
            images,
            source,
            customerSnapshot,
            status: 'approved', // Auto-approve for now
            isPublished: true,
            isVerified: true
        });

        // Update business rating
        const avgRating = await Review.getBusinessAverageRating(business._id);
        await Business.findByIdAndUpdate(business._id, {
            'ratings.average': avgRating.averageRating,
            'ratings.count': avgRating.totalReviews
        });

        // Invalidate cache
        await deleteCache(`business:${business._id}:reviews`);

        return res.status(201).json({
            success: true,
            message: "Review submitted successfully",
            data: newReview
        });
    } catch (err) {
        next(err);
    }
};

// ================== Get Reviews ==================
const getReviews = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const {
            businessId,
            page = 1,
            limit = 20,
            rating,
            status,
            isPublished,
            customerId,
            serviceId,
            staffId,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

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

        const cacheKey = `business:${business._id}:reviews:${page}:${limit}:${rating}:${status}:${isPublished}:${customerId}:${serviceId}:${staffId}:${sortBy}:${sortOrder}`;

        // Try cache first
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            return res.json({ success: true, source: "cache", ...cachedData });
        }

        // Build query
        let query = { business: business._id };

        if (rating) {
            query.rating = Number(rating);
        }

        if (status) {
            query.status = status;
        }

        if (isPublished !== undefined) {
            query.isPublished = isPublished === 'true';
        }

        if (customerId) {
            query.customer = customerId;
        }

        if (serviceId) {
            query.service = serviceId;
        }

        if (staffId) {
            query.staff = staffId;
        }

        // Sort options
        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

        const reviews = await Review.find(query)
            .populate('customer', 'firstName lastName phone email')
            .populate('service', 'name')
            .populate('staff', 'name role')
            .populate('appointment', 'bookingNumber appointmentDate')
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .sort(sortOptions)
            .lean();

        const total = await Review.countDocuments(query);

        const response = {
            success: true,
            data: reviews,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        };

        // Cache for 3 minutes
        await setCache(cacheKey, response, 180);

        return res.json(response);
    } catch (err) {
        next(err);
    }
};

// ================== Get Review by ID ==================
const getReviewById = async (req, res, next) => {
    try {
        const { id } = req.params;

        const review = await Review.findById(id)
            .populate('business', 'name type branch')
            .populate('customer', 'firstName lastName phone email totalVisits')
            .populate('service', 'name category price')
            .populate('staff', 'name role')
            .populate('appointment', 'bookingNumber appointmentDate')
            .populate('response.respondedBy');

        if (!review) {
            return res.status(404).json({
                success: false,
                message: "Review not found"
            });
        }

        return res.json({
            success: true,
            data: review
        });
    } catch (err) {
        next(err);
    }
};

// ================== Update Review ==================
const updateReview = async (req, res, next) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const review = await Review.findById(id);

        if (!review) {
            return res.status(404).json({
                success: false,
                message: "Review not found"
            });
        }

        // Mark as edited
        if (updates.review || updates.rating) {
            review.isEdited = true;
            review.editedAt = new Date();
        }

        // Update review
        Object.assign(review, updates);
        await review.save();

        // Update business rating if rating changed
        if (updates.rating) {
            const avgRating = await Review.getBusinessAverageRating(review.business);
            await Business.findByIdAndUpdate(review.business, {
                'ratings.average': avgRating.averageRating,
                'ratings.count': avgRating.totalReviews
            });
        }

        // Invalidate cache
        await deleteCache(`business:${review.business}:reviews`);

        return res.json({
            success: true,
            message: "Review updated successfully",
            data: review
        });
    } catch (err) {
        next(err);
    }
};

// ================== Approve Review ==================
const approveReview = async (req, res, next) => {
    try {
        const { id } = req.params;

        const review = await Review.findById(id);

        if (!review) {
            return res.status(404).json({
                success: false,
                message: "Review not found"
            });
        }

        await review.approve();

        // Update business rating
        const avgRating = await Review.getBusinessAverageRating(review.business);
        await Business.findByIdAndUpdate(review.business, {
            'ratings.average': avgRating.averageRating,
            'ratings.count': avgRating.totalReviews
        });

        // Invalidate cache
        await deleteCache(`business:${review.business}:reviews`);

        return res.json({
            success: true,
            message: "Review approved successfully"
        });
    } catch (err) {
        next(err);
    }
};

// ================== Reject Review ==================
const rejectReview = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { id } = req.params;
        const { reason } = req.body;

        const review = await Review.findById(id);

        if (!review) {
            return res.status(404).json({
                success: false,
                message: "Review not found"
            });
        }

        await review.reject(
            reason,
            userId,
            userRole === 'admin' ? 'Admin' : 'Manager'
        );

        // Invalidate cache
        await deleteCache(`business:${review.business}:reviews`);

        return res.json({
            success: true,
            message: "Review rejected successfully"
        });
    } catch (err) {
        next(err);
    }
};

// ================== Flag Review ==================
const flagReview = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        const review = await Review.findById(id);

        if (!review) {
            return res.status(404).json({
                success: false,
                message: "Review not found"
            });
        }

        await review.flag(reason);

        // Invalidate cache
        await deleteCache(`business:${review.business}:reviews`);

        return res.json({
            success: true,
            message: "Review flagged for moderation"
        });
    } catch (err) {
        next(err);
    }
};

// ================== Add Response to Review ==================
const addResponse = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { id } = req.params;
        const { response } = req.body;

        if (!response) {
            return res.status(400).json({
                success: false,
                message: "Response text is required"
            });
        }

        const review = await Review.findById(id);

        if (!review) {
            return res.status(404).json({
                success: false,
                message: "Review not found"
            });
        }

        await review.addResponse(
            response,
            userId,
            userRole === 'admin' ? 'Admin' : 'Manager'
        );

        // Invalidate cache
        await deleteCache(`business:${review.business}:reviews`);

        return res.json({
            success: true,
            message: "Response added successfully",
            data: review.response
        });
    } catch (err) {
        next(err);
    }
};

// ================== Mark Review as Helpful ==================
const markHelpful = async (req, res, next) => {
    try {
        const { id } = req.params;

        const review = await Review.findById(id);

        if (!review) {
            return res.status(404).json({
                success: false,
                message: "Review not found"
            });
        }

        await review.markHelpful();

        return res.json({
            success: true,
            message: "Review marked as helpful",
            data: {
                helpfulCount: review.helpfulCount,
                helpfulPercentage: review.helpfulPercentage
            }
        });
    } catch (err) {
        next(err);
    }
};

// ================== Get Review Statistics ==================
const getReviewStats = async (req, res, next) => {
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

        const cacheKey = `business:${business._id}:review:stats`;

        // Try cache first
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            return res.json({ success: true, source: "cache", data: cachedData });
        }

        const stats = await Review.getBusinessAverageRating(business._id);

        // Cache for 5 minutes
        await setCache(cacheKey, stats, 300);

        return res.json({
            success: true,
            data: stats
        });
    } catch (err) {
        next(err);
    }
};

// ================== Get Featured Reviews ==================
const getFeaturedReviews = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { businessId, limit = 5 } = req.query;

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

        const reviews = await Review.getFeaturedReviews(business._id, parseInt(limit));

        return res.json({
            success: true,
            data: reviews
        });
    } catch (err) {
        next(err);
    }
};

// ================== Delete Review ==================
const deleteReview = async (req, res, next) => {
    try {
        const { id } = req.params;

        const review = await Review.findById(id);

        if (!review) {
            return res.status(404).json({
                success: false,
                message: "Review not found"
            });
        }

        const businessId = review.business;

        await Review.findByIdAndDelete(id);

        // Update business rating
        const avgRating = await Review.getBusinessAverageRating(businessId);
        await Business.findByIdAndUpdate(businessId, {
            'ratings.average': avgRating.averageRating,
            'ratings.count': avgRating.totalReviews
        });

        // Invalidate cache
        await deleteCache(`business:${businessId}:reviews`);

        return res.json({
            success: true,
            message: "Review deleted successfully"
        });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    createReview,
    getReviews,
    getReviewById,
    updateReview,
    approveReview,
    rejectReview,
    flagReview,
    addResponse,
    markHelpful,
    getReviewStats,
    getFeaturedReviews,
    deleteReview
};

