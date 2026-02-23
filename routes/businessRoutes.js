const express = require("express");
const router = express.Router();
const businessController = require("../controllers/businessController");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

// ================== Public Routes (No Authentication Required) ==================

// Get all public businesses (for home page listing)
router.get("/public/list", businessController.getPublicBusinesses);

// Get master list of Indian locations (states and cities)
router.get("/public/locations/india", businessController.getIndiaLocations);

// Get businesses near a location (geospatial query)
// Query params: lat, lng, maxDistance (in meters, default 5000), type, page, limit
router.get("/public/nearby", businessController.getBusinessesNearby);

// Advanced Search (Location + Text)
// Query params: lat, lng, q, category, radius, sort, page, limit
router.get("/public/explore", businessController.searchBusinesses);

// Business Autocomplete - Search businesses in database
// Query params: input (required), limit (optional, default 10)
router.get("/public/search/business-autocomplete", businessController.getBusinessAutocomplete);

// Google Places API - Autocomplete for location search
router.get("/public/search/autocomplete", businessController.getPlacesAutocomplete);

// Dedicated location suggestions for search bar (Local + Google)
router.get("/public/suggest-locations", businessController.suggestLocations);

// Google Places API - Get place details by place_id
// Query params: place_id (required)
router.get("/public/search/place-details", businessController.getPlaceDetails);

// Google Places API - Enhanced search with Google Places + Database merge
// Query params: lat, lng, q, location, category, minRating, radius, page, limit
router.get("/public/search/places", businessController.searchWithPlaces);

// Get list of reviews for a business (public)
router.get("/public/:id/reviews", businessController.getBusinessReviews);

// Add a review for a business (public)
router.post("/public/:id/reviews", businessController.addBusinessReview);

// Mark review as helpful (public)
router.post("/public/reviews/:id/helpful", businessController.markReviewHelpful);

// Get business info by business link (public for appointment booking)
router.get("/info/:businessLink", businessController.getBusinessInfoByLink);

// Get business info by slug (public)
// Using (.*) regex to capture slugs with slashes, compatible with Express 5
router.get("/public/profile/:slug", businessController.getBusinessBySlug);

// ================== Protected Routes (Authentication Required) ==================

// Update business (Admin + Manager)
// Admin can update any of their businesses by ID
// Manager can update their own business (use 'mine' or their business ID)
router.put("/:id",
    authMiddleware,
    roleMiddleware(["admin", "manager"]),
    businessController.updateBusiness
);

// Get business details (Admin + Manager)
router.get("/:id",
    authMiddleware,
    roleMiddleware(["admin", "manager"]),
    businessController.getBusinessById
);

// Get business staff (Admin + Manager)
router.get("/:id/staff",
    authMiddleware,
    roleMiddleware(["admin", "manager"]),
    businessController.getBusinessStaff
);

// Get business daily records (Admin + Manager)
router.get("/:id/daily-business",
    authMiddleware,
    roleMiddleware(["admin", "manager"]),
    businessController.getBusinessDailyRecords
);

// Get business analytics (Admin + Manager)
router.get("/:id/analytics",
    authMiddleware,
    roleMiddleware(["admin", "manager"]),
    businessController.getBusinessAnalytics
);

// ================== Super Admin Routes ==================
// These routes should ideally be restricted to super_admin role
// For now, allowing admin to access for initial setup/testing if needed, 
// but the client-side super admin panel will use these.

router.get("/super-admin/all",
    authMiddleware,
    // roleMiddleware(["super_admin"]), // Uncomment once super_admin role is fully set up
    businessController.getAllBusinessesForSuperAdmin
);

router.get("/:id/sidebar-settings",
    authMiddleware,
    businessController.getSidebarSettings
);

router.put("/:id/sidebar-settings",
    authMiddleware,
    businessController.updateSidebarSettings
);

module.exports = router;
