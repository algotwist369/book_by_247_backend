// Review.js - Review and rating model
const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
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
            required: function () { return !this.guestName; }, // Required if not a guest
            index: true
        },
        // Guest Details (for checking out/reviewing without account)
        guestName: { type: String, trim: true },
        guestEmail: { type: String, trim: true, lowercase: true },
        appointment: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Appointment"
        },
        service: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Service"
        },
        staff: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Staff"
        },

        // Rating
        rating: {
            type: Number,
            required: true,
            min: 1,
            max: 5,
            index: true
        },

        // Review Content
        title: {
            type: String,
            trim: true
        },
        review: {
            type: String,
            required: true
        },

        // Detailed Ratings
        ratings: {
            service: { type: Number, min: 1, max: 5 },
            staff: { type: Number, min: 1, max: 5 },
            cleanliness: { type: Number, min: 1, max: 5 },
            ambience: { type: Number, min: 1, max: 5 },
            valueForMoney: { type: Number, min: 1, max: 5 }
        },

        // Media
        images: [{ type: String }],

        // Status
        status: {
            type: String,
            enum: ["pending", "approved", "rejected", "flagged"],
            default: "pending",
            index: true
        },

        // Publishing
        isPublished: {
            type: Boolean,
            default: false,
            index: true
        },
        isVerified: {
            type: Boolean,
            default: false
        },
        isFeatured: {
            type: Boolean,
            default: false
        },

        // Business Response
        response: {
            text: { type: String },
            respondedBy: {
                type: mongoose.Schema.Types.ObjectId,
                refPath: 'respondedByModel'
            },
            respondedByModel: {
                type: String,
                enum: ['Manager', 'Admin']
            },
            respondedAt: { type: Date }
        },

        // Helpfulness
        helpfulCount: {
            type: Number,
            default: 0
        },
        notHelpfulCount: {
            type: Number,
            default: 0
        },

        // Moderation
        flaggedReason: {
            type: String
        },
        moderatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: 'moderatedByModel'
        },
        moderatedByModel: {
            type: String,
            enum: ['Manager', 'Admin']
        },
        moderatedAt: {
            type: Date
        },
        moderationNotes: {
            type: String
        },

        // Source
        source: {
            type: String,
            enum: ["website", "mobile_app", "email", "sms", "google", "facebook", "other"],
            default: "website"
        },

        // Sentiment Analysis (can be added by AI)
        sentiment: {
            type: String,
            enum: ["positive", "neutral", "negative"]
        },
        sentimentScore: {
            type: Number,
            min: -1,
            max: 1
        },

        // Customer Details (snapshot at review time)
        customerSnapshot: {
            name: { type: String },
            email: { type: String },
            totalVisits: { type: Number }
        },

        // Metadata
        isEdited: {
            type: Boolean,
            default: false
        },
        editedAt: {
            type: Date
        },

        // Display Order
        displayOrder: {
            type: Number,
            default: 0
        }
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);

// Indexes for better performance
reviewSchema.index({ business: 1, isPublished: 1, status: 1 });
reviewSchema.index({ business: 1, rating: -1 });
reviewSchema.index({ business: 1, createdAt: -1 });
reviewSchema.index({ customer: 1, business: 1 });
reviewSchema.index({ service: 1 });
reviewSchema.index({ staff: 1 });

// Compound index for customer and business (prevent duplicate reviews for same appointment)
reviewSchema.index({ customer: 1, appointment: 1 }, { unique: true, sparse: true });

// Virtual for helpful percentage
reviewSchema.virtual('helpfulPercentage').get(function () {
    const total = this.helpfulCount + this.notHelpfulCount;
    if (total === 0) return 0;
    return Math.round((this.helpfulCount / total) * 100);
});

// Virtual for average detailed rating
reviewSchema.virtual('averageDetailedRating').get(function () {
    if (!this.ratings) return this.rating;

    const ratings = Object.values(this.ratings).filter(r => r > 0);
    if (ratings.length === 0) return this.rating;

    const sum = ratings.reduce((acc, r) => acc + r, 0);
    return sum / ratings.length;
});

// Virtual for review age in days
reviewSchema.virtual('reviewAgeInDays').get(function () {
    const now = new Date();
    const created = new Date(this.createdAt);
    const diffTime = Math.abs(now - created);
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
});

// Pre-save middleware to calculate sentiment
reviewSchema.pre('save', function (next) {
    // Simple sentiment analysis based on rating
    if (this.rating >= 4) {
        this.sentiment = 'positive';
        this.sentimentScore = 0.7;
    } else if (this.rating === 3) {
        this.sentiment = 'neutral';
        this.sentimentScore = 0;
    } else {
        this.sentiment = 'negative';
        this.sentimentScore = -0.7;
    }

    next();
});

// Method to approve review
reviewSchema.methods.approve = async function () {
    this.status = 'approved';
    this.isPublished = true;
    await this.save();
};

// Method to reject review
reviewSchema.methods.reject = async function (reason, moderatedBy, moderatedByModel) {
    this.status = 'rejected';
    this.isPublished = false;
    this.moderationNotes = reason;
    this.moderatedBy = moderatedBy;
    this.moderatedByModel = moderatedByModel;
    this.moderatedAt = new Date();
    await this.save();
};

// Method to flag review
reviewSchema.methods.flag = async function (reason) {
    this.status = 'flagged';
    this.flaggedReason = reason;
    await this.save();
};

// Method to add response
reviewSchema.methods.addResponse = async function (text, respondedBy, respondedByModel) {
    this.response = {
        text,
        respondedBy,
        respondedByModel,
        respondedAt: new Date()
    };
    await this.save();
};

// Method to mark as helpful
reviewSchema.methods.markHelpful = async function () {
    this.helpfulCount += 1;
    await this.save();
};

// Method to mark as not helpful
reviewSchema.methods.markNotHelpful = async function () {
    this.notHelpfulCount += 1;
    await this.save();
};

// Static method to get business average rating
reviewSchema.statics.getBusinessAverageRating = async function (businessId) {
    const result = await this.aggregate([
        {
            $match: {
                business: businessId,
                isPublished: true,
                status: 'approved'
            }
        },
        {
            $group: {
                _id: null,
                averageRating: { $avg: '$rating' },
                totalReviews: { $sum: 1 },
                fiveStarCount: {
                    $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] }
                },
                fourStarCount: {
                    $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] }
                },
                threeStarCount: {
                    $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] }
                },
                twoStarCount: {
                    $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] }
                },
                oneStarCount: {
                    $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] }
                }
            }
        }
    ]);

    return result[0] || {
        averageRating: 0,
        totalReviews: 0,
        fiveStarCount: 0,
        fourStarCount: 0,
        threeStarCount: 0,
        twoStarCount: 0,
        oneStarCount: 0
    };
};

// Static method to get featured reviews
reviewSchema.statics.getFeaturedReviews = async function (businessId, limit = 5) {
    return await this.find({
        business: businessId,
        isPublished: true,
        isFeatured: true,
        status: 'approved'
    })
        .populate('customer', 'firstName lastName')
        .sort({ displayOrder: 1, createdAt: -1 })
        .limit(limit);
};

// Static method to get recent reviews
reviewSchema.statics.getRecentReviews = async function (businessId, limit = 10) {
    return await this.find({
        business: businessId,
        isPublished: true,
        status: 'approved'
    })
        .populate('customer', 'firstName lastName')
        .populate('service', 'name')
        .sort({ createdAt: -1 })
        .limit(limit);
};

module.exports = mongoose.model("Review", reviewSchema);

