const InventoryManagement = require("../models/InventoryManagement");
const Business = require("../models/Business");
const Manager = require("../models/Manager");
const Appointment = require("../models/Appointment");

const createRequest = async (req, res) => {
    try {
        const {
            businessId,
            relatedAppointmentId,
            type,
            priority,
            items,
            subject,
            description,
            images
        } = req.body;

        const userId = req.user.id;
        const userRole = req.user.role; // 'manager' or 'staff'

        // Verify business access
        let hasAccess = false;
        let targetBusinessId = businessId;

        if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            if (manager) {
                if (targetBusinessId) {
                    hasAccess = manager.business.toString() === targetBusinessId;
                } else {
                    // Auto-assign manager's business if not provided
                    targetBusinessId = manager.business.toString();
                    hasAccess = true;
                }
            }
        } else if (userRole === 'admin') {
             // Admins usually don't raise requests for themselves, but if they do:
             const business = await Business.findOne({ _id: targetBusinessId, admin: userId });
             hasAccess = !!business;
        }
        // TODO: Add staff check if staff can raise requests

        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                message: "Access denied. You do not have permission for this business."
            });
        }

        // Validate related appointment if provided
        if (relatedAppointmentId) {
            const appointment = await Appointment.findById(relatedAppointmentId);
            if (!appointment) {
                return res.status(404).json({
                    success: false,
                    message: "Related appointment not found"
                });
            }
            if (appointment.business.toString() !== targetBusinessId) {
                return res.status(400).json({
                    success: false,
                    message: "Appointment does not belong to this business"
                });
            }
        }

        const newRequest = await InventoryManagement.create({
            business: targetBusinessId,
            raisedBy: userId,
            relatedAppointment: relatedAppointmentId || null,
            type,
            priority: priority || 'medium',
            items: items || [],
            subject,
            description,
            images: images || [],
            status: 'pending'
        });

        res.status(201).json({
            success: true,
            message: "Request submitted successfully",
            data: newRequest
        });

    } catch (error) {
        console.error("Error creating request:", error);
        res.status(500).json({
            success: false,
            message: "Server Error",
            error: error.message
        });
    }
};

const getRequests = async (req, res) => {
    try {
        const { businessId, status, type, priority, startDate, endDate } = req.query;
        const userId = req.user.id;
        const userRole = req.user.role;

        let query = {};

        // Authorization & Scoping
        if (userRole === 'admin') {
             // MULTI-TENANCY CHECK: Admin can ONLY see requests for businesses they explicitly own.
             // This ensures Admin 1 cannot see Admin 2's data.
             if (businessId) {
                 // Verify the specific business belongs to this admin
                 const business = await Business.findOne({ _id: businessId, admin: userId });
                 if (!business) {
                     return res.status(403).json({ success: false, message: "Access denied. You do not own this business." });
                 }
                 query.business = businessId;
             } else {
                 // Fetch ALL businesses owned by this admin
                 const businesses = await Business.find({ admin: userId }).select('_id');
                 // If admin has no businesses, they see nothing
                 if (businesses.length === 0) {
                     return res.status(200).json({ success: true, count: 0, data: [] });
                 }
                 const businessIds = businesses.map(b => b._id);
                 query.business = { $in: businessIds };
             }
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            if (!manager) return res.status(404).json({ success: false, message: "Manager not found" });
            
            // Manager can only see their business
            if (businessId && businessId !== manager.business.toString()) {
                 return res.status(403).json({ success: false, message: "Access denied" });
            }
            query.business = manager.business;
        } else {
             return res.status(403).json({ success: false, message: "Access denied" });
        }

        // Filters
        if (status) query.status = status;
        if (type) query.type = type;
        if (priority) query.priority = priority;
        
        if (startDate && endDate) {
            query.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        const requests = await InventoryManagement.find(query)
            .populate('raisedBy', 'name email role')
            .populate('relatedAppointment', 'bookingNumber service appointmentDate')
            .populate('business', 'name branch')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: requests.length,
            data: requests
        });

    } catch (error) {
        console.error("Error fetching requests:", error);
        res.status(500).json({
            success: false,
            message: "Server Error",
            error: error.message
        });
    }
};

const getRequestById = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const userRole = req.user.role;

        const request = await InventoryManagement.findById(id)
            .populate('raisedBy', 'name email role')
            .populate('relatedAppointment')
            .populate('business');

        if (!request) {
            return res.status(404).json({
                success: false,
                message: "Request not found"
            });
        }

        // Check Access
        let hasAccess = false;
        if (userRole === 'admin') {
            // MULTI-TENANCY CHECK: Verify request belongs to a business owned by this admin
            // Use _id from populated business or direct ID
            const businessIdToCheck = request.business._id || request.business;
            const business = await Business.findOne({ _id: businessIdToCheck, admin: userId });
            hasAccess = !!business;
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            hasAccess = manager && manager.business.toString() === request.business._id.toString();
        }

        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                message: "Access denied"
            });
        }

        res.status(200).json({
            success: true,
            data: request
        });

    } catch (error) {
        console.error("Error fetching request details:", error);
        res.status(500).json({
            success: false,
            message: "Server Error",
            error: error.message
        });
    }
};

const updateRequestStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, adminResponse, actionTaken } = req.body;
        const userId = req.user.id;
        const userRole = req.user.role;

        const request = await InventoryManagement.findById(id);

        if (!request) {
            return res.status(404).json({
                success: false,
                message: "Request not found"
            });
        }

        // Check Access
        let hasAccess = false;
        let isAdmin = false;

        if (userRole === 'admin') {
            // MULTI-TENANCY CHECK: Admin can only update requests for their own businesses
            const business = await Business.findOne({ _id: request.business, admin: userId });
            if (business) {
                hasAccess = true;
                isAdmin = true;
            }
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            if (manager && manager.business.toString() === request.business.toString()) {
                hasAccess = true;
                // Manager can only cancel their own pending requests
                if (request.raisedBy.toString() !== userId) {
                     // Or maybe manager can update any request from their branch? 
                     // Let's stick to: Manager can only cancel pending requests.
                }
            }
        }

        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                message: "Access denied"
            });
        }

        // Logic for updates
        if (isAdmin) {
            // Admin can update to any status
            if (status) request.status = status;
            if (adminResponse) request.adminResponse = adminResponse;
            if (actionTaken) request.actionTaken = actionTaken;
            
            if (['approved', 'rejected', 'fulfilled', 'cancelled'].includes(status)) {
                request.resolvedAt = new Date();
            }

        } else {
            // Manager restrictions
            if (status === 'cancelled' && request.status === 'pending') {
                request.status = 'cancelled';
                request.resolvedAt = new Date();
            } else {
                return res.status(403).json({
                    success: false,
                    message: "Managers can only cancel pending requests."
                });
            }
        }

        await request.save();

        res.status(200).json({
            success: true,
            message: "Request updated successfully",
            data: request
        });

    } catch (error) {
        console.error("Error updating request:", error);
        res.status(500).json({
            success: false,
            message: "Server Error",
            error: error.message
        });
    }
};

const deleteRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const userRole = req.user.role;

        const request = await InventoryManagement.findById(id);

        if (!request) {
            return res.status(404).json({
                success: false,
                message: "Request not found"
            });
        }

        let hasAccess = false;
        
        if (userRole === 'admin') {
            const business = await Business.findOne({ _id: request.business, admin: userId });
            hasAccess = !!business;
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            // Manager can only delete their own pending requests
            if (manager && manager.business.toString() === request.business.toString()) {
                if (request.raisedBy.toString() === userId && request.status === 'pending') {
                    hasAccess = true;
                }
            }
        }

        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                message: "Access denied or cannot delete non-pending request"
            });
        }

        await request.deleteOne();

        res.status(200).json({
            success: true,
            message: "Request deleted successfully"
        });

    } catch (error) {
        console.error("Error deleting request:", error);
        res.status(500).json({
            success: false,
            message: "Server Error",
            error: error.message
        });
    }
};

module.exports = {
    createRequest,
    getRequests,
    getRequestById,
    updateRequestStatus,
    deleteRequest
};
