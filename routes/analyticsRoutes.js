// analyticsRoutes.js - Advanced analytics routes
const express = require("express");
const router = express.Router();
const analyticsController = require("../controllers/analyticsController");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

// All routes require authentication (Admin or Manager)
router.use(authMiddleware, roleMiddleware(["admin", "manager"]));

// ================== Dashboard Analytics ==================

// Get dashboard overview
router.get("/dashboard", analyticsController.getDashboardOverview);

// Get revenue analytics
router.get("/revenue", analyticsController.getRevenueAnalytics);

// Get customer analytics
router.get("/customers", analyticsController.getCustomerAnalytics);

// Get service performance
router.get("/services", analyticsController.getServicePerformance);

// Get appointment analytics
router.get("/appointments", analyticsController.getAppointmentAnalytics);

// Get staff performance
router.get("/staff", analyticsController.getStaffPerformance);

// Get trends and predictions
router.get("/trends", analyticsController.getTrendsAndPredictions);

module.exports = router;

