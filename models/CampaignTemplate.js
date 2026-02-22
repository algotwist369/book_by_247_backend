// CampaignTemplate.js - Campaign template model
const mongoose = require("mongoose");

const campaignTemplateSchema = new mongoose.Schema(
    {
        // Template Details
        name: {
            type: String,
            required: true,
            trim: true
        },
        description: {
            type: String
        },
        
        // Category
        category: {
            type: String,
            enum: [
                "welcome",
                "birthday",
                "anniversary",
                "promotional",
                "seasonal",
                "retention",
                "reactivation",
                "feedback",
                "thank_you",
                "review_request",
                "appointment_reminder",
                "loyalty",
                "referral",
                "custom"
            ],
            required: true,
            index: true
        },
        
        // Campaign Type
        campaignType: {
            type: String,
            enum: ["promotional", "seasonal", "loyalty", "reactivation", "birthday", "anniversary", "referral", "feedback", "announcement"],
            required: true
        },
        
        // Template Content
        message: {
            subject: { type: String },
            body: { type: String, required: true },
            variables: [{ type: String }] // e.g., ["customerName", "businessName", "offerAmount"]
        },
        
        // Email Specific
        emailContent: {
            htmlBody: { type: String },
            previewText: { type: String }
        },
        
        // Default Channels
        defaultChannels: [{
            type: String,
            enum: ["email", "sms", "whatsapp", "push_notification"]
        }],
        
        // Default Offer Structure
        defaultOffer: {
            hasOffer: { type: Boolean, default: false },
            offerType: {
                type: String,
                enum: ["percentage", "fixed", "free_service", "loyalty_points"]
            },
            offerValue: { type: Number },
            validityDays: { type: Number, default: 7 }
        },
        
        // Default Target Audience Suggestions
        suggestedAudience: {
            customerType: [{
                type: String,
                enum: ["new", "regular", "vip", "inactive"]
            }],
            membershipTier: [{
                type: String,
                enum: ["none", "bronze", "silver", "gold", "platinum"]
            }]
        },
        
        // Preview Image
        previewImage: {
            type: String
        },
        
        // Template Settings
        isPublic: {
            type: Boolean,
            default: true
        },
        isActive: {
            type: Boolean,
            default: true
        },
        
        // Usage Statistics
        stats: {
            timesUsed: { type: Number, default: 0 },
            avgOpenRate: { type: Number, default: 0 },
            avgClickRate: { type: Number, default: 0 },
            avgConversionRate: { type: Number, default: 0 }
        },
        
        // Business Reference (null for system templates)
        business: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Business",
            index: true
        },
        
        // Tags for easy search
        tags: [{ type: String }],
        
        // Created By
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: 'createdByModel'
        },
        createdByModel: {
            type: String,
            enum: ['Admin', 'Manager', 'System']
        }
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);

// Indexes
campaignTemplateSchema.index({ category: 1, isActive: 1 });
campaignTemplateSchema.index({ business: 1, isActive: 1 });
campaignTemplateSchema.index({ tags: 1 });
campaignTemplateSchema.index({ 'stats.timesUsed': -1 });

// Method to render template with variables
campaignTemplateSchema.methods.render = function(variables = {}) {
    let subject = this.message.subject || '';
    let body = this.message.body || '';
    let htmlBody = this.emailContent?.htmlBody || '';
    
    // Replace variables in subject and body
    Object.keys(variables).forEach(key => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        subject = subject.replace(regex, variables[key]);
        body = body.replace(regex, variables[key]);
        htmlBody = htmlBody.replace(regex, variables[key]);
    });
    
    return {
        subject,
        body,
        htmlBody
    };
};

// Method to increment usage
campaignTemplateSchema.methods.incrementUsage = async function() {
    this.stats.timesUsed += 1;
    await this.save();
};

// Static method to get popular templates
campaignTemplateSchema.statics.getPopular = async function(limit = 10) {
    return await this.find({ isActive: true, isPublic: true })
        .sort({ 'stats.timesUsed': -1 })
        .limit(limit);
};

// Static method to get by category
campaignTemplateSchema.statics.getByCategory = async function(category, businessId = null) {
    const query = { category, isActive: true };
    
    if (businessId) {
        query.$or = [
            { business: businessId },
            { business: null, isPublic: true }
        ];
    } else {
        query.business = null;
        query.isPublic = true;
    }
    
    return await this.find(query).sort({ 'stats.timesUsed': -1 });
};

module.exports = mongoose.model("CampaignTemplate", campaignTemplateSchema);

