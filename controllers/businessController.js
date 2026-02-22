// businessController.js - Business-specific operations for managers and admins
const Business = require("../models/Business");
const Review = require("../models/Review");
const mongoose = require("mongoose");

// Fetch services for all businesses
const Service = require("../models/Service");


// Helper function to validate MongoDB ObjectId
const isValidObjectId = (id) => {
    if (!id || id === 'undefined' || id === 'null') {
        return false;
    }
    return mongoose.Types.ObjectId.isValid(id);
};
const Staff = require("../models/Staff");
const Manager = require("../models/Manager");
const DailyBusiness = require("../models/DailyBusiness");
const { setCache, getCache } = require("../utils/cache");
const { generateBusinessAnalytics } = require("../utils/businessUtils");
const indiaLocations = require("../data/indiaLocations");
const { encryptResponse } = require("../utils/encryptionUtils");
const googlePlaces = require("../utils/googlePlaces");

// Pre-compute known locations for fast lookup
const knownLocations = new Set();
const knownStates = new Set();
// Initialize knownLocations
(function initKnownLocations() {
    if (Array.isArray(indiaLocations)) {
        indiaLocations.forEach(loc => {
            if (loc.state) {
                const stateLower = loc.state.toLowerCase();
                knownLocations.add(stateLower);
                knownStates.add(stateLower);
            }
            if (loc.cities && Array.isArray(loc.cities)) {
                loc.cities.forEach(city => knownLocations.add(city.toLowerCase()));
            }
        });
    }
})();

const isKnownLocation = (text) => {
    if (!text) return false;
    const clean = text.trim().toLowerCase();
    if (knownLocations.has(clean)) return true;
    const parts = clean.split(',').map(p => p.trim());
    return parts.some(p => knownLocations.has(p));
};

// ===========================================
//              PUBLIC CONTROLLERS  
// ===========================================

// ================== Get All Public Businesses (Public) ==================
const getPublicBusinesses = async (req, res, next) => {
    try {
        const {
            page = 1,
            limit = 20,
            type,
            cursor
        } = req.query;

        const limitNumber = Math.min(Math.max(parseInt(limit) || 20, 1), 50);
        const pageNumber = Math.max(1, parseInt(page) || 1);
        const useCursor = Boolean(cursor);

        let cursorDate = null;
        if (cursor) {
            const parsedDate = new Date(cursor);
            if (Number.isNaN(parsedDate.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid cursor value",
                    code: "INVALID_CURSOR"
                });
            }
            cursorDate = parsedDate;
        }

        const cacheKey = useCursor
            ? `public:businesses:v3:cursor:${cursor || 'start'}:${limitNumber}:${type || 'all'}`
            : `public:businesses:v3:page:${pageNumber}:${limitNumber}:${type || 'all'}`;

        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            return res.json({ success: true, source: "cache", ...cachedData });
        }

        const matchStage = {
            isActive: true,
            isActiveFromSuperAdmin: { $ne: false }
            // 'settings.appointmentSettings.allowOnlineBooking': true // Relaxed for better visibility
        };

        if (type && ['salon', 'spa', 'beauty'].includes(type)) {
            matchStage.type = type;
        }

        if (cursorDate) {
            matchStage.createdAt = { $lt: cursorDate };
        }

        const skip = useCursor ? 0 : (pageNumber - 1) * limitNumber;

        const pipeline = [
            { $match: matchStage },
            // Add a random field for randomization within rating tiers
            { $addFields: { randomSort: { $rand: {} } } },
            // Sort by ratings.average descending, then by the random field
            { $sort: { "ratings.average": -1, randomSort: 1 } },
            { $skip: skip },
            { $limit: limitNumber },
            {
                $project: {
                    name: 1, type: 1, branch: 1, city: 1, phone: 1, images: 1,
                    ratings: 1, slug: 1, createdAt: 1, seo: 1
                }
            }
        ];

        const businesses = await Business.aggregate(pipeline);

        const formattedBusinesses = businesses.map(business => ({
            id: business._id,
            name: business.name,
            type: business.type,
            branch: business.branch,
            city: business.city,
            phone: business.phone,
            images: business.images,
            ratings: business.ratings,
            seo: business.seo,
            slug: business.slug,
            createdAt: business.createdAt
        }));

        let total = null;
        if (!useCursor) {
            total = await Business.countDocuments(matchStage);
        }

        const lastBusiness = formattedBusinesses[formattedBusinesses.length - 1];
        const nextCursor = lastBusiness
            ? {
                cursor: lastBusiness.createdAt?.toISOString?.() || new Date().toISOString(),
                cursorId: lastBusiness.id
            }
            : null;

        const response = {
            businesses: formattedBusinesses,
            pagination: useCursor
                ? null
                : {
                    total,
                    page: pageNumber,
                    limit: limitNumber,
                    pages: total ? Math.ceil(total / limitNumber) : null,
                    hasMore: total ? pageNumber * limitNumber < total : false
                },
            cursorPagination: {
                cursor: cursorDate ? cursorDate.toISOString() : null,
                limit: limitNumber,
                nextCursor: formattedBusinesses.length === limitNumber ? nextCursor : null,
                hasMore: formattedBusinesses.length === limitNumber
            }
        };

        const secureResponse = {
            success: true,
            message: "fetched successfully",
            payload: encryptResponse(response)
        };

        await setCache(cacheKey, secureResponse, 300);

        return res.json(secureResponse);
    } catch (err) {
        next(err);
    }
};

// ================== Get Business Info by Link (Public) ==================
const getBusinessInfoByLink = async (req, res, next) => {
    try {
        const { businessLink } = req.params;

        const business = await Business.findOne({ businessLink, isActive: true, isActiveFromSuperAdmin: true })
            .select('name type branch address city state country zipCode phone alternatePhone email website description settings businessLink images google360ImageUrl videos socialMedia location googleMapsUrl ratings features amenities category subCategory tags specialties capacity paymentMethods seo')
            .lean();

        if (!business) {
            return res.status(404).json({
                success: false,
                message: "Business not found"
            });
        }

        // Return comprehensive public business information
        const businessInfo = {
            id: business._id,
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
            businessLink: business.businessLink,
            // Location & Maps
            location: business.location,
            googleMapsUrl: business.googleMapsUrl,
            // Media
            images: business.images,
            socialMedia: business.socialMedia,
            // Ratings & Reviews
            ratings: business.ratings,
            // Category & Tags
            category: business.category,
            subCategory: business.subCategory,
            tags: business.tags,
            specialties: business.specialties,
            // Capacity
            capacity: business.capacity,
            // Features & Amenities
            features: business.features,
            amenities: business.amenities,
            // Payment Methods
            paymentMethods: business.paymentMethods,
            // Settings
            workingHours: business.settings?.workingHours,
            appointmentSettings: business.settings?.appointmentSettings,
            currency: business.settings?.currency,
            timezone: business.settings?.timezone,
            seo: business.seo
        };

        return res.json({ success: true, data: businessInfo });
    } catch (err) {
        next(err);
    }
};

// ================== Get Business Info by Slug (Public) ==================
const getBusinessBySlug = async (req, res, next) => {
    try {
        const { slug } = req.params;

        if (!slug) {
            return res.status(400).json({
                success: false,
                message: "Slug is required"
            });
        }

        const business = await Business.findOne({
            slug,
            isActive: true,
            isActiveFromSuperAdmin: true
        })
            .select('name type branch address city state country zipCode phone alternatePhone email website description settings businessLink slug images google360ImageUrl videos socialMedia location googleMapsUrl ratings features amenities category subCategory tags specialties capacity paymentMethods seo')
            .lean();

        if (!business) {
            return res.status(404).json({
                success: false,
                message: "Business not found"
            });
        }

        const services = await Service.find({
            business: business._id,
            isActive: true
        })
            .select('name description shortDescription category subCategory price originalPrice currency pricingType pricingOptions serviceType duration bufferTime images thumbnail ratings isFeatured displayOrder')
            .sort({ displayOrder: 1, name: 1 })
            .lean();

        // Fetch recent approved reviews for this business
        const recentReviews = await Review.find({
            business: business._id,
            status: 'approved',
            isPublished: true
        })
            .populate('customer', 'firstName lastName avatar fullName')
            .sort({ createdAt: -1 })
            .limit(5)
            .lean();

        // Return comprehensive public business information (consistent with getBusinessInfoByLink)
        const businessInfo = {
            id: business._id,
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
            // Location & Maps
            location: business.location,
            googleMapsUrl: business.googleMapsUrl,
            // Media
            images: business.images,
            socialMedia: business.socialMedia,
            // Ratings & Reviews
            ratings: business.ratings,
            // Category & Tags
            category: business.category,
            subCategory: business.subCategory,
            tags: business.tags,
            specialties: business.specialties,
            // Capacity
            capacity: business.capacity,
            // Features & Amenities
            features: business.features,
            amenities: business.amenities,
            // Settings
            workingHours: business.settings?.workingHours,
            currency: business.settings?.currency || "INR",
            timezone: business.settings?.timezone || "Asia/Kolkata",
            seo: business.seo,
            services: services,
            reviewsList: recentReviews.map(r => {
                const authorName = r.customer ?
                    (`${r.customer.firstName || ''} ${r.customer.lastName || ''}`).trim() :
                    "Anonymous";

                return {
                    id: r._id,
                    author: authorName || "Anonymous",
                    avatar: r.customer?.avatar || r.customer?.profilePicture || `https://ui-avatars.com/api/?name=${encodeURIComponent(authorName || 'U')}&background=random`,
                    rating: r.rating,
                    content: r.review,
                    date: new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
                    images: r.images || []
                };
            })
        };

        return res.json({ success: true, data: businessInfo });
    } catch (err) {
        next(err);
    }
};

// ================== Get Businesses Near Location (Public - Geospatial Query) ==================
const getBusinessesNearby = async (req, res, next) => {
    try {
        const {
            lat,
            lng,
            maxDistance = 3000,
            type,
            page = 1,
            limit = 20,
            cursorDistance,
            cursorId
        } = req.query;

        // ================== Input Validation & Sanitization ==================
        if (!lat || !lng) {
            return res.status(400).json({
                success: false,
                message: "Latitude and longitude are required",
                code: "MISSING_COORDINATES"
            });
        }

        const latitude = parseFloat(lat);
        const longitude = parseFloat(lng);

        if (isNaN(latitude) || isNaN(longitude)) {
            return res.status(400).json({
                success: false,
                message: "Invalid latitude or longitude format",
                code: "INVALID_COORDINATES"
            });
        }

        if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
            return res.status(400).json({
                success: false,
                message: "Invalid coordinate ranges",
                code: "INVALID_COORDINATE_RANGE"
            });
        }

        const maxDistanceMeters = Math.min(Math.max(parseInt(maxDistance) || 15000, 100), 100000); // Increased default to 15km
        const pageNumber = Math.max(1, parseInt(page) || 1);
        const limitNumber = Math.min(Math.max(parseInt(limit) || 20, 1), 50);

        console.log(`[getBusinessesNearby] Lat/Lng: ${latitude}/${longitude}, MaxDist: ${maxDistanceMeters}`);

        const parsedCursorDistance = cursorDistance !== undefined ? parseFloat(cursorDistance) : null;
        const hasCursorDistance = typeof parsedCursorDistance === 'number' && !Number.isNaN(parsedCursorDistance) && parsedCursorDistance >= 0;
        const cursorObjectId = cursorId && mongoose.Types.ObjectId.isValid(cursorId) ? new mongoose.Types.ObjectId(cursorId) : null;
        const useCursor = hasCursorDistance || !!cursorObjectId;

        const skip = useCursor ? 0 : (pageNumber - 1) * limitNumber;

        // ================== Cache Check ==================
        const cacheKey = useCursor
            ? `nearby:v3:${latitude.toFixed(4)}:${longitude.toFixed(4)}:${maxDistanceMeters}:${type || 'all'}:cursor:${hasCursorDistance ? parsedCursorDistance : 'none'}:${cursorObjectId || 'none'}:${limitNumber}`
            : `nearby:v3:${latitude.toFixed(4)}:${longitude.toFixed(4)}:${maxDistanceMeters}:${type || 'all'}:page:${pageNumber}:${limitNumber}`;

        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            return res.json({ success: true, source: "cache", ...cachedData });
        }

        // ================== Build Query ==================
        const baseQuery = {
            isActive: true,
            isActiveFromSuperAdmin: { $ne: false },
            // 'settings.appointmentSettings.allowOnlineBooking': true, // Relaxed for better visibility
            location: { $exists: true, $ne: null }
        };

        if (type && ['salon', 'spa', 'beauty'].includes(type)) {
            baseQuery.type = type;
        }

        // ================== Aggregation Pipeline ==================
        const pipeline = [
            {
                $geoNear: {
                    near: { type: "Point", coordinates: [longitude, latitude] },
                    distanceField: "distance",
                    maxDistance: maxDistanceMeters,
                    spherical: true,
                    query: baseQuery
                }
            },
            {
                $project: {
                    name: 1, type: 1, branch: 1, address: 1, city: 1, phone: 1,
                    images: 1, ratings: 1, category: 1, tags: 1,
                    'settings.workingHours': 1, 'settings.appointmentSettings': 1,
                    distance: 1, slug: 1, seo: 1
                }
            },
            {
                $facet: {
                    data: [{ $skip: skip }, { $limit: limitNumber }],
                    metadata: [{ $count: "total" }]
                }
            }
        ];

        let result = await Business.aggregate(pipeline).allowDiskUse(true);
        const businesses = result[0]?.data || [];
        const total = useCursor ? null : (result[0]?.metadata?.[0]?.total || 0);

        // ================== Fetch Services & Process Stats ==================
        const businessIds = businesses.map(b => b._id);
        const servicesMap = {};

        if (businessIds.length > 0) {
            const services = await Service.find({
                business: { $in: businessIds },
                isActive: true,
                isAvailableOnline: true
            }).select('name price duration category business pricingOptions').lean();

            const { getServicePriceAndDuration } = require("../utils/appointmentUtils");

            services.forEach(service => {
                if (!servicesMap[service.business]) servicesMap[service.business] = [];
                if (servicesMap[service.business].length < 5) {
                    const { price, duration } = getServicePriceAndDuration(service);
                    servicesMap[service.business].push({
                        name: service.name,
                        price,
                        duration,
                        category: service.category
                    });
                }
            });
        }

        // Helper to check if business is open
        const { isBusinessOpen } = require("../utils/businessUtils");

        const formattedBusinesses = businesses.map(business => {
            const distance = business.distance || 0;
            return {
                id: business._id,
                name: business.name,
                type: business.type,
                branch: business.branch,
                address: business.address,
                city: business.city,
                images: business.images,
                ratings: business.ratings || { average: 0, totalReviews: 0 },
                distance: Math.round(distance),
                distanceKm: parseFloat((distance / 1000).toFixed(2)),
                slug: business.slug,
                isOpen: isBusinessOpen(business.settings?.workingHours),
                services: servicesMap[business._id] || [],
                seo: business.seo
            };
        });

        const lastBusiness = formattedBusinesses[formattedBusinesses.length - 1];
        const nextCursor = lastBusiness ? { cursorDistance: lastBusiness.distance, cursorId: lastBusiness.id } : null;

        const response = {
            data: formattedBusinesses,
            pagination: useCursor ? null : { total, page: pageNumber, limit: limitNumber, pages: Math.ceil(total / limitNumber) },
            searchLocation: { latitude, longitude, radius: maxDistanceMeters },
            cursorPagination: { nextCursor, hasMore: formattedBusinesses.length === limitNumber }
        };

        const secureResponse = {
            success: true,
            payload: encryptResponse(response)
        };

        await setCache(cacheKey, secureResponse, 300);
        return res.json(secureResponse);

    } catch (err) {
        console.error('[getBusinessesNearby] Error:', err);
        next(err);
    }
};


const searchBusinesses = async (req, res, next) => {
    try {
        const {
            lat,
            lng,
            q,
            location,
            category,
            minRating,
            minPrice,
            maxPrice,
            service,
            offers,
            radius = 3000,
            sort,
            amenities,
            gender,
            page = 1,
            limit = 20
        } = req.query;

        // 1. Validation & Setup
        let hasLocation = false;
        let latitude, longitude;
        let hasLocationFilter = false; // Track if we're filtering by location text

        if (lat && lng) {
            latitude = parseFloat(lat);
            longitude = parseFloat(lng);
            if (!isNaN(latitude) && !isNaN(longitude)) hasLocation = true;
        }

        // Handle "Near Me" intent detection
        let isNearMeIntent = false;
        let searchQuery = q;

        // Check for "near me" or "nearby" in the query string
        if (searchQuery && /\b(near[\s-]?me|nearby)\b/i.test(searchQuery)) {
            isNearMeIntent = true;
            // Remove "near me" from the search query to avoid text matching issues
            searchQuery = searchQuery.replace(/\b(near[\s-]?me|nearby)\b/gi, "").trim();
            // If the query was ONLY "near me", set it to null so we don't do text search
            if (!searchQuery) searchQuery = null;
        }

        // SMART LOCATION HANDLING
        let isBroadLocation = false;
        let isSpecificLocation = false;
        if (location) {
            const locLower = location.trim().toLowerCase();
            if (knownStates.has(locLower) || locLower === 'india') {
                isBroadLocation = true;
            } else {
                isSpecificLocation = true;
            }
        }

        const maxDistance = isBroadLocation ? 2000000 : (isSpecificLocation ? 100000 : (parseInt(radius) || 15000)); // Increased default to 15km
        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.min(Math.max(parseInt(limit) || 20, 1), 500);

        console.log(`[searchBusinesses] Query: "${searchQuery}", Location: "${location}", Lat/Lng: ${latitude}/${longitude}, MaxDist: ${maxDistance}`);

        // ALWAYS apply text filter if location name is provided (for "only listed for" accuracy)
        hasLocationFilter = !!location;

        if (hasLocationFilter && !searchQuery && !category && !minRating && !isNearMeIntent) {
            const isLoc = isKnownLocation(location);
            if (!isLoc) {
                // Switch to keyword search if the "location" is actually a service or something unknown
                searchQuery = location;
                hasLocationFilter = false;
            }
        }

        // 2. Build Cache Key for location-only searches
        let cacheKey = null;
        // Skip cache if "near me" intent is present (as it depends on specific user context)
        if (hasLocationFilter && !searchQuery && !category && !minRating && !isNearMeIntent) {
            // Simple location search - cache it
            cacheKey = `search:location:${location}:${sort}:${page}:${limit}`;
            const cachedData = await getCache(cacheKey);
            if (cachedData) {
                return res.json({
                    success: true,
                    message: "Fetched successfully",
                    source: "cache",
                    payload: encryptResponse(cachedData)
                });
            }
        }

        // 3. Build Aggregation Pipeline
        const pipeline = [];

        // Base match criteria
        const baseMatch = {
            isActive: true,
            isActiveFromSuperAdmin: { $ne: false }
            // 'settings.appointmentSettings.allowOnlineBooking': true // Relaxed for better visibility
        };

        if (hasLocation) {
            pipeline.push({
                $geoNear: {
                    near: { type: "Point", coordinates: [longitude, latitude] },
                    distanceField: "distance",
                    maxDistance: maxDistance,
                    spherical: true,
                    query: baseMatch
                }
            });
        } else {
            pipeline.push({ $match: baseMatch });
        }

        // Lookup services
        pipeline.push({
            $lookup: {
                from: "services",
                localField: "_id",
                foreignField: "business",
                as: "serviceDetails"
            }
        });

        // Build dynamic match for search query and filters
        const matchStage = {};
        let matchConditions = [];

        // Text-based search (q parameter) - Using cleaned searchQuery
        if (searchQuery) {
            const terms = searchQuery.trim().split(/\s+/);
            matchConditions.push({
                $and: terms.map(term => {
                    const regex = new RegExp(term, "i");
                    return {
                        $or: [
                            { name: regex },
                            { businessLink: regex },
                            { branch: regex },
                            { area: regex },
                            { category: regex },
                            { tags: regex },
                            { description: regex },
                            { address: regex },
                            { city: regex },
                            { state: regex },
                            { zipCode: regex },
                            { "serviceDetails.name": regex }
                        ]
                    };
                })
            });
        }

        if (hasLocationFilter) {
            // Normalize location string
            const normalizedLocation = location.trim().toLowerCase();

            // Split by comma or spaces for compound locations (e.g., "Vashi, Navi Mumbai" or "Vasai Mumbai")
            const locationParts = (location.includes(',') ? location.split(',') : location.split(/\s+/))
                .map(p => p.trim())
                .filter(p => p.length > 2); // Include parts longer than 2 chars to avoid "at", "in", etc.

            // Create regex patterns with higher specificity for exact matches
            const regexes = [new RegExp(`^${normalizedLocation}$`, "i")]; // Exact match
            regexes.push(new RegExp(normalizedLocation, "i")); // Partial match

            // Add individual parts as separate search terms
            locationParts.forEach(part => {
                const trimmedPart = part.trim();
                if (trimmedPart.length > 0 && trimmedPart.toLowerCase() !== normalizedLocation) {
                    regexes.push(new RegExp(`^${trimmedPart}$`, "i")); // Exact match for parts
                    regexes.push(new RegExp(trimmedPart, "i")); // Partial match for parts
                }
            });

            // Priority: city > state > address > branch
            const locationOrConditions = [];

            // Add exact match conditions first (highest priority)
            [new RegExp(`^${normalizedLocation}$`, "i")].forEach(regex => {
                locationOrConditions.push({ city: regex });
                locationOrConditions.push({ area: regex });
                locationOrConditions.push({ state: regex });
            });

            // Add partial match conditions
            regexes.forEach(regex => {
                locationOrConditions.push({ city: regex });
                locationOrConditions.push({ area: regex });
                locationOrConditions.push({ state: regex });
                locationOrConditions.push({ address: regex });
                locationOrConditions.push({ branch: regex });
            });

            matchConditions.push({ $or: locationOrConditions });
        }

        // Category filter
        if (category) {
            matchConditions.push({
                $or: [
                    { type: { $regex: category, $options: "i" } },
                    { category: { $regex: category, $options: "i" } }
                ]
            });
        }

        // Rating filter
        if (minRating) {
            matchConditions.push({ 'ratings.average': { $gte: parseFloat(minRating) } });
        }

        // Service filter
        if (service) {
            matchConditions.push({ 'serviceDetails.name': { $regex: service, $options: 'i' } });
        }

        // Offers filter
        if (offers) {
            matchConditions.push({ 'offers': { $exists: true, $ne: [] } });
        }

        // Amenities filter
        if (amenities) {
            // Expecting comma-separated string: "wifi,parking"
            const amenitiesList = typeof amenities === 'string'
                ? amenities.split(',').map(a => a.trim()).filter(Boolean)
                : Array.isArray(amenities) ? amenities : [];

            if (amenitiesList.length > 0) {
                // Case-insensitive matching for amenities
                const amenitiesRegex = amenitiesList.map(a => new RegExp(a, 'i'));
                matchConditions.push({ amenities: { $all: amenitiesRegex } });
            }
        }

        // Gender filter
        if (gender && gender !== 'any') {

            const genderTerm = gender.toLowerCase();
            let genderRegex;

            if (genderTerm === 'male') {
                genderRegex = /male|men|unisex/i;
            } else if (genderTerm === 'female') {
                genderRegex = /female|women|ladies|unisex/i;
            } else if (genderTerm === 'unisex') {
                genderRegex = /unisex|couple/i;
            } else {
                genderRegex = new RegExp(gender, 'i');
            }

            matchConditions.push({
                $or: [
                    { tags: genderRegex },
                    { features: genderRegex },
                    { amenities: genderRegex },
                    { type: genderRegex } // e.g. "Gents Salon" type?
                ]
            });
        }

        // Combine all match conditions
        if (matchConditions.length > 0) {
            if (matchConditions.length === 1) {
                Object.assign(matchStage, matchConditions[0]);
            } else {
                matchStage.$and = matchConditions;
            }
            pipeline.push({ $match: matchStage });
        }

        if (minPrice || maxPrice) {
            const priceCondition = {};
            if (minPrice) priceCondition.$gte = Number(minPrice);
            if (maxPrice) priceCondition.$lte = Number(maxPrice);

            pipeline.push({
                $match: {
                    serviceDetails: {
                        $elemMatch: {
                            $or: [
                                // Check direct price field
                                { price: priceCondition },
                                // Check pricingOptions array for any option with price in range
                                {
                                    pricingOptions: {
                                        $elemMatch: {
                                            price: priceCondition,
                                            isActive: { $ne: false }
                                        }
                                    }
                                }
                            ]
                        }
                    }
                }
            });
        }

        // Projection stage
        pipeline.push({
            $project: {
                name: 1,
                type: 1,
                branch: 1,
                address: 1,
                city: 1,
                state: 1,
                location: 1,
                images: 1,
                image: { $ifNull: ["$images.thumbnail", { $ifNull: ["$images.logo", { $ifNull: ["$images.banner", null] }] }] },
                ratings: 1,
                category: 1,
                tags: 1,
                description: 1,
                phone: 1,
                socialMedia: 1,
                businessLink: 1,
                distance: { $ifNull: ["$distance", null] },
                snippet: { $concat: [{ $substrCP: [{ $ifNull: ["$description", ""] }, 0, 150] }, "..."] },
                serviceDetails: 1,
                offers: 1,
                createdAt: 1,
                slug: 1
            }
        });

        // Scoring for Exact/Partial Match (for searchQuery parameter)
        if (searchQuery) {
            const cleanQ = searchQuery.trim().toLowerCase();
            pipeline.push({
                $addFields: {
                    relevanceScore: {
                        $add: [
                            {
                                $cond: {
                                    if: { $eq: [{ $toLower: "$name" }, cleanQ] },
                                    then: 100, // Exact name match
                                    else: {
                                        $cond: {
                                            if: { $eq: [{ $indexOfCP: [{ $toLower: "$name" }, cleanQ] }, 0] },
                                            then: 80, // Starts with name
                                            else: {
                                                $cond: {
                                                    if: { $gt: [{ $indexOfCP: [{ $toLower: "$name" }, cleanQ] }, -1] },
                                                    then: 60, // Partial name match
                                                    else: 0
                                                }
                                            }
                                        }
                                    }
                                }
                            },
                            {
                                $cond: {
                                    if: { $in: [cleanQ, { $map: { input: "$serviceDetails", as: "s", in: { $toLower: "$$s.name" } } }] },
                                    then: 50, // Exact service match
                                    else: 0
                                }
                            },
                            {
                                $cond: {
                                    if: { $regexMatch: { input: "$type", regex: cleanQ, options: "i" } },
                                    then: 40, // Category match
                                    else: 0
                                }
                            },
                            {
                                $cond: {
                                    if: { $in: [new RegExp(cleanQ, "i"), { $ifNull: ["$tags", []] }] },
                                    then: 30, // Tag match
                                    else: 0
                                }
                            }
                        ]
                    }
                }
            });
        } else {
            pipeline.push({ $addFields: { relevanceScore: 0 } });
        }


        // Applied when: Default sort, No Geo-Location (distance matters less), No Near Me intent, AND No specific Text Query (relevance matters!)
        const useRandomDistribution = (!sort || sort === 'recommended') && !hasLocation && !isNearMeIntent && !searchQuery;


        if (sort === 'rating') {
            pipeline.push({ $sort: { relevanceScore: -1, 'ratings.average': -1, 'ratings.totalReviews': -1 } });
        } else if (sort === 'price' || sort === 'price_low') {
            pipeline.push({ $sort: { relevanceScore: -1, 'serviceDetails.price': 1 } });
        } else if (sort === 'price_high') {
            pipeline.push({ $sort: { relevanceScore: -1, 'serviceDetails.price': -1 } });
        } else if (sort === 'distance' && hasLocation) {
            pipeline.push({ $sort: { relevanceScore: -1, distance: 1 } });
        } else {
            // Default / Recommended sorting
            if (isNearMeIntent && hasLocation) {
                // "Near Me" intent: Prioritize DISTANCE above all else
                pipeline.push({ $sort: { distance: 1, relevanceScore: -1, 'ratings.average': -1 } });
            } else if (hasLocation) {
                // Geo-based: prioritize exact match, then distance, then rating
                pipeline.push({ $sort: { relevanceScore: -1, distance: 1, 'ratings.average': -1 } });
            } else if (hasLocationFilter) {
                // Location text filter: prioritize rating, then recency
                pipeline.push({ $sort: { 'ratings.average': -1, 'ratings.totalReviews': -1, createdAt: -1 } });
            } else if (!useRandomDistribution) {
                // General search fallback (if random not eligible for some reason): prioritize exact match, then rating
                pipeline.push({ $sort: { relevanceScore: -1, 'ratings.average': -1, createdAt: -1 } });
            }
            // If useRandomDistribution is true, we SKIP sorting here to let $sample handle it
        }

        // Pagination & Result Shaping
        if (useRandomDistribution) {
            // This ensures fair visibility ("Equal Leads") for all matching businesses
            pipeline.push({
                $facet: {
                    results: [
                        { $sample: { size: limitNum } }
                    ],
                    totalCount: [{ $count: "count" }]
                }
            });
        } else {
            // Standard Mode: Use deterministic Skip/Limit
            pipeline.push({
                $facet: {
                    results: [
                        { $skip: (pageNum - 1) * limitNum },
                        { $limit: limitNum }
                    ],
                    totalCount: [{ $count: "count" }]
                }
            });
        }

        // 4. Execute Query
        const result = await Business.aggregate(pipeline);
        const businesses = result[0]?.results || [];
        const totalResults = result[0]?.totalCount[0]?.count || 0;

        // Format output
        const { isBusinessOpen } = require("../utils/businessUtils");

        const formattedResults = businesses.map(b => {
            let distanceText = "";
            if (b.distance !== null && b.distance !== undefined) {
                distanceText = `${(b.distance / 1000).toFixed(1)} km`;
            }

            // Format services from lookup result (max 5)
            const formattedServices = (b.serviceDetails || [])
                .filter(s => s.isActive !== false) // Ensure active
                .slice(0, 5)
                .map(s => ({ name: s.name, price: s.price }));

            return {
                id: b._id,
                name: b.name,
                type: b.type,
                branch: b.branch,
                address: b.address,
                city: b.city,
                state: b.state,
                category: b.category,
                tags: b.tags,
                ratings: b.ratings,
                image: b.image || b.images?.thumbnail || b.images?.logo,
                gallery: b.images?.gallery || [],
                distance: b.distance,
                distanceText,
                isOpen: isBusinessOpen(b.settings?.workingHours),
                snippet: b.snippet,
                location: b.location,
                phone: b.phone,
                socialMedia: b.socialMedia,
                services: formattedServices,
                offers: b.offers || [],
                businessLink: b.businessLink,
                seo: b.seo,
                slug: b.slug
            };
        });

        // Encrypt & respond
        const responseData = {
            page: pageNum,
            limit: limitNum,
            totalResults,
            results: formattedResults,
            searchType: isNearMeIntent && hasLocation ? 'near-me' : (hasLocation ? 'geo' : (hasLocationFilter ? 'location' : 'general'))
        };

        const secureResponse = {
            success: true,
            message: "Fetched successfully",
            payload: encryptResponse(responseData)
        };

        // Cache location-only searches for 5 minutes
        if (cacheKey) {
            await setCache(cacheKey, responseData, 300);
        }

        return res.json(secureResponse);

    } catch (err) {
        console.error('Error in searchBusinesses:', err);
        next(err);
    }
};

const getIndiaLocations = async (req, res, next) => {
    try {
        const { search = "", state = "" } = req.query;
        const normalizedSearch = search.trim().toLowerCase();
        const normalizedState = state.trim().toLowerCase();

        const states = indiaLocations
            .map((entry) => {
                const stateMatches = entry.state.toLowerCase().includes(normalizedState);
                const cities = entry.cities.filter((city) => {
                    if (!normalizedSearch) return true;
                    return (
                        city.toLowerCase().includes(normalizedSearch) ||
                        entry.state.toLowerCase().includes(normalizedSearch)
                    );
                });

                if (normalizedState && !stateMatches && cities.length === 0) {
                    return null;
                }

                if (normalizedSearch && cities.length === 0 && !entry.state.toLowerCase().includes(normalizedSearch)) {
                    return null;
                }

                return {
                    state: entry.state,
                    stateCode: entry.stateCode,
                    cities
                };
            })
            .filter(Boolean)
            .filter((entry) => entry.cities.length > 0);

        const flattenedLocations = states.flatMap((entry) =>
            entry.cities.map((city) => ({
                state: entry.state,
                stateCode: entry.stateCode,
                city
            }))
        );

        // Uses shared utility

        const responseData = {
            totalStates: indiaLocations.length,
            matchedStates: states.length,
            totalCities: flattenedLocations.length,
            states,
            locations: flattenedLocations
        };

        return res.json({
            success: true,
            message: "Fetched successfully",
            payload: encryptResponse(responseData)
        });
    } catch (error) {
        next(error);
    }
};

// ===========================================
//              ADMIN & MANAGER  
// ===========================================

// ================== Get Business by ID ==================
const getBusinessById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const userRole = req.user.role;

        // Validate ID
        if (!id || !isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Valid Business ID is required"
            });
        }

        let query = { _id: id, isActive: true };

        // If user is manager, check if they belong to this business
        if (userRole === 'manager') {
            const manager = await require("../models/Manager").findById(userId);
            if (!manager || manager.business.toString() !== id) {
                return res.status(403).json({ success: false, message: "Access denied" });
            }
        } else if (userRole === 'admin') {
            query.admin = userId;
        }

        const business = await Business.findOne(query)
            .populate('managers', 'name username email phone isActive lastLogin')
            .populate('staff', 'name role phone email isActive')
            .populate('admin', 'name companyName email');

        if (!business) {
            return res.status(404).json({ success: false, message: "Business not found" });
        }

        return res.json({ success: true, data: business });
    } catch (err) {
        next(err);
    }
};

// ================== Get Business Staff ==================
const getBusinessStaff = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const userRole = req.user.role;
        const { page = 1, limit = 10, role, search } = req.query;

        // Verify access
        let hasAccess = false;
        if (userRole === 'admin') {
            const business = await Business.findOne({ _id: id, admin: userId });
            hasAccess = !!business;
        } else if (userRole === 'manager') {
            const manager = await require("../models/Manager").findById(userId);
            hasAccess = manager && manager.business.toString() === id;
        }

        if (!hasAccess) {
            return res.status(403).json({ success: false, message: "Access denied" });
        }

        const cacheKey = `business:${id}:staff:${role}:${search}:${page}:${limit}`;
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            return res.json({ success: true, source: "cache", ...cachedData });
        }

        let query = { business: id, isActive: true };

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
            .populate('manager', 'name username')
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
                pages: Math.ceil(total / limit)
            }
        };

        await setCache(cacheKey, response, 120);
        return res.json(response);
    } catch (err) {
        next(err);
    }
};

// ================== Get Business Daily Records ==================
const getBusinessDailyRecords = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const userRole = req.user.role;
        const { startDate, endDate, page = 1, limit = 10 } = req.query;

        // Verify access
        let hasAccess = false;
        if (userRole === 'admin') {
            const business = await Business.findOne({ _id: id, admin: userId });
            hasAccess = !!business;
        } else if (userRole === 'manager') {
            const manager = await require("../models/Manager").findById(userId);
            hasAccess = manager && manager.business.toString() === id;
        }

        if (!hasAccess) {
            return res.status(403).json({ success: false, message: "Access denied" });
        }

        const cacheKey = `business:${id}:daily:${startDate}:${endDate}:${page}:${limit}`;
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            return res.json({ success: true, source: "cache", ...cachedData });
        }

        let query = { business: id };

        if (startDate && endDate) {
            query.date = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        const records = await DailyBusiness.find(query)
            .populate('manager', 'name username')
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .sort({ date: -1 });

        const total = await DailyBusiness.countDocuments(query);

        const response = {
            success: true,
            data: records.map(r => r.toObject()),
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        };

        await setCache(cacheKey, response, 300);
        return res.json(response);
    } catch (err) {
        next(err);
    }
};

// ================== Get Business Analytics ==================
const getBusinessAnalytics = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const userRole = req.user.role;
        const { period = 'monthly' } = req.query;

        // Import Models locally if not top-level to avoid circular dependency risks or just ensuring availability
        const Transaction = require("../models/Transaction");
        const Appointment = require("../models/Appointment");

        // Verify access
        let hasAccess = false;
        if (userRole === 'admin') {
            const business = await Business.findOne({ _id: id, admin: userId });
            hasAccess = !!business;
        } else if (userRole === 'manager') {
            const manager = await require("../models/Manager").findById(userId);
            hasAccess = manager && manager.business.toString() === id;
        }

        if (!hasAccess) {
            return res.status(403).json({ success: false, message: "Access denied" });
        }

        // Set date range based on period
        const endDate = new Date();
        const startDate = new Date();

        // Adjust dates to cover full days
        endDate.setHours(23, 59, 59, 999);
        startDate.setHours(0, 0, 0, 0);

        let daysInPeriod = 30; // Default

        switch (period) {
            case 'daily':
                startDate.setDate(endDate.getDate() - 1); // Last 24h effectively? Or today? Usually means "Today" or "Yesterday"
                // User logic was -1 day. Let's keep consistent but ensure ranges.
                daysInPeriod = 1;
                break;
            case 'weekly':
                startDate.setDate(endDate.getDate() - 7);
                daysInPeriod = 7;
                break;
            case 'monthly':
                startDate.setMonth(endDate.getMonth() - 1);
                daysInPeriod = 30;
                break;
            case 'yearly':
                startDate.setFullYear(endDate.getFullYear() - 1);
                daysInPeriod = 365;
                break;
            case 'all':
                startDate.setTime(0); // Beginning of time
                // Calculate days since business creation for accurate averages
                const biz = await Business.findById(id).select('createdAt');
                if (biz && biz.createdAt) {
                    const diffTime = Math.abs(endDate - new Date(biz.createdAt));
                    daysInPeriod = Math.max(Math.ceil(diffTime / (1000 * 60 * 60 * 24)), 1);
                } else {
                    daysInPeriod = 365; // Fallback
                }
                break;
            default:
                startDate.setMonth(endDate.getMonth() - 1);
        }

        // Get Daily Records (for granular trends if available)
        const dailyRecords = await DailyBusiness.find({
            business: id,
            date: { $gte: startDate, $lte: endDate }
        }).sort({ date: -1 });

        // Generate Base Analytics
        const analytics = generateBusinessAnalytics(dailyRecords, period);

        // =========================================================================
        // OVERRIDE WITH HYBRID REAL-TIME STATS (To Match Manager Dashboard)
        // =========================================================================

        // Construct Match Queries
        const txnMatch = {
            business: new mongoose.Types.ObjectId(id),
            paymentStatus: 'completed',
            isRefunded: false
        };

        const apptMatch = {
            business: new mongoose.Types.ObjectId(id),
            status: 'completed'
        };

        // Apply Date Filter ONLY if NOT 'all' time
        if (period !== 'all') {
            txnMatch.transactionDate = { $gte: startDate, $lte: endDate };
            apptMatch.appointmentDate = { $gte: startDate, $lte: endDate };
        }

        // 1. Transactions Revenue & Count
        const txnStats = await Transaction.aggregate([
            { $match: txnMatch },
            { $group: { _id: null, total: { $sum: "$finalPrice" }, count: { $sum: 1 }, customers: { $sum: 1 } } } // Approx customers count
        ]);

        const txnRevenue = txnStats[0]?.total || 0;
        const txnCount = txnStats[0]?.count || 0;
        // txnCustomers is approximation, we usually just sum counts for "Total Customers" metric in this hybrid model

        // 2. Missing Appointments (Ghost Revenue)
        const apptStats = await Appointment.aggregate([
            { $match: apptMatch },
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

        const apptRevenue = apptStats[0]?.total || 0;
        const apptCount = apptStats[0]?.count || 0;

        // 3. Update Analytics Object
        const totalHybridRevenue = txnRevenue + apptRevenue;
        const totalHybridCustomers = txnCount + apptCount; // Matches "Total Customers" logic in manager dashboard (Total Interactions)

        analytics.totalRevenue = totalHybridRevenue;
        analytics.totalCustomers = totalHybridCustomers;

        // Recalculate Averages
        analytics.averageDailyRevenue = analytics.totalRevenue / Math.max(daysInPeriod, 1);
        analytics.averageDailyCustomers = analytics.totalCustomers / Math.max(daysInPeriod, 1);

        // Update Net Profit (assuming expenses from DailyBusiness are still best source for expenses)
        // Profit = Hybrid Revenue - Reported Expenses
        analytics.netProfit = analytics.totalRevenue - analytics.totalExpenses;

        return res.json({
            success: true,
            data: analytics
        });
    } catch (err) {
        next(err);
    }
};

// ================== Update Business (Admin + Manager shared endpoint) ==================
const updateBusiness = async (req, res, next) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const userId = req.user.id;
        const userRole = req.user.role;

        let business;
        let businessId = id;

        // Validate ID for admin
        if (userRole === 'admin') {
            if (!id || !isValidObjectId(id)) {
                return res.status(400).json({
                    success: false,
                    message: "Valid Business ID is required"
                });
            }
            // Admin can update any of their businesses
            business = await Business.findOne({ _id: id, admin: userId });
            if (!business) {
                return res.status(404).json({ success: false, message: "Business not found or access denied" });
            }
        } else if (userRole === 'manager') {
            // Manager can only update their own business
            const manager = await require("../models/Manager").findById(userId);
            if (!manager) {
                return res.status(404).json({ success: false, message: "Manager not found" });
            }

            // If no ID provided, update manager's own business
            if (!id || id === 'mine') {
                businessId = manager.business.toString();
            }

            // Validate businessId before query
            if (!businessId || !isValidObjectId(businessId)) {
                return res.status(400).json({
                    success: false,
                    message: "Valid Business ID is required"
                });
            }

            business = await Business.findById(businessId);
            if (!business || business._id.toString() !== manager.business.toString()) {
                return res.status(403).json({ success: false, message: "Access denied: You can only update your own business" });
            }

            // Managers cannot change certain fields
            delete updates.admin;
            delete updates.isActive;
            delete updates.businessLink;
        }

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

        // Helper function for deep merging objects
        const deepMerge = (target, source) => {
            const output = { ...(target.toObject?.() || target) };

            for (const key in source) {
                if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                    // Recursively merge nested objects
                    if (target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
                        output[key] = deepMerge(target[key], source[key]);
                    } else {
                        output[key] = source[key];
                    }
                } else {
                    // Direct assignment for primitives and arrays
                    output[key] = source[key];
                }
            }

            return output;
        };

        // Apply updates to the business object with deep merge
        Object.keys(updates).forEach(key => {
            if (updates[key] && typeof updates[key] === 'object' && !Array.isArray(updates[key]) && business[key]) {
                // For nested objects (like settings, seo, etc.), use deep merge
                business[key] = deepMerge(business[key], updates[key]);
            } else {
                // For primitive values and arrays, direct assignment
                business[key] = updates[key];
            }
        });

        // Save to trigger pre-save hooks (for Google Maps URL lat/lng extraction and businessLink generation)
        const updatedBusiness = await business.save();

        // Populate the managers field after save
        await updatedBusiness.populate('managers', 'name username email phone isActive');

        // Invalidate relevant caches
        if (userRole === 'admin') {
            const { deleteCache } = require("../utils/cache");
            await deleteCache(`admin:${userId}:businesses`);
            await deleteCache(`admin:${userId}:dashboard`);
        } else if (userRole === 'manager') {
            const { deleteCache } = require("../utils/cache");
            await deleteCache(`manager:${userId}:dashboard`);
            await deleteCache(`business:${businessId}:info`);
        }

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
                subCategory: updatedBusiness.subCategory,
                tags: updatedBusiness.tags,
                features: updatedBusiness.features,
                amenities: updatedBusiness.amenities,
                paymentMethods: updatedBusiness.paymentMethods,
                bankDetails: updatedBusiness.bankDetails,
                capacity: updatedBusiness.capacity,
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

// ================== Add Business Review (Public) ==================
const addBusinessReview = async (req, res, next) => {
    try {
        const { id } = req.params; // Business ID
        const { name, email, rating, review } = req.body;

        // validation
        if (!name || !email || !rating || !review) {
            return res.status(400).json({
                success: false,
                message: "Please provide all required fields: name, email, rating, review"
            });
        }

        if (rating < 1 || rating > 5) {
            return res.status(400).json({
                success: false,
                message: "Rating must be between 1 and 5"
            });
        }

        const business = await Business.findById(id);
        if (!business) {
            return res.status(404).json({ success: false, message: "Business not found" });
        }

        // Create the review
        const newReview = await Review.create({
            business: id,
            guestName: name,
            guestEmail: email,
            rating: Number(rating),
            review: review,
            isPublished: true, // Auto-publish for now
            status: 'approved',
            source: 'website'
        });

        // Update Business Ratings
        const ratingField = ['oneStar', 'twoStars', 'threeStars', 'fourStars', 'fiveStars'][Math.round(rating) - 1];

        // Use atomic update for counts
        const incUpdate = {
            'ratings.totalReviews': 1
        };
        if (ratingField) {
            incUpdate[`ratings.${ratingField}`] = 1;
        }

        await Business.findByIdAndUpdate(id, { $inc: incUpdate });

        // Recalculate average
        const updatedBusiness = await Business.findById(id).select('ratings');
        const r = updatedBusiness.ratings;
        const totalStars = (r.fiveStars * 5) + (r.fourStars * 4) + (r.threeStars * 3) + (r.twoStars * 2) + (r.oneStar * 1);
        const newAverage = r.totalReviews > 0 ? totalStars / r.totalReviews : 0;

        await Business.findByIdAndUpdate(id, { 'ratings.average': newAverage });

        return res.status(201).json({
            success: true,
            message: "Review submitted successfully",
            data: newReview
        });

    } catch (err) {
        next(err);
    }
};

// ================== Get Business Reviews (Public) ==================
const getBusinessReviews = async (req, res, next) => {
    try {
        const { id } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20; // Default limit 20
        const skip = (page - 1) * limit;

        // Fetch reviews with pagination
        const reviews = await Review.find({
            business: id,
            isPublished: true
        })
            .select('guestName guestEmail rating review createdAt helpfulCount notHelpfulCount') // Added helpful counts
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const total = await Review.countDocuments({ business: id, isPublished: true });

        // Secure response by masking email
        const securedData = {
            reviews: reviews.map(review => ({
                _id: review._id,
                guestName: review.guestName,
                // guestEmail removed for security
                rating: review.rating,
                review: review.review,
                createdAt: review.createdAt,
                helpfulPercentage: (review.helpfulCount + review.notHelpfulCount) > 0
                    ? Math.round((review.helpfulCount / (review.helpfulCount + review.notHelpfulCount)) * 100)
                    : 0
            })),
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit),
                hasMore: (page * limit) < total
            }
        };

        // Simple obfuscation/encryption function for the response
        // This hides the data in the network tab as requested
        // Uses shared utility

        res.json({
            success: true,
            message: "fetched successfully",
            payload: encryptResponse(securedData)
        });

    } catch (err) {
        next(err);
    }
};

// ================== Mark Review Helpful (Public) ==================
const markReviewHelpful = async (req, res, next) => {
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

// ================== Business Autocomplete (Database Search) ==================
const getBusinessAutocomplete = async (req, res, next) => {
    try {
        const { input, limit = 20, lat, lng, type } = req.query; // Added type support

        if (!input || input.trim().length < 2) {
            return res.json({
                success: true,
                suggestions: []
            });
        }

        const normalizedInput = input.trim();
        const lowerInput = normalizedInput.toLowerCase();

        // 1. Handle "Near Me" Intent
        if (lowerInput.includes('near me') || lowerInput.includes('nearby')) {
            return res.json({
                success: true,
                suggestions: [{
                    id: 'near-me',
                    name: 'Search Near Me',
                    location: 'Current Location',
                    displayText: '📍 Search Near Me',
                    type: 'action',
                    action: 'near_me'
                }]
            });
        }

        let keyword = normalizedInput;
        let location = '';

        // 2. Handle "Best/Top" Intent (Rating Sort)
        let isQualitySearch = false;
        if (lowerInput.startsWith('best ') || lowerInput.startsWith('top ')) {
            isQualitySearch = true;
            keyword = normalizedInput.replace(/^(best|top)\s+/i, '').trim();
        }

        // 3. Parse "Keyword IN Location" Pattern
        const locationMatch = keyword.match(/^(.*?)\s+(?:in|at|near|from)\s+(.*)$/i);
        if (locationMatch) {
            keyword = locationMatch[1];
            location = locationMatch[2];
        }

        const suggestions = [];
        const limitNum = parseInt(limit);

        // 3. Parallel Searches
        const searchPromises = [];

        // A. Business Search (Direct Match)
        const businessQuery = {
            isActive: true,
            isActiveFromSuperAdmin: true,
            'settings.appointmentSettings.allowOnlineBooking': true,
        };

        // Enforce type if provided (essential for syncing with main search)
        if (type && type !== 'all') {
            businessQuery.type = type;
        }

        // If no explicit location found via "IN/AT", we try a smart multi-field search
        if (!location) {
            const terms = keyword.split(/\s+/).filter(t => t.length > 2);
            if (terms.length > 1) {
                // Multi-word case: "Spa Nest Vasai"
                // Match each term against any of the key fields
                businessQuery.$and = terms.map(term => {
                    const regex = new RegExp(term, "i");
                    return {
                        $or: [
                            { name: regex },
                            { branch: regex },
                            { area: regex },
                            { city: regex },
                            { address: regex }
                        ]
                    };
                });
            } else {
                // Single word case
                const regex = new RegExp(keyword, "i");
                businessQuery.$or = [
                    { name: regex },
                    { branch: regex },
                    { area: regex },
                    { city: regex },
                    { address: regex }
                ];
            }
        } else {
            // Explicit location case: "Spa IN Vasai"
            const kwRegex = new RegExp(keyword, "i");
            const locRegex = new RegExp(location, "i");
            businessQuery.$and = [
                { $or: [{ name: kwRegex }, { branch: kwRegex }, { category: kwRegex }] },
                { $or: [{ area: locRegex }, { city: locRegex }, { address: locRegex }] }
            ];
        }

        // Sort configuration
        let sortConfig = { 'ratings.average': -1, 'stats.popularity': -1 }; // Default: High rating -> Popularity

        // Behavior:
        // 1. If lat/lng provided: Sort by distance is implicitly desired but mongo needs $near or aggregation
        // 2. For basic find(), we can't easily mixed sort specific items by distance without geoNear
        // 3. However, user wants "High Rated 20 Near Location".

        searchPromises.push(
            Business.find(businessQuery)
                .select('name address city branch area businessLink ratings.average stats.popularity location')
                .sort(sortConfig) // Prioritize high rated
                .limit(limitNum)
                .lean()
                .then(results => results.map(b => {
                    // Create unique location parts to avoid repeats like "Lucknow, Lucknow"
                    const locParts = [b.branch, b.area, b.city]
                        .filter(Boolean)
                        .map(part => part.trim());

                    const uniqueLocParts = [];
                    const seenParts = new Set();

                    for (const part of locParts) {
                        const lowerPart = part.toLowerCase();
                        if (!seenParts.has(lowerPart)) {
                            uniqueLocParts.push(part);
                            seenParts.add(lowerPart);
                        }
                    }

                    const loc = uniqueLocParts.join(', ');

                    // Basic distance scoring if lat/lng available (client-side of this function)
                    let distScore = 0;
                    if (lat && lng && b.location && b.location.coordinates) {
                        const [bLng, bLat] = b.location.coordinates;
                        // Simple Euclidean distance for sorting (accurate enough for sorting)
                        const dist = Math.sqrt(Math.pow(parseFloat(lat) - bLat, 2) + Math.pow(parseFloat(lng) - bLng, 2));
                        distScore = 100 / (dist + 1); // Closer = higher score
                    }

                    return {
                        id: b._id,
                        name: b.name,
                        location: loc,
                        displayText: loc ? `${b.name} - ${loc}` : b.name,
                        businessLink: b.businessLink,
                        rating: b.ratings?.average || 0,
                        type: 'business',
                        score: 10 + (b.ratings?.average || 0) + distScore // Combined score
                    };
                }))
        );

        // B. Service Search
        // Find services matching the keyword
        const serviceQuery = {
            isActive: true,
            name: { $regex: keyword, $options: 'i' }
        };

        searchPromises.push(
            Service.find(serviceQuery)
                .select('name category business')
                .populate('business', 'name city area branch')
                .limit(5)
                .lean()
                .then(results => results
                    .filter(s => s.business) // Ensure business exists
                    .map(s => {
                        const loc = [s.business.branch, s.business.area, s.business.city].filter(Boolean).join(', ');
                        return {
                            id: s._id,
                            name: s.name, // Search query becomes service name
                            location: loc,
                            displayText: `${s.name} at ${s.business.name} (${loc})`,
                            businessLink: s.business.businessLink, // Or separate service link
                            type: 'service',
                            score: 8
                        };
                    }))
        );

        // C. Category/Tag Search (Generic)
        // If keyword matches a category, suggest "Category in Location" or just "Category"
        // We can check available categories or just synthetically generate this if no exact business match
        // For now, let's skip complex aggregation for speed and just rely on service search which covers categories often

        // Execute Searches
        const [businessResults, serviceResults] = await Promise.all(searchPromises);

        // Merge and Sort
        const allSuggestions = [...businessResults, ...serviceResults];

        // Deduplicate by displayText
        const uniqueSuggestions = [];
        const seenTexts = new Set();

        allSuggestions.sort((a, b) => b.score - a.score); // Priority sorting

        for (const item of allSuggestions) {
            if (!seenTexts.has(item.displayText)) {
                seenTexts.add(item.displayText);
                uniqueSuggestions.push(item);
            }
            if (uniqueSuggestions.length >= limitNum) break;
        }

        // If parsed location exists but no direct results found, 
        // add a generic "Search for [Keyword] in [Location]" suggestion
        if (uniqueSuggestions.length === 0 && location) {
            uniqueSuggestions.push({
                id: 'generic-search',
                name: keyword,
                location: location,
                displayText: `🔍 Search for "${keyword}" in ${location}`,
                type: 'generic'
            });
        }

        // Add "Best Rated [Keyword]" suggestion if quality intent detected
        if (isQualitySearch) {
            uniqueSuggestions.unshift({
                id: 'best-rated',
                name: keyword,
                displayText: `⭐ Best Rated ${keyword} ${location ? 'in ' + location : ''}`,
                type: 'generic',
                searchQuery: `best ${keyword} ${location ? 'in ' + location : ''}`
            });
        }

        return res.json({
            success: true,
            suggestions: uniqueSuggestions,
            source: 'database_smart'
        });
    } catch (error) {
        console.error('[Business Autocomplete] Error:', error);
        return res.json({
            success: true,
            suggestions: [],
            source: 'error'
        });
    }
};

// ================== Google Places Autocomplete (Public) ==================
const getPlacesAutocomplete = async (req, res, next) => {
    try {
        const { input, types, location } = req.query;

        if (!input || input.trim().length < 2) {
            return res.json({
                success: true,
                suggestions: []
            });
        }

        const options = {};
        if (types) options.types = types;
        if (location) {
            const coords = location.split(',');
            if (coords.length === 2) {
                options.location = `${coords[0]},${coords[1]}`;
                options.radius = 30000;
            }
        }

        const result = await googlePlaces.autocomplete(input, options);

        if (result.success) {
            return res.json({
                success: true,
                suggestions: result.suggestions,
                source: 'google_places'
            });
        }

        return res.json({ success: true, suggestions: [], source: 'fallback' });
    } catch (error) {
        next(error);
    }
};

// ================== Get Place Details (Public) ==================
const getPlaceDetails = async (req, res, next) => {
    try {
        const { place_id } = req.query;

        if (!place_id) {
            return res.status(400).json({
                success: false,
                error: 'place_id is required'
            });
        }

        const result = await googlePlaces.getPlaceDetails(place_id);

        if (result.success) {
            return res.json({
                success: true,
                place: result.place
            });
        }

        return res.status(404).json({
            success: false,
            error: result.error || 'Place not found'
        });
    } catch (error) {
        next(error);
    }
};

// ================== Get Suggest Locations (Dedicated for Search Bar) ==================
const suggestLocations = async (req, res, next) => {
    try {
        const { input } = req.query;

        if (!input || input.trim().length < 2) {
            return res.json({ success: true, suggestions: [] });
        }

        // Search in local India locations first
        const matchedCities = [];
        const normalizedInput = input.trim().toLowerCase();

        // India locations search (limited to 5 for speed)
        indiaLocations.forEach(stateEntry => {
            stateEntry.cities.forEach(city => {
                if (city.toLowerCase().includes(normalizedInput) && matchedCities.length < 5) {
                    matchedCities.push({
                        description: `${city}, ${stateEntry.state}`,
                        main_text: city,
                        secondary_text: stateEntry.state,
                        type: 'city',
                        source: 'local'
                    });
                }
            });
        });

        // Search Google Places (if enabled)
        let googleSuggestions = [];
        if (googlePlaces.isEnabled()) {
            const result = await googlePlaces.autocomplete(input, { types: '(cities)', components: 'country:in' });
            if (result.success) {
                googleSuggestions = result.suggestions.map(s => ({
                    ...s,
                    source: 'google',
                    type: 'place'
                }));
            }
        }

        // Merge and return
        const suggestions = [...matchedCities, ...googleSuggestions].slice(0, 10);
        return res.json({
            success: true,
            suggestions,
            payload: encryptResponse({ suggestions })
        });
    } catch (error) {
        next(error);
    }
};

// ================== Enhanced Search with Google Places (Public) ==================
const searchWithPlaces = async (req, res, next) => {
    try {
        const {
            lat,
            lng,
            q,
            location,
            category,
            minRating,
            radius = 15000,
            page = 1,
            limit = 20
        } = req.query;

        console.log(`[searchWithPlaces] Q: ${q}, Location: ${location}, Radius: ${radius}`);

        let searchLat = lat ? parseFloat(lat) : null;
        let searchLng = lng ? parseFloat(lng) : null;

        // If location name is provided but no coordinates, geocode it
        if (location && (!searchLat || !searchLng)) {
            const geocodeResult = await googlePlaces.geocode(location);
            if (geocodeResult.success && geocodeResult.result) {
                searchLat = geocodeResult.result.lat;
                searchLng = geocodeResult.result.lng;
            }
        } else if (!location && !searchLat && q) {
            // Smart Parse: If no location provided but 'q' exists

            // 1. Check for "Keyword IN Location" pattern
            const locationMatch = q.match(/^(.*?)\s+(?:in|at|near|from)\s+(.*)$/i);
            if (locationMatch) {
                const extractedLocation = locationMatch[2];
                const geocodeResult = await googlePlaces.geocode(extractedLocation);
                if (geocodeResult.success && geocodeResult.result) {
                    searchLat = geocodeResult.result.lat;
                    searchLng = geocodeResult.result.lng;
                }
            }
        }

        // Handle "Best/Top" Intent in Query
        let searchQuery = q;
        let sortOption = req.query.sort;
        let minRatingFilter = minRating;

        if (q && (q.toLowerCase().startsWith('best ') || q.toLowerCase().startsWith('top '))) {
            searchQuery = q.replace(/^(best|top)\s+/i, '').trim();
            sortOption = 'rating'; // Sort by rating
            if (!minRatingFilter) minRatingFilter = 4; // Auto-filter for high rating
        }

        // Fetch Google Places results (if enabled)
        let placesResults = [];
        if (searchLat && searchLng && googlePlaces.isEnabled()) {
            const keyword = q || category || 'spa';
            const nearbyResult = await googlePlaces.nearbySearch(
                searchLat,
                searchLng,
                keyword,
                parseInt(radius)
            );

            if (nearbyResult.success) {
                placesResults = nearbyResult.places;
            }
        }

        // Fetch database results (existing search)
        const dbParams = {
            lat: searchLat,
            lng: searchLng,
            q: searchQuery, // Use parsed query (stripped of 'best'/'top')
            location,
            category,
            minRating: minRatingFilter, // Use filter from quality intent
            sort: sortOption, // Use sort from quality intent
            radius,
            page,
            limit
        };

        // Use existing searchBusinesses logic
        const pipeline = [];
        const baseMatch = {
            isActive: true,
            isActiveFromSuperAdmin: { $ne: false }
            // 'settings.appointmentSettings.allowOnlineBooking': true // Relaxed for better visibility
        };

        if (searchLat && searchLng) {
            pipeline.push({
                $geoNear: {
                    near: { type: "Point", coordinates: [searchLng, searchLat] },
                    distanceField: "distance",
                    maxDistance: parseInt(radius),
                    spherical: true,
                    query: baseMatch
                }
            });
        } else {
            pipeline.push({ $match: baseMatch });
        }

        pipeline.push({
            $lookup: {
                from: "services",
                localField: "_id",
                foreignField: "business",
                as: "serviceDetails"
            }
        });

        const matchStage = {};
        if (q) {
            const terms = q.trim().split(/\s+/);
            matchStage.$and = terms.map(term => {
                const regex = new RegExp(term, "i");
                return {
                    $or: [
                        { name: regex },
                        { category: regex },
                        { tags: regex },
                        { description: regex },
                        { address: regex },
                        { "serviceDetails.name": regex }
                    ]
                };
            });
        }

        if (category) matchStage.type = { $regex: category, $options: "i" };
        if (minRating) matchStage['ratings.average'] = { $gte: parseFloat(minRating) };

        if (Object.keys(matchStage).length > 0) {
            pipeline.push({ $match: matchStage });
        }

        pipeline.push({
            $project: {
                name: 1,
                type: 1,
                branch: 1,
                address: 1,
                location: 1,
                images: 1,
                image: { $ifNull: ["$images.thumbnail", { $ifNull: ["$images.logo", "$images.banner"] }] },
                ratings: 1,
                category: 1,
                tags: 1,
                description: 1,
                phone: 1,
                socialMedia: 1,
                businessLink: 1,
                distance: { $ifNull: ["$distance", null] },
                snippet: { $concat: [{ $substrCP: [{ $ifNull: ["$description", ""] }, 0, 150] }, "..."] },
                serviceDetails: 1,
                offers: 1
            }
        });

        if (searchLat && searchLng) {
            pipeline.push({ $sort: { distance: 1, 'ratings.average': -1 } });
        } else {
            pipeline.push({ $sort: { 'ratings.average': -1, createdAt: -1 } });
        }

        const limitNum = Math.min(Math.max(parseInt(limit), 1), 3000);
        pipeline.push({
            $facet: {
                results: [
                    { $skip: (parseInt(page) - 1) * limitNum },
                    { $limit: limitNum }
                ],
                totalCount: [{ $count: "count" }]
            }
        });

        const dbResult = await Business.aggregate(pipeline);
        const businesses = dbResult[0]?.results || [];
        const totalResults = dbResult[0]?.totalCount[0]?.count || 0;

        // Format database results
        const { isBusinessOpen } = require("../utils/businessUtils");

        const formattedResults = businesses.map(b => ({
            id: b._id,
            name: b.name,
            type: b.type,
            branch: b.branch,
            address: b.address,
            category: b.category,
            tags: b.tags,
            ratings: b.ratings,
            image: b.image || b.images?.thumbnail || b.images?.logo,
            gallery: b.images?.gallery || [],
            distance: b.distance,
            distanceText: b.distance ? `${(b.distance / 1000).toFixed(1)} km` : '',
            isOpen: isBusinessOpen(b.settings?.workingHours),
            snippet: b.snippet,
            location: b.location,
            phone: b.phone,
            socialMedia: b.socialMedia,
            services: (b.serviceDetails || []).slice(0, 5).map(s => ({ name: s.name, price: s.price })),
            offers: b.offers || [],
            businessLink: b.businessLink,
            source: 'database'
        }));

        // Remove duplicates by name proximity
        const mergedResults = [...formattedResults];
        const existingNames = new Set(formattedResults.map(b => b.name.toLowerCase()));

        placesResults.forEach(place => {
            // Simple duplicate check by name
            if (!existingNames.has(place.name.toLowerCase())) {
                mergedResults.push({
                    id: place.place_id,
                    name: place.name,
                    address: place.vicinity,
                    ratings: place.rating ? { average: place.rating, totalReviews: place.user_ratings_total || 0 } : null,
                    location: { coordinates: [place.lng, place.lat] },
                    distance: null, // Will be calculated on frontend if needed
                    snippet: `Found on Google Places - ${place.vicinity}`,
                    source: 'google_places',
                    isExternal: true, // Flag for frontend to handle differently
                    place_id: place.place_id
                });
                existingNames.add(place.name.toLowerCase());
            }
        });

        const responseData = {
            page: parseInt(page),
            limit: limitNum,
            totalResults: mergedResults.length,
            results: mergedResults,
            sources: {
                database: formattedResults.length,
                google_places: placesResults.length
            }
        };

        return res.json({
            success: true,
            message: "Fetched successfully",
            payload: encryptResponse(responseData)
        });
    } catch (error) {
        next(error);
    }
};

const getAllBusinessesForSuperAdmin = async (req, res, next) => {
    try {
        // Fetch all businesses with their admin details
        const businesses = await Business.find({})
            .populate('admin', 'name phone companyName')
            .select('name branch businessLink isActive ratings sidebarSettings remark createdAt admin')
            .sort({ createdAt: -1 })
            .lean();

        const formattedBusinesses = businesses.map(biz => ({
            id: biz._id,
            companyName: biz.admin?.companyName || biz.name,
            businessName: biz.name,
            branch: biz.branch,
            adminName: biz.admin?.name || 'N/A',
            phone: biz.admin?.phone || 'N/A',
            status: biz.isActive ? 'active' : 'inactive',
            remark: biz.remark || '',
            joinedAt: biz.createdAt,
            sidebarSettings: biz.sidebarSettings || {}
        }));

        return res.json({
            success: true,
            data: formattedBusinesses
        });
    } catch (err) {
        next(err);
    }
};

const getSidebarSettings = async (req, res, next) => {
    try {
        const { id } = req.params;

        // If the user is a manager, return their specific sidebar settings
        // instead of the general business settings
        if (req.user && req.user.role === 'manager') {
            const manager = await Manager.findById(req.user.id).select('sidebarSettings').lean();
            if (manager) {
                return res.json({
                    success: true,
                    data: manager.sidebarSettings || {}
                });
            }
        }

        const business = await Business.findById(id).select('sidebarSettings').lean();

        if (!business) {
            return res.status(404).json({ success: false, message: "Business not found" });
        }

        return res.json({
            success: true,
            data: business.sidebarSettings || {}
        });
    } catch (err) {
        next(err);
    }
};

const updateSidebarSettings = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { sidebarSettings } = req.body;

        if (!sidebarSettings) {
            return res.status(400).json({ success: false, message: "Sidebar settings required" });
        }

        const updatedBusiness = await Business.findByIdAndUpdate(
            id,
            { sidebarSettings },
            { new: true, runValidators: true }
        ).select('sidebarSettings');

        if (!updatedBusiness) {
            return res.status(404).json({ success: false, message: "Business not found" });
        }

        return res.json({
            success: true,
            message: "Sidebar settings updated successfully",
            data: updatedBusiness.sidebarSettings
        });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    getPublicBusinesses,
    getBusinessInfoByLink,
    getBusinessBySlug,
    getBusinessById,
    getBusinessStaff,
    getBusinessDailyRecords,
    getBusinessAnalytics,
    getBusinessesNearby,
    searchBusinesses,
    getIndiaLocations,
    updateBusiness,
    addBusinessReview,
    getBusinessReviews,
    markReviewHelpful,
    getBusinessAutocomplete,
    getPlacesAutocomplete,
    getPlaceDetails,
    suggestLocations,
    searchWithPlaces,
    getAllBusinessesForSuperAdmin,
    getSidebarSettings,
    updateSidebarSettings
};
