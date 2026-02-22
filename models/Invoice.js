// Invoice.js - Invoice and payment tracking model
const mongoose = require("mongoose");

const invoiceSchema = new mongoose.Schema(
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
        appointment: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Appointment"
        },

        // Invoice Number
        invoiceNumber: {
            type: String,
            unique: true,
            required: true,
            index: true
        },

        // Invoice Date
        invoiceDate: {
            type: Date,
            default: Date.now,
            index: true
        },
        dueDate: {
            type: Date
        },

        // Items
        items: [{
            itemType: {
                type: String,
                enum: ["service", "product", "package", "membership", "other"],
                required: true
            },
            service: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Service"
            },
            name: {
                type: String,
                required: true
            },
            description: {
                type: String
            },
            quantity: {
                type: Number,
                required: true,
                default: 1,
                min: 1
            },
            price: {
                type: Number,
                required: true,
                min: 0
            },
            discount: {
                type: Number,
                default: 0,
                min: 0
            },
            tax: {
                type: Number,
                default: 0,
                min: 0
            },
            total: {
                type: Number,
                required: true
            }
        }],

        // Pricing Breakdown
        subtotal: {
            type: Number,
            required: true,
            min: 0
        },
        discountTotal: {
            type: Number,
            default: 0,
            min: 0
        },
        taxTotal: {
            type: Number,
            default: 0,
            min: 0
        },
        adjustmentAmount: {
            type: Number,
            default: 0
        },
        adjustmentReason: {
            type: String
        },
        total: {
            type: Number,
            required: true,
            min: 0
        },

        // Discount Details
        discountCode: {
            type: String
        },
        discountType: {
            type: String,
            enum: ["percentage", "fixed", "loyalty_points"]
        },
        discountValue: {
            type: Number
        },

        // Tax Details
        taxRate: {
            type: Number,
            default: 18 // GST percentage
        },
        taxBreakdown: [{
            taxName: { type: String },
            taxRate: { type: Number },
            taxAmount: { type: Number }
        }],

        // Payment Status
        paymentStatus: {
            type: String,
            enum: ["unpaid", "partial", "paid", "overdue", "refunded", "cancelled"],
            default: "unpaid",
            index: true
        },

        // Payment Details
        payments: [{
            paymentDate: {
                type: Date,
                default: Date.now
            },
            amount: {
                type: Number,
                required: true
            },
            paymentMethod: {
                type: String,
                enum: ["cash", "card", "upi", "netbanking", "wallet", "cheque", "other"],
                required: true
            },
            transactionId: {
                type: String
            },
            paymentGateway: {
                type: String
            },
            status: {
                type: String,
                enum: ["pending", "success", "failed"],
                default: "success"
            },
            notes: {
                type: String
            },
            processedBy: {
                type: mongoose.Schema.Types.ObjectId,
                refPath: 'processedByModel'
            },
            processedByModel: {
                type: String,
                enum: ['Staff', 'Manager', 'Admin']
            }
        }],

        paidAmount: {
            type: Number,
            default: 0,
            min: 0
        },

        // Refund Details
        refunds: [{
            refundDate: {
                type: Date,
                default: Date.now
            },
            amount: {
                type: Number,
                required: true
            },
            reason: {
                type: String
            },
            refundMethod: {
                type: String
            },
            transactionId: {
                type: String
            },
            processedBy: {
                type: mongoose.Schema.Types.ObjectId,
                refPath: 'refundProcessedByModel'
            },
            refundProcessedByModel: {
                type: String,
                enum: ['Staff', 'Manager', 'Admin']
            }
        }],

        refundedAmount: {
            type: Number,
            default: 0,
            min: 0
        },

        // Customer Details (snapshot at time of invoice)
        customerSnapshot: {
            name: { type: String },
            email: { type: String },
            phone: { type: String },
            address: {
                street: { type: String },
                city: { type: String },
                state: { type: String },
                zipCode: { type: String },
                country: { type: String }
            }
        },

        // Business Details (snapshot at time of invoice)
        businessSnapshot: {
            name: { type: String },
            email: { type: String },
            phone: { type: String },
            address: { type: String },
            gstNumber: { type: String },
            panNumber: { type: String }
        },

        // Notes
        notes: {
            type: String
        },
        internalNotes: {
            type: String
        },
        termsAndConditions: {
            type: String
        },

        // Status
        status: {
            type: String,
            enum: ["draft", "sent", "viewed", "paid", "cancelled", "overdue"],
            default: "draft",
            index: true
        },

        // Email/SMS Tracking
        sentDate: {
            type: Date
        },
        viewedDate: {
            type: Date
        },
        remindersSent: {
            type: Number,
            default: 0
        },
        lastReminderDate: {
            type: Date
        },

        // Loyalty Points
        loyaltyPointsEarned: {
            type: Number,
            default: 0
        },
        loyaltyPointsRedeemed: {
            type: Number,
            default: 0
        },

        // Invoice Type
        invoiceType: {
            type: String,
            enum: ["regular", "proforma", "credit_note", "debit_note"],
            default: "regular"
        },

        // Related Invoices
        parentInvoice: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Invoice"
        },

        // Metadata
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: 'createdByModel'
        },
        createdByModel: {
            type: String,
            enum: ['Staff', 'Manager', 'Admin']
        },
        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: 'updatedByModel'
        },
        updatedByModel: {
            type: String,
            enum: ['Staff', 'Manager', 'Admin']
        }
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);

// Indexes for better performance
invoiceSchema.index({ business: 1, invoiceDate: -1 });
invoiceSchema.index({ business: 1, customer: 1 });
invoiceSchema.index({ business: 1, paymentStatus: 1 });
invoiceSchema.index({ business: 1, status: 1 });

// Virtual for balance due
invoiceSchema.virtual('balanceDue').get(function () {
    return this.total - this.paidAmount + this.refundedAmount;
});

// Virtual for is paid
invoiceSchema.virtual('isPaid').get(function () {
    return this.paymentStatus === 'paid';
});

// Virtual for is overdue
invoiceSchema.virtual('isOverdue').get(function () {
    if (this.dueDate && this.paymentStatus !== 'paid') {
        return new Date() > new Date(this.dueDate);
    }
    return false;
});

// Virtual for days overdue
invoiceSchema.virtual('daysOverdue').get(function () {
    if (this.isOverdue) {
        const today = new Date();
        const due = new Date(this.dueDate);
        const diffTime = Math.abs(today - due);
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }
    return 0;
});

// Pre-save middleware to generate invoice number
invoiceSchema.pre('save', async function (next) {
    if (!this.invoiceNumber) {
        // Generate unique invoice number: INV-YYYYMMDD-XXXX
        const date = new Date();
        const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
        const random = Math.floor(1000 + Math.random() * 9000);
        this.invoiceNumber = `INV-${dateStr}-${random}`;
    }

    // Update payment status based on paid amount
    if (this.paidAmount >= this.total) {
        this.paymentStatus = 'paid';
    } else if (this.paidAmount > 0) {
        this.paymentStatus = 'partial';
    } else {
        this.paymentStatus = 'unpaid';
    }

    // Check if overdue
    if (this.dueDate && new Date() > new Date(this.dueDate) && this.paymentStatus !== 'paid') {
        this.paymentStatus = 'overdue';
    }

    next();
});

// Method to add payment
invoiceSchema.methods.addPayment = async function (paymentData) {
    this.payments.push(paymentData);
    this.paidAmount += paymentData.amount;

    if (this.paidAmount >= this.total) {
        this.paymentStatus = 'paid';
        this.status = 'paid';
    } else if (this.paidAmount > 0) {
        this.paymentStatus = 'partial';
    }

    await this.save();
    return this;
};

// Method to add refund
invoiceSchema.methods.addRefund = async function (refundData) {
    this.refunds.push(refundData);
    this.refundedAmount += refundData.amount;

    if (this.refundedAmount >= this.paidAmount) {
        this.paymentStatus = 'refunded';
    }

    await this.save();
    return this;
};

// Method to mark as sent
invoiceSchema.methods.markAsSent = async function () {
    this.status = 'sent';
    this.sentDate = new Date();
    await this.save();
};

// Method to mark as viewed
invoiceSchema.methods.markAsViewed = async function () {
    if (this.status === 'sent') {
        this.status = 'viewed';
    }
    this.viewedDate = new Date();
    await this.save();
};

// Method to send reminder
invoiceSchema.methods.sendReminder = async function () {
    this.remindersSent += 1;
    this.lastReminderDate = new Date();
    await this.save();
};

// Method to cancel invoice
invoiceSchema.methods.cancel = async function () {
    this.status = 'cancelled';
    this.paymentStatus = 'cancelled';
    await this.save();
};

// Static method to get overdue invoices
invoiceSchema.statics.getOverdue = async function (businessId) {
    const today = new Date();
    return await this.find({
        business: businessId,
        dueDate: { $lt: today },
        paymentStatus: { $in: ['unpaid', 'partial', 'overdue'] }
    })
        .populate('customer', 'firstName lastName phone email')
        .sort({ dueDate: 1 });
};

// Static method to calculate revenue
invoiceSchema.statics.calculateRevenue = async function (businessId, startDate, endDate) {
    const result = await this.aggregate([
        {
            $match: {
                business: businessId,
                invoiceDate: {
                    $gte: startDate,
                    $lte: endDate
                },
                status: { $nin: ['cancelled', 'draft'] }
            }
        },
        {
            $group: {
                _id: null,
                totalRevenue: { $sum: '$total' },
                paidRevenue: { $sum: '$paidAmount' },
                pendingRevenue: { $sum: { $subtract: ['$total', '$paidAmount'] } },
                invoiceCount: { $sum: 1 }
            }
        }
    ]);

    return result[0] || {
        totalRevenue: 0,
        paidRevenue: 0,
        pendingRevenue: 0,
        invoiceCount: 0
    };
};

module.exports = mongoose.model("Invoice", invoiceSchema);

