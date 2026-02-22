const mongoose = require("mongoose");

const inventoryTransactionSchema = new mongoose.Schema({
    business: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Business",
        required: true,
        index: true
    },
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true,
        index: true
    },

    // Transaction Type
    type: {
        type: String,
        enum: [
            "purchase",      // Buying new stock
            "usage",         // Used in service/consumed
            "sale",          // Sold as retail
            "adjustment",    // Manual stock correction
            "wastage",       // Damaged/expired/lost
            "return",        // Return to supplier
            "transfer"       // Transfer between locations
        ],
        required: true,
        index: true
    },

    // Quantity & Cost
    quantity: {
        type: Number,
        required: true
    },
    costPerUnit: { type: Number },
    totalCost: { type: Number },

    // Stock Levels (for audit trail)
    stockBefore: { type: Number },
    stockAfter: { type: Number },

    // Context - What triggered this transaction
    relatedTo: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'relatedModel'
    },
    relatedModel: {
        type: String,
        enum: ["DailyBusiness", "Appointment", "Expense", "Invoice", "Service"]
    },

    // Transfer Details (if type is 'transfer')
    transferFrom: { type: String },  
    transferTo: { type: String },

    // Return Details (if type is 'return')
    returnReason: { type: String },
    refundAmount: { type: Number },

    // Wastage Details (if type is 'wastage')
    wastageReason: {
        type: String,
        enum: ["expired", "damaged", "lost", "quality_issue", "other"]
    },

    // Metadata
    notes: { type: String },
    performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'performedByModel'
    },
    performedByModel: {
        type: String,
        enum: ['Manager', 'Admin', 'Staff']
    },

    // Verification
    isVerified: {
        type: Boolean,
        default: false
    },
    verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin'
    },
    verificationDate: { type: Date },

    // Document reference (invoice, receipt, etc.)
    documentUrl: { type: String },
    documentNumber: { type: String }
}, {
    timestamps: true
});

// Compound Indexes
inventoryTransactionSchema.index({ business: 1, product: 1, createdAt: -1 });
inventoryTransactionSchema.index({ business: 1, type: 1, createdAt: -1 });
inventoryTransactionSchema.index({ relatedTo: 1, relatedModel: 1 });
inventoryTransactionSchema.index({ performedBy: 1, createdAt: -1 });
inventoryTransactionSchema.index({ business: 1, createdAt: -1 });

// Pre-save Hook

/**
 * Auto-calculate total cost
 */
inventoryTransactionSchema.pre('save', function (next) {
    if (this.costPerUnit && this.quantity) {
        this.totalCost = this.costPerUnit * Math.abs(this.quantity);
    }
    next();
});

// Instance Methods

/**
 * Verify transaction
 */
inventoryTransactionSchema.methods.verify = async function (adminId) {
    this.isVerified = true;
    this.verifiedBy = adminId;
    this.verificationDate = new Date();
    await this.save();
    return this;
};

// Static Methods

/**
 * Get inventory movement summary for a period
 */
inventoryTransactionSchema.statics.getMovementSummary = async function (businessId, startDate, endDate) {
    return await this.aggregate([
        {
            $match: {
                business: businessId,
                createdAt: { $gte: startDate, $lte: endDate }
            }
        },
        {
            $group: {
                _id: {
                    type: '$type',
                    product: '$product'
                },
                totalQuantity: { $sum: '$quantity' },
                totalCost: { $sum: '$totalCost' },
                count: { $sum: 1 }
            }
        },
        {
            $lookup: {
                from: 'products',
                localField: '_id.product',
                foreignField: '_id',
                as: 'productDetails'
            }
        }
    ]);
};

/**
 * Get product usage trend
 */
inventoryTransactionSchema.statics.getUsageTrend = async function (productId, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return await this.aggregate([
        {
            $match: {
                product: productId,
                type: 'usage',
                createdAt: { $gte: startDate }
            }
        },
        {
            $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                totalUsed: { $sum: '$quantity' },
                transactions: { $sum: 1 }
            }
        },
        { $sort: { _id: 1 } }
    ]);
};

/**
 * Get wastage report
 */
inventoryTransactionSchema.statics.getWastageReport = async function (businessId, startDate, endDate) {
    return await this.aggregate([
        {
            $match: {
                business: businessId,
                type: 'wastage',
                createdAt: { $gte: startDate, $lte: endDate }
            }
        },
        {
            $group: {
                _id: {
                    product: '$product',
                    reason: '$wastageReason'
                },
                totalQuantity: { $sum: '$quantity' },
                totalCost: { $sum: '$totalCost' },
                count: { $sum: 1 }
            }
        },
        {
            $lookup: {
                from: 'products',
                localField: '_id.product',
                foreignField: '_id',
                as: 'productDetails'
            }
        },
        { $sort: { totalCost: -1 } }
    ]);
};

/**
 * Calculate stock turnover rate
 */
inventoryTransactionSchema.statics.getStockTurnover = async function (productId, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const Product = require('./Product');
    const product = await Product.findById(productId);

    if (!product) return null;

    const usage = await this.aggregate([
        {
            $match: {
                product: productId,
                type: { $in: ['usage', 'sale'] },
                createdAt: { $gte: startDate }
            }
        },
        {
            $group: {
                _id: null,
                totalUsed: { $sum: '$quantity' }
            }
        }
    ]);

    const totalUsed = usage[0]?.totalUsed || 0;
    const avgInventory = product.currentStock;
    const turnoverRate = avgInventory > 0 ? totalUsed / avgInventory : 0;

    return {
        product: product.name,
        currentStock: product.currentStock,
        totalUsed,
        periodDays: days,
        turnoverRate: Math.round(turnoverRate * 100) / 100,
        avgDailyUsage: Math.round((totalUsed / days) * 100) / 100
    };
};

module.exports = mongoose.model("InventoryTransaction", inventoryTransactionSchema);
