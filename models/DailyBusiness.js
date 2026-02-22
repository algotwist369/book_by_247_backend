const mongoose = require("mongoose");

const dailyBusinessSchema = new mongoose.Schema(
    {
        business: { type: mongoose.Schema.Types.ObjectId, ref: "Business", required: true, index: true },
        manager: { type: mongoose.Schema.Types.ObjectId, ref: "Manager", required: true, index: true },
        date: { type: Date, default: Date.now, index: true },
        businessType: { type: String, enum: ["salon", "spa", "hotel"], required: true },

        // Daily summary (Original fields - PRESERVED)
        totalCustomers: { type: Number, default: 0 },
        totalIncome: { type: Number, default: 0 },
        totalExpenses: { type: Number, default: 0 },
        netProfit: { type: Number, default: 0 },

        // === PHASE 1 ENHANCEMENT: Revenue Breakdown by Payment Method ===
        revenueByPaymentMethod: {
            cash: { type: Number, default: 0 },
            card: { type: Number, default: 0 },
            upi: { type: Number, default: 0 },
            wallet: { type: Number, default: 0 },
            bankTransfer: { type: Number, default: 0 },
            credit: { type: Number, default: 0 }
        },

        // === PHASE 2 ENHANCEMENT: Income Breakdown by Source ===
        incomeBreakdown: {
            serviceRevenue: { type: Number, default: 0 },
            productRevenue: { type: Number, default: 0 },
            membershipRevenue: { type: Number, default: 0 },
            giftCardRevenue: { type: Number, default: 0 }
        },

        adjustments: {
            discounts: { type: Number, default: 0 },
            refunds: { type: Number, default: 0 },
            tips: { type: Number, default: 0 },
            cancellationFees: { type: Number, default: 0 }
        },

        // === PHASE 1 ENHANCEMENT: Detailed Expense Tracking ===
        expenses: {
            staff: {
                salaries: { type: Number, default: 0 },
                commissions: { type: Number, default: 0 },
                bonuses: { type: Number, default: 0 }
            },
            operational: {
                rent: { type: Number, default: 0 },
                electricity: { type: Number, default: 0 },
                water: { type: Number, default: 0 },
                internet: { type: Number, default: 0 },
                cleaning: { type: Number, default: 0 },
                laundry: { type: Number, default: 0 }
            },
            inventory: {
                products: { type: Number, default: 0 },
                supplies: { type: Number, default: 0 }
            },
            marketing: { type: Number, default: 0 },
            maintenance: { type: Number, default: 0 },
            miscellaneous: [{
                description: String,
                amount: Number,
                category: String,
                receipt: String
            }]
        },

        // === PHASE 1 ENHANCEMENT: Cash Reconciliation ===
        cashHandling: {
            openingBalance: { type: Number, default: 0 },
            expectedClosing: { type: Number, default: 0 },
            actualClosing: { type: Number, default: 0 },
            variance: { type: Number, default: 0 },
            varianceReason: String,
            pettyCashWithdrawals: { type: Number, default: 0 },
            pettyCashDeposits: { type: Number, default: 0 },
            reconciledBy: { type: mongoose.Schema.Types.ObjectId, ref: "Manager" },
            reconciledAt: Date
        },

        // === PHASE 1 ENHANCEMENT: Inventory Consumed ===
        inventoryConsumed: [{
            product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
            quantityUsed: { type: Number, required: true },
            estimatedCost: { type: Number, default: 0 }
        }],

        // Service-wise breakdown
        services: [{
            serviceName: { type: String, required: true },
            serviceType: { type: String, enum: ["hair", "facial", "massage", "nail", "spa", "room", "food", "other"] },
            customerCount: { type: Number, default: 0 },
            totalRevenue: { type: Number, default: 0 },
            averagePrice: { type: Number, default: 0 }
        }],

        // Staff performance
        staffPerformance: [{
            staff: { type: mongoose.Schema.Types.ObjectId, ref: "Staff" },
            customersServed: { type: Number, default: 0 },
            revenue: { type: Number, default: 0 },
            commission: { type: Number, default: 0 }
        }],

        // Additional metrics (Original fields - PRESERVED)
        metrics: {
            walkInCustomers: { type: Number, default: 0 },
            appointmentCustomers: { type: Number, default: 0 },
            repeatCustomers: { type: Number, default: 0 },
            newCustomers: { type: Number, default: 0 },
            averageServiceTime: { type: Number, default: 0 }, // in minutes
            customerSatisfaction: { type: Number, default: 0, min: 0, max: 5 }
        },

        // === PHASE 1 ENHANCEMENT: Operational Metrics ===
        operationalMetrics: {
            totalAppointments: { type: Number, default: 0 },
            completedAppointments: { type: Number, default: 0 },
            cancelledAppointments: { type: Number, default: 0 },
            noShows: { type: Number, default: 0 },
            averageBookingValue: { type: Number, default: 0 },
            serviceUtilizationRate: { type: Number, default: 0 },  // % of available slots used
            staffUtilizationRate: { type: Number, default: 0 },    // % of staff time billable
            averageServiceDuration: { type: Number, default: 0 },
            peakHours: [{ hour: Number, bookings: Number }]
        },

        // === PHASE 2 ENHANCEMENT: Marketing Metrics ===
        marketingMetrics: {
            leadsGenerated: { type: Number, default: 0 },
            conversions: { type: Number, default: 0 },
            socialMediaReach: { type: Number, default: 0 },
            campaignRoas: { type: Number, default: 0 } // Return on Ad Spend
        },

        // === PHASE 2 ENHANCEMENT: Staff Attendance ===
        staffAttendance: {
            totalStaff: { type: Number, default: 0 },
            present: { type: Number, default: 0 },
            absent: { type: Number, default: 0 },
            late: { type: Number, default: 0 },
            sickLeave: { type: Number, default: 0 }
        },

        // === PHASE 1 ENHANCEMENT: Flags for Business Intelligence ===
        flags: {
            hasDiscrepancy: { type: Boolean, default: false },
            requiresReview: { type: Boolean, default: false },
            hasLowStock: { type: Boolean, default: false },
            belowTarget: { type: Boolean, default: false }
        },

        // Notes and observations (Original fields - PRESERVED)
        notes: { type: String },
        weather: { type: String }, // For business correlation
        specialEvents: [{ type: String }], // Festivals, holidays, etc.

        // === PHASE 1 ENHANCEMENT: Additional Notes ===
        internalNotes: { type: String },  // Manager notes (not visible to admins)

        isCompleted: { type: Boolean, default: false },
        completedAt: { type: Date },

        // === PHASE 1 ENHANCEMENT: Audit Trail ===
        closedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Manager" },
        closedAt: Date,
        lastModifiedBy: { type: mongoose.Schema.Types.ObjectId, refPath: 'lastModifiedByModel' },
        lastModifiedByModel: { type: String, enum: ['Manager', 'Admin'] }
    },
    { timestamps: true }
);

// Compound indexes (Original - PRESERVED)
dailyBusinessSchema.index({ business: 1, date: -1 });
dailyBusinessSchema.index({ manager: 1, date: -1 });
dailyBusinessSchema.index({ businessType: 1, date: -1 });
dailyBusinessSchema.index({ date: -1, isCompleted: 1 });

// === PHASE 1 ENHANCEMENT: Additional Indexes ===
dailyBusinessSchema.index({ business: 1, date: -1, isCompleted: 1 });
dailyBusinessSchema.index({ 'flags.requiresReview': 1, date: -1 });
dailyBusinessSchema.index({ 'flags.hasDiscrepancy': 1, date: -1 });
dailyBusinessSchema.index({ 'cashHandling.reconciledBy': 1, date: -1 });

// === PHASE 1 ENHANCEMENT: Enhanced Pre-save Hook ===
dailyBusinessSchema.pre('save', function (next) {
    // Auto-calculate total revenue from payment methods (if provided)
    if (this.revenueByPaymentMethod) {
        const paymentTotal =
            (this.revenueByPaymentMethod.cash || 0) +
            (this.revenueByPaymentMethod.card || 0) +
            (this.revenueByPaymentMethod.upi || 0) +
            (this.revenueByPaymentMethod.wallet || 0) +
            (this.revenueByPaymentMethod.bankTransfer || 0) +
            (this.revenueByPaymentMethod.credit || 0);

        const adjustmentsTotal =
            (this.adjustments?.tips || 0) +
            (this.adjustments?.cancellationFees || 0) -
            (this.adjustments?.discounts || 0) -
            (this.adjustments?.refunds || 0);

        // Only override totalIncome if payment breakdown is provided
        if (paymentTotal > 0) {
            this.totalIncome = paymentTotal + adjustmentsTotal;
        }
    }

    // Auto-calculate total expenses from breakdown (if provided)
    if (this.expenses) {
        const staffExpenses =
            (this.expenses.staff?.salaries || 0) +
            (this.expenses.staff?.commissions || 0) +
            (this.expenses.staff?.bonuses || 0);

        const operationalExpenses =
            (this.expenses.operational?.rent || 0) +
            (this.expenses.operational?.electricity || 0) +
            (this.expenses.operational?.water || 0) +
            (this.expenses.operational?.internet || 0) +
            (this.expenses.operational?.cleaning || 0) +
            (this.expenses.operational?.laundry || 0);

        const inventoryExpenses =
            (this.expenses.inventory?.products || 0) +
            (this.expenses.inventory?.supplies || 0);

        const miscExpenses = (this.expenses.miscellaneous || []).reduce(
            (sum, item) => sum + (item.amount || 0), 0
        );

        const calculatedTotal =
            staffExpenses +
            operationalExpenses +
            inventoryExpenses +
            (this.expenses.marketing || 0) +
            (this.expenses.maintenance || 0) +
            miscExpenses;

        // Only override if breakdown has values
        if (calculatedTotal > 0) {
            this.totalExpenses = calculatedTotal;
        }
    }

    // Calculate net profit (works with both old and new data)
    this.netProfit = (this.totalIncome || 0) - (this.totalExpenses || 0);

    // Cash reconciliation variance
    if (this.cashHandling) {
        this.cashHandling.variance =
            (this.cashHandling.actualClosing || 0) -
            (this.cashHandling.expectedClosing || 0);
    }

    // Flag for cash discrepancies (> Rs.100)
    if (this.cashHandling && Math.abs(this.cashHandling.variance) > 100) {
        this.flags = this.flags || {};
        this.flags.hasDiscrepancy = true;
    }

    next();
});

module.exports = mongoose.model("DailyBusiness", dailyBusinessSchema);
