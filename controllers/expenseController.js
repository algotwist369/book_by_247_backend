const Expense = require("../models/Expense");
const Business = require("../models/Business");
const Manager = require("../models/Manager");
const DailyBusiness = require("../models/DailyBusiness");
const { setCache, getCache, deleteCache } = require("../utils/cache");
const { cacheKeys } = require("../config/redis");

/**
 * @route   POST /api/expenses
 * @desc    Create new expense
 * @access  Manager, Admin
 */
const createExpense = async (req, res, next) => {
    try {
        const {
            businessId,
            date,
            category,
            subcategory,
            amount,
            paymentMethod,
            description,
            receipt,
            invoiceNumber,
            vendor,
            isRecurring,
            recurrenceFrequency,
            tags,
            notes,
            dailyBusinessId
        } = req.body;

        const userId = req.user.id;
        const userRole = req.user.role;

        // Validate required fields
        if (!businessId || !date || !category || !amount || !paymentMethod || !description) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields: businessId, date, category, amount, paymentMethod, description"
            });
        }

        // Verify business access
        let hasAccess = false;
        if (userRole === 'admin') {
            const business = await Business.findOne({ _id: businessId, admin: userId });
            hasAccess = !!business;
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            hasAccess = manager && manager.business.toString() === businessId;
        }

        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                message: "You don't have access to this business"
            });
        }

        // Calculate next due date for recurring expenses
        let nextDueDate = null;
        if (isRecurring && recurrenceFrequency) {
            const expenseDate = new Date(date);
            nextDueDate = new Date(expenseDate);

            switch (recurrenceFrequency) {
                case 'daily':
                    nextDueDate.setDate(nextDueDate.getDate() + 1);
                    break;
                case 'weekly':
                    nextDueDate.setDate(nextDueDate.getDate() + 7);
                    break;
                case 'monthly':
                    nextDueDate.setMonth(nextDueDate.getMonth() + 1);
                    break;
                case 'quarterly':
                    nextDueDate.setMonth(nextDueDate.getMonth() + 3);
                    break;
                case 'yearly':
                    nextDueDate.setFullYear(nextDueDate.getFullYear() + 1);
                    break;
            }
        }

        // Create expense
        const expense = await Expense.create({
            business: businessId,
            date: new Date(date),
            category,
            subcategory,
            amount: parseFloat(amount),
            paymentMethod,
            description,
            receipt,
            invoiceNumber,
            vendor,
            status: userRole === 'admin' ? 'approved' : 'pending', // Auto-approve if created by admin
            submittedBy: userId,
            approvedBy: userRole === 'admin' ? userId : null,
            approvalDate: userRole === 'admin' ? new Date() : null,
            isRecurring,
            recurrenceFrequency,
            nextDueDate,
            tags,
            notes,
            dailyBusiness: dailyBusinessId
        });

        // Invalidate cache
        await deleteCache(`business:${businessId}:expenses:*`);
        if (dailyBusinessId) {
            await deleteCache(`business:${businessId}:daily:*`);
        }

        return res.status(201).json({
            success: true,
            message: userRole === 'admin'
                ? "Expense created and approved automatically"
                : "Expense created and submitted for approval",
            data: expense
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @route   GET /api/expenses
 * @desc    Get all expenses with filters
 * @access  Manager, Admin
 */
const getExpenses = async (req, res, next) => {
    try {
        const {
            businessId,
            startDate,
            endDate,
            category,
            status,
            paymentMethod,
            isRecurring,
            page = 1,
            limit = 20
        } = req.query;

        const userId = req.user.id;
        const userRole = req.user.role;

        // Build query
        let query = {};

        if (userRole === 'admin') {
            if (businessId) {
                query.business = businessId;
            } else {
                const businesses = await Business.find({ admin: userId }).select('_id');
                query.business = { $in: businesses.map(b => b._id) };
            }
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            if (!manager) {
                return res.status(404).json({ success: false, message: "Manager not found" });
            }
            query.business = manager.business;
        }

        // Date range filter
        if (startDate && endDate) {
            query.date = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        } else if (startDate) {
            query.date = { $gte: new Date(startDate) };
        } else if (endDate) {
            query.date = { $lte: new Date(endDate) };
        }

        // Category filter
        if (category) {
            query.category = category;
        }

        // Status filter
        if (status) {
            query.status = status;
        }

        // Payment method filter
        if (paymentMethod) {
            query.paymentMethod = paymentMethod;
        }

        // Recurring filter
        if (isRecurring !== undefined) {
            query.isRecurring = isRecurring === 'true';
        }

        // Check cache
        const cacheKey = `expenses:${JSON.stringify(query)}:${page}:${limit}`;
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            return res.json({ success: true, source: 'cache', ...cachedData });
        }

        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const limitNum = parseInt(limit);

        // Fetch expenses
        const expenses = await Expense.find(query)
            .populate('submittedBy', 'name username')
            .populate('approvedBy', 'name email')
            .populate('business', 'name type branch')
            .sort({ date: -1, createdAt: -1 })
            .skip(skip)
            .limit(limitNum);

        const total = await Expense.countDocuments(query);

        // Calculate totals
        const totals = await Expense.aggregate([
            { $match: query },
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: '$amount' },
                    totalApproved: {
                        $sum: {
                            $cond: [{ $in: ['$status', ['approved', 'paid']] }, '$amount', 0]
                        }
                    },
                    totalPending: {
                        $sum: {
                            $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0]
                        }
                    }
                }
            }
        ]);

        const response = {
            success: true,
            data: expenses,
            pagination: {
                total,
                page: parseInt(page),
                limit: limitNum,
                pages: Math.ceil(total / limitNum)
            },
            summary: totals[0] || {
                totalAmount: 0,
                totalApproved: 0,
                totalPending: 0
            }
        };

        // Cache for 5 minutes
        await setCache(cacheKey, response, 300);

        return res.json(response);
    } catch (error) {
        next(error);
    }
};

/**
 * @route   GET /api/expenses/:id
 * @desc    Get expense by ID
 * @access  Manager, Admin
 */
const getExpenseById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const userRole = req.user.role;

        const expense = await Expense.findById(id)
            .populate('submittedBy', 'name username email phone')
            .populate('approvedBy', 'name email')
            .populate('business', 'name type branch address city')
            .populate('dailyBusiness', 'date totalIncome totalExpenses');

        if (!expense) {
            return res.status(404).json({
                success: false,
                message: "Expense not found"
            });
        }

        // Verify access
        let hasAccess = false;
        if (userRole === 'admin') {
            const business = await Business.findOne({
                _id: expense.business._id,
                admin: userId
            });
            hasAccess = !!business;
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            hasAccess = manager && manager.business.toString() === expense.business._id.toString();
        }

        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                message: "Access denied"
            });
        }

        return res.json({
            success: true,
            data: expense
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @route   PUT /api/expenses/:id
 * @desc    Update expense
 * @access  Manager (creator only), Admin
 */
const updateExpense = async (req, res, next) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const userId = req.user.id;
        const userRole = req.user.role;

        const expense = await Expense.findById(id);

        if (!expense) {
            return res.status(404).json({
                success: false,
                message: "Expense not found"
            });
        }

        // Only creator or admin can update
        if (userRole === 'manager' && expense.submittedBy.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: "You can only update expenses you created"
            });
        }

        // Can't update approved/rejected expenses unless admin
        if (expense.status !== 'pending' && userRole !== 'admin') {
            return res.status(400).json({
                success: false,
                message: "Cannot update expense that has been approved or rejected"
            });
        }

        // Update allowed fields
        const allowedUpdates = [
            'date', 'category', 'subcategory', 'amount', 'paymentMethod',
            'description', 'receipt', 'invoiceNumber', 'vendor',
            'tags', 'notes'
        ];

        allowedUpdates.forEach(field => {
            if (updates[field] !== undefined) {
                expense[field] = updates[field];
            }
        });

        await expense.save();

        // Invalidate cache
        await deleteCache(`business:${expense.business}:expenses:*`);

        return res.json({
            success: true,
            message: "Expense updated successfully",
            data: expense
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @route   POST /api/expenses/:id/approve
 * @desc    Approve expense
 * @access  Admin only
 */
const approveExpense = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const expense = await Expense.findById(id);

        if (!expense) {
            return res.status(404).json({
                success: false,
                message: "Expense not found"
            });
        }

        if (expense.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: `Expense is already ${expense.status}`
            });
        }

        await expense.approve(userId);

        // Invalidate cache
        await deleteCache(`business:${expense.business}:expenses:*`);

        return res.json({
            success: true,
            message: "Expense approved successfully",
            data: expense
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @route   POST /api/expenses/:id/reject
 * @desc    Reject expense
 * @access  Admin only
 */
const rejectExpense = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const userId = req.user.id;

        if (!reason) {
            return res.status(400).json({
                success: false,
                message: "Rejection reason is required"
            });
        }

        const expense = await Expense.findById(id);

        if (!expense) {
            return res.status(404).json({
                success: false,
                message: "Expense not found"
            });
        }

        if (expense.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: `Expense is already ${expense.status}`
            });
        }

        await expense.reject(userId, reason);

        // Invalidate cache
        await deleteCache(`business:${expense.business}:expenses:*`);

        return res.json({
            success: true,
            message: "Expense rejected",
            data: expense
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @route   POST /api/expenses/:id/mark-paid
 * @desc    Mark expense as paid
 * @access  Admin only
 */
const markExpensePaid = async (req, res, next) => {
    try {
        const { id } = req.params;

        const expense = await Expense.findById(id);

        if (!expense) {
            return res.status(404).json({
                success: false,
                message: "Expense not found"
            });
        }

        await expense.markPaid();

        // Invalidate cache
        await deleteCache(`business:${expense.business}:expenses:*`);

        return res.json({
            success: true,
            message: "Expense marked as paid",
            data: expense
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @route   DELETE /api/expenses/:id
 * @desc    Delete expense
 * @access  Admin only
 */
const deleteExpense = async (req, res, next) => {
    try {
        const { id } = req.params;

        const expense = await Expense.findById(id);

        if (!expense) {
            return res.status(404).json({
                success: false,
                message: "Expense not found"
            });
        }

        // Only allow deletion of pending expenses
        if (expense.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: "Can only delete pending expenses. Approved/Rejected expenses should not be deleted for audit trail."
            });
        }

        await Expense.findByIdAndDelete(id);

        // Invalidate cache
        await deleteCache(`business:${expense.business}:expenses:*`);

        return res.json({
            success: true,
            message: "Expense deleted successfully"
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @route   GET /api/expenses/reports/by-category
 * @desc    Get expenses grouped by category
 * @access  Manager, Admin
 */
const getExpensesByCategory = async (req, res, next) => {
    try {
        const { businessId, startDate, endDate } = req.query;
        const userId = req.user.id;
        const userRole = req.user.role;

        if (!businessId || !startDate || !endDate) {
            return res.status(400).json({
                success: false,
                message: "businessId, startDate, and endDate are required"
            });
        }

        // Verify access
        let hasAccess = false;
        if (userRole === 'admin') {
            const business = await Business.findOne({ _id: businessId, admin: userId });
            hasAccess = !!business;
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            hasAccess = manager && manager.business.toString() === businessId;
        }

        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                message: "Access denied"
            });
        }

        const report = await Expense.getExpensesByCategory(
            businessId,
            new Date(startDate),
            new Date(endDate)
        );

        return res.json({
            success: true,
            data: report
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @route   GET /api/expenses/pending-approvals
 * @desc    Get pending expense approvals
 * @access  Admin only
 */
const getPendingApprovals = async (req, res, next) => {
    try {
        const { businessId } = req.query;
        const userId = req.user.id;

        if (!businessId) {
            return res.status(400).json({
                success: false,
                message: "businessId is required"
            });
        }

        // Verify admin owns this business
        const business = await Business.findOne({ _id: businessId, admin: userId });
        if (!business) {
            return res.status(403).json({
                success: false,
                message: "Access denied"
            });
        }

        const pending = await Expense.getPendingApprovals(businessId);

        return res.json({
            success: true,
            count: pending.length,
            data: pending
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @route   POST /api/expenses/process-recurring
 * @desc    Process recurring expenses (cron job)
 * @access  Internal/System
 */
const processRecurringExpenses = async (req, res, next) => {
    try {
        const dueExpenses = await Expense.getRecurringDue();

        const created = [];

        for (const expense of dueExpenses) {
            // Create new expense instance
            const newExpense = await Expense.create({
                business: expense.business,
                date: new Date(),
                category: expense.category,
                subcategory: expense.subcategory,
                amount: expense.amount,
                paymentMethod: expense.paymentMethod,
                description: `${expense.description} (Auto-generated - Recurring)`,
                status: 'pending',
                submittedBy: expense.submittedBy,
                isRecurring: false, // The generated instance is not recurring
                parentExpense: expense._id,
                tags: expense.tags,
                notes: `Generated from recurring expense on ${new Date().toLocaleDateString()}`
            });

            created.push(newExpense);

            // Update next due date on parent
            const nextDue = new Date(expense.nextDueDate);
            switch (expense.recurrenceFrequency) {
                case 'daily':
                    nextDue.setDate(nextDue.getDate() + 1);
                    break;
                case 'weekly':
                    nextDue.setDate(nextDue.getDate() + 7);
                    break;
                case 'monthly':
                    nextDue.setMonth(nextDue.getMonth() + 1);
                    break;
                case 'quarterly':
                    nextDue.setMonth(nextDue.getMonth() + 3);
                    break;
                case 'yearly':
                    nextDue.setFullYear(nextDue.getFullYear() + 1);
                    break;
            }
            expense.nextDueDate = nextDue;
            await expense.save();
        }

        return res.json({
            success: true,
            message: `Processed ${created.length} recurring expenses`,
            data: created
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    createExpense,
    getExpenses,
    getExpenseById,
    updateExpense,
    approveExpense,
    rejectExpense,
    markExpensePaid,
    deleteExpense,
    getExpensesByCategory,
    getPendingApprovals,
    processRecurringExpenses
};
