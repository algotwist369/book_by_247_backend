// Campaign.js - Marketing campaign model
const mongoose = require("mongoose");

const campaignSchema = new mongoose.Schema(
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
        
        // Campaign Type
        type: { 
            type: String, 
            enum: ["promotional", "seasonal", "loyalty", "reactivation", "birthday", "anniversary", "referral", "feedback", "announcement"],
            required: true,
            index: true
        },
        
        // Communication Channels
        channels: [{
            type: String,
            enum: ["email", "sms", "whatsapp", "push_notification", "in_app"],
            required: true
        }],
        
        // Message Content
        message: {
            subject: { type: String }, // For email
            body: { type: String, required: true },
            template: { type: String }, // Template ID if using templates
            variables: { type: Map, of: String } // Dynamic variables for personalization
        },
        
        // Email Specific
        emailContent: {
            htmlBody: { type: String },
            attachments: [{ type: String }]
        },
        
        // Offer/Discount Details
        offer: {
            hasOffer: { type: Boolean, default: false },
            offerType: {
                type: String, 
                enum: ["percentage", "fixed", "free_service", "loyalty_points"]
            },
            offerValue: { type: Number },
            promoCode: { type: String },
            validFrom: { type: Date },
            validUntil: { type: Date },
            termsAndConditions: { type: String }
        },
        
        // Target Audience
        targetAudience: {
                        type: String, 
            enum: ["all", "specific", "segment"],
                        default: "all"
                    },
        
        // Specific Customer IDs (if targetAudience is 'specific')
        targetCustomers: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "Customer"
        }],
        
        // Segment Filters (if targetAudience is 'segment')
        segmentFilters: {
            customerType: [{
                type: String,
                enum: ["new", "regular", "vip", "inactive"]
            }],
            membershipTier: [{
                type: String,
                enum: ["none", "bronze", "silver", "gold", "platinum"]
            }],
            minTotalSpent: { type: Number },
            maxTotalSpent: { type: Number },
                    minVisits: { type: Number },
                    maxVisits: { type: Number },
            lastVisitBefore: { type: Date },
            lastVisitAfter: { type: Date },
            hasEmail: { type: Boolean },
            hasPhone: { type: Boolean },
            marketingConsent: {
                email: { type: Boolean },
                sms: { type: Boolean },
                whatsapp: { type: Boolean }
            },
            tags: [{ type: String }]
        },
        
        // Schedule
        scheduledDate: {
            type: Date,
            index: true
        },
        scheduledTime: {
            type: String
        },
        timezone: {
            type: String,
            default: "Asia/Kolkata"
        },
        
        // Recurring Campaign
        isRecurring: {
            type: Boolean,
            default: false
        },
        recurringPattern: {
            frequency: {
                    type: String, 
                enum: ["daily", "weekly", "monthly", "yearly"]
            },
            interval: { type: Number, default: 1 },
            endDate: { type: Date }
        },
        
        // Status
        status: { 
            type: String, 
            enum: ["draft", "scheduled", "in_progress", "completed", "cancelled", "failed"],
            default: "draft",
            index: true
        },
        
        // Execution Details
        executionStartedAt: {
            type: Date
        },
        executionCompletedAt: {
            type: Date
        },
        
        // Statistics
        stats: {
            totalRecipients: { type: Number, default: 0 },
            sent: { type: Number, default: 0 },
            delivered: { type: Number, default: 0 },
            failed: { type: Number, default: 0 },
            opened: { type: Number, default: 0 },
            clicked: { type: Number, default: 0 },
            converted: { type: Number, default: 0 },
            unsubscribed: { type: Number, default: 0 },
            bounced: { type: Number, default: 0 }
        },
        
        // Cost & Budget
        budget: {
            type: Number,
            min: 0
        },
        costPerMessage: {
            type: Number,
            default: 0
        },
        totalCost: {
            type: Number,
            default: 0
        },
        
        // ROI Tracking
        roi: {
            revenue: { type: Number, default: 0 },
            appointments: { type: Number, default: 0 },
            newCustomers: { type: Number, default: 0 }
        },
        
        // A/B Testing
        abTest: {
            enabled: { type: Boolean, default: false },
            variants: [{
                name: { type: String },
                    message: { type: String },
                recipients: { type: Number, default: 0 },
                    sent: { type: Number, default: 0 },
                    opened: { type: Number, default: 0 },
                    clicked: { type: Number, default: 0 },
                    converted: { type: Number, default: 0 }
            }]
        },
        
        // Tracking
        trackingEnabled: {
            type: Boolean,
            default: true
        },
        clickTrackingUrl: {
            type: String
        },
        
        // Campaign Recipients (detailed tracking)
        recipients: [{
            customer: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Customer"
            },
            channel: {
                type: String,
                enum: ["email", "sms", "whatsapp", "push_notification"]
            },
            status: {
                type: String,
                enum: ["pending", "sent", "delivered", "failed", "opened", "clicked", "converted"],
                default: "pending"
            },
            sentAt: { type: Date },
            deliveredAt: { type: Date },
            openedAt: { type: Date },
            clickedAt: { type: Date },
            convertedAt: { type: Date },
            failureReason: { type: String },
            messageId: { type: String } // External message ID from provider
        }],
        
        // Notes
        notes: {
            type: String
        },
        
        // Metadata
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: 'createdByModel'
        },
        createdByModel: {
            type: String,
            enum: ['Manager', 'Admin']
        },
        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: 'updatedByModel'
        },
        updatedByModel: {
            type: String, 
            enum: ['Manager', 'Admin']
        }
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);

// Indexes for better performance
campaignSchema.index({ business: 1, status: 1 });
campaignSchema.index({ business: 1, type: 1 });
campaignSchema.index({ business: 1, scheduledDate: 1 });
campaignSchema.index({ business: 1, createdAt: -1 });

// Virtual for delivery rate
campaignSchema.virtual('deliveryRate').get(function() {
    if (this.stats.sent === 0) return 0;
    return Math.round((this.stats.delivered / this.stats.sent) * 100);
});

// Virtual for open rate
campaignSchema.virtual('openRate').get(function() {
    if (this.stats.delivered === 0) return 0;
    return Math.round((this.stats.opened / this.stats.delivered) * 100);
});

// Virtual for click rate
campaignSchema.virtual('clickRate').get(function() {
    if (this.stats.opened === 0) return 0;
    return Math.round((this.stats.clicked / this.stats.opened) * 100);
});

// Virtual for conversion rate
campaignSchema.virtual('conversionRate').get(function() {
    if (this.stats.delivered === 0) return 0;
    return Math.round((this.stats.converted / this.stats.delivered) * 100);
});

// Virtual for ROI percentage
campaignSchema.virtual('roiPercentage').get(function() {
    if (this.totalCost === 0) return 0;
    return Math.round(((this.roi.revenue - this.totalCost) / this.totalCost) * 100);
});

// Method to start campaign execution
campaignSchema.methods.start = async function() {
    this.status = 'in_progress';
    this.executionStartedAt = new Date();
    await this.save();
};

// Method to complete campaign
campaignSchema.methods.complete = async function() {
    this.status = 'completed';
    this.executionCompletedAt = new Date();
    await this.save();
};

// Method to cancel campaign
campaignSchema.methods.cancel = async function() {
    this.status = 'cancelled';
    await this.save();
};

// Method to update recipient status
campaignSchema.methods.updateRecipientStatus = async function(customerId, channel, status, timestamp) {
    const recipient = this.recipients.find(
        r => r.customer.toString() === customerId.toString() && r.channel === channel
    );
    
    if (recipient) {
        recipient.status = status;
        
        switch (status) {
            case 'sent':
                recipient.sentAt = timestamp;
                this.stats.sent += 1;
                break;
            case 'delivered':
                recipient.deliveredAt = timestamp;
                this.stats.delivered += 1;
                break;
            case 'opened':
                recipient.openedAt = timestamp;
                this.stats.opened += 1;
                break;
            case 'clicked':
                recipient.clickedAt = timestamp;
                this.stats.clicked += 1;
                break;
            case 'converted':
                recipient.convertedAt = timestamp;
                this.stats.converted += 1;
                break;
            case 'failed':
                this.stats.failed += 1;
                break;
        }
        
        await this.save();
    }
};

// Method to calculate total cost
campaignSchema.methods.calculateCost = function() {
    this.totalCost = this.stats.sent * this.costPerMessage;
    return this.totalCost;
};

// Static method to get active campaigns
campaignSchema.statics.getActiveCampaigns = async function(businessId) {
    return await this.find({
        business: businessId,
        status: { $in: ['scheduled', 'in_progress'] }
    }).sort({ scheduledDate: 1 });
};

// Static method to get campaign performance
campaignSchema.statics.getPerformanceStats = async function(businessId, startDate, endDate) {
    const result = await this.aggregate([
        {
            $match: {
                business: businessId,
                status: 'completed',
                executionCompletedAt: {
                    $gte: startDate,
                    $lte: endDate
                }
            }
        },
        {
            $group: {
                _id: null,
                totalCampaigns: { $sum: 1 },
                totalSent: { $sum: '$stats.sent' },
                totalDelivered: { $sum: '$stats.delivered' },
                totalOpened: { $sum: '$stats.opened' },
                totalClicked: { $sum: '$stats.clicked' },
                totalConverted: { $sum: '$stats.converted' },
                totalCost: { $sum: '$totalCost' },
                totalRevenue: { $sum: '$roi.revenue' }
            }
        }
    ]);
    
    return result[0] || {
        totalCampaigns: 0,
        totalSent: 0,
        totalDelivered: 0,
        totalOpened: 0,
        totalClicked: 0,
        totalConverted: 0,
        totalCost: 0,
        totalRevenue: 0
    };
};

module.exports = mongoose.model("Campaign", campaignSchema);
