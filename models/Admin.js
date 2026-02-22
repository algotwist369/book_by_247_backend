const mongoose = require("mongoose");

const adminSchema = new mongoose.Schema(
    {
        companyName: { type: String, required: true, trim: true },
        name: { type: String, required: true },
        email: { type: String, required: true, unique: true, lowercase: true },
        phone: { type: String, required: true, unique: true, index: true },
        password: { type: String, required: true },

        businesses: [{ type: mongoose.Schema.Types.ObjectId, ref: "Business" }],

        // Google Sheet Integration
        googleSheetUrl: { type: String, trim: true },
        syncConfig: {
            isActive: { type: Boolean, default: false },
            lastSyncedAt: { type: Date }
        },

        refreshToken: { type: String },
        isActive: { type: Boolean, default: true },
        superAdminRemark: { type: String, default: "" },
    },
    { timestamps: true }
);

// Compound index: companyName + email for uniqueness per company
adminSchema.index({ companyName: 1, email: 1 });

module.exports = mongoose.model("Admin", adminSchema);
