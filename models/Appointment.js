// Appointment.js - Appointment/Booking model
const mongoose = require("mongoose");

const appointmentSchema = new mongoose.Schema(
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
            required: true,
            index: true
        },
        service: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Service",
            required: true
        },
        staff: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Staff"
        },

        // Booking Number
        bookingNumber: {
            type: String,
            unique: true,
            index: true
        },

        // Date & Time
        appointmentDate: {
            type: Date,
            required: true,
            index: true
        },
        startTime: {
            type: String,
            required: true
        },
        endTime: {
            type: String,
            required: true
        },
        duration: {
            type: Number, // in minutes
            required: true
        },

        // Status
        status: {
            type: String,
            enum: ["pending", "confirmed", "in_progress", "completed", "cancelled", "no_show", "rescheduled"],
            default: "pending",
            index: true
        },

        // Pricing
        servicePrice: {
            type: Number,
            required: true
        },
        additionalCharges: {
            type: Number,
            default: 0
        },
        discount: {
            type: Number,
            default: 0
        },
        tax: {
            type: Number,
            default: 0
        },
        totalAmount: {
            type: Number,
            required: true
        },

        // Payment
        paymentStatus: {
            type: String,
            enum: ["pending", "partial", "paid", "refunded"],
            default: "pending",
            index: true
        },
        paymentMethod: {
            type: String,
            enum: ["cash", "card", "upi", "netbanking", "wallet", "online"],
            default: "cash"
        },
        paidAmount: {
            type: Number,
            default: 0
        },
        advanceAmount: {
            type: Number,
            default: 0
        },

        // Booking Details
        bookingSource: {
            type: String,
            enum: ["walk-in", "online", "phone", "whatsapp", "social_media", "mobile_app"],
            default: "walk-in"
        },
        bookingType: {
            type: String,
            enum: ["regular", "package", "membership"],
            default: "regular"
        },

        // Customer Notes
        customerNotes: {
            type: String
        },
        specialRequests: {
            type: String
        },

        // Internal Notes
        staffNotes: {
            type: String
        },
        internalNotes: {
            type: String
        },

        // Reminders
        reminderSent: {
            type: Boolean,
            default: false
        },
        reminderSentAt: {
            type: Date
        },
        confirmationSent: {
            type: Boolean,
            default: false
        },
        confirmationSentAt: {
            type: Date
        },

        // Cancellation
        cancellationReason: {
            type: String
        },
        cancelledBy: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: 'cancelledByModel'
        },
        cancelledByModel: {
            type: String,
            enum: ['Customer', 'Staff', 'Manager', 'Admin']
        },
        cancelledAt: {
            type: Date
        },
        cancellationFee: {
            type: Number,
            default: 0
        },

        // Rescheduling
        originalAppointmentDate: {
            type: Date
        },
        rescheduleReason: {
            type: String
        },
        rescheduledBy: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: 'rescheduledByModel'
        },
        rescheduledByModel: {
            type: String,
            enum: ['Customer', 'Staff', 'Manager', 'Admin']
        },
        rescheduledAt: {
            type: Date
        },

        // Completion
        completedAt: {
            type: Date
        },
        checkInTime: {
            type: Date
        },
        checkOutTime: {
            type: Date
        },
        actualDuration: {
            type: Number // in minutes
        },

        // Feedback
        rating: {
            type: Number,
            min: 1,
            max: 5
        },
        review: {
            type: String
        },
        reviewDate: {
            type: Date
        },

        // Follow-up
        followUpRequired: {
            type: Boolean,
            default: false
        },
        followUpDate: {
            type: Date
        },
        followUpNotes: {
            type: String
        },
        followUpCompleted: {
            type: Boolean,
            default: false
        },

        // Package/Membership
        packageId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "CustomerPackage"
        },
        membershipId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "CustomerMembership"
        },

        // Loyalty Points
        loyaltyPointsEarned: {
            type: Number,
            default: 0
        },
        loyaltyPointsRedeemed: {
            type: Number,
            default: 0
        },

        // Metadata
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: 'createdByModel'
        },
        createdByModel: {
            type: String,
            enum: ['Customer', 'Staff', 'Manager', 'Admin']
        },
        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: 'updatedByModel'
        },
        updatedByModel: {
            type: String,
            enum: ['Customer', 'Staff', 'Manager', 'Admin']
        }
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);

// Indexes for better performance
appointmentSchema.index({ business: 1, appointmentDate: 1 });
appointmentSchema.index({ business: 1, status: 1 });
appointmentSchema.index({ business: 1, customer: 1 });
appointmentSchema.index({ business: 1, staff: 1, appointmentDate: 1 });
appointmentSchema.index({ business: 1, service: 1 });
appointmentSchema.index({ createdAt: -1 });

// Virtual for formatted booking number
appointmentSchema.virtual('formattedBookingNumber').get(function () {
    return `BK${this.bookingNumber}`;
});

// Virtual for appointment day
appointmentSchema.virtual('appointmentDay').get(function () {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[new Date(this.appointmentDate).getDay()];
});

// Virtual for remaining amount
appointmentSchema.virtual('remainingAmount').get(function () {
    return this.totalAmount - this.paidAmount;
});

// Virtual for is upcoming
appointmentSchema.virtual('isUpcoming').get(function () {
    const now = new Date();
    const appointmentDateTime = new Date(this.appointmentDate);
    return appointmentDateTime > now && ['pending', 'confirmed'].includes(this.status);
});

// Pre-save middleware to generate booking number
appointmentSchema.pre('save', async function (next) {
    if (!this.bookingNumber) {
        // Generate unique booking number: YYYYMMDD + random 4 digits
        const date = new Date();
        const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
        const random = Math.floor(1000 + Math.random() * 9000);
        this.bookingNumber = `${dateStr}${random}`;
    }
    next();
});

// Method to confirm appointment
appointmentSchema.methods.confirm = async function () {
    this.status = 'confirmed';
    this.confirmationSent = true;
    this.confirmationSentAt = new Date();
    await this.save();
};

// Method to start appointment (customer checked in)
appointmentSchema.methods.start = async function () {
    this.status = 'in_progress';
    this.checkInTime = new Date();
    await this.save();
};

// Method to complete appointment
appointmentSchema.methods.complete = async function () {
    this.status = 'completed';
    this.completedAt = new Date();
    this.checkOutTime = new Date();

    if (this.checkInTime) {
        const duration = (this.checkOutTime - this.checkInTime) / (1000 * 60);
        this.actualDuration = Math.round(duration);
    }

    await this.save();
};

// Method to cancel appointment
appointmentSchema.methods.cancel = async function (reason, cancelledBy, cancelledByModel, fee = 0) {
    this.status = 'cancelled';
    this.cancellationReason = reason;
    this.cancelledBy = cancelledBy;
    this.cancelledByModel = cancelledByModel;
    this.cancelledAt = new Date();
    this.cancellationFee = fee;
    await this.save();
};

// Method to reschedule appointment
appointmentSchema.methods.reschedule = async function (newDate, newStartTime, newEndTime, reason, rescheduledBy, rescheduledByModel) {
    this.originalAppointmentDate = this.appointmentDate;
    this.appointmentDate = newDate;
    this.startTime = newStartTime;
    this.endTime = newEndTime;
    this.rescheduleReason = reason;
    this.rescheduledBy = rescheduledBy;
    this.rescheduledByModel = rescheduledByModel;
    this.rescheduledAt = new Date();
    this.status = 'rescheduled';
    await this.save();
};

// Method to mark as no-show
appointmentSchema.methods.markNoShow = async function () {
    this.status = 'no_show';
    await this.save();
};

// Method to send reminder
appointmentSchema.methods.sendReminder = async function () {
    this.reminderSent = true;
    this.reminderSentAt = new Date();
    await this.save();
};

// Method to add review
appointmentSchema.methods.addReview = async function (rating, review) {
    this.rating = rating;
    this.review = review;
    this.reviewDate = new Date();
    await this.save();
};

// Static method to get upcoming appointments
appointmentSchema.statics.getUpcoming = async function (businessId, startDate, endDate) {
    return await this.find({
        business: businessId,
        appointmentDate: {
            $gte: startDate,
            $lte: endDate
        },
        status: { $in: ['pending', 'confirmed'] }
    })
        .populate('customer', 'firstName lastName phone email')
        .populate('service', 'name duration price')
        .populate('staff', 'name role')
        .sort({ appointmentDate: 1, startTime: 1 });
};

// Static method to check availability
appointmentSchema.statics.checkAvailability = async function (businessId, staffId, date, startTime, endTime) {
    const conflictingAppointments = await this.find({
        business: businessId,
        staff: staffId,
        appointmentDate: date,
        status: { $in: ['pending', 'confirmed', 'in_progress'] },
        $or: [
            {
                startTime: { $lte: startTime },
                endTime: { $gt: startTime }
            },
            {
                startTime: { $lt: endTime },
                endTime: { $gte: endTime }
            },
            {
                startTime: { $gte: startTime },
                endTime: { $lte: endTime }
            }
        ]
    });

    return conflictingAppointments.length === 0;
};

module.exports = mongoose.model("Appointment", appointmentSchema);
