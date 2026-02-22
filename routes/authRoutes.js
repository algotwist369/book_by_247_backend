const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");

// Auth Routes
router.post("/register", authController.registerAdmin);       // Admin register
router.post("/login", authController.login);                  // Admin/Manager login
router.post("/refresh", authController.refreshToken);         // Refresh token
router.post("/logout", authController.logout);                // Logout
router.post("/otp/send", authController.sendOTP);             // Send OTP
router.post("/otp/verify", authController.verifyOTP);         // Verify OTP

module.exports = router;
