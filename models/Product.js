const mongoose = require("mongoose");

/**
 * Product Model - Track inventory items (consumables, retail products, supplies)
 * Phase 1 Enhancement - NEW MODEL
 */
const productSchema = new mongoose.Schema({
    business: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Business",
        required: true,
        index: true
    },

    // Basic Information
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: { type: String },
    category: {
        type: String,
        enum: ["consumable", "retail", "equipment", "supplies", "other"],
        required: true,
        index: true
    },
    subcategory: { type: String },
    sku: {
        type: String,
        unique: true,
        sparse: true,
        index: true
    },
    barcode: { type: String },

    // Stock Management
    currentStock: {
        type: Number,
        default: 0,
        min: 0,
        index: true
    },
    unit: {
        type: String,
        enum: ["piece", "liter", "ml", "kg", "gram", "box", "bottle", "packet", "other"],
        default: "piece"
    },
    reorderLevel: {
        type: Number,
        default: 10
    },
    reorderQuantity: {
        type: Number,
        default: 50
    },
    maxStockLevel: { type: Number },

    // Pricing
    costPrice: {
        type: Number,
        required: true,
        min: 0
    },  // Purchase cost
    sellingPrice: {
        type: Number,
        min: 0
    },  // Retail price (if sold to customers)
    margin: { type: Number }, // Profit margin %

    // Supplier Information
    supplier: {
        name: { type: String },
        contact: { type: String },
        email: { type: String },
        leadTimeDays: { type: Number, default: 7 }
    },
    alternativeSuppliers: [{
        name: String,
        contact: String,
        costPrice: Number
    }],

    // Usage Tracking
    avgDailyConsumption: {
        type: Number,
        default: 0
    },
    lastRestockDate: { type: Date },
    lastRestockQuantity: { type: Number },
    expiryDate: { type: Date },

    // Status & Alerts
    isActive: {
        type: Boolean,
        default: true,
        index: true
    },
    isLowStock: {
        type: Boolean,
        default: false,
        index: true
    },
    lastLowStockAlert: { type: Date },

    // Images
    images: [{ type: String }],
    thumbnail: { type: String },

    // Custom Fields
    tags: [{ type: String }],
    notes: { type: String },

    // Metadata
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'createdByModel'
    },
    createdByModel: {
        type: String,
        enum: ['Admin', 'Manager']
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes
productSchema.index({ business: 1, category: 1, isLowStock: 1 });
productSchema.index({ business: 1, isActive: 1 });
productSchema.index({ business: 1, name: 'text', description: 'text' });

// Virtuals

/**
 * Days until stockout (based on avg daily consumption)
 */
productSchema.virtual('daysUntilStockout').get(function () {
    if (this.avgDailyConsumption > 0) {
        return Math.floor(this.currentStock / this.avgDailyConsumption);
    }
    return null;
});

/**
 * Stock status
 */
productSchema.virtual('stockStatus').get(function () {
    if (this.currentStock === 0) return 'out_of_stock';
    if (this.currentStock <= this.reorderLevel) return 'low_stock';
    if (this.maxStockLevel && this.currentStock >= this.maxStockLevel) return 'overstock';
    return 'in_stock';
});

/**
 * Profit margin calculation
 */
productSchema.virtual('profitMargin').get(function () {
    if (this.sellingPrice && this.costPrice && this.costPrice > 0) {
        return ((this.sellingPrice - this.costPrice) / this.costPrice) * 100;
    }
    return 0;
});

// Pre-save Hooks

/**
 * Auto-update low stock status
 */
productSchema.pre('save', function (next) {
    const wasLowStock = this.isLowStock;
    this.isLowStock = this.currentStock <= this.reorderLevel;

    // Update alert timestamp when transitioning to low stock
    if (!wasLowStock && this.isLowStock) {
        this.lastLowStockAlert = new Date();
    }

    next();
});

// Instance Methods

/**
 * Add stock (purchase/restock)
 */
productSchema.methods.addStock = async function (quantity, cost = null) {
    this.currentStock += quantity;
    this.lastRestockDate = new Date();
    this.lastRestockQuantity = quantity;

    if (cost) {
        this.costPrice = cost;
    }

    await this.save();
    return this;
};

/**
 * Reduce stock (usage/sale)
 */
productSchema.methods.reduceStock = async function (quantity) {
    if (this.currentStock < quantity) {
        throw new Error(`Insufficient stock. Available: ${this.currentStock}, Requested: ${quantity}`);
    }

    this.currentStock -= quantity;
    await this.save();
    return this;
};

/**
 * Adjust stock (inventory correction)
 */
productSchema.methods.adjustStock = async function (newQuantity, reason = '') {
    const difference = newQuantity - this.currentStock;
    this.currentStock = newQuantity;
    await this.save();

    return {
        previousStock: this.currentStock - difference,
        newStock: this.currentStock,
        adjustment: difference,
        reason
    };
};

/**
 * Update average daily consumption
 */
productSchema.methods.updateAvgConsumption = async function (daysInPeriod, totalUsed) {
    if (daysInPeriod > 0) {
        this.avgDailyConsumption = totalUsed / daysInPeriod;
        await this.save();
    }
};

// Static Methods

/**
 * Get low stock products
 */
productSchema.statics.getLowStockProducts = async function (businessId) {
    return await this.find({
        business: businessId,
        isLowStock: true,
        isActive: true
    }).sort({ currentStock: 1 });
};

/**
 * Get products expiring soon
 */
productSchema.statics.getExpiringSoon = async function (businessId, days = 30) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    return await this.find({
        business: businessId,
        expiryDate: { $lte: futureDate, $gte: new Date() },
        isActive: true
    }).sort({ expiryDate: 1 });
};

/**
 * Get stock valuation
 */
productSchema.statics.getStockValuation = async function (businessId) {
    return await this.aggregate([
        {
            $match: {
                business: businessId,
                isActive: true
            }
        },
        {
            $group: {
                _id: '$category',
                totalValue: { $sum: { $multiply: ['$currentStock', '$costPrice'] } },
                totalItems: { $sum: 1 },
                totalStock: { $sum: '$currentStock' }
            }
        }
    ]);
};

module.exports = mongoose.model("Product", productSchema);
