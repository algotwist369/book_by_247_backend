const mongoose = require("mongoose");

const inventoryManagementSchema = new mongoose.Schema(
    {
        business: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Business",
            required: true,
            index: true
        },
        raisedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Manager", // Can also be Staff if needed
            required: true
        },
        // Optional: Link to an appointment if the need arose during a specific service
        relatedAppointment: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Appointment"
        },
        
        // Type of issue/request
        type: {
            type: String,
            enum: ["inventory_restock", "maintenance_issue", "staffing_request", "other"],
            required: true,
            default: "inventory_restock"
        },
        
        priority: {
            type: String,
            enum: ["low", "medium", "high", "critical"],
            default: "medium"
        },

        // Specific details for inventory requests
        items: [{
            itemName: { type: String, required: true },
            currentStock: { type: Number }, // Optional: what they have left
            requestedQuantity: { type: Number, required: true },
            unit: { type: String, default: 'units' } // e.g., bottles, boxes, liters
        }],

        // General description of the issue or request
        subject: {
            type: String,
            required: true
        },
        description: {
            type: String,
            required: true
        },
        
        // Attachments (optional, for photos of broken items etc.)
        images: [{
            type: String
        }],

        // Admin Workflow
        status: {
            type: String,
            enum: ["pending", "reviewed", "approved", "rejected", "fulfilled", "cancelled"],
            default: "pending",
            index: true
        },
        adminResponse: {
            type: String // Admin's comments, approval notes, or rejection reason
        },
        actionTaken: {
            type: String // e.g., "Ordered from supplier", "Scheduled repair"
        },
        resolvedAt: {
            type: Date
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("InventoryManagement", inventoryManagementSchema);
