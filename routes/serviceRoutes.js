// serviceRoutes.js - Service/Product catalog routes
const express = require("express");
const router = express.Router();
const serviceController = require("../controllers/serviceController");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

// Public route for booking services
router.get("/public/business/:identifier", serviceController.getPublicBusinessServices);

// All routes below require authentication (Admin or Manager)
router.use(authMiddleware, roleMiddleware(["admin", "manager"]));

// ================== Service Management ==================

// Create new service
router.post("/", serviceController.createService);

// Get services with filtering and pagination
router.get("/", serviceController.getServices);

// Get popular services
router.get("/popular", serviceController.getPopularServices);

// Get featured services
router.get("/featured", serviceController.getFeaturedServices);

// Get service categories
router.get("/categories", serviceController.getServiceCategories);

// Get service by ID
router.get("/:id", serviceController.getServiceById);

// Update service
router.put("/:id", serviceController.updateService);

// Delete service (soft delete)
router.delete("/:id", serviceController.deleteService);

// ================== Inventory Management ==================

// Update service inventory
router.post("/:id/inventory", serviceController.updateInventory);

module.exports = router;

