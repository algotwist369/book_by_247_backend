// Customer.js - Customer model for CRM
const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
    {
        // Business Reference
        business: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Business",
            required: true,
            index: true
        },

        // Basic Information
        firstName: { type: String, required: true, trim: true },
        lastName: { type: String, trim: true },
        email: {
            type: String,
            lowercase: true,
            trim: true,
            index: true
        },
        phone: {
            type: String,
            required: true,
            index: true
        },
        alternatePhone: { type: String },

        // Personal Details
        dateOfBirth: { type: Date },
        gender: {
            type: String,
            enum: ["male", "female", "other", "prefer_not_to_say"]
        },
        anniversary: { type: Date },

        // Address
        address: {
            street: { type: String },
            city: { type: String },
            state: { type: String },
            country: { type: String, default: "India" },
            zipCode: { type: String }
        },

        // Profile
        profilePicture: { type: String },
        preferredLanguage: { type: String, default: "en" },

        // Customer Status
        customerType: {
            type: String,
            enum: ["new", "regular", "vip", "inactive"],
            default: "new"
        },
        source: {
            type: String,
            enum: ["walk-in", "online", "referral", "social_media", "advertisement", "other"],
            default: "walk-in"
        },
        referredBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Customer"
        },

        // Visit & Spending Information
        totalVisits: { type: Number, default: 0 },
        totalSpent: { type: Number, default: 0 },
        averageSpent: { type: Number, default: 0 },
        firstVisit: { type: Date },
        lastVisit: { type: Date },

        // Preferences
        preferences: {
            preferredStaff: [{
                type: mongoose.Schema.Types.ObjectId,
                ref: "Staff"
            }],
            preferredServices: [{
                type: mongoose.Schema.Types.ObjectId,
                ref: "Service"
            }],
            preferredTimeSlots: [{ type: String }], // e.g., ["morning", "afternoon"]
            specialRequests: { type: String }
        },

        // Loyalty & Membership
        loyaltyPoints: { type: Number, default: 0 },
        membershipTier: {
            type: String,
            enum: ["none", "bronze", "silver", "gold", "platinum"],
            default: "none"
        },
        membershipStartDate: { type: Date },
        membershipExpiryDate: { type: Date },
        activeSubscription: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "CustomerMembership"
        },

        // Tags & Categories
        tags: [{ type: String }],
        category: { type: String }, // e.g., "High Value", "Frequent Visitor"

        // Notes & Comments
        notes: { type: String },
        internalNotes: { type: String }, // Only visible to staff

        // Marketing Preferences
        marketingConsent: {
            email: { type: Boolean, default: false },
            sms: { type: Boolean, default: false },
            whatsapp: { type: Boolean, default: false },
            phone: { type: Boolean, default: false }
        },

        // Social Media
        socialMedia: {
            facebook: { type: String },
            instagram: { type: String },
            twitter: { type: String }
        },

        // Status
        isActive: { type: Boolean, default: true, index: true },
        isBlacklisted: { type: Boolean, default: false },
        blacklistReason: { type: String },

        // Emergency Contact
        emergencyContact: {
            name: { type: String },
            phone: { type: String },
            relationship: { type: String }
        },

        // Custom Fields (for flexibility)
        customFields: {
            type: Map,
            of: mongoose.Schema.Types.Mixed
        },

        // Metadata
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: 'createdByModel'
        },
        createdByModel: {
            type: String,
            enum: ['Admin', 'Manager', 'Staff']
        },
        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: 'updatedByModel'
        },
        updatedByModel: {
            type: String,
            enum: ['Admin', 'Manager', 'Staff']
        }
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);

// Indexes for better performance
customerSchema.index({ business: 1, phone: 1 }, { unique: true });
customerSchema.index({ business: 1, email: 1 });
customerSchema.index({ business: 1, isActive: 1 });
customerSchema.index({ business: 1, customerType: 1 });
customerSchema.index({ business: 1, lastVisit: -1 });
customerSchema.index({ business: 1, totalSpent: -1 });
customerSchema.index({ tags: 1 });

// Virtual for full name
customerSchema.virtual('fullName').get(function () {
    if (this.lastName) {
        return `${this.firstName} ${this.lastName}`;
    }
    return this.firstName;
});

// Virtual for age
customerSchema.virtual('age').get(function () {
    if (this.dateOfBirth) {
        const today = new Date();
        const birthDate = new Date(this.dateOfBirth);
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();

        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }

        return age;
    }
    return null;
});

// Virtual for days since last visit
customerSchema.virtual('daysSinceLastVisit').get(function () {
    if (this.lastVisit) {
        const today = new Date();
        const lastVisit = new Date(this.lastVisit);
        const diffTime = Math.abs(today - lastVisit);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
    }
    return null;
});

// Method to update customer stats after visit
customerSchema.methods.updateAfterVisit = async function (amount) {
    this.totalVisits += 1;
    this.totalSpent += amount;
    this.averageSpent = this.totalSpent / this.totalVisits;
    this.lastVisit = new Date();

    if (!this.firstVisit) {
        this.firstVisit = new Date();
    }

    // Update customer type based on visits
    if (this.totalVisits >= 20) {
        this.customerType = 'vip';
    } else if (this.totalVisits >= 5) {
        this.customerType = 'regular';
    } else {
        this.customerType = 'new';
    }

    await this.save();
};

// Method to add loyalty points
customerSchema.methods.addLoyaltyPoints = async function (points) {
    this.loyaltyPoints += points;

    // Auto-upgrade membership tier
    if (this.loyaltyPoints >= 10000) {
        this.membershipTier = 'platinum';
    } else if (this.loyaltyPoints >= 5000) {
        this.membershipTier = 'gold';
    } else if (this.loyaltyPoints >= 2000) {
        this.membershipTier = 'silver';
    } else if (this.loyaltyPoints >= 500) {
        this.membershipTier = 'bronze';
    }

    await this.save();
};

// Method to redeem loyalty points
customerSchema.methods.redeemPoints = async function (points) {
    if (this.loyaltyPoints >= points) {
        this.loyaltyPoints -= points;
        await this.save();
        return true;
    }
    return false;
};

// Static method to find duplicate customers
customerSchema.statics.findDuplicates = async function (business, phone, email) {
    const query = {
        business,
        isActive: true,
        $or: [{ phone }]
    };

    if (email) {
        query.$or.push({ email });
    }

    return await this.find(query);
};

// Pre-save middleware to update customer type
customerSchema.pre('save', function (next) {
    // Check if customer has been inactive for 180+ days
    if (this.lastVisit) {
        const today = new Date();
        const daysSinceLastVisit = Math.floor((today - this.lastVisit) / (1000 * 60 * 60 * 24));

        if (daysSinceLastVisit > 180 && this.customerType !== 'new') {
            this.customerType = 'inactive';
        }
    }
    next();
});

module.exports = mongoose.model("Customer", customerSchema);
