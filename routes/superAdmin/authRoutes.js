const express = require("express");
const router = express.Router();
const authController = require("../../controllers/superAdmin/authController");
const superAdminAuth = require("../../middleware/superAdminAuth");

// Public Auth Routes
router.post("/register", authController.register); // Should be restricted or removed after first setup
router.post("/login", authController.login);

// Protected Routes
router.get("/profile", superAdminAuth, authController.getProfile);
router.post("/logout", superAdminAuth, authController.logout);

module.exports = router;
