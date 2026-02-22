const mongoose = require("mongoose");

/**
 * Expense Model - Track all business expenses with approval workflow
 * Phase 1 Enhancement - NEW MODEL
 */
const expenseSchema = new mongoose.Schema({
    business: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Business",
        required: true,
        index: true
    },
    date: {
        type: Date,
        required: true,
        index: true
    },

    // Categorization
    category: {
        type: String,
        enum: [
            "staff_salary",
            "staff_commission",
            "staff_bonus",
            "rent",
            "electricity",
            "water",
            "internet",
            "utilities",
            "inventory",
            "supplies",
            "marketing",
            "maintenance",
            "repair",
            "taxes",
            "insurance",
            "cleaning",
            "laundry",
            "transportation",
            "miscellaneous"
        ],
        required: true,
        index: true
    },
    subcategory: { type: String },

    // Amount & Payment
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    paymentMethod: {
        type: String,
        enum: ["cash", "bank_transfer", "cheque", "card", "upi", "wallet"],
        required: true
    },

    // Documentation
    description: {
        type: String,
        required: true
    },
    receipt: { type: String },  // URL to uploaded receipt image
    invoiceNumber: { type: String },
    vendor: { type: String },

    // Approval Workflow
    status: {
        type: String,
        enum: ["pending", "approved", "rejected", "paid"],
        default: "pending",
        index: true
    },
    submittedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Manager",
        required: true
    },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Admin"
    },
    approvalDate: { type: Date },
    rejectionReason: { type: String },

    // Recurring Expense Tracking
    isRecurring: {
        type: Boolean,
        default: false
    },
    recurrenceFrequency: {
        type: String,
        enum: ["daily", "weekly", "monthly", "quarterly", "yearly"]
    },
    nextDueDate: { type: Date },
    parentExpense: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Expense"
    }, // For recurring expenses

    // Tags for reporting
    tags: [{ type: String }],
    notes: { type: String },

    // Linked to daily business record
    dailyBusiness: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "DailyBusiness"
    }
}, {
    timestamps: true
});

// Compound Indexes for efficient queries
expenseSchema.index({ business: 1, date: -1 });
expenseSchema.index({ business: 1, category: 1, date: -1 });
expenseSchema.index({ business: 1, status: 1, date: -1 });
expenseSchema.index({ submittedBy: 1, status: 1 });
expenseSchema.index({ approvedBy: 1, approvalDate: -1 });
expenseSchema.index({ isRecurring: 1, nextDueDate: 1 });

// Instance Methods

/**
 * Approve expense
 */
expenseSchema.methods.approve = async function (adminId) {
    this.status = 'approved';
    this.approvedBy = adminId;
    this.approvalDate = new Date();
    await this.save();
    return this;
};

/**
 * Reject expense
 */
expenseSchema.methods.reject = async function (adminId, reason) {
    this.status = 'rejected';
    this.approvedBy = adminId;
    this.approvalDate = new Date();
    this.rejectionReason = reason;
    await this.save();
    return this;
};

/**
 * Mark as paid
 */
expenseSchema.methods.markPaid = async function () {
    if (this.status !== 'approved') {
        throw new Error('Only approved expenses can be marked as paid');
    }
    this.status = 'paid';
    await this.save();
    return this;
};

// Static Methods

/**
 * Get total expenses by category for a date range
 */
expenseSchema.statics.getExpensesByCategory = async function (businessId, startDate, endDate) {
    return await this.aggregate([
        {
            $match: {
                business: businessId,
                date: { $gte: startDate, $lte: endDate },
                status: { $in: ['approved', 'paid'] }
            }
        },
        {
            $group: {
                _id: '$category',
                totalAmount: { $sum: '$amount' },
                count: { $sum: 1 }
            }
        },
        { $sort: { totalAmount: -1 } }
    ]);
};

/**
 * Get pending approvals
 */
expenseSchema.statics.getPendingApprovals = async function (businessId) {
    return await this.find({
        business: businessId,
        status: 'pending'
    })
        .populate('submittedBy', 'name username')
        .sort({ createdAt: -1 });
};

/**
 * Get recurring expenses due for processing
 */
expenseSchema.statics.getRecurringDue = async function () {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return await this.find({
        isRecurring: true,
        status: 'approved',
        nextDueDate: { $lte: today }
    });
};

module.exports = mongoose.model("Expense", expenseSchema);
