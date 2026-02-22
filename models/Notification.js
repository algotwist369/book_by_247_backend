const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
    {
        business: { type: mongoose.Schema.Types.ObjectId, ref: "Business", required: true, index: true },
        sender: { type: mongoose.Schema.Types.ObjectId, ref: "Manager", required: true, index: true },

        // Notification details
        title: { type: String, required: true },
        message: { type: String, required: true },
        type: {
            type: String,
            enum: ["promotion", "reminder", "announcement", "offer", "event", "appointment", "general"],
            required: true,
            index: true
        },

        // Targeting
        targetAudience: {
            type: {
                type: String,
                enum: ["all", "segment", "individual", "loyalty", "new", "inactive"],
                default: "all"
            },
            segments: [{
                name: { type: String },
                criteria: {
                    minVisits: { type: Number },
                    maxVisits: { type: Number },
                    minSpent: { type: Number },
                    maxSpent: { type: Number },
                    lastVisitDays: { type: Number },
                    preferredServices: [{ type: String }],
                    ageRange: {
                        min: { type: Number },
                        max: { type: Number }
                    },
                    gender: [{ type: String, enum: ["male", "female", "other"] }]
                }
            }],
            individualCustomers: [{ type: mongoose.Schema.Types.ObjectId, ref: "Customer" }]
        },

        // Content
        content: {
            imageUrl: { type: String },
            actionUrl: { type: String }, // Link to booking, offer, etc.
            actionText: { type: String }, // "Book Now", "Claim Offer", etc.
            expiryDate: { type: Date },
            discountCode: { type: String },
            discountPercentage: { type: Number },
            discountAmount: { type: Number }
        },

        // Delivery settings
        delivery: {
            channels: [{
                type: String,
                enum: ["sms", "email", "whatsapp", "push"],
                required: true
            }],
            scheduledAt: { type: Date, default: Date.now },
            timezone: { type: String, default: "Asia/Kolkata" },
            priority: {
                type: String,
                enum: ["low", "normal", "high", "urgent"],
                default: "normal"
            }
        },

        // Campaign tracking
        campaign: {
            name: { type: String },
            description: { type: String },
            tags: [{ type: String }]
        },

        // Status and tracking
        status: {
            type: String,
            enum: ["draft", "scheduled", "sending", "sent", "failed", "cancelled"],
            default: "draft",
            index: true
        },

        // Delivery statistics
        stats: {
            totalRecipients: { type: Number, default: 0 },
            sent: { type: Number, default: 0 },
            delivered: { type: Number, default: 0 },
            opened: { type: Number, default: 0 },
            clicked: { type: Number, default: 0 },
            failed: { type: Number, default: 0 },
            bounced: { type: Number, default: 0 }
        },

        // Individual delivery records
        deliveries: [{
            customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
            channel: { type: String, enum: ["sms", "email", "whatsapp", "push"] },
            status: {
                type: String,
                enum: ["pending", "sent", "delivered", "opened", "clicked", "failed", "bounced"],
                default: "pending"
            },
            sentAt: { type: Date },
            deliveredAt: { type: Date },
            openedAt: { type: Date },
            clickedAt: { type: Date },
            failedAt: { type: Date },
            failureReason: { type: String },
            response: { type: String } // For tracking customer responses
        }],

        // Analytics
        analytics: {
            openRate: { type: Number, default: 0 },
            clickRate: { type: Number, default: 0 },
            conversionRate: { type: Number, default: 0 },
            revenue: { type: Number, default: 0 },
            newBookings: { type: Number, default: 0 }
        },

        // Metadata
        metadata: {
            createdBy: { type: String },
            approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Manager" },
            approvedAt: { type: Date },
            notes: { type: String }
        }
    },
    { timestamps: true }
);

// Indexes
notificationSchema.index({ business: 1, status: 1 });
notificationSchema.index({ business: 1, type: 1 });
notificationSchema.index({ business: 1, createdAt: -1 });
notificationSchema.index({ "delivery.scheduledAt": 1 });
notificationSchema.index({ "campaign.name": 1 });

// Virtual for delivery rate
notificationSchema.virtual('deliveryRate').get(function () {
    if (this.stats.totalRecipients === 0) return 0;
    return (this.stats.delivered / this.stats.totalRecipients) * 100;
});

// Virtual for engagement rate
notificationSchema.virtual('engagementRate').get(function () {
    if (this.stats.delivered === 0) return 0;
    return ((this.stats.opened + this.stats.clicked) / this.stats.delivered) * 100;
});

// Method to update delivery stats
notificationSchema.methods.updateStats = function (saveDocument = false) {
    const deliveries = this.deliveries;

    this.stats.totalRecipients = deliveries.length;
    this.stats.sent = deliveries.filter(d => d.status !== 'pending').length;
    this.stats.delivered = deliveries.filter(d => ['delivered', 'opened', 'clicked'].includes(d.status)).length;
    this.stats.opened = deliveries.filter(d => ['opened', 'clicked'].includes(d.status)).length;
    this.stats.clicked = deliveries.filter(d => d.status === 'clicked').length;
    this.stats.failed = deliveries.filter(d => d.status === 'failed').length;
    this.stats.bounced = deliveries.filter(d => d.status === 'bounced').length;

    // Calculate rates
    this.analytics.openRate = this.stats.delivered > 0 ? (this.stats.opened / this.stats.delivered) * 100 : 0;
    this.analytics.clickRate = this.stats.delivered > 0 ? (this.stats.clicked / this.stats.delivered) * 100 : 0;

    return saveDocument ? this.save() : this;
};

// Method to add delivery record
notificationSchema.methods.addDelivery = function (customerId, channel, status = 'pending', saveDocument = false) {
    this.deliveries.push({
        customer: customerId,
        channel: channel,
        status: status,
        sentAt: status !== 'pending' ? new Date() : null
    });

    return saveDocument ? this.save() : this;
};

// Method to update delivery status
notificationSchema.methods.updateDeliveryStatus = function (customerId, channel, status, additionalData = {}, saveDocument = false) {
    const delivery = this.deliveries.find(d =>
        d.customer.toString() === customerId.toString() && d.channel === channel
    );

    if (delivery) {
        delivery.status = status;

        switch (status) {
            case 'delivered':
                delivery.deliveredAt = new Date();
                break;
            case 'opened':
                delivery.openedAt = new Date();
                break;
            case 'clicked':
                delivery.clickedAt = new Date();
                break;
            case 'failed':
                delivery.failedAt = new Date();
                delivery.failureReason = additionalData.reason;
                break;
        }

        if (additionalData.response) {
            delivery.response = additionalData.response;
        }
    }

    return saveDocument ? this.save() : this;
};

module.exports = mongoose.model("Notification", notificationSchema);
