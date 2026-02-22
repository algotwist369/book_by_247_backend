const mongoose = require("mongoose");
const { getMicroserviceConnection } = require("../config/microserviceDB");

const dbConnection = getMicroserviceConnection();

const googleSheetLeadSchema = new mongoose.Schema(
    {
        adminId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
            required: true,
            index: true
        },
        location: {
            type: String,
            required: true,
            trim: true,
            index: true
        },
        customerPhone: {
            type: String,
            required: true,
            trim: true,
            index: true
        },
        customerName: {
            type: String,
            trim: true
        },
        syncedAt: {
            type: Date,
            default: Date.now
        },
        isCalled: {
            type: Boolean,
            default: false
        },
        isWhatsapp: {
            type: Boolean,
            default: false
        },
        isCalledBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Manager"
        },
        isWhatsappBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Manager"
        },
        lastModified: {
            type: Date,
            default: Date.now
        },
        // Admin status tracking for analytics
        status: {
            type: String,
            enum: ['pending', 'forwarded', 'done'],
            default: 'pending',
            index: true
        },
        statusUpdatedAt: {
            type: Date
        },
        statusUpdatedBy: {
            type: String
        },
        // Detailed tracking for multiple managers
        managerStatus: [{
            managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Manager' },
            managerName: { type: String },
            action: { type: String }, // 'call', 'whatsapp', 'done'
            timestamp: { type: Date, default: Date.now }
        }],
        // Remarks / Notes
        remarks: [{
            text: { type: String, required: true },
            by: { type: String, required: true }, // User/Admin name
            createdAt: { type: Date, default: Date.now }
        }]
    },
    {
        timestamps: true
    }
);

// Compound index for uniqueness (Admin + Location + Phone) to prevent duplicates
googleSheetLeadSchema.index({ adminId: 1, location: 1, customerPhone: 1 }, { unique: true });

// Index for efficient querying
googleSheetLeadSchema.index({ syncedAt: -1 });
googleSheetLeadSchema.index({ createdAt: -1 });

// Pre-save middleware to update lastModified
googleSheetLeadSchema.pre('save', function (next) {
    this.lastModified = new Date();
    next();
});


module.exports = dbConnection.model("GoogleSheetLead", googleSheetLeadSchema);
