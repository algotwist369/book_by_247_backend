// invoiceController.js - Invoice and payment management
const Invoice = require("../models/Invoice");
const Customer = require("../models/Customer");
const Business = require("../models/Business");
const Manager = require("../models/Manager");
const Appointment = require("../models/Appointment");
const MembershipPlan = require("../models/MembershipPlan");
const LoyaltyTransaction = require("../models/LoyaltyTransaction");
const { setCache, getCache, deleteCache } = require("../utils/cache");

// ================== Create Invoice ==================
const createInvoice = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const {
            businessId,
            customerId,
            appointmentId,
            items,
            dueDate,
            notes,
            termsAndConditions,
            discountCode,
            discountType,
            discountValue,
            taxRate = 18
        } = req.body;

        // Validate items
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: "At least one item is required"
            });
        }

        // Determine business
        let business;
        if (userRole === 'admin') {
            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: "Business ID is required"
                });
            }
            business = await Business.findOne({ _id: businessId, admin: userId });
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            business = await Business.findById(manager.business);
        }

        if (!business) {
            return res.status(404).json({
                success: false,
                message: "Business not found or access denied"
            });
        }

        // Verify customer
        const customer = await Customer.findOne({
            _id: customerId,
            business: business._id
        });

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: "Customer not found"
            });
        }

        // Verify appointment if provided
        let appointment = null;
        if (appointmentId) {
            appointment = await Appointment.findOne({
                _id: appointmentId,
                business: business._id,
                customer: customerId
            });
        }

        // Get membership plan for tier-based discount
        let membershipPlan = null;
        let tierDiscount = 0;

        if (customer.membershipTier && customer.membershipTier !== 'none') {
            membershipPlan = await MembershipPlan.findOne({
                business: business._id,
                tier: customer.membershipTier,
                isActive: true
            });
        }

        // Calculate invoice totals
        let subtotal = 0;
        let discountTotal = 0;
        let taxTotal = 0;

        const processedItems = items.map(item => {
            if (!item.name || !item.price || !item.quantity) {
                throw new Error("Item name, price, and quantity are required");
            }

            const itemSubtotal = Number(item.price) * Number(item.quantity);
            let itemDiscount = Number(item.discount) || 0;

            // Apply membership tier discount
            if (membershipPlan) {
                const memberDiscount = membershipPlan.calculateDiscount(itemSubtotal, item.service);
                itemDiscount += memberDiscount;
            }

            const itemTaxableAmount = itemSubtotal - itemDiscount;
            const itemTax = (itemTaxableAmount * Number(taxRate)) / 100;
            const itemTotal = itemTaxableAmount + itemTax;

            subtotal += itemSubtotal;
            discountTotal += itemDiscount;
            taxTotal += itemTax;

            return {
                ...item,
                itemType: item.itemType || 'service', // Default to service if missing
                discount: itemDiscount,
                tax: itemTax,
                total: itemTotal
            };
        });

        const total = subtotal - discountTotal + taxTotal;

        // Customer snapshot
        const customerSnapshot = {
            name: customer.fullName,
            email: customer.email,
            phone: customer.phone,
            address: customer.address
        };

        // Business snapshot
        const businessSnapshot = {
            name: business.name,
            email: business.email,
            phone: business.phone,
            address: business.address?.street || business.address,
            gstNumber: business.registration?.gstNumber,
            panNumber: business.registration?.panNumber
        };

        // Create invoice
        const invoice = await Invoice.create({
            business: business._id,
            customer: customerId,
            appointment: appointmentId,
            items: processedItems,
            subtotal,
            discountTotal,
            taxTotal,
            total,
            dueDate,
            notes,
            termsAndConditions,
            discountCode,
            discountType,
            discountValue,
            taxRate,
            customerSnapshot,
            businessSnapshot,
            createdBy: userId,
            createdByModel: userRole === 'admin' ? 'Admin' : 'Manager'
        });

        // Invalidate cache
        await deleteCache(`business:${business._id}:invoices`);

        return res.status(201).json({
            success: true,
            message: "Invoice created successfully",
            data: {
                invoiceNumber: invoice.invoiceNumber,
                total: invoice.total,
                dueDate: invoice.dueDate,
                status: invoice.status
            }
        });
    } catch (err) {
        if (err.message === "Item name, price, and quantity are required") {
            return res.status(400).json({
                success: false,
                message: err.message
            });
        }
        next(err);
    }
};

// ================== Get Invoices ==================
const getInvoices = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const {
            businessId,
            page = 1,
            limit = 20,
            status,
            paymentStatus,
            customerId,
            startDate,
            endDate,
            search
        } = req.query;

        // Determine business(es)
        let businessIds = [];
        if (userRole === 'admin') {
            if (businessId) {
                const business = await Business.findOne({ _id: businessId, admin: userId });
                if (!business) {
                    return res.status(404).json({ success: false, message: "Business not found or access denied" });
                }
                businessIds = [business._id];
            } else {
                // Fetch all businesses for this admin
                const businesses = await Business.find({ admin: userId }).select('_id');
                businessIds = businesses.map(b => b._id);
            }
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            businessIds = [manager.business];
        }

        if (businessIds.length === 0) {
            return res.json({
                success: true,
                data: [],
                pagination: { total: 0, page: parseInt(page), limit: parseInt(limit), pages: 0 }
            });
        }

        const cacheKey = `invoices:${userId}:${businessId || 'all'}:${page}:${limit}:${status}:${paymentStatus}:${customerId}:${startDate}:${endDate}:${search}`;

        // Try cache first
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            return res.json({ success: true, source: "cache", ...cachedData });
        }

        // Build query
        let query = { business: { $in: businessIds } };

        if (status) {
            query.status = status;
        }

        if (paymentStatus) {
            query.paymentStatus = paymentStatus;
        }

        if (customerId) {
            query.customer = customerId;
        }

        if (startDate && endDate) {
            query.invoiceDate = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        if (search) {
            query.invoiceNumber = { $regex: search, $options: 'i' };
        }

        const invoices = await Invoice.find(query)
            .populate('customer', 'firstName lastName phone email')
            .populate('appointment', 'bookingNumber appointmentDate')
            .populate('business', 'name') // Populate business name for list view
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .sort({ invoiceDate: -1 })
            .lean();

        const total = await Invoice.countDocuments(query);

        const response = {
            success: true,
            data: invoices,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        };

        // Cache for 2 minutes
        await setCache(cacheKey, response, 120);

        return res.json(response);
    } catch (err) {
        next(err);
    }
};

// ================== Get Invoice by ID ==================
const getInvoiceById = async (req, res, next) => {
    try {
        const { id } = req.params;

        const invoice = await Invoice.findById(id)
            .populate('business', 'name email phone address')
            .populate('customer', 'firstName lastName phone email address')
            .populate('appointment', 'bookingNumber appointmentDate startTime service')
            .populate('items.service', 'name description')
            .populate('payments.processedBy')
            .populate('refunds.processedBy');

        if (!invoice) {
            return res.status(404).json({
                success: false,
                message: "Invoice not found"
            });
        }

        return res.json({
            success: true,
            data: invoice
        });
    } catch (err) {
        next(err);
    }
};

// ================== Update Invoice ==================
const updateInvoice = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { id } = req.params;
        const updates = req.body;

        const invoice = await Invoice.findById(id);

        if (!invoice) {
            return res.status(404).json({
                success: false,
                message: "Invoice not found"
            });
        }

        // Cannot update paid invoices
        if (invoice.paymentStatus === 'paid' && !updates.allowPaidUpdate) {
            return res.status(400).json({
                success: false,
                message: "Cannot update paid invoices"
            });
        }

        // Verify access
        if (userRole === 'admin') {
            const business = await Business.findOne({
                _id: invoice.business,
                admin: userId
            });
            if (!business) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied"
                });
            }
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            if (manager.business.toString() !== invoice.business.toString()) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied"
                });
            }
        }

        // Update invoice
        Object.assign(invoice, updates);
        invoice.updatedBy = userId;
        invoice.updatedByModel = userRole === 'admin' ? 'Admin' : 'Manager';

        await invoice.save();

        // Invalidate cache
        await deleteCache(`business:${invoice.business}:invoices`);

        return res.json({
            success: true,
            message: "Invoice updated successfully",
            data: invoice
        });
    } catch (err) {
        next(err);
    }
};

// ================== Add Payment ==================
const addPayment = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { id } = req.params;
        const { amount, paymentMethod, transactionId, paymentGateway, notes } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: "Valid payment amount is required"
            });
        }

        const invoice = await Invoice.findById(id);

        if (!invoice) {
            return res.status(404).json({
                success: false,
                message: "Invoice not found"
            });
        }

        if (invoice.paymentStatus === 'paid') {
            return res.status(400).json({
                success: false,
                message: "Invoice is already paid"
            });
        }

        const paymentData = {
            amount,
            paymentMethod,
            transactionId,
            paymentGateway,
            notes,
            processedBy: userId,
            processedByModel: userRole === 'admin' ? 'Admin' : 'Manager'
        };

        await invoice.addPayment(paymentData);

        // Auto-add loyalty points if invoice is now fully paid
        if (invoice.paymentStatus === 'paid' && !invoice.loyaltyPointsEarned) {
            const business = await Business.findById(invoice.business);
            const customer = await Customer.findById(invoice.customer);

            if (customer && business.settings?.loyaltySettings?.enabled) {
                const pointsRate = business.settings.loyaltySettings.pointsPerRupee || 1;
                const multiplier = customer.membershipTier !== 'none'
                    ? (business.settings.loyaltySettings.tierMultipliers?.[customer.membershipTier] || 1)
                    : 1;

                const pointsToEarn = Math.floor(invoice.total * pointsRate * multiplier);

                if (pointsToEarn > 0) {
                    // Add points to customer
                    await customer.loyaltyPoints(pointsToEarn);

                    // Create loyalty transaction
                    await LoyaltyTransaction.createEarnedTransaction({
                        business: business._id,
                        customer,
                        points: pointsToEarn,
                        amountSpent: invoice.total,
                        pointsRate,
                        multiplier,
                        invoice: invoice._id,
                        description: `Earned ${pointsToEarn} points from invoice ${invoice.invoiceNumber}`
                    });

                    // Update invoice
                    invoice.loyaltyPointsEarned = pointsToEarn;
                    await invoice.save();
                }
            }
        }

        // Invalidate cache
        await deleteCache(`business:${invoice.business}:invoices`);

        return res.json({
            success: true,
            message: "Payment added successfully",
            data: {
                paidAmount: invoice.paidAmount,
                balanceDue: invoice.balanceDue,
                paymentStatus: invoice.paymentStatus,
                loyaltyPointsEarned: invoice.loyaltyPointsEarned || 0
            }
        });
    } catch (err) {
        next(err);
    }
};

// ================== Add Refund ==================
const addRefund = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { id } = req.params;
        const { amount, reason, refundMethod, transactionId } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: "Valid refund amount is required"
            });
        }

        const invoice = await Invoice.findById(id);

        if (!invoice) {
            return res.status(404).json({
                success: false,
                message: "Invoice not found"
            });
        }

        if (amount > invoice.paidAmount - invoice.refundedAmount) {
            return res.status(400).json({
                success: false,
                message: "Refund amount exceeds paid amount"
            });
        }

        const refundData = {
            amount,
            reason,
            refundMethod,
            transactionId,
            processedBy: userId,
            refundProcessedByModel: userRole === 'admin' ? 'Admin' : 'Manager'
        };

        await invoice.addRefund(refundData);

        // Invalidate cache
        await deleteCache(`business:${invoice.business}:invoices`);

        return res.json({
            success: true,
            message: "Refund processed successfully",
            data: {
                refundedAmount: invoice.refundedAmount,
                paymentStatus: invoice.paymentStatus
            }
        });
    } catch (err) {
        next(err);
    }
};

// ================== Cancel Invoice ==================
const cancelInvoice = async (req, res, next) => {
    try {
        const { id } = req.params;

        const invoice = await Invoice.findById(id);

        if (!invoice) {
            return res.status(404).json({
                success: false,
                message: "Invoice not found"
            });
        }

        if (invoice.paymentStatus === 'paid') {
            return res.status(400).json({
                success: false,
                message: "Cannot cancel paid invoice. Please process a refund instead."
            });
        }

        await invoice.cancel();

        // Invalidate cache
        await deleteCache(`business:${invoice.business}:invoices`);

        return res.json({
            success: true,
            message: "Invoice cancelled successfully"
        });
    } catch (err) {
        next(err);
    }
};

// ================== Get Invoice Statistics ==================
const getInvoiceStats = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { businessId, startDate, endDate } = req.query;

        // Determine business(es)
        let businessIds = [];
        if (userRole === 'admin') {
            if (businessId) {
                const business = await Business.findOne({ _id: businessId, admin: userId });
                if (!business) {
                    return res.status(404).json({ success: false, message: "Business not found or access denied" });
                }
                businessIds = [business._id];
            } else {
                const businesses = await Business.find({ admin: userId }).select('_id');
                businessIds = businesses.map(b => b._id);
            }
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            businessIds = [manager.business];
        }

        if (businessIds.length === 0) {
            return res.json({
                success: true,
                data: {
                    totalInvoices: 0, unpaid: 0, partial: 0, paid: 0, overdue: 0,
                    totalRevenue: 0, totalPaid: 0, totalPending: 0, averageInvoiceValue: 0
                }
            });
        }

        const cacheKey = `invoice:stats:${userId}:${businessId || 'all'}:${startDate}:${endDate}`;

        // Try cache first
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            return res.json({ success: true, source: "cache", data: cachedData });
        }

        // Build match stage
        const matchStage = { business: { $in: businessIds } };
        if (startDate && endDate) {
            matchStage.invoiceDate = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        // Aggregate statistics
        const stats = await Invoice.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: null,
                    totalInvoices: { $sum: 1 },
                    unpaid: {
                        $sum: { $cond: [{ $eq: ['$paymentStatus', 'unpaid'] }, 1, 0] }
                    },
                    partial: {
                        $sum: { $cond: [{ $eq: ['$paymentStatus', 'partial'] }, 1, 0] }
                    },
                    paid: {
                        $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, 1, 0] }
                    },
                    overdue: {
                        $sum: { $cond: [{ $eq: ['$paymentStatus', 'overdue'] }, 1, 0] }
                    },
                    totalRevenue: { $sum: '$total' },
                    totalPaid: { $sum: '$paidAmount' },
                    totalPending: { $sum: { $subtract: ['$total', '$paidAmount'] } },
                    averageInvoiceValue: { $avg: '$total' }
                }
            }
        ]);

        const result = stats[0] || {
            totalInvoices: 0,
            unpaid: 0,
            partial: 0,
            paid: 0,
            overdue: 0,
            totalRevenue: 0,
            totalPaid: 0,
            totalPending: 0,
            averageInvoiceValue: 0
        };

        // Cache for 5 minutes
        await setCache(cacheKey, result, 300);

        return res.json({
            success: true,
            data: result
        });
    } catch (err) {
        next(err);
    }
};

// ================== Get Overdue Invoices ==================
const getOverdueInvoices = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { businessId } = req.query;

        // Determine business
        let business;
        if (userRole === 'admin') {
            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: "Business ID is required"
                });
            }
            business = await Business.findOne({ _id: businessId, admin: userId });
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            business = await Business.findById(manager.business);
        }

        if (!business) {
            return res.status(404).json({
                success: false,
                message: "Business not found or access denied"
            });
        }

        const invoices = await Invoice.getOverdue(business._id);

        return res.json({
            success: true,
            data: invoices
        });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    createInvoice,
    getInvoices,
    getInvoiceById,
    updateInvoice,
    addPayment,
    addRefund,
    cancelInvoice,
    getInvoiceStats,
    getOverdueInvoices
};

