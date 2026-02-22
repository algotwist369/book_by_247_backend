const mongoose = require("mongoose");

const adminNotificationSchema = new mongoose.Schema(
    {
        admin: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true, index: true },
        
        // Notification details
        title: { type: String, required: true },
        message: { type: String, required: true },
        type: {
            type: String,
            enum: ["system", "business", "user", "payment", "security", "update", "reminder"],
            required: true,
            index: true
        },
        
        // Related entities (optional)
        relatedBusiness: { type: mongoose.Schema.Types.ObjectId, ref: "Business" },
        relatedManager: { type: mongoose.Schema.Types.ObjectId, ref: "Manager" },
        relatedUser: { type: mongoose.Schema.Types.ObjectId }, // Admin, Manager, or Staff
        
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
            source: { type: String }, // e.g., "system", "payment_gateway", "security_monitor"
            eventId: { type: String },
            category: { type: String }
        }
    },
    { timestamps: true }
);

// Indexes for efficient queries
adminNotificationSchema.index({ admin: 1, isRead: 1, createdAt: -1 });
adminNotificationSchema.index({ admin: 1, type: 1, createdAt: -1 });
adminNotificationSchema.index({ admin: 1, priority: 1, isRead: 1 });

// Method to mark as read
adminNotificationSchema.methods.markAsRead = function() {
    this.isRead = true;
    this.readAt = new Date();
    return this.save();
};

// Static method to create system notification
adminNotificationSchema.statics.createSystemNotification = async function(adminId, title, message, options = {}) {
    const notification = new this({
        admin: adminId,
        title,
        message,
        type: options.type || 'system',
        priority: options.priority || 'normal',
        actionUrl: options.actionUrl,
        actionText: options.actionText,
        metadata: options.metadata || {}
    });
    
    return await notification.save();
};

module.exports = mongoose.model("AdminNotification", adminNotificationSchema);

