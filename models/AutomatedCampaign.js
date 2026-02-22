// AutomatedCampaign.js - Automated campaign triggers
const mongoose = require("mongoose");

const automatedCampaignSchema = new mongoose.Schema(
    {
        // Business Reference
        business: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Business",
            required: true,
            index: true
        },

        // Campaign Details
        name: {
            type: String,
            required: true,
            trim: true
        },
        description: {
            type: String
        },

        // Trigger Type
        triggerType: {
            type: String,
            enum: [
                "customer_birthday",
                "customer_anniversary",
                "days_since_last_visit",
                "days_of_inactivity",
                "after_appointment",
                "after_purchase",
                "loyalty_tier_upgrade",
                "points_expiring",
                "subscription_expiring",
                "new_customer_signup",
                "first_purchase",
                "abandoned_cart",
                "review_request"
            ],
            required: true,
            index: true
        },

        // Trigger Configuration
        triggerConfig: {
            // For time-based triggers
            days: { type: Number }, // e.g., 7 days since last visit

            // For tier-based triggers
            fromTier: { type: String },
            toTier: { type: String },

            // For points expiring
            daysBeforeExpiry: { type: Number },

            // For subscription expiring
            daysBeforeExpiration: { type: Number },

            // Execution time (for daily checks)
            executionTime: { type: String, default: "10:00" }, // HH:mm format

            // Additional filters
            customerType: [{ type: String }],
            membershipTier: [{ type: String }],
            minTotalSpent: { type: Number },
            tags: [{ type: String }]
        },

        // Campaign Template or Custom Message
        useTemplate: {
            type: Boolean,
            default: false
        },
        template: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "CampaignTemplate"
        },

        // Custom Message (if not using template)
        message: {
            subject: { type: String },
            body: { type: String },
            variables: { type: Map, of: String }
        },

        // Email Content
        emailContent: {
            htmlBody: { type: String }
        },

        // Communication Channels
        channels: [{
            type: String,
            enum: ["email", "sms", "whatsapp", "push_notification"],
            required: true
        }],

        // Offer/Discount
        offer: {
            hasOffer: { type: Boolean, default: false },
            offerType: {
                type: String,
                enum: ["percentage", "fixed", "free_service", "loyalty_points"]
            },
            offerValue: { type: Number },
            promoCode: { type: String },
            validityDays: { type: Number, default: 7 }
        },

        // Frequency Control (to prevent spam)
        frequencyControl: {
            maxPerCustomer: { type: Number, default: 1 }, // Max times this campaign can be sent to same customer
            cooldownDays: { type: Number, default: 30 }, // Days to wait before sending again
            checkLastSent: { type: Boolean, default: true }
        },

        // Status
        isActive: {
            type: Boolean,
            default: true,
            index: true
        },

        // Schedule
        schedule: {
            startDate: { type: Date },
            endDate: { type: Date },
            timezone: { type: String, default: "Asia/Kolkata" }
        },

        // Statistics
        stats: {
            totalTriggered: { type: Number, default: 0 },
            totalSent: { type: Number, default: 0 },
            totalDelivered: { type: Number, default: 0 },
            totalOpened: { type: Number, default: 0 },
            totalClicked: { type: Number, default: 0 },
            totalConverted: { type: Number, default: 0 },
            lastTriggeredAt: { type: Date }
        },

        // Execution Log (recent executions)
        executionLog: [{
            executedAt: { type: Date },
            customersTargeted: { type: Number },
            customersSent: { type: Number },
            status: {
                type: String,
                enum: ["success", "partial", "failed"]
            },
            errorMessage: { type: String }
        }],

        // Sent To Tracking (to prevent duplicates)
        sentTo: [{
            customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
            sentAt: { type: Date },
            campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign" }
        }],

        // Created By
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: 'createdByModel'
        },
        createdByModel: {
            type: String,
            enum: ['Admin', 'Manager']
        }
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);

// Indexes
automatedCampaignSchema.index({ business: 1, isActive: 1 });
automatedCampaignSchema.index({ business: 1, triggerType: 1 });
automatedCampaignSchema.index({ 'schedule.startDate': 1, 'schedule.endDate': 1 });
automatedCampaignSchema.index({ 'sentTo.customer': 1, 'sentTo.sentAt': 1 });

// Virtual for success rate
automatedCampaignSchema.virtual('successRate').get(function () {
    if (this.stats.totalSent === 0) return 0;
    return Math.round((this.stats.totalDelivered / this.stats.totalSent) * 100);
});

// Method to check if customer already received this campaign
automatedCampaignSchema.methods.hasReceivedCampaign = function (customerId) {
    const now = new Date();
    const cooldownDate = new Date(now.getTime() - (this.frequencyControl.cooldownDays * 24 * 60 * 60 * 1000));

    const recentSends = this.sentTo.filter(s =>
        s.customer.toString() === customerId.toString() &&
        s.sentAt > cooldownDate
    );

    return recentSends.length >= this.frequencyControl.maxPerCustomer;
};

// Method to add customer to sent list
automatedCampaignSchema.methods.markAsSent = async function (customerId, campaignId) {
    this.sentTo.push({
        customer: customerId,
        sentAt: new Date(),
        campaignId
    });

    this.stats.totalSent += 1;

    // Keep only last 1000 entries to prevent array from growing too large
    if (this.sentTo.length > 1000) {
        this.sentTo = this.sentTo.slice(-1000);
    }

    await this.save();
};

// Method to log execution
automatedCampaignSchema.methods.logExecution = async function (customersTargeted, customersSent, status, errorMessage = null) {
    this.executionLog.push({
        executedAt: new Date(),
        customersTargeted,
        customersSent,
        status,
        errorMessage
    });

    // Keep only last 50 logs
    if (this.executionLog.length > 50) {
        this.executionLog = this.executionLog.slice(-50);
    }

    this.stats.totalTriggered += 1;
    this.stats.lastTriggeredAt = new Date();

    await this.save();
};

// Static method to get active automated campaigns
automatedCampaignSchema.statics.getActive = async function (businessId) {
    const now = new Date();

    const query = {
        business: businessId,
        isActive: true,
        $and: [
            {
                $or: [
                    { 'schedule.startDate': { $exists: false } },
                    { 'schedule.startDate': { $lte: now } }
                ]
            },
            {
                $or: [
                    { 'schedule.endDate': { $exists: false } },
                    { 'schedule.endDate': { $gte: now } }
                ]
            }
        ]
    };

    return await this.find(query).populate('template');
};

// Static method to get by trigger type
automatedCampaignSchema.statics.getByTriggerType = async function (businessId, triggerType) {
    return await this.find({
        business: businessId,
        triggerType,
        isActive: true
    }).populate('template');
};

module.exports = mongoose.model("AutomatedCampaign", automatedCampaignSchema);

