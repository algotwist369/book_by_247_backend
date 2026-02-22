// MembershipPlan.js - Membership plans with benefits
const mongoose = require("mongoose");

const membershipPlanSchema = new mongoose.Schema(
    {
        // Business Reference
        business: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Business",
            required: true,
            index: true
        },
        
        // Plan Details
        name: {
            type: String,
            required: true,
            trim: true
        },
        tier: {
            type: String,
            enum: ["bronze", "silver", "gold", "platinum"],
            required: true,
            unique: true,
            index: true
        },
        tagline: {
            type: String,
            maxlength: 100
        },
        description: {
            type: String,
            required: true
        },
        
        // Images
        image: {
            type: String
        },
        icon: {
            type: String
        },
        
        // Pricing
        price: {
            type: Number,
            required: true,
            min: 0
        },
        currency: {
            type: String,
            default: "INR"
        },
        
        // Duration
        duration: {
            value: { type: Number, required: true, default: 12 },
            unit: { type: String, enum: ["days", "months", "years"], default: "months" }
        },
        
        // Requirements
        minPointsRequired: {
            type: Number,
            default: 0
        },
        minSpendRequired: {
            type: Number,
            default: 0
        },
        
        // Benefits
        benefits: [{
            title: { type: String, required: true },
            description: { type: String },
            icon: { type: String }
        }],
        
        // Discounts
        discounts: {
            percentageDiscount: { type: Number, default: 0, min: 0, max: 100 },
            flatDiscount: { type: Number, default: 0 },
            applicableOn: {
                type: String,
                enum: ["all", "services", "products", "specific"],
                default: "all"
            },
            specificServices: [{
                type: mongoose.Schema.Types.ObjectId,
                ref: "Service"
            }]
        },
        
        // Points Benefits
        pointsBenefits: {
            pointsMultiplier: { type: Number, default: 1, min: 1 },
            bonusPointsOnSignup: { type: Number, default: 0 },
            bonusPointsMonthly: { type: Number, default: 0 }
        },
        
        // Inclusions
        inclusions: {
            freeServices: [{
                service: { type: mongoose.Schema.Types.ObjectId, ref: "Service" },
                quantity: { type: Number, default: 1 },
                frequency: { type: String, enum: ["once", "monthly", "quarterly", "yearly"], default: "once" }
            }],
            priorityBooking: { type: Boolean, default: false },
            dedicatedSupport: { type: Boolean, default: false },
            flexibleCancellation: { type: Boolean, default: false }
        },
        
        // Color Theme (for UI)
        colorTheme: {
            primary: { type: String, default: "#000000" },
            secondary: { type: String, default: "#ffffff" },
            gradient: { type: String }
        },
        
        // Status
        isActive: {
            type: Boolean,
            default: true,
            index: true
        },
        isPopular: {
            type: Boolean,
            default: false
        },
        
        // Display Order
        displayOrder: {
            type: Number,
            default: 0
        },
        
        // Terms & Conditions
        terms: {
            type: String
        },
        
        // Statistics
        stats: {
            totalSubscribers: { type: Number, default: 0 },
            activeSubscribers: { type: Number, default: 0 },
            revenue: { type: Number, default: 0 }
        },
        
        // Metadata
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: 'createdByModel'
        },
        createdByModel: {
            type: String,
            enum: ['Admin', 'Manager']
        },
        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: 'updatedByModel'
        },
        updatedByModel: {
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
membershipPlanSchema.index({ business: 1, isActive: 1 });
membershipPlanSchema.index({ business: 1, tier: 1 });
membershipPlanSchema.index({ displayOrder: 1 });

// Virtual for formatted price
membershipPlanSchema.virtual('formattedPrice').get(function() {
    return `${this.currency} ${this.price.toLocaleString()}`;
});

// Virtual for duration text
membershipPlanSchema.virtual('durationText').get(function() {
    const unit = this.duration.value === 1 ? this.duration.unit.slice(0, -1) : this.duration.unit;
    return `${this.duration.value} ${unit}`;
});

// Method to check if customer is eligible
membershipPlanSchema.methods.isEligible = function(customer) {
    if (customer.loyaltyPoints < this.minPointsRequired) {
        return { 
            eligible: false, 
            reason: `Need ${this.minPointsRequired - customer.loyaltyPoints} more loyalty points` 
        };
    }
    
    if (customer.totalSpent < this.minSpendRequired) {
        return { 
            eligible: false, 
            reason: `Need to spend ${this.currency} ${this.minSpendRequired - customer.totalSpent} more` 
        };
    }
    
    return { eligible: true };
};

// Method to apply discount
membershipPlanSchema.methods.calculateDiscount = function(amount, serviceId = null) {
    let discount = 0;
    
    // Check if discount is applicable
    if (this.discounts.applicableOn === 'all') {
        // Apply discount on all
        if (this.discounts.percentageDiscount > 0) {
            discount = (amount * this.discounts.percentageDiscount) / 100;
        } else if (this.discounts.flatDiscount > 0) {
            discount = this.discounts.flatDiscount;
        }
    } else if (this.discounts.applicableOn === 'specific' && serviceId) {
        // Check if service is in the list
        const isApplicable = this.discounts.specificServices.some(
            s => s.toString() === serviceId.toString()
        );
        
        if (isApplicable) {
            if (this.discounts.percentageDiscount > 0) {
                discount = (amount * this.discounts.percentageDiscount) / 100;
            } else if (this.discounts.flatDiscount > 0) {
                discount = this.discounts.flatDiscount;
            }
        }
    }
    
    // Ensure discount doesn't exceed amount
    if (discount > amount) discount = amount;
    
    return Math.round(discount);
};

// Static method to get active plans
membershipPlanSchema.statics.getActivePlans = async function(businessId) {
    return await this.find({
        business: businessId,
        isActive: true
    })
    .populate('inclusions.freeServices.service', 'name price')
    .sort({ displayOrder: 1 });
};

// Static method to get plan by tier
membershipPlanSchema.statics.getByTier = async function(businessId, tier) {
    return await this.findOne({
        business: businessId,
        tier: tier,
        isActive: true
    })
    .populate('inclusions.freeServices.service', 'name price');
};

module.exports = mongoose.model("MembershipPlan", membershipPlanSchema);

