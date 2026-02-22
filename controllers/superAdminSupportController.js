const SuperAdminSupport = require("../models/SuperAdminSupport");
const SuperAdminSupportNotification = require("../models/superAdminSupportNotification");
const SuperAdminNotification = require("../models/SuperAdminNotification");
const Admin = require("../models/Admin");
const Business = require("../models/Business");
const { emitToRole } = require("../config/socket");

const createSupportTicket = async (req, res, next) => {
    try {
        const adminId = req.user.id;
        const { business_id, issue_type, priority, subject, description } = req.body;

        if (!business_id || !issue_type || !priority || !subject || !description) {
            return res.status(400).json({
                success: false,
                message: "Please provide all required fields (business_id, issue_type, priority, subject, description)"
            });
        }

        // Fetch Admin details
        const admin = await Admin.findById(adminId);
        if (!admin) {
            return res.status(404).json({ success: false, message: "Admin not found" });
        }

        // Fetch Business details
        let businessName = "All Businesses / General";
        let businessId = null;

        if (business_id && business_id !== 'all') {
            const business = await Business.findById(business_id);
            if (!business) {
                return res.status(404).json({ message: "Business not found" });
            }
            businessName = business.name;
            businessId = business_id;
        }

        const newTicket = new SuperAdminSupport({
            admin_id: req.user.id,
            admin_name: admin.name,
            admin_email: admin.email,
            admin_phone: admin.phone,
            admin_company_name: admin.companyName,
            business_id: businessId,
            business_name: businessName,
            issue_type,
            priority,
            subject,
            description
        });

        await newTicket.save();

        // Create notification records for Super Admin
        try {
            // 1. Support-specific notification (for Support Sidebar)
            const supportNotif = new SuperAdminSupportNotification({
                type: priority, // Using ticket priority as notification type
                title: 'New Support Ticket',
                message: `${admin.name} (${admin.companyName}) raised a ticket: ${subject}`,
                link: '/support-management',
                metadata: {
                    ticketId: newTicket._id,
                    businessName
                }
            });
            await supportNotif.save();

            // 2. National/General notification (for Main Notification Bell)
            const generalNotif = new SuperAdminNotification({
                type: 'warning',
                title: 'Support Ticket Raised',
                message: `${admin.name} raised a ticket: ${subject}`,
                link: '/support-management',
                metadata: { ticketId: newTicket._id }
            });
            await generalNotif.save();

            // Emit general notification event
            emitToRole("super-admin", "superAdminNotification:new", {
                notification: generalNotif
            });

        } catch (notifyErr) {
            console.error('Failed to save support notifications:', notifyErr.message);
        }

        // Emit support-specific update event (for badges and sidebar)
        emitToRole("super-admin", "supportTicket:updated", {
            type: "new_ticket",
            ticket: newTicket
        });

        res.status(201).json({
            success: true,
            message: "Support ticket raised successfully",
            data: newTicket
        });
    } catch (error) {
        next(error);
    }
};

const getAdminSupportTickets = async (req, res, next) => {
    try {
        const adminId = req.user.id;
        const tickets = await SuperAdminSupport.find({ admin_id: adminId }).sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: tickets.length,
            data: tickets
        });
    } catch (error) {
        next(error);
    }
};


const getSuperAdminSupportTickets = async (req, res, next) => {
    try {
        const { status, search, page = 1, limit = 10 } = req.query;
        const query = {};

        if (status && status !== 'all') {
            query.status = status;
        }

        if (search) {
            query.$or = [
                { admin_name: { $regex: search, $options: 'i' } },
                { admin_email: { $regex: search, $options: 'i' } },
                { admin_company_name: { $regex: search, $options: 'i' } },
                { subject: { $regex: search, $options: 'i' } },
                { business_name: { $regex: search, $options: 'i' } }
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await SuperAdminSupport.countDocuments(query);
        const tickets = await SuperAdminSupport.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        res.status(200).json({
            success: true,
            count: tickets.length,
            total,
            page: parseInt(page),
            totalPages: Math.ceil(total / limit),
            data: tickets
        });
    } catch (error) {
        next(error);
    }
};

const updateTicketStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!["open", "pending", "resolved", "closed"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid status. Must be one of: open, pending, resolved, closed"
            });
        }

        const ticket = await SuperAdminSupport.findByIdAndUpdate(
            id,
            { status },
            { new: true, runValidators: true }
        );

        if (!ticket) {
            return res.status(404).json({ success: false, message: "Support ticket not found" });
        }

        // Emit real-time update to Super Admins
        emitToRole("super-admin", "supportTicket:updated", {
            type: "status_updated",
            ticketId: id,
            status: status,
            ticket: ticket
        });

        res.status(200).json({
            success: true,
            message: "Ticket status updated successfully",
            data: ticket
        });
    } catch (error) {
        next(error);
    }
};

const updateNotificationStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { read, delivered } = req.body;

        const updateData = {};
        if (read !== undefined) updateData.read = read;
        if (delivered !== undefined) updateData.delivered = delivered;

        const notification = await SuperAdminSupportNotification.findByIdAndUpdate(
            id,
            updateData,
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({ success: false, message: "Notification not found" });
        }

        res.status(200).json({
            success: true,
            data: notification
        });
    } catch (error) {
        next(error);
    }
};

const clearAllNotifications = async (req, res, next) => {
    try {
        await SuperAdminSupportNotification.deleteMany({});
        res.status(200).json({
            success: true,
            message: "All support notifications cleared successfully"
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    createSupportTicket,
    getAdminSupportTickets,
    getSuperAdminSupportTickets,
    updateTicketStatus,
    clearAllNotifications,
    updateNotificationStatus
};
