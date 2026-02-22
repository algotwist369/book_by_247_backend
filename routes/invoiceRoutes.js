// invoiceRoutes.js - Invoice and payment routes
const express = require("express");
const router = express.Router();
const invoiceController = require("../controllers/invoiceController");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

// All routes require authentication (Admin or Manager)
router.use(authMiddleware, roleMiddleware(["admin", "manager"]));

// ================== Invoice Management ==================

// Create new invoice
router.post("/", invoiceController.createInvoice);

// Get invoices with filtering and pagination
router.get("/", invoiceController.getInvoices);

// Get invoice statistics
router.get("/stats", invoiceController.getInvoiceStats);

// Get overdue invoices
router.get("/overdue", invoiceController.getOverdueInvoices);

// Get invoice by ID
router.get("/:id", invoiceController.getInvoiceById);

// Update invoice
router.put("/:id", invoiceController.updateInvoice);

// Cancel invoice
router.post("/:id/cancel", invoiceController.cancelInvoice);

// ================== Payment Management ==================

// Add payment to invoice
router.post("/:id/payment", invoiceController.addPayment);

// Add refund to invoice
router.post("/:id/refund", invoiceController.addRefund);

module.exports = router;

