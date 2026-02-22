/**
 * Enhanced Business Utilities for Phase 3
 * Profitability analysis, inventory insights, and advanced metrics
 */

const DailyBusiness = require('../models/DailyBusiness');
const Expense = require('../models/Expense');
const Product = require('../models/Product');
const InventoryTransaction = require('../models/InventoryTransaction');
const Invoice = require('../models/Invoice');
const Appointment = require('../models/Appointment');

/**
 * Calculate comprehensive profitability analysis
 * @param {string} businessId - Business ID
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Object} Profitability metrics
 */
async function generateProfitabilityAnalysis(businessId, startDate, endDate) {
    try {
        // Get all daily business records
        const dailyRecords = await DailyBusiness.find({
            business: businessId,
            date: { $gte: startDate, $lte: endDate },
            isCompleted: true
        });

        if (dailyRecords.length === 0) {
            return {
                totalRevenue: 0,
                totalExpenses: 0,
                netProfit: 0,
                profitMargin: 0,
                averageDailyProfit: 0,
                message: "No completed daily records found"
            };
        }

        // Aggregate totals
        const totals = dailyRecords.reduce((acc, record) => {
            acc.totalRevenue += record.totalIncome || 0;
            acc.totalExpenses += record.totalExpenses || 0;
            acc.netProfit += record.netProfit || 0;
            return acc;
        }, { totalRevenue: 0, totalExpenses: 0, netProfit: 0 });

        const profitMargin = totals.totalRevenue > 0
            ? ((totals.netProfit / totals.totalRevenue) * 100).toFixed(2)
            : 0;

        // Get approved expenses for detailed breakdown
        const expenses = await Expense.find({
            business: businessId,
            date: { $gte: startDate, $lte: endDate },
            status: { $in: ['approved', 'paid'] }
        });

        // Expense breakdown by category
        const expenseByCategory = expenses.reduce((acc, expense) => {
            acc[expense.category] = (acc[expense.category] || 0) + expense.amount;
            return acc;
        }, {});

        // Calculate expense ratios
        const expenseRatios = {};
        Object.keys(expenseByCategory).forEach(category => {
            expenseRatios[category] = totals.totalRevenue > 0
                ? ((expenseByCategory[category] / totals.totalRevenue) * 100).toFixed(2)
                : 0;
        });

        // Revenue breakdown by payment method (from daily records with new structure)
        const revenueByPaymentMethod = dailyRecords.reduce((acc, record) => {
            if (record.revenueByPaymentMethod) {
                acc.cash += record.revenueByPaymentMethod.cash || 0;
                acc.card += record.revenueByPaymentMethod.card || 0;
                acc.upi += record.revenueByPaymentMethod.upi || 0;
                acc.wallet += record.revenueByPaymentMethod.wallet || 0;
                acc.bankTransfer += record.revenueByPaymentMethod.bankTransfer || 0;
                acc.credit += record.revenueByPaymentMethod.credit || 0;
            }
            return acc;
        }, { cash: 0, card: 0, upi: 0, wallet: 0, bankTransfer: 0, credit: 0 });

        // Cash flow analysis
        const cashFlow = {
            cashRevenue: revenueByPaymentMethod.cash,
            cashExpenses: expenses.filter(e => e.paymentMethod === 'cash')
                .reduce((sum, e) => sum + e.amount, 0),
            netCashFlow: 0
        };
        cashFlow.netCashFlow = cashFlow.cashRevenue - cashFlow.cashExpenses;

        // Daily profitability trend
        const dailyTrend = dailyRecords.map(record => ({
            date: record.date,
            revenue: record.totalIncome,
            expenses: record.totalExpenses,
            profit: record.netProfit,
            profitMargin: record.totalIncome > 0
                ? ((record.netProfit / record.totalIncome) * 100).toFixed(2)
                : 0
        })).sort((a, b) => new Date(a.date) - new Date(b.date));

        // Calculate break-even point
        const averageDailyRevenue = totals.totalRevenue / dailyRecords.length;
        const averageDailyExpenses = totals.totalExpenses / dailyRecords.length;
        const daysToBreakEven = averageDailyRevenue > averageDailyExpenses
            ? Math.ceil(10000 / (averageDailyRevenue - averageDailyExpenses)) // Assuming 10k initial investment
            : null;

        return {
            period: {
                startDate,
                endDate,
                totalDays: dailyRecords.length
            },
            summary: {
                totalRevenue: parseFloat(totals.totalRevenue.toFixed(2)),
                totalExpenses: parseFloat(totals.totalExpenses.toFixed(2)),
                netProfit: parseFloat(totals.netProfit.toFixed(2)),
                profitMargin: parseFloat(profitMargin),
                averageDailyRevenue: parseFloat((totals.totalRevenue / dailyRecords.length).toFixed(2)),
                averageDailyExpenses: parseFloat((totals.totalExpenses / dailyRecords.length).toFixed(2)),
                averageDailyProfit: parseFloat((totals.netProfit / dailyRecords.length).toFixed(2))
            },
            expenseBreakdown: {
                byCategory: expenseByCategory,
                ratios: expenseRatios
            },
            revenueBreakdown: {
                byPaymentMethod: revenueByPaymentMethod
            },
            cashFlow,
            trends: {
                daily: dailyTrend,
                profitTrend: dailyTrend.length >= 2
                    ? dailyTrend[dailyTrend.length - 1].profit - dailyTrend[0].profit > 0 ? 'increasing' : 'decreasing'
                    : 'stable'
            },
            insights: {
                topExpenseCategory: Object.keys(expenseByCategory).reduce((a, b) =>
                    expenseByCategory[a] > expenseByCategory[b] ? a : b, Object.keys(expenseByCategory)[0] || 'none'
                ),
                topExpenseAmount: Math.max(...Object.values(expenseByCategory), 0),
                daysToBreakEven,
                isProfitable: totals.netProfit > 0,
                healthStatus: profitMargin >= 20 ? 'excellent' : profitMargin >= 10 ? 'good' : profitMargin >= 0 ? 'fair' : 'poor'
            }
        };
    } catch (error) {
        throw new Error(`Error generating profitability analysis: ${error.message}`);
    }
}

/**
 * Generate inventory analysis and insights
 * @param {string} businessId - Business ID
 * @param {number} days - Number of days to analyze (default 30)
 * @returns {Object} Inventory metrics
 */
async function generateInventoryAnalysis(businessId, days = 30) {
    try {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        // Get all products
        const products = await Product.find({ business: businessId, isActive: true });

        if (products.length === 0) {
            return {
                totalProducts: 0,
                message: "No products found"
            };
        }

        // Get inventory transactions for the period
        const transactions = await InventoryTransaction.find({
            business: businessId,
            createdAt: { $gte: startDate }
        });

        // Calculate inventory metrics for each product
        const productAnalysis = await Promise.all(products.map(async (product) => {
            const productTransactions = transactions.filter(t =>
                t.product.toString() === product._id.toString()
            );

            // Calculate usage/consumption
            const usage = productTransactions
                .filter(t => ['usage', 'sale'].includes(t.type))
                .reduce((sum, t) => sum + t.quantity, 0);

            // Calculate purchases
            const purchased = productTransactions
                .filter(t => t.type === 'purchase')
                .reduce((sum, t) => sum + t.quantity, 0);

            // Calculate wastage
            const wastage = productTransactions
                .filter(t => t.type === 'wastage')
                .reduce((sum, t) => sum + (t.quantity || 0), 0);

            // Calculate wastage value
            const wastageValue = productTransactions
                .filter(t => t.type === 'wastage')
                .reduce((sum, t) => sum + (t.totalCost || 0), 0);

            // Turnover rate
            const avgInventory = product.currentStock;
            const turnoverRate = avgInventory > 0 ? (usage / avgInventory).toFixed(2) : 0;

            // Average daily usage
            const avgDailyUsage = (usage / days).toFixed(2);

            // Days until stockout
            const daysUntilStockout = parseFloat(avgDailyUsage) > 0
                ? Math.floor(product.currentStock / parseFloat(avgDailyUsage))
                : null;

            // Reorder recommendation
            const needsReorder = product.currentStock <= product.reorderLevel;

            return {
                productId: product._id,
                name: product.name,
                category: product.category,
                currentStock: product.currentStock,
                reorderLevel: product.reorderLevel,
                unit: product.unit,
                metrics: {
                    totalUsage: usage,
                    totalPurchased: purchased,
                    totalWastage: wastage,
                    wastageValue: parseFloat(wastageValue.toFixed(2)),
                    wastagePercentage: usage > 0 ? ((wastage / usage) * 100).toFixed(2) : 0,
                    avgDailyUsage: parseFloat(avgDailyUsage),
                    turnoverRate: parseFloat(turnoverRate),
                    daysUntilStockout
                },
                status: {
                    isLowStock: product.isLowStock,
                    needsReorder,
                    stockLevel: product.currentStock === 0 ? 'out_of_stock' :
                        product.isLowStock ? 'low' :
                            product.maxStockLevel && product.currentStock >= product.maxStockLevel ? 'overstock' :
                                'adequate'
                },
                value: {
                    currentValue: (product.currentStock * product.costPrice).toFixed(2),
                    potentialRevenue: product.sellingPrice
                        ? (product.currentStock * product.sellingPrice).toFixed(2)
                        : null
                }
            };
        }));

        // Overall inventory insights
        const lowStockProducts = productAnalysis.filter(p => p.status.isLowStock);
        const outOfStockProducts = productAnalysis.filter(p => p.currentStock === 0);
        const totalInventoryValue = productAnalysis.reduce((sum, p) => sum + parseFloat(p.value.currentValue), 0);
        const totalWastageValue = productAnalysis.reduce((sum, p) => sum + p.metrics.wastageValue, 0);

        // Category-wise analysis
        const categoryAnalysis = {};
        productAnalysis.forEach(p => {
            if (!categoryAnalysis[p.category]) {
                categoryAnalysis[p.category] = {
                    count: 0,
                    totalValue: 0,
                    avgTurnoverRate: 0
                };
            }
            categoryAnalysis[p.category].count++;
            categoryAnalysis[p.category].totalValue += parseFloat(p.value.currentValue);
            categoryAnalysis[p.category].avgTurnoverRate += parseFloat(p.metrics.turnoverRate);
        });

        // Calculate averages for categories
        Object.keys(categoryAnalysis).forEach(cat => {
            categoryAnalysis[cat].avgTurnoverRate =
                (categoryAnalysis[cat].avgTurnoverRate / categoryAnalysis[cat].count).toFixed(2);
        });

        return {
            period: {
                days,
                startDate,
                endDate: new Date()
            },
            summary: {
                totalProducts: products.length,
                lowStockCount: lowStockProducts.length,
                outOfStockCount: outOfStockProducts.length,
                totalInventoryValue: parseFloat(totalInventoryValue.toFixed(2)),
                totalWastageValue: parseFloat(totalWastageValue.toFixed(2)),
                wastagePercentage: totalInventoryValue > 0
                    ? ((totalWastageValue / totalInventoryValue) * 100).toFixed(2)
                    : 0
            },
            products: productAnalysis,
            byCategory: categoryAnalysis,
            alerts: {
                lowStock: lowStockProducts.map(p => ({
                    name: p.name,
                    currentStock: p.currentStock,
                    reorderLevel: p.reorderLevel,
                    daysUntilStockout: p.metrics.daysUntilStockout
                })),
                outOfStock: outOfStockProducts.map(p => ({ name: p.name, category: p.category })),
                highWastage: productAnalysis
                    .filter(p => parseFloat(p.metrics.wastagePercentage) > 10)
                    .map(p => ({
                        name: p.name,
                        wastagePercentage: p.metrics.wastagePercentage,
                        wastageValue: p.metrics.wastageValue
                    }))
            },
            recommendations: generateInventoryRecommendations(productAnalysis)
        };
    } catch (error) {
        throw new Error(`Error generating inventory analysis: ${error.message}`);
    }
}

/**
 * Generate inventory recommendations
 * @param {Array} productAnalysis - Product analysis data
 * @returns {Array} Recommendations
 */
function generateInventoryRecommendations(productAnalysis) {
    const recommendations = [];

    productAnalysis.forEach(product => {
        // Reorder recommendation
        if (product.status.needsReorder && product.metrics.daysUntilStockout <= 7) {
            recommendations.push({
                type: 'urgent_reorder',
                priority: 'high',
                productName: product.name,
                message: `Urgent: Reorder ${product.name}. Only ${product.metrics.daysUntilStockout} days of stock remaining.`,
                action: `Order ${product.reorderLevel * 2} ${product.unit}s`
            });
        } else if (product.status.needsReorder) {
            recommendations.push({
                type: 'reorder',
                priority: 'medium',
                productName: product.name,
                message: `${product.name} is below reorder level.`,
                action: `Order ${product.reorderLevel} ${product.unit}s`
            });
        }

        // High wastage warning
        if (parseFloat(product.metrics.wastagePercentage) > 15) {
            recommendations.push({
                type: 'high_wastage',
                priority: 'high',
                productName: product.name,
                message: `High wastage detected for ${product.name} (${product.metrics.wastagePercentage}%).`,
                action: 'Investigate storage or quality issues'
            });
        }

        // Slow-moving inventory
        if (parseFloat(product.metrics.turnoverRate) < 0.5 && product.currentStock > product.reorderLevel) {
            recommendations.push({
                type: 'slow_moving',
                priority: 'low',
                productName: product.name,
                message: `${product.name} has low turnover rate.`,
                action: 'Consider reducing reorder quantity or promoting usage'
            });
        }

        // Overstock warning
        if (product.status.stockLevel === 'overstock') {
            recommendations.push({
                type: 'overstock',
                priority: 'medium',
                productName: product.name,
                message: `${product.name} is overstocked.`,
                action: 'Hold off on reordering until stock normalizes'
            });
        }
    });

    return recommendations.sort((a, b) => {
        const priorityOrder = { high: 1, medium: 2, low: 3 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
}

/**
 * Calculate comprehensive daily business summary
 * @param {string} businessId - Business ID
 * @param {Date} date - Date for summary
 * @returns {Object} Daily summary
 */
async function calculateDailyBusinessSummary(businessId, date) {
    try {
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        // Get appointments
        const appointments = await Appointment.find({
            business: businessId,
            appointmentDate: { $gte: startOfDay, $lte: endOfDay }
        }).populate('service staff customer');

        // Get invoices
        const invoices = await Invoice.find({
            business: businessId,
            invoiceDate: { $gte: startOfDay, $lte: endOfDay }
        });

        // Get expenses
        const expenses = await Expense.find({
            business: businessId,
            date: { $gte: startOfDay, $lte: endOfDay },
            status: { $in: ['approved', 'paid'] }
        });

        // Revenue calculations
        const totalRevenue = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);

        const revenueByPaymentMethod = invoices.reduce((acc, inv) => {
            inv.payments.forEach(payment => {
                const method = payment.method || 'cash';
                acc[method] = (acc[method] || 0) + payment.amount;
            });
            return acc;
        }, { cash: 0, card: 0, upi: 0, wallet: 0, bankTransfer: 0, credit: 0 });

        // Expense calculations
        const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);

        const expensesByCategory = expenses.reduce((acc, exp) => {
            acc[exp.category] = (acc[exp.category] || 0) + exp.amount;
            return acc;
        }, {});

        // Appointment metrics
        const appointmentMetrics = {
            total: appointments.length,
            completed: appointments.filter(a => a.status === 'completed').length,
            cancelled: appointments.filter(a => a.status === 'cancelled').length,
            noShow: appointments.filter(a => a.status === 'no-show').length,
            pending: appointments.filter(a => ['confirmed', 'checked-in'].includes(a.status)).length
        };

        // Customer metrics
        const uniqueCustomers = new Set(invoices.map(inv => inv.customer?.toString()).filter(Boolean));

        return {
            date,
            revenue: {
                total: parseFloat(totalRevenue.toFixed(2)),
                byPaymentMethod: revenueByPaymentMethod
            },
            expenses: {
                total: parseFloat(totalExpenses.toFixed(2)),
                byCategory: expensesByCategory
            },
            profit: {
                net: parseFloat((totalRevenue - totalExpenses).toFixed(2)),
                margin: totalRevenue > 0 ? ((totalRevenue - totalExpenses) / totalRevenue * 100).toFixed(2) : 0
            },
            appointments: appointmentMetrics,
            customers: {
                total: uniqueCustomers.size,
                averageSpend: uniqueCustomers.size > 0
                    ? (totalRevenue / uniqueCustomers.size).toFixed(2)
                    : 0
            }
        };
    } catch (error) {
        throw new Error(`Error calculating daily summary: ${error.message}`);
    }
}

module.exports = {
    generateProfitabilityAnalysis,
    generateInventoryAnalysis,
    generateInventoryRecommendations,
    calculateDailyBusinessSummary
};
