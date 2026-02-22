const express = require("express");
const router = express.Router();
const { createOrder, verifyPayment } = require("../controllers/paymentController");
const protect = require("../middleware/authMiddleware");

// Routes
router.post("/create-order", createOrder);
router.post("/verify-payment", verifyPayment);
router.get("/get-key", require("../controllers/paymentController").getRazorpayKey);
router.get("/check-config", require("../controllers/paymentController").checkConfig);

module.exports = router;
