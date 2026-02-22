const mongoose = require("mongoose");

const attendanceRecordSchema = new mongoose.Schema(
    {
        date: {
            type: Date,
            required: true
        },
        status: {
            type: String,
            enum: ["present", "absent", "late", "half-day", "leave"],
            required: true
        },
        checkIn: Date,
        checkOut: Date,
        notes: String
    },
    { _id: false }
);

const staffSchema = new mongoose.Schema(
    {
        // 🔹 Business Structure
        business: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Business",
            required: true,
            index: true
        },
        manager: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Manager",
            index: true
        },

        // 🔹 Basic Info
        name: { type: String, required: true, trim: true },
        email: { type: String, lowercase: true, trim: true },
        phone: { type: String, required: true, trim: true },
        address: { type: String },

        role: {
            type: String,
            required: true,
            default: "stylist",
            index: true
        },

        specialization: String,
        experience: { type: Number, default: 0 },

        // 🔹 Salary & Commission
        salary: { type: Number, default: 0 },
        commissionPercentage: { type: Number, default: 0 },

        // 🔹 Login (Secure)
        username: { type: String, unique: true, sparse: true },
        password: { type: String, select: false }, // must hash
        pin: { type: String, select: false }, // must hash

        // 🔹 Status
        status: {
            type: String,
            enum: ["active", "inactive", "suspended"],
            default: "active",
            index: true
        },

        joiningDate: { type: Date, default: Date.now },

        // 🔹 Working Schedule
        workingHours: {
            start: { type: String, default: "09:00" },
            end: { type: String, default: "18:00" },
            days: [
                {
                    type: String,
                    enum: [
                        "monday",
                        "tuesday",
                        "wednesday",
                        "thursday",
                        "friday",
                        "saturday",
                        "sunday"
                    ]
                }
            ]
        },

        // 🔹 Attendance (Embedded)
        attendance: {
            summary: {
                totalWorkingDays: { type: Number, default: 0 },
                presentDays: { type: Number, default: 0 },
                absentDays: { type: Number, default: 0 },
                lateDays: { type: Number, default: 0 },
                halfDays: { type: Number, default: 0 },
                leaveDays: { type: Number, default: 0 }
            },

            records: [attendanceRecordSchema]
        },

        // 🔹 Performance (Dashboard Ready)
        performance: {
            totalCustomers: { type: Number, default: 0 },
            totalRevenue: { type: Number, default: 0 },
            totalAppointments: { type: Number, default: 0 },
            completedAppointments: { type: Number, default: 0 },
            cancelledByStaff: { type: Number, default: 0 },

            averageRating: { type: Number, default: 0, min: 0, max: 5 },
            totalReviews: { type: Number, default: 0 },

            totalCommissionEarned: { type: Number, default: 0 },
            avgServiceTime: { type: Number, default: 0 },
            customerRetentionRate: { type: Number, default: 0 },
            customerSatisfaction: { type: Number, default: 0, min: 0, max: 100 }
        },

        // 🔹 Monthly Targets
        monthlyTarget: {
            revenue: { type: Number, default: 0 },
            appointments: { type: Number, default: 0 },
            rating: { type: Number, default: 4.5 },
            customerSatisfaction: { type: Number, default: 90 }
        },

        // 🔹 Emergency Contact
        emergencyContact: {
            name: String,
            phone: String,
            relationship: String
        },

        // 🔹 Documents
        documents: [
            {
                type: {
                    type: String,
                    enum: ["aadhar", "pan", "resume", "certificate", "other"]
                },
                url: String,
                uploadedAt: { type: Date, default: Date.now }
            }
        ],

        notes: String
    },
    { timestamps: true }
);

// 🔹 Indexes
staffSchema.index({ business: 1, status: 1 });
staffSchema.index({ business: 1, role: 1 });
staffSchema.index({ "performance.totalRevenue": -1 });
staffSchema.index({ phone: 1 });

module.exports = mongoose.model("Staff", staffSchema);
