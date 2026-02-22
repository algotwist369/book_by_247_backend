// CustomerMembership.js - Customer membership subscription management
const mongoose = require("mongoose");

const customerMembershipSchema = new mongoose.Schema(
    {
        // References
        customer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Customer",
            required: true,
            index: true
        },
        business: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Business",
            required: true,
            index: true
        },
        membershipPlan: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "MembershipPlan",
            required: true
        },

        // Subscription Number
        subscriptionNumber: {
            type: String,
            unique: true,
            index: true
        },

        // Dates
        startDate: {
            type: Date,
            required: true,
            default: Date.now
        },
        endDate: {
            type: Date,
            required: true,
            index: true
        },

        // Status
        status: {
            type: String,
            enum: ["active", "expired", "cancelled", "suspended"],
            default: "active",
            index: true
        },

        // Pricing
        price: {
            type: Number,
            required: true
        },
        currency: {
            type: String,
            default: "INR"
        },

        // Payment Details
        paymentDetails: {
            invoice: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Invoice"
            },
            paymentMethod: {
                type: String,
                enum: ["cash", "card", "upi", "netbanking", "wallet", "other"]
            },
            transactionId: { type: String },
            paidDate: { type: Date }
        },

        // Auto Renewal
        autoRenew: {
            type: Boolean,
            default: false
        },
        renewalReminderSent: {
            type: Boolean,
            default: false
        },

        // Benefits Tracking
        benefits: {
            freeServicesUsed: [{
                service: { type: mongoose.Schema.Types.ObjectId, ref: "Service" },
                usedDate: { type: Date },
                appointment: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment" }
            }],
            totalDiscountAvailed: { type: Number, default: 0 },
            bonusPointsGranted: { type: Number, default: 0 }
        },

        // Usage Stats
        stats: {
            totalVisits: { type: Number, default: 0 },
            totalSpent: { type: Number, default: 0 },
            totalSaved: { type: Number, default: 0 },
            freeServicesUsedCount: { type: Number, default: 0 }
        },

        // Cancellation Details
        cancellationDetails: {
            cancelledAt: { type: Date },
            cancelledBy: {
                type: mongoose.Schema.Types.ObjectId,
                refPath: 'cancellationDetails.cancelledByModel'
            },
            cancelledByModel: {
                type: String,
                enum: ['Customer', 'Manager', 'Admin']
            },
            reason: { type: String },
            refundAmount: { type: Number, default: 0 }
        },

        // Renewal History
        renewalHistory: [{
            renewedDate: { type: Date },
            previousEndDate: { type: Date },
            newEndDate: { type: Date },
            price: { type: Number },
            invoice: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice" }
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
            enum: ['Customer', 'Manager', 'Admin']
        }
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);

// Indexes
customerMembershipSchema.index({ customer: 1, status: 1 });
customerMembershipSchema.index({ business: 1, status: 1 });
customerMembershipSchema.index({ business: 1, membershipPlan: 1 });
customerMembershipSchema.index({ endDate: 1, status: 1 });

// Virtual for days remaining
customerMembershipSchema.virtual('daysRemaining').get(function () {
    if (this.status !== 'active') return 0;
    const now = new Date();
    const end = new Date(this.endDate);
    const diffTime = end - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
});

// Virtual for is expiring soon (within 7 days)
customerMembershipSchema.virtual('isExpiringSoon').get(function () {
    return this.daysRemaining > 0 && this.daysRemaining <= 7;
});

// Virtual for is expired
customerMembershipSchema.virtual('isExpired').get(function () {
    return new Date() > new Date(this.endDate);
});

// Pre-save middleware to generate subscription number
customerMembershipSchema.pre('save', async function (next) {
    if (!this.subscriptionNumber) {
        const date = new Date();
        const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
        const random = Math.floor(1000 + Math.random() * 9000);
        this.subscriptionNumber = `SUB-${dateStr}-${random}`;
    }

    // Auto-update status based on dates
    const now = new Date();
    if (this.status === 'active' && now > this.endDate) {
        this.status = 'expired';
    }

    next();
});

// Method to cancel subscription
customerMembershipSchema.methods.cancel = async function (cancelledBy, cancelledByModel, reason, refundAmount = 0) {
    this.status = 'cancelled';
    this.cancellationDetails = {
        cancelledAt: new Date(),
        cancelledBy,
        cancelledByModel,
        reason,
        refundAmount
    };
    await this.save();
};

// Method to renew subscription
customerMembershipSchema.methods.renew = async function (duration, price, invoice) {
    const oldEndDate = this.endDate;

    // Calculate new end date
    const newEndDate = new Date(oldEndDate);
    newEndDate.setMonth(newEndDate.getMonth() + duration.value);

    this.endDate = newEndDate;
    this.status = 'active';

    this.renewalHistory.push({
        renewedDate: new Date(),
        previousEndDate: oldEndDate,
        newEndDate: newEndDate,
        price,
        invoice
    });

    await this.save();
};

// Method to use free service
customerMembershipSchema.methods.useFreeService = async function (serviceId, appointmentId) {
    this.benefits.freeServicesUsed.push({
        service: serviceId,
        usedDate: new Date(),
        appointment: appointmentId
    });

    this.stats.freeServicesUsedCount += 1;

    await this.save();
};

// Method to track discount availed
customerMembershipSchema.methods.trackDiscount = async function (discountAmount) {
    this.benefits.totalDiscountAvailed += discountAmount;
    this.stats.totalSaved += discountAmount;
    await this.save();
};

// Method to track visit
customerMembershipSchema.methods.trackVisit = async function (amountSpent) {
    this.stats.totalVisits += 1;
    this.stats.totalSpent += amountSpent;
    await this.save();
};

// Static method to get active subscription for customer
customerMembershipSchema.statics.getActiveSubscription = async function (customerId) {
    return await this.findOne({
        customer: customerId,
        status: 'active',
        endDate: { $gte: new Date() }
    })
        .populate('membershipPlan')
        .populate('business', 'name');
};

// Static method to get expiring subscriptions (for reminders)
customerMembershipSchema.statics.getExpiringSoon = async function (businessId, days = 7) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    return await this.find({
        business: businessId,
        status: 'active',
        endDate: {
            $gte: new Date(),
            $lte: futureDate
        },
        renewalReminderSent: false
    })
        .populate('customer', 'firstName lastName email phone')
        .populate('membershipPlan', 'name tier');
};

// Static method to expire subscriptions
customerMembershipSchema.statics.expireSubscriptions = async function () {
    const now = new Date();

    const expiredSubs = await this.updateMany(
        {
            status: 'active',
            endDate: { $lt: now }
        },
        {
            status: 'expired'
        }
    );

    return expiredSubs;
};

// Static method to get subscription statistics
customerMembershipSchema.statics.getStats = async function (businessId) {
    const stats = await this.aggregate([
        {
            $match: { business: businessId }
        },
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 },
                totalRevenue: { $sum: '$price' }
            }
        }
    ]);

    const tierStats = await this.aggregate([
        {
            $match: { business: businessId, status: 'active' }
        },
        {
            $lookup: {
                from: 'membershipplans',
                localField: 'membershipPlan',
                foreignField: '_id',
                as: 'plan'
            }
        },
        {
            $unwind: '$plan'
        },
        {
            $group: {
                _id: '$plan.tier',
                count: { $sum: 1 }
            }
        }
    ]);

    return {
        byStatus: stats,
        byTier: tierStats
    };
};

module.exports = mongoose.model("CustomerMembership", customerMembershipSchema);

