const express = require("express");
const router = express.Router();
const authRoutes = require("./authRoutes");

// Auth Routes
router.use("/auth", authRoutes);

// Management Routes
router.use("/manage", require("./managementRoutes"));

module.exports = router;
