// reviewRoutes.js - Review and rating routes
const express = require("express");
const router = express.Router();
const reviewController = require("../controllers/reviewController");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

// All routes require authentication (Admin or Manager)
router.use(authMiddleware, roleMiddleware(["admin", "manager"]));

// ================== Review Management ==================

// Create new review
router.post("/", reviewController.createReview);

// Get reviews with filtering and pagination
router.get("/", reviewController.getReviews);

// Get review statistics
router.get("/stats", reviewController.getReviewStats);

// Get featured reviews
router.get("/featured", reviewController.getFeaturedReviews);

// Get review by ID
router.get("/:id", reviewController.getReviewById);

// Update review
router.put("/:id", reviewController.updateReview);

// Delete review
router.delete("/:id", reviewController.deleteReview);

// ================== Review Actions ==================

// Approve review
router.post("/:id/approve", reviewController.approveReview);

// Reject review
router.post("/:id/reject", reviewController.rejectReview);

// Flag review for moderation
router.post("/:id/flag", reviewController.flagReview);

// Add response to review
router.post("/:id/response", reviewController.addResponse);

// Mark review as helpful
router.post("/:id/helpful", reviewController.markHelpful);

module.exports = router;

