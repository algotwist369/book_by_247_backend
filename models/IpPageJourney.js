const mongoose = require("mongoose");

const ipPageJourneySchema = new mongoose.Schema(
    {
        businessId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Business",
            required: true,
            index: true
        },
        ipAddress: {
            type: String,
            required: true,
            index: true
        },
        pagesVisited: [
            {
                page: { type: String, required: true },
                timestamp: { type: Date, default: Date.now }
            }
        ],
        lastPageVisited: {
            type: String
        },
        totalClicks: {
            type: Number,
            default: 1
        },
        lastVisitedAt: {
            type: Date,
            default: Date.now
        }
    },
    { timestamps: true }
);

// TTL Index: Auto-delete documents after 30 days (2592000 seconds)
ipPageJourneySchema.index({ lastVisitedAt: 1 }, { expireAfterSeconds: 2592000 });

// Compound index for frequent lookups
ipPageJourneySchema.index({ businessId: 1, ipAddress: 1 });

module.exports = mongoose.model("IpPageJourney", ipPageJourneySchema);
