const DailyBusiness = require("../models/DailyBusiness");
const Transaction = require("../models/Transaction");
const Business = require("../models/Business");
const mongoose = require("mongoose");
const { calculateDailyMetrics, generateBusinessAnalytics } = require("../utils/businessUtils");
const { setCache, getCache, deleteCache } = require("../utils/cache");

// Helper function to validate MongoDB ObjectId
const isValidObjectId = (id) => {
    if (!id || id === 'undefined' || id === 'null') {
        return false;
    }
    return mongoose.Types.ObjectId.isValid(id);
};

// ================== Add Daily Business Record(admin and manager) ==================
const addDailyBusiness = async (req, res, next) => {
    try {
        const { 
            businessId, 
            date, 
            notes, 
            weather, 
            specialEvents,
            // Manual Data Entry Fields
            expenses,
            inventoryConsumed,
            cashHandling,
            staffAttendance,
            marketingMetrics,
            incomeBreakdown,
            revenueByPaymentMethod
        } = req.body;
        const managerId = req.user.id;

        // Validate businessId
        if (!businessId || !isValidObjectId(businessId)) {
            return res.status(400).json({
                success: false,
                message: "Valid Business ID is required"
            });
        }

        // Check if business exists and manager has access
        const business = await Business.findById(businessId);
        if (!business) {
            return res.status(404).json({ success: false, message: "Business not found" });
        }

        // Check if daily record already exists for this date
        const existingRecord = await DailyBusiness.findOne({
            business: businessId,
            date: new Date(date)
        });

        if (existingRecord) {
            return res.status(400).json({
                success: false,
                message: "Daily business record already exists for this date"
            });
        }

        // Get transactions for this date to calculate metrics
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        const transactions = await Transaction.find({
            business: businessId,
            transactionDate: { $gte: startOfDay, $lte: endOfDay }
        }).populate('staff');

        // Calculate metrics from transactions
        const metrics = calculateDailyMetrics(transactions);

        // Prepare Income Breakdown (Auto-calc or Manual)
        let finalIncomeBreakdown = {
            serviceRevenue: metrics.totalRevenue, // Default to service revenue
            productRevenue: 0,
            membershipRevenue: 0,
            giftCardRevenue: 0
        };

        if (incomeBreakdown) {
            finalIncomeBreakdown = { ...finalIncomeBreakdown, ...incomeBreakdown };
        }

        // Create daily business record
        const dailyBusiness = await DailyBusiness.create({
            business: businessId,
            manager: managerId,
            date: new Date(date),
            businessType: business.type,
            
            // Financials
            totalCustomers: metrics.totalCustomers,
            totalIncome: metrics.totalRevenue, // Will be recalculated by pre-save hook if revenueByPaymentMethod is provided
            totalExpenses: 0, // Will be recalculated by pre-save hook if expenses are provided
            netProfit: 0,     // Will be recalculated by pre-save hook
            
            // Manual/Optional Data
            revenueByPaymentMethod,
            incomeBreakdown: finalIncomeBreakdown,
            expenses,
            inventoryConsumed,
            cashHandling,
            staffAttendance,
            marketingMetrics,

            services: Object.entries(metrics.serviceBreakdown).map(([serviceType, data]) => ({
                serviceName: serviceType,
                serviceType: serviceType,
                customerCount: data.count,
                totalRevenue: data.revenue,
                averagePrice: data.count > 0 ? data.revenue / data.count : 0
            })),
            
            staffPerformance: Object.entries(metrics.staffPerformance).map(([staffId, data]) => ({
                staff: staffId,
                customersServed: data.customersServed,
                revenue: data.revenue,
                commission: data.commission
            })),
            
            metrics: {
                walkInCustomers: metrics.totalCustomers, // Can be refined later
                appointmentCustomers: 0,
                repeatCustomers: 0,
                newCustomers: metrics.totalCustomers,
                averageServiceTime: metrics.averageServiceTime,
                customerSatisfaction: metrics.customerSatisfaction
            },
            
            notes,
            weather,
            specialEvents: specialEvents || [],
            isCompleted: true,
            completedAt: new Date()
        });

        // Invalidate cache
        await deleteCache(`business:${businessId}:daily-business`);
        await deleteCache(`manager:${managerId}:daily-business`);

        return res.status(201).json({
            success: true,
            message: "Daily business record added successfully",
            data: dailyBusiness
        });
    } catch (err) {
        next(err);
    }
};

// ================== Get Daily Business Records ==================
const getDailyBusinessRecords = async (req, res, next) => {
    try {
        const { businessId, startDate, endDate, page = 1, limit = 10 } = req.query;
        const managerId = req.user.id;

        const cacheKey = `daily-business:${businessId || managerId}:${startDate}:${endDate}:${page}:${limit}`;

        // Try cache first
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            return res.json({ success: true, source: "cache", ...cachedData });
        }

        let query = {};



        if (req.user.role === 'admin') {
            // Admin: Must rely on businessId or get all their businesses
            if (businessId) {
                // Verify admin owns this business
                const business = await Business.findOne({ _id: businessId, admin: managerId });
                if (!business) {
                    return res.status(403).json({ success: false, message: "Access denied: You do not own this business" });
                }
                query.business = businessId;
            } else {
                // Return records for ALL businesses owned by this admin
                const businesses = await Business.find({ admin: managerId }).select('_id');
                const businessIds = businesses.map(b => b._id);
                query.business = { $in: businessIds };
            }
        } else {
            // Manager: Restrict to their assigned business
            const manager = await require("../models/Manager").findById(managerId);
            if (!manager || !manager.business) {
                return res.status(403).json({ success: false, message: "Manager not assigned to a business" });
            }

            // If businessId provided, ensure it matches their own
            if (businessId && manager.business.toString() !== businessId) {
                return res.status(403).json({ success: false, message: "Access denied" });
            }

            query.business = manager.business;
        }

        if (startDate && endDate) {
            query.date = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        const records = await DailyBusiness.find(query)
            .populate('business', 'name type branch')
            .populate('manager', 'name username')
            .sort({ date: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        const total = await DailyBusiness.countDocuments(query);

        const response = {
            success: true,
            data: records.map(r => r.toObject()),
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        };

        // Cache for 5 minutes
        await setCache(cacheKey, response, 300);

        return res.json(response);
    } catch (err) {
        next(err);
    }
};

// ================== Update Daily Business Record ==================
const updateDailyBusiness = async (req, res, next) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const managerId = req.user.id;

        const dailyBusiness = await DailyBusiness.findById(id);
        if (!dailyBusiness) {
            return res.status(404).json({ success: false, message: "Daily business record not found" });
        }

        // Check if manager has permission to update this record
        if (dailyBusiness.manager.toString() !== managerId) {
            return res.status(403).json({ success: false, message: "Access denied" });
        }

        // Apply updates
        Object.keys(updates).forEach(key => {
            // Prevent updating immutable fields if necessary, e.g., business, manager, date
            if (key !== '_id' && key !== 'business' && key !== 'manager' && key !== 'createdAt') {
                dailyBusiness[key] = updates[key];
            }
        });

        dailyBusiness.updatedAt = new Date();
        dailyBusiness.lastModifiedBy = managerId;
        dailyBusiness.lastModifiedByModel = 'Manager';

        // Save triggers the pre-save hook for recalculations
        const updatedRecord = await dailyBusiness.save();
        
        // Populate after save
        await updatedRecord.populate('business', 'name type branch');

        // Invalidate cache
        await deleteCache(`business:${dailyBusiness.business}:daily-business`);
        await deleteCache(`manager:${managerId}:daily-business`);

        return res.json({
            success: true,
            message: "Daily business record updated successfully",
            data: updatedRecord
        });
    } catch (err) {
        next(err);
    }
};

// ================== Delete Daily Business Record ==================
const deleteDailyBusiness = async (req, res, next) => {
    try {
        const { id } = req.params;
        const managerId = req.user.id;

        const dailyBusiness = await DailyBusiness.findById(id);
        if (!dailyBusiness) {
            return res.status(404).json({ success: false, message: "Daily business record not found" });
        }

        // Check if manager has permission to delete this record
        if (dailyBusiness.manager.toString() !== managerId) {
            return res.status(403).json({ success: false, message: "Access denied" });
        }

        await DailyBusiness.findByIdAndDelete(id);

        // Invalidate cache
        await deleteCache(`business:${dailyBusiness.business}:daily-business`);
        await deleteCache(`manager:${managerId}:daily-business`);

        return res.json({
            success: true,
            message: "Daily business record deleted successfully"
        });
    } catch (err) {
        next(err);
    }
};

// ================== Get Business Analytics ==================
const getBusinessAnalytics = async (req, res, next) => {
    try {
        const { businessId, period = 'monthly' } = req.query;
        const managerId = req.user.id;



        let query = {};

        if (req.user.role === 'admin') {
            // Keep consistent: Admin must provide businessId for specific analytics, or get aggregated? 
            // Usually analytics are per business. Logic implies single business for 'generateBusinessAnalytics'.
            if (!businessId) {
                // If getting analytics for "all businesses" is not supported by generateBusinessAnalytics structure, maybe default to 400?
                // But strictly, let's allow if the downstream supports it, BUT filtering by admin is key.
                // For now, let's enforce businessId for analytics to be safe, or if omitted, find their first business?
                // The existing code tried to allow 'no businessId' -> 'manager's business'. 
                return res.status(400).json({ success: false, message: "Business ID is required for Admin analytics" });
            }

            const business = await Business.findOne({ _id: businessId, admin: managerId });
            if (!business) {
                return res.status(403).json({ success: false, message: "Access denied" });
            }
            query.business = businessId;

        } else {
            const manager = await require("../models/Manager").findById(managerId);
            if (!manager || !manager.business) {
                return res.status(403).json({ success: false, message: "Access denied" });
            }
            if (businessId && manager.business.toString() !== businessId) {
                return res.status(403).json({ success: false, message: "Access denied" });
            }
            query.business = manager.business;
        }

        // Set date range based on period
        const endDate = new Date();
        const startDate = new Date();

        switch (period) {
            case 'daily':
                startDate.setDate(endDate.getDate() - 1);
                break;
            case 'weekly':
                startDate.setDate(endDate.getDate() - 7);
                break;
            case 'monthly':
                startDate.setMonth(endDate.getMonth() - 1);
                break;
            case 'yearly':
                startDate.setFullYear(endDate.getFullYear() - 1);
                break;
            default:
                startDate.setMonth(endDate.getMonth() - 1);
        }

        query.date = { $gte: startDate, $lte: endDate };

        const dailyRecords = await DailyBusiness.find(query)
            .sort({ date: -1 })
            .populate('business', 'name type branch')
            .populate('staffPerformance.staff', 'name role email phone');

        const analytics = generateBusinessAnalytics(dailyRecords, period);

        return res.json({
            success: true,
            data: analytics
        });
    } catch (err) {
        next(err);
    }
};

// ================== Get Daily Summary ==================
const getDailySummary = async (req, res, next) => {
    try {
        const { businessId, date } = req.query;
        const managerId = req.user.id;

        const targetDate = date ? new Date(date) : new Date();
        const startOfDay = new Date(targetDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);

        let businessQuery = {};

        if (req.user.role === 'admin') {
            if (businessId) {
                const business = await Business.findOne({ _id: businessId, admin: managerId });
                if (!business) return res.status(403).json({ success: false, message: "Access denied" });
                businessQuery._id = businessId;
            } else {
                return res.status(400).json({ success: false, message: "Business ID is required" });
            }
        } else {
            const manager = await require("../models/Manager").findById(managerId);
            if (!manager || !manager.business) return res.status(403).json({ success: false, message: "Access denied" });

            if (businessId && manager.business.toString() !== businessId) {
                return res.status(403).json({ success: false, message: "Access denied" });
            }
            businessQuery._id = manager.business;
        }

        // Get daily business record
        const dailyRecord = await DailyBusiness.findOne({
            business: businessQuery._id,
            date: { $gte: startOfDay, $lte: endOfDay }
        }).populate('business', 'name type branch');

        // Get transactions for the day
        const transactions = await Transaction.find({
            business: businessQuery._id,
            transactionDate: { $gte: startOfDay, $lte: endOfDay }
        }).populate('staff', 'name role');

        const summary = {
            date: targetDate,
            business: dailyRecord?.business || null,
            dailyRecord: dailyRecord || null,
            transactions: transactions,
            totals: {
                revenue: transactions.reduce((sum, t) => sum + (t.finalPrice || 0), 0),
                customers: transactions.length,
                transactions: transactions.length
            }
        };

        return res.json({
            success: true,
            data: summary
        });
    } catch (err) {
        next(err);
    }
};

// ================== PHASE 3 ENHANCEMENT: Initialize Daily Business ==================
/**
 * Initialize daily business record with opening cash balance
 * @route POST /api/daily-business/initialize
 */
const initializeDailyBusiness = async (req, res, next) => {
    try {
        const { businessId, date, openingCashBalance } = req.body;
        const managerId = req.user.id;
        const userRole = req.user.role;

        if (!businessId || !date) {
            return res.status(400).json({
                success: false,
                message: "businessId and date are required"
            });
        }

        // Access Control
        if (userRole === 'admin') {
            const business = await Business.findOne({ _id: businessId, admin: managerId });
            if (!business) return res.status(403).json({ success: false, message: "Access denied" });
        } else {
            const manager = await require("../models/Manager").findById(managerId);
            if (!manager || manager.business.toString() !== businessId) {
                return res.status(403).json({ success: false, message: "Access denied" });
            }
        }

        // Check if already exists
        const existing = await DailyBusiness.findOne({
            business: businessId,
            date: new Date(date)
        });

        if (existing) {
            return res.status(400).json({
                success: false,
                message: "Daily record already initialized for this date"
            });
        }

        // Get business details
        const business = await Business.findById(businessId);
        if (!business) {
            return res.status(404).json({ success: false, message: "Business not found" });
        }

        // Create initial record
        const dailyRecord = await DailyBusiness.create({
            business: businessId,
            manager: managerId,
            date: new Date(date),
            businessType: business.type,
            totalCustomers: 0,
            totalIncome: 0,
            totalExpenses: 0,
            netProfit: 0,
            cashHandling: {
                openingBalance: openingCashBalance || 0,
                expectedClosing: openingCashBalance || 0,
                actualClosing: 0,
                variance: 0
            },
            isCompleted: false
        });

        // Invalidate cache
        await deleteCache(`business:${businessId}:daily:*`);

        return res.status(201).json({
            success: true,
            message: "Daily business initialized",
            data: dailyRecord
        });
    } catch (error) {
        next(error);
    }
};

// ================== PHASE 3 ENHANCEMENT: Close Daily Business ==================
/**
 * Close daily business with cash reconciliation and final calculations
 * @route POST /api/daily-business/:id/close
 */
const closeDailyBusiness = async (req, res, next) => {
    try {
        const { id } = req.params;
        const {
            actualCashClosing,
            varianceReason,
            internalNotes,
            inventoryConsumed  // Array of {product, quantityUsed, estimatedCost}
        } = req.body;
        const managerId = req.user.id;

        const dailyRecord = await DailyBusiness.findById(id);

        if (!dailyRecord) {
            return res.status(404).json({
                success: false,
                message: "Daily business record not found"
            });
        }

        if (dailyRecord.isCompleted) {
            return res.status(400).json({
                success: false,
                message: "Daily business already closed"
            });
        }

        // Access Control
        if (req.user.role === 'admin') {
            const business = await Business.findOne({ _id: dailyRecord.business, admin: managerId });
            if (!business) return res.status(403).json({ success: false, message: "Access denied" });
        } else {
            if (dailyRecord.manager.toString() !== managerId) {
                // Double check if manager belongs to business even if they didn't Create the record? 
                // Usually any manager of the business should be able to close it, but strictly checking record creator is safer 
                // OR stricter: checking if manager.business matches dailyRecord.business
                const manager = await require("../models/Manager").findById(managerId);
                if (!manager || manager.business.toString() !== dailyRecord.business.toString()) {
                    return res.status(403).json({ success: false, message: "Access denied" });
                }
            }
        }

        // Get actual revenue and expenses from transactions/invoices
        const Invoice = require('../models/Invoice');
        const Expense = require('../models/Expense');

        const startOfDay = new Date(dailyRecord.date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(dailyRecord.date);
        endOfDay.setHours(23, 59, 59, 999);

        // Calculate revenue from invoices
        const invoices = await Invoice.find({
            business: dailyRecord.business,
            invoiceDate: { $gte: startOfDay, $lte: endOfDay }
        });

        const totalRevenue = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);

        // Calculate revenue by payment method
        const revenueByPaymentMethod = invoices.reduce((acc, inv) => {
            inv.payments.forEach(payment => {
                const method = payment.method || 'cash';
                if (!acc[method]) acc[method] = 0;
                acc[method] += payment.amount;
            });
            return acc;
        }, { cash: 0, card: 0, upi: 0, wallet: 0, bankTransfer: 0, credit: 0 });

        // Get approved expenses
        const expenses = await Expense.find({
            business: dailyRecord.business,
            date: { $gte: startOfDay, $lte: endOfDay },
            status: { $in: ['approved', 'paid'] }
        });

        const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);

        // Calculate expected cash closing
        const cashRevenue = revenueByPaymentMethod.cash || 0;
        const cashExpenses = expenses
            .filter(e => e.paymentMethod === 'cash')
            .reduce((sum, e) => sum + e.amount, 0);

        const expectedCashClosing =
            (dailyRecord.cashHandling?.openingBalance || 0) +
            cashRevenue -
            cashExpenses;

        // Update daily record
        dailyRecord.totalIncome = totalRevenue;
        dailyRecord.totalExpenses = totalExpenses;
        dailyRecord.netProfit = totalRevenue - totalExpenses;
        dailyRecord.revenueByPaymentMethod = revenueByPaymentMethod;

        // Cash reconciliation
        dailyRecord.cashHandling = {
            ...dailyRecord.cashHandling,
            expectedClosing: expectedCashClosing,
            actualClosing: actualCashClosing || expectedCashClosing,
            variance: (actualCashClosing || expectedCashClosing) - expectedCashClosing,
            varianceReason: varianceReason || '',
            reconciledBy: managerId,
            reconciledAt: new Date()
        };

        // Set discrepancy flag if variance > 100
        if (Math.abs(dailyRecord.cashHandling.variance) > 100) {
            dailyRecord.flags = dailyRecord.flags || {};
            dailyRecord.flags.hasDiscrepancy = true;
        }

        // Add inventory consumed
        if (inventoryConsumed && inventoryConsumed.length > 0) {
            dailyRecord.inventoryConsumed = inventoryConsumed;
        }

        // Add internal notes
        if (internalNotes) {
            dailyRecord.internalNotes = internalNotes;
        }

        // Mark as completed
        dailyRecord.isCompleted = true;
        dailyRecord.completedAt = new Date();
        dailyRecord.closedBy = managerId;
        dailyRecord.closedAt = new Date();

        await dailyRecord.save();

        // Invalidate cache
        await deleteCache(`business:${dailyRecord.business}:daily:*`);

        return res.json({
            success: true,
            message: "Daily business closed successfully",
            data: dailyRecord,
            warnings: dailyRecord.flags?.hasDiscrepancy
                ? [`Cash variance detected: ₹${Math.abs(dailyRecord.cashHandling.variance)}`]
                : []
        });
    } catch (error) {
        next(error);
    }
};

// ================== PHASE 3 ENHANCEMENT: Get Cash Discrepancies ==================
/**
 * Get daily records with cash discrepancies
 * @route GET /api/daily-business/cash-discrepancies
 */
const getCashDiscrepancies = async (req, res, next) => {
    try {
        const { businessId, startDate, endDate } = req.query;
        const userId = req.user.id;
        const userRole = req.user.role;

        if (!businessId) {
            return res.status(400).json({
                success: false,
                message: "businessId is required"
            });
        }

        // Access Control
        if (userRole === 'admin') {
            const business = await Business.findOne({ _id: businessId, admin: userId });
            if (!business) return res.status(403).json({ success: false, message: "Access denied" });
        } else {
            // Managers not allowed in route, but safe to add check
            return res.status(403).json({ success: false, message: "Access denied" });
        }

        // Build query
        let query = {
            business: businessId,
            isCompleted: true,
            'flags.hasDiscrepancy': true
        };

        if (startDate && endDate) {
            query.date = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        const discrepancies = await DailyBusiness.find(query)
            .populate('manager', 'name username')
            .populate('closedBy', 'name username')
            .sort({ date: -1 });

        const summary = discrepancies.reduce((acc, record) => {
            acc.totalVariance += Math.abs(record.cashHandling?.variance || 0);
            acc.count++;
            return acc;
        }, { totalVariance: 0, count: 0 });

        return res.json({
            success: true,
            data: discrepancies.map(d => ({
                _id: d._id,
                date: d.date,
                manager: d.manager,
                closedBy: d.closedBy,
                variance: d.cashHandling?.variance,
                varianceReason: d.cashHandling?.varianceReason,
                expectedClosing: d.cashHandling?.expectedClosing,
                actualClosing: d.cashHandling?.actualClosing
            })),
            summary
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    addDailyBusiness,
    getDailyBusinessRecords,
    updateDailyBusiness,
    deleteDailyBusiness,
    getBusinessAnalytics,
    getDailySummary,
    // Phase 3 enhancements
    initializeDailyBusiness,
    closeDailyBusiness,
    getCashDiscrepancies
};

