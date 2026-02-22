const mongoose = require("mongoose");

const dailyClickCountSchema = new mongoose.Schema(
    {
        businessId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Business",
            required: true,
            index: true
        },
        date: {
            type: String, // Format: YYYY-MM-DD
            required: true
        },
        callClicks: {
            type: Number,
            default: 0
        },
        whatsappClicks: {
            type: Number,
            default: 0
        },
        bookingClicks: {
            type: Number,
            default: 0
        }
    },
    { timestamps: true }
);

// Compound index for efficient querying and updating by business and date
dailyClickCountSchema.index({ businessId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("DailyClickCount", dailyClickCountSchema);
