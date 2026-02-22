const express = require("express");
const router = express.Router();
const controller = require("../controllers/superAdminSupportController");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const superAdminAuth = require("../middleware/superAdminAuth");

// ================== Admin Routes ==================
// POST /api/support/admin - Raise a ticket
router.post("/admin", authMiddleware, roleMiddleware(["admin"]), controller.createSupportTicket);

// GET /api/support/admin - Get own tickets
router.get("/admin", authMiddleware, roleMiddleware(["admin"]), controller.getAdminSupportTickets);

// ================== Super Admin Routes ==================
// GET /api/support/super-admin - View all tickets
router.get("/super-admin", superAdminAuth, controller.getSuperAdminSupportTickets);

// PUT /api/support/super-admin/:id - Update ticket status
router.put("/super-admin/:id", superAdminAuth, controller.updateTicketStatus);

// DELETE /api/support/super-admin/notifications/clear - Clear all support notifications
router.delete("/super-admin/notifications/clear", superAdminAuth, controller.clearAllNotifications);

// PATCH /api/support/super-admin/notifications/:id - Update notification status (read/delivered)
router.patch("/super-admin/notifications/:id", superAdminAuth, controller.updateNotificationStatus);

module.exports = router;
