const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
    {
        business: { type: mongoose.Schema.Types.ObjectId, ref: "Business", required: true, index: true },
        manager: { type: mongoose.Schema.Types.ObjectId, ref: "Manager", index: true },
        staff: { type: mongoose.Schema.Types.ObjectId, ref: "Staff" },

        // References (The Missing Links)
        customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", index: true },
        appointment: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment", index: true },
        service: { type: mongoose.Schema.Types.ObjectId, ref: "Service", index: true },

        // Customer information (Snapshot)
        customerName: { type: String, required: true },
        customerPhone: { type: String },
        customerEmail: { type: String },
        isNewCustomer: { type: Boolean, default: true },

        // Service details
        serviceName: { type: String, required: true },
        serviceType: { type: String, required: true }, // Relaxed Enum
        serviceCategory: { type: String },

        // Pricing
        basePrice: { type: Number, required: true },
        discount: { type: Number, default: 0 },
        tax: { type: Number, default: 0 },
        finalPrice: { type: Number, required: true }, // Overrideable

        // Payment details
        paymentMethod: {
            type: String,
            enum: ["cash", "card", "upi", "wallet", "other"],
            default: "cash"
        },
        paymentStatus: {
            type: String,
            enum: ["pending", "completed", "refunded"],
            default: "completed"
        },

        // Source of transaction
        source: {
            type: String,
            default: "walk-in"
        },


        // Service timing
        serviceStartTime: { type: Date },
        serviceEndTime: { type: Date },
        duration: { type: Number }, // in minutes

        // Additional details
        notes: { type: String },
        rating: { type: Number, min: 1, max: 5 },
        feedback: { type: String },

        // Commission tracking
        staffCommission: { type: Number, default: 0 },

        // Date and time
        transactionDate: { type: Date, default: Date.now, index: true },
        isRefunded: { type: Boolean, default: false },
        refundDate: { type: Date },
        refundReason: { type: String }
    },
    { timestamps: true }
);

// Compound indexes
transactionSchema.index({ business: 1, transactionDate: -1 });
transactionSchema.index({ manager: 1, transactionDate: -1 });
transactionSchema.index({ staff: 1, transactionDate: -1 });
transactionSchema.index({ customerPhone: 1 });

// Smart Pricing Hook
transactionSchema.pre('save', function (next) {
    // Only calculate if finalPrice is NOT provided (Allows Overrides)
    if (this.finalPrice === undefined || this.finalPrice === null) {
        this.finalPrice = (this.basePrice || 0) - (this.discount || 0) + (this.tax || 0);
    }
    next();
});

module.exports = mongoose.model("Transaction", transactionSchema);
