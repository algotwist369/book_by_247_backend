// LoyaltyReward.js - Loyalty rewards catalog
const mongoose = require("mongoose");

const loyaltyRewardSchema = new mongoose.Schema(
    {
        // Business Reference
        business: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Business",
            required: true,
            index: true
        },
        
        // Reward Details
        name: {
            type: String,
            required: true,
            trim: true
        },
        description: {
            type: String,
            required: true
        },
        shortDescription: {
            type: String,
            maxlength: 150
        },
        
        // Images
        image: {
            type: String
        },
        
        // Reward Type
        type: {
            type: String,
            enum: ["discount", "free_service", "free_product", "voucher", "cashback", "gift"],
            required: true,
            index: true
        },
        
        // Points Cost
        pointsCost: {
            type: Number,
            required: true,
            min: 0,
            index: true
        },
        
        // Reward Value
        value: {
            type: Number,
            required: true
        },
        valueType: {
            type: String,
            enum: ["percentage", "fixed", "points"],
            default: "fixed"
        },
        
        // Availability
        isActive: {
            type: Boolean,
            default: true,
            index: true
        },
        availableFrom: {
            type: Date
        },
        availableTo: {
            type: Date
        },
        
        // Eligibility
        minMembershipTier: {
            type: String,
            enum: ["none", "bronze", "silver", "gold", "platinum"],
            default: "none"
        },
        maxRedemptionsPerCustomer: {
            type: Number,
            default: 0 // 0 means unlimited
        },
        totalQuantity: {
            type: Number,
            default: 0 // 0 means unlimited
        },
        redeemedCount: {
            type: Number,
            default: 0
        },
        
        // Restrictions
        restrictions: {
            minPurchaseAmount: { type: Number, default: 0 },
            applicableServices: [{
                type: mongoose.Schema.Types.ObjectId,
                ref: "Service"
            }],
            excludedServices: [{
                type: mongoose.Schema.Types.ObjectId,
                ref: "Service"
            }],
            validDays: [{
                type: String,
                enum: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
            }]
        },
        
        // Terms & Conditions
        terms: {
            type: String
        },
        
        // Voucher Details (if type is voucher)
        voucherDetails: {
            code: { type: String },
            validityDays: { type: Number, default: 30 }
        },
        
        // Display
        displayOrder: {
            type: Number,
            default: 0
        },
        isFeatured: {
            type: Boolean,
            default: false
        },
        
        // Statistics
        stats: {
            totalRedemptions: { type: Number, default: 0 },
            totalPointsRedeemed: { type: Number, default: 0 },
            popularityScore: { type: Number, default: 0 }
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
loyaltyRewardSchema.index({ business: 1, isActive: 1 });
loyaltyRewardSchema.index({ business: 1, type: 1 });
loyaltyRewardSchema.index({ business: 1, pointsCost: 1 });
loyaltyRewardSchema.index({ displayOrder: 1 });

// Virtual for availability status
loyaltyRewardSchema.virtual('isAvailable').get(function() {
    if (!this.isActive) return false;
    
    const now = new Date();
    if (this.availableFrom && now < this.availableFrom) return false;
    if (this.availableTo && now > this.availableTo) return false;
    
    if (this.totalQuantity > 0 && this.redeemedCount >= this.totalQuantity) return false;
    
    return true;
});

// Virtual for remaining quantity
loyaltyRewardSchema.virtual('remainingQuantity').get(function() {
    if (this.totalQuantity === 0) return 'Unlimited';
    return this.totalQuantity - this.redeemedCount;
});

// Method to check if customer can redeem
loyaltyRewardSchema.methods.canRedeem = function(customer) {
    // Check if reward is active
    if (!this.isActive) return { canRedeem: false, reason: 'Reward is not active' };
    
    // Check availability dates
    const now = new Date();
    if (this.availableFrom && now < this.availableFrom) {
        return { canRedeem: false, reason: 'Reward not yet available' };
    }
    if (this.availableTo && now > this.availableTo) {
        return { canRedeem: false, reason: 'Reward has expired' };
    }
    
    // Check quantity
    if (this.totalQuantity > 0 && this.redeemedCount >= this.totalQuantity) {
        return { canRedeem: false, reason: 'Reward is out of stock' };
    }
    
    // Check customer points
    if (customer.loyaltyPoints < this.pointsCost) {
        return { 
            canRedeem: false, 
            reason: `Insufficient points. You need ${this.pointsCost - customer.loyaltyPoints} more points` 
        };
    }
    
    // Check membership tier
    const tierOrder = { none: 0, bronze: 1, silver: 2, gold: 3, platinum: 4 };
    if (tierOrder[customer.membershipTier] < tierOrder[this.minMembershipTier]) {
        return { 
            canRedeem: false, 
            reason: `This reward requires ${this.minMembershipTier} membership tier or higher` 
        };
    }
    
    return { canRedeem: true };
};

// Method to redeem reward
loyaltyRewardSchema.methods.redeem = async function() {
    this.redeemedCount += 1;
    this.stats.totalRedemptions += 1;
    this.stats.totalPointsRedeemed += this.pointsCost;
    this.stats.popularityScore += 1;
    await this.save();
};

// Static method to get available rewards for customer
loyaltyRewardSchema.statics.getAvailableForCustomer = async function(businessId, customer) {
    const now = new Date();
    
    const rewards = await this.find({
        business: businessId,
        isActive: true,
        $or: [
            { availableFrom: { $exists: false } },
            { availableFrom: { $lte: now } }
        ],
        $or: [
            { availableTo: { $exists: false } },
            { availableTo: { $gte: now } }
        ]
    }).sort({ displayOrder: 1 });
    
    return rewards.filter(reward => {
        // Check quantity
        if (reward.totalQuantity > 0 && reward.redeemedCount >= reward.totalQuantity) return false;
        
        // Check membership tier
        const tierOrder = { none: 0, bronze: 1, silver: 2, gold: 3, platinum: 4 };
        if (tierOrder[customer.membershipTier] < tierOrder[reward.minMembershipTier]) return false;
        
        return true;
    });
};

// Static method to get featured rewards
loyaltyRewardSchema.statics.getFeatured = async function(businessId) {
    return await this.find({
        business: businessId,
        isActive: true,
        isFeatured: true
    }).sort({ displayOrder: 1 });
};

module.exports = mongoose.model("LoyaltyReward", loyaltyRewardSchema);

