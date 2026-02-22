const express = require("express");
const router = express.Router();
const appointmentController = require("../controllers/appointmentController");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

// ================== PUBLIC ROUTES (No Authentication Required) ==================

// Get business info for booking (by slug)
router.get("/business/:slug/info", appointmentController.getBusinessInfoForBooking);

// Get available time slots (by slug)
router.get("/business/:slug/slots", appointmentController.getAvailableSlotsForBooking);

// Get available slots (by businessId - Internal/Shared)
router.get("/available-slots", appointmentController.getAvailableSlots);

// Book appointment (by slug)
router.post("/business/:slug/book", appointmentController.bookAppointmentPublic);

// Verify booking OTP (by slug)
router.post("/business/:slug/book/verify", appointmentController.verifyBookingOTP);

// Get appointment by confirmation code (public)
router.get("/confirmation/:confirmationCode", appointmentController.getAppointmentByConfirmationCode);

// Cancel appointment by confirmation code (public)
router.post("/confirmation/:confirmationCode/cancel", appointmentController.cancelAppointmentByCode);

// ================== PROTECTED ROUTES (Authentication Required) ==================

// All routes below require authentication (Admin or Manager)
router.use(authMiddleware, roleMiddleware(["admin", "manager"]));

// ================== Appointment Management ==================

// Create new appointment
router.post("/", appointmentController.createAppointment);

// Get appointments with filtering and pagination
router.get("/", appointmentController.getAppointments);

// Get appointment statistics
router.get("/stats", appointmentController.getAppointmentStats);

// Get appointment by ID
router.get("/:id", appointmentController.getAppointmentById);

// Update appointment
router.put("/:id", appointmentController.updateAppointment);

// ================== Appointment Actions ==================

// Confirm appointment
router.post("/:id/confirm", appointmentController.confirmAppointment);

// Start appointment (customer checked in)
router.post("/:id/start", appointmentController.startAppointment);

// Complete appointment
router.post("/:id/complete", appointmentController.completeAppointment);

// Cancel appointment
router.post("/:id/cancel", appointmentController.cancelAppointment);

// Reschedule appointment
router.post("/:id/reschedule", appointmentController.rescheduleAppointment);

// Mark as no-show
router.post("/:id/no-show", appointmentController.markNoShow);

// Add review to appointment
router.post("/:id/review", appointmentController.addReview);

// Update appointment status
router.patch("/:id/status", appointmentController.updateAppointmentStatus);

// Download Invoice
router.get("/:id/invoice", appointmentController.downloadInvoice);

module.exports = router;
