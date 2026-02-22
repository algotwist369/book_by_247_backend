// DripCampaign.js - Multi-step drip campaign model
const mongoose = require("mongoose");

const dripCampaignSchema = new mongoose.Schema(
    {
        // Business Reference
        business: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Business",
            required: true,
            index: true
        },

        // Campaign Details
        name: {
            type: String,
            required: true,
            trim: true
        },
        description: {
            type: String
        },

        // Campaign Type
        type: {
            type: String,
            enum: ["onboarding", "nurture", "reengagement", "education", "promotion", "retention", "custom"],
            required: true
        },

        // Trigger - How customers enter this drip
        entryTrigger: {
            type: {
                type: String,
                enum: ["manual", "signup", "first_purchase", "tag_added", "segment", "api"],
                required: true
            },
            // For segment-based entry
            segmentFilters: {
                customerType: [{ type: String }],
                membershipTier: [{ type: String }],
                tags: [{ type: String }]
            }
        },

        // Exit Conditions
        exitConditions: {
            // Customer exits if they match any of these
            onPurchase: { type: Boolean, default: false },
            onTag: [{ type: String }],
            onUnsubscribe: { type: Boolean, default: true },
            afterDays: { type: Number }, // Auto-exit after X days
            onGoalComplete: { type: Boolean, default: false }
        },

        // Drip Steps
        steps: [{
            stepNumber: { type: Number, required: true },
            name: { type: String, required: true },

            // Delay before sending (from previous step or entry)
            delay: {
                value: { type: Number, required: true }, // e.g., 2
                unit: {
                    type: String,
                    enum: ["hours", "days", "weeks"],
                    default: "days"
                }
            },

            // Message Content
            useTemplate: { type: Boolean, default: false },
            template: { type: mongoose.Schema.Types.ObjectId, ref: "CampaignTemplate" },

            message: {
                subject: { type: String },
                body: { type: String },
                variables: { type: Map, of: String }
            },

            emailContent: {
                htmlBody: { type: String }
            },

            // Channels
            channels: [{
                type: String,
                enum: ["email", "sms", "whatsapp", "push_notification"]
            }],

            // Offer
            offer: {
                hasOffer: { type: Boolean, default: false },
                offerType: { type: String },
                offerValue: { type: Number },
                promoCode: { type: String }
            },

            // Conditional Logic - Send this step only if...
            conditions: {
                enabled: { type: Boolean, default: false },

                // Send if previous step was opened
                previousStepOpened: { type: Boolean },

                // Send if previous step was clicked
                previousStepClicked: { type: Boolean },

                // Send if customer has specific tag
                hasTags: [{ type: String }],

                // Send if customer spent minimum amount
                minTotalSpent: { type: Number }
            },

            // Alternative Step (if conditions not met)
            alternativeStep: {
                enabled: { type: Boolean, default: false },
                message: {
                    subject: { type: String },
                    body: { type: String }
                }
            },

            // Statistics for this step
            stats: {
                sent: { type: Number, default: 0 },
                delivered: { type: Number, default: 0 },
                opened: { type: Number, default: 0 },
                clicked: { type: Number, default: 0 },
                converted: { type: Number, default: 0 }
            }
        }],

        // Goal Tracking
        goal: {
            type: {
                type: String,
                enum: ["purchase", "appointment", "engagement", "custom"]
            },
            targetValue: { type: Number },
            achieved: { type: Number, default: 0 }
        },

        // Status
        isActive: {
            type: Boolean,
            default: true,
            index: true
        },

        // Statistics
        stats: {
            totalEntered: { type: Number, default: 0 },
            currentActive: { type: Number, default: 0 },
            totalCompleted: { type: Number, default: 0 },
            totalExited: { type: Number, default: 0 },
            totalConverted: { type: Number, default: 0 },
            avgCompletionRate: { type: Number, default: 0 },
            avgTimeToComplete: { type: Number, default: 0 } // in days
        },

        // Customer Journey Tracking
        enrollments: [{
            customer: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Customer",
                index: true
            },
            enrolledAt: { type: Date, default: Date.now },
            currentStep: { type: Number, default: 0 },
            status: {
                type: String,
                enum: ["active", "completed", "exited", "paused"],
                default: "active"
            },
            completedSteps: [{ type: Number }],
            exitedAt: { type: Date },
            exitReason: { type: String },
            completedAt: { type: Date },
            converted: { type: Boolean, default: false },

            // Step history
            stepHistory: [{
                stepNumber: { type: Number },
                sentAt: { type: Date },
                opened: { type: Boolean, default: false },
                openedAt: { type: Date },
                clicked: { type: Boolean, default: false },
                clickedAt: { type: Date },
                campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign" }
            }]
        }],

        // Created By
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: 'createdByModel'
        },
        createdByModel: {
            type: String,
            enum: ['Admin', 'Manager']
        }
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);

// Indexes
dripCampaignSchema.index({ business: 1, isActive: 1 });
dripCampaignSchema.index({ 'enrollments.status': 1 });
dripCampaignSchema.index({ 'enrollments.currentStep': 1 });

// Virtual for completion rate
dripCampaignSchema.virtual('completionRate').get(function () {
    if (this.stats.totalEntered === 0) return 0;
    return Math.round((this.stats.totalCompleted / this.stats.totalEntered) * 100);
});

// Method to enroll customer
dripCampaignSchema.methods.enrollCustomer = async function (customerId) {
    // Check if customer already enrolled
    const existing = this.enrollments.find(e =>
        e.customer.toString() === customerId.toString() &&
        e.status === 'active'
    );

    if (existing) {
        throw new Error('Customer already enrolled in this drip campaign');
    }

    this.enrollments.push({
        customer: customerId,
        enrolledAt: new Date(),
        currentStep: 0,
        status: 'active'
    });

    this.stats.totalEntered += 1;
    this.stats.currentActive += 1;

    await this.save();

    return this.enrollments[this.enrollments.length - 1];
};

// Method to move customer to next step
dripCampaignSchema.methods.moveToNextStep = async function (customerId) {
    const enrollment = this.enrollments.find(e =>
        e.customer.toString() === customerId.toString() &&
        e.status === 'active'
    );

    if (!enrollment) {
        throw new Error('Customer not enrolled or already completed');
    }

    enrollment.currentStep += 1;
    enrollment.completedSteps.push(enrollment.currentStep - 1);

    // Check if campaign completed
    if (enrollment.currentStep >= this.steps.length) {
        enrollment.status = 'completed';
        enrollment.completedAt = new Date();
        this.stats.totalCompleted += 1;
        this.stats.currentActive -= 1;
    }

    await this.save();
};

// Method to exit customer
dripCampaignSchema.methods.exitCustomer = async function (customerId, reason) {
    const enrollment = this.enrollments.find(e =>
        e.customer.toString() === customerId.toString() &&
        e.status === 'active'
    );

    if (!enrollment) {
        return;
    }

    enrollment.status = 'exited';
    enrollment.exitedAt = new Date();
    enrollment.exitReason = reason;

    this.stats.totalExited += 1;
    this.stats.currentActive -= 1;

    await this.save();
};

// Method to mark conversion
dripCampaignSchema.methods.markConversion = async function (customerId) {
    const enrollment = this.enrollments.find(e =>
        e.customer.toString() === customerId.toString()
    );

    if (enrollment && !enrollment.converted) {
        enrollment.converted = true;
        this.stats.totalConverted += 1;

        if (this.goal?.type) {
            this.goal.achieved += 1;
        }

        await this.save();
    }
};

// Method to record step action
dripCampaignSchema.methods.recordStepAction = async function (customerId, stepNumber, action, campaignId) {
    const enrollment = this.enrollments.find(e =>
        e.customer.toString() === customerId.toString()
    );

    if (!enrollment) return;

    let stepHistory = enrollment.stepHistory.find(h => h.stepNumber === stepNumber);

    if (!stepHistory) {
        stepHistory = {
            stepNumber,
            sentAt: new Date(),
            campaignId
        };
        enrollment.stepHistory.push(stepHistory);
    }

    if (action === 'opened') {
        stepHistory.opened = true;
        stepHistory.openedAt = new Date();
    } else if (action === 'clicked') {
        stepHistory.clicked = true;
        stepHistory.clickedAt = new Date();
    }

    await this.save();
};

// Static method to get pending steps (steps that need to be sent)
dripCampaignSchema.statics.getPendingSteps = async function (businessId) {
    const now = new Date();

    const campaigns = await this.find({
        business: businessId,
        isActive: true,
        'enrollments.status': 'active'
    }).populate('enrollments.customer');

    const pendingSteps = [];

    for (const campaign of campaigns) {
        for (const enrollment of campaign.enrollments) {
            if (enrollment.status !== 'active') continue;

            const currentStep = campaign.steps[enrollment.currentStep];
            if (!currentStep) continue;

            // Calculate when this step should be sent
            const lastStepTime = enrollment.stepHistory.length > 0
                ? enrollment.stepHistory[enrollment.stepHistory.length - 1].sentAt
                : enrollment.enrolledAt;

            const delayMs = currentStep.delay.value * (
                currentStep.delay.unit === 'hours' ? 60 * 60 * 1000 :
                    currentStep.delay.unit === 'days' ? 24 * 60 * 60 * 1000 :
                        7 * 24 * 60 * 60 * 1000 // weeks
            );

            const sendTime = new Date(lastStepTime.getTime() + delayMs);

            if (now >= sendTime) {
                pendingSteps.push({
                    campaign,
                    enrollment,
                    step: currentStep,
                    customer: enrollment.customer
                });
            }
        }
    }

    return pendingSteps;
};

module.exports = mongoose.model("DripCampaign", dripCampaignSchema);

