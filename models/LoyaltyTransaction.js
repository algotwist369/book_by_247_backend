// LoyaltyTransaction.js - Loyalty points transaction history
const mongoose = require("mongoose");

const loyaltyTransactionSchema = new mongoose.Schema(
    {
        // References
        business: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Business",
            required: true,
            index: true
        },
        customer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Customer",
            required: true,
            index: true
        },

        // Transaction Type
        type: {
            type: String,
            enum: ["earned", "redeemed", "expired", "adjusted", "bonus"],
            required: true,
            index: true
        },

        // Points
        points: {
            type: Number,
            required: true
        },
        pointsBefore: {
            type: Number,
            required: true
        },
        pointsAfter: {
            type: Number,
            required: true
        },

        // Related References
        invoice: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Invoice"
        },
        appointment: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Appointment"
        },
        reward: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "LoyaltyReward"
        },

        // Description
        description: {
            type: String,
            required: true
        },
        notes: {
            type: String
        },

        // Earning Details (for earned type)
        earningDetails: {
            amountSpent: { type: Number },
            pointsRate: { type: Number }, // Points per rupee
            multiplier: { type: Number, default: 1 } // 2x, 3x events
        },

        // Redemption Details (for redeemed type)
        redemptionDetails: {
            rewardName: { type: String },
            rewardValue: { type: Number },
            discountApplied: { type: Number }
        },

        // Expiry Details (for expired type)
        expiryDetails: {
            originalEarnedDate: { type: Date },
            expiryReason: { type: String }
        },

        // Status
        status: {
            type: String,
            enum: ["completed", "pending", "cancelled", "reversed"],
            default: "completed",
            index: true
        },

        // Expiry Date (for earned points)
        expiresAt: {
            type: Date,
            index: true
        },

        // Metadata
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: 'createdByModel'
        },
        createdByModel: {
            type: String,
            enum: ['Admin', 'Manager', 'Staff', 'System']
        }
    },
    {
        timestamps: true
    }
);

// Indexes for better performance
loyaltyTransactionSchema.index({ business: 1, customer: 1, createdAt: -1 });
loyaltyTransactionSchema.index({ business: 1, type: 1 });

// Static method to create earned points transaction
loyaltyTransactionSchema.statics.createEarnedTransaction = async function (data) {
    const { business, customer, points, amountSpent, pointsRate, multiplier, invoice, appointment, description } = data;

    // Calculate expiry date (1 year from now)
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    const transaction = await this.create({
        business,
        customer: customer._id,
        type: 'earned',
        points,
        pointsBefore: customer.loyaltyPoints,
        pointsAfter: customer.loyaltyPoints + points,
        invoice,
        appointment,
        description,
        earningDetails: {
            amountSpent,
            pointsRate,
            multiplier: multiplier || 1
        },
        expiresAt,
        status: 'completed',
        createdBy: 'System',
        createdByModel: 'System'
    });

    return transaction;
};

// Static method to create redeemed points transaction
loyaltyTransactionSchema.statics.createRedeemedTransaction = async function (data) {
    const { business, customer, points, reward, rewardName, rewardValue, discountApplied, description } = data;

    const transaction = await this.create({
        business,
        customer: customer._id,
        type: 'redeemed',
        points: -points, // Negative for redemption
        pointsBefore: customer.loyaltyPoints,
        pointsAfter: customer.loyaltyPoints - points,
        reward,
        description,
        redemptionDetails: {
            rewardName,
            rewardValue,
            discountApplied
        },
        status: 'completed',
        createdBy: 'System',
        createdByModel: 'System'
    });

    return transaction;
};

// Static method to expire points
loyaltyTransactionSchema.statics.expirePoints = async function () {
    const now = new Date();

    // Find all earned points that have expired
    const expiredTransactions = await this.find({
        type: 'earned',
        status: 'completed',
        expiresAt: { $lte: now }
    }).populate('customer');

    const expiryRecords = [];

    for (const transaction of expiredTransactions) {
        const customer = transaction.customer;

        // Create expiry transaction
        const expiryTransaction = await this.create({
            business: transaction.business,
            customer: customer._id,
            type: 'expired',
            points: -transaction.points,
            pointsBefore: customer.loyaltyPoints,
            pointsAfter: customer.loyaltyPoints - transaction.points,
            description: `Points expired from transaction on ${transaction.createdAt.toLocaleDateString()}`,
            expiryDetails: {
                originalEarnedDate: transaction.createdAt,
                expiryReason: 'Points expired after 1 year'
            },
            status: 'completed',
            createdBy: 'System',
            createdByModel: 'System'
        });

        // Update customer points
        customer.loyaltyPoints -= transaction.points;
        if (customer.loyaltyPoints < 0) customer.loyaltyPoints = 0;
        await customer.save();

        // Mark original transaction as expired
        transaction.status = 'expired';
        await transaction.save();

        expiryRecords.push(expiryTransaction);
    }

    return expiryRecords;
};

// Static method to get customer transaction history
loyaltyTransactionSchema.statics.getCustomerHistory = async function (customerId, limit = 50) {
    return await this.find({ customer: customerId })
        .populate('invoice', 'invoiceNumber total')
        .populate('appointment', 'bookingNumber appointmentDate')
        .populate('reward', 'name pointsCost')
        .sort({ createdAt: -1 })
        .limit(limit);
};

module.exports = mongoose.model("LoyaltyTransaction", loyaltyTransactionSchema);

