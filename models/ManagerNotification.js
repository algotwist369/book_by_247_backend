const mongoose = require("mongoose");

const managerNotificationSchema = new mongoose.Schema(
    {
        manager: { type: mongoose.Schema.Types.ObjectId, ref: "Manager", required: true, index: true },
        business: { type: mongoose.Schema.Types.ObjectId, ref: "Business", required: true, index: true },

        // Notification details
        title: { type: String, required: true },
        message: { type: String, required: true },
        type: {
            type: String,
            enum: ["appointment", "system", "business", "user", "payment", "security", "update", "reminder"],
            required: true,
            default: "system",
            index: true
        },

        // Related entities (optional)
        relatedCustomer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
        relatedAppointment: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment" },

        // Priority
        priority: {
            type: String,
            enum: ["low", "normal", "high", "urgent"],
            default: "normal",
            index: true
        },

        // Read status
        isRead: { type: Boolean, default: false, index: true },
        readAt: { type: Date },

        // Action link
        actionUrl: { type: String },
        actionText: { type: String },

        // Additional data
        metadata: {
            source: { type: String },
            eventId: { type: String },
            category: { type: String }
        }
    },
    { timestamps: true }
);

// Indexes for efficient queries
managerNotificationSchema.index({ manager: 1, isRead: 1, createdAt: -1 });
managerNotificationSchema.index({ manager: 1, type: 1, createdAt: -1 });
managerNotificationSchema.index({ business: 1, createdAt: -1 });

// Method to mark as read
managerNotificationSchema.methods.markAsRead = function () {
    this.isRead = true;
    this.readAt = new Date();
    return this.save();
};

// Static method to create notification
managerNotificationSchema.statics.createNotification = async function (managerId, businessId, title, message, options = {}) {
    const notification = new this({
        manager: managerId,
        business: businessId,
        title,
        message,
        type: options.type || 'system',
        priority: options.priority || 'normal',
        relatedCustomer: options.relatedCustomer,
        relatedAppointment: options.relatedAppointment,
        actionUrl: options.actionUrl,
        actionText: options.actionText,
        metadata: options.metadata || {}
    });

    return await notification.save();
};

module.exports = mongoose.model("ManagerNotification", managerNotificationSchema);
