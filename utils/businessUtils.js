// businessUtils.js - Business-specific utility functions

/**
 * Generate business link for manager access
 * @param {string} businessName - Business name
 * @param {string} businessId - Business ID
 * @returns {string} - Generated business link
 */
const generateBusinessLink = (businessName, businessId) => {
    const cleanBusinessName = businessName.toLowerCase().replace(/[^a-z0-9]/g, '');
    // Extract last 3 digits from businessId ObjectId for shorter link
    const shortId = businessId.toString().slice(-3);
    return `${cleanBusinessName}_${shortId}`;
};

/**
 * Calculate daily business metrics
 * @param {Array} transactions - Array of transactions
 * @returns {Object} - Calculated metrics
 */
const calculateDailyMetrics = (transactions) => {
    const metrics = {
        totalCustomers: transactions.length,
        totalRevenue: 0,
        totalExpenses: 0,
        netProfit: 0,
        serviceBreakdown: {},
        staffPerformance: {},
        averageServiceTime: 0,
        customerSatisfaction: 0
    };

    let totalServiceTime = 0;
    let totalRating = 0;
    let ratingCount = 0;

    transactions.forEach(transaction => {
        // Revenue calculation
        metrics.totalRevenue += transaction.finalPrice || 0;

        // Service breakdown
        const serviceType = transaction.serviceType || 'other';
        if (!metrics.serviceBreakdown[serviceType]) {
            metrics.serviceBreakdown[serviceType] = {
                count: 0,
                revenue: 0
            };
        }
        metrics.serviceBreakdown[serviceType].count++;
        metrics.serviceBreakdown[serviceType].revenue += transaction.finalPrice || 0;

        // Staff performance
        if (transaction.staff) {
            const staffId = transaction.staff.toString();
            if (!metrics.staffPerformance[staffId]) {
                metrics.staffPerformance[staffId] = {
                    customersServed: 0,
                    revenue: 0,
                    commission: 0
                };
            }
            metrics.staffPerformance[staffId].customersServed++;
            metrics.staffPerformance[staffId].revenue += transaction.finalPrice || 0;
            metrics.staffPerformance[staffId].commission += transaction.staffCommission || 0;
        }

        // Service time calculation
        if (transaction.duration) {
            totalServiceTime += transaction.duration;
        }

        // Rating calculation
        if (transaction.rating) {
            totalRating += transaction.rating;
            ratingCount++;
        }
    });

    // Calculate averages
    metrics.netProfit = metrics.totalRevenue - metrics.totalExpenses;
    metrics.averageServiceTime = transactions.length > 0 ? totalServiceTime / transactions.length : 0;
    metrics.customerSatisfaction = ratingCount > 0 ? totalRating / ratingCount : 0;

    return metrics;
};

/**
 * Generate business analytics data with comprehensive CRM insights
 * @param {Array} dailyBusinessRecords - Array of daily business records
 * @param {string} period - Time period (daily, weekly, monthly, yearly)
 * @returns {Object} - Analytics data
 */
const generateBusinessAnalytics = (dailyBusinessRecords, period = 'monthly') => {
    const analytics = {
        period,
        totalRevenue: 0,
        totalCustomers: 0,
        totalExpenses: 0,
        netProfit: 0,
        averageDailyRevenue: 0,
        averageDailyCustomers: 0,
        revenueGrowth: 0,
        customerGrowth: 0,
        profitMargin: 0,
        topServices: [],
        serviceBreakdown: {},
        staffPerformance: [],
        trends: [],
        peakPerformance: {
            bestDay: null,
            bestService: null,
            bestStaff: null
        },
        customerMetrics: {
            averageRevenuePerCustomer: 0,
            averageTransactionValue: 0,
            repeatCustomerRate: 0,
            newCustomerRate: 0
        },
        efficiencyMetrics: {
            revenuePerStaff: 0,
            customersPerStaff: 0,
            expenseRatio: 0
        },
        insights: []
    };

    if (dailyBusinessRecords.length === 0) {
        return analytics;
    }

    // Sort records by date
    const sortedRecords = [...dailyBusinessRecords].sort((a, b) =>
        new Date(a.date) - new Date(b.date)
    );

    // Calculate totals and aggregate data
    let totalUniqueCustomers = new Set();
    let totalRepeatCustomers = 0;
    let totalNewCustomers = 0;
    let serviceStats = {};
    let staffStats = {};
    let dailyStats = {};
    let bestDayRevenue = 0;
    let bestDayRecord = null;

    sortedRecords.forEach(record => {
        const recordDate = new Date(record.date);
        const dayKey = recordDate.toISOString().split('T')[0];

        analytics.totalRevenue += record.totalIncome || 0;
        analytics.totalCustomers += record.totalCustomers || 0;
        analytics.totalExpenses += record.totalExpenses || 0;

        // Track daily performance
        if (!dailyStats[dayKey]) {
            dailyStats[dayKey] = {
                date: record.date,
                revenue: 0,
                customers: 0,
                profit: 0
            };
        }
        dailyStats[dayKey].revenue += record.totalIncome || 0;
        dailyStats[dayKey].customers += record.totalCustomers || 0;
        dailyStats[dayKey].profit += record.netProfit || 0;

        // Track best day
        if ((record.totalIncome || 0) > bestDayRevenue) {
            bestDayRevenue = record.totalIncome || 0;
            bestDayRecord = {
                date: record.date,
                revenue: record.totalIncome || 0,
                customers: record.totalCustomers || 0
            };
        }

        // Service breakdown
        if (record.services && Array.isArray(record.services)) {
            record.services.forEach(service => {
                const serviceName = service.serviceName || service.serviceType || 'Unknown';
                if (!serviceStats[serviceName]) {
                    serviceStats[serviceName] = {
                        name: serviceName,
                        revenue: 0,
                        customers: 0,
                        transactions: 0,
                        averagePrice: 0
                    };
                }
                serviceStats[serviceName].revenue += service.totalRevenue || 0;
                serviceStats[serviceName].customers += service.customerCount || 0;
                serviceStats[serviceName].transactions += service.customerCount || 0;
            });
        }

        // Staff performance
        if (record.staffPerformance && Array.isArray(record.staffPerformance)) {
            record.staffPerformance.forEach(perf => {
                const staffId = perf.staff?._id?.toString() || perf.staff?.toString() || perf.staff;
                if (staffId) {
                    if (!staffStats[staffId]) {
                        staffStats[staffId] = {
                            staff: perf.staff, // Preserve the full staff object if populated
                            customersServed: 0,
                            revenue: 0,
                            commission: 0
                        };
                    }
                    staffStats[staffId].customersServed += perf.customersServed || 0;
                    staffStats[staffId].revenue += perf.revenue || 0;
                    staffStats[staffId].commission += perf.commission || 0;
                }
            });
        }

        // Customer metrics
        if (record.metrics) {
            totalNewCustomers += record.metrics.newCustomers || 0;
            totalRepeatCustomers += record.metrics.repeatCustomers || 0;
        }
    });

    // Calculate derived metrics
    analytics.netProfit = analytics.totalRevenue - analytics.totalExpenses;
    const recordCount = sortedRecords.length;
    analytics.averageDailyRevenue = recordCount > 0 ? analytics.totalRevenue / recordCount : 0;
    analytics.averageDailyCustomers = recordCount > 0 ? analytics.totalCustomers / recordCount : 0;
    analytics.profitMargin = analytics.totalRevenue > 0
        ? (analytics.netProfit / analytics.totalRevenue) * 100
        : 0;

    // Calculate growth rates
    if (sortedRecords.length > 1) {
        const firstRecord = sortedRecords[0];
        const lastRecord = sortedRecords[sortedRecords.length - 1];
        const firstRevenue = firstRecord.totalIncome || 0;
        const lastRevenue = lastRecord.totalIncome || 0;
        const firstCustomers = firstRecord.totalCustomers || 0;
        const lastCustomers = lastRecord.totalCustomers || 0;

        if (firstRevenue > 0) {
            analytics.revenueGrowth = ((lastRevenue - firstRevenue) / firstRevenue) * 100;
        }
        if (firstCustomers > 0) {
            analytics.customerGrowth = ((lastCustomers - firstCustomers) / firstCustomers) * 100;
        }
    }

    // Process service breakdown
    const totalServiceRevenue = Object.values(serviceStats).reduce((sum, s) => sum + s.revenue, 0);
    Object.keys(serviceStats).forEach(serviceName => {
        const service = serviceStats[serviceName];
        service.averagePrice = service.customers > 0 ? service.revenue / service.customers : 0;
        service.percentage = totalServiceRevenue > 0
            ? (service.revenue / totalServiceRevenue) * 100
            : 0;

        analytics.serviceBreakdown[serviceName] = {
            revenue: service.revenue,
            customers: service.customers,
            transactions: service.transactions,
            averagePrice: service.averagePrice,
            percentage: service.percentage
        };
    });

    // Top services
    analytics.topServices = Object.values(serviceStats)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10)
        .map(s => ({
            name: s.name,
            revenue: s.revenue,
            customers: s.customers,
            averagePrice: s.averagePrice,
            percentage: s.percentage
        }));

    // Best performing service
    if (analytics.topServices.length > 0) {
        analytics.peakPerformance.bestService = analytics.topServices[0];
    }

    // Staff performance ranking - ensure staff object is preserved
    analytics.staffPerformance = Object.values(staffStats)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10)
        .map(perf => ({
            staff: perf.staff, // This should be populated if records were populated
            customersServed: perf.customersServed,
            revenue: perf.revenue,
            commission: perf.commission,
            staffName: perf.staff?.name || (typeof perf.staff === 'object' && perf.staff?.name ? perf.staff.name : null) || 'Staff Member' // Add name field for easier access
        }));

    // Best performing staff
    if (analytics.staffPerformance.length > 0) {
        analytics.peakPerformance.bestStaff = analytics.staffPerformance[0];
    }

    // Best day
    analytics.peakPerformance.bestDay = bestDayRecord;

    // Daily trends
    analytics.trends = Object.values(dailyStats)
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .slice(-30) // Last 30 days max
        .map(stat => ({
            date: stat.date,
            revenue: stat.revenue,
            customers: stat.customers,
            profit: stat.profit
        }));

    // Customer metrics
    analytics.customerMetrics.averageRevenuePerCustomer = analytics.totalCustomers > 0
        ? analytics.totalRevenue / analytics.totalCustomers
        : 0;
    analytics.customerMetrics.averageTransactionValue = analytics.totalCustomers > 0
        ? analytics.totalRevenue / analytics.totalCustomers
        : 0;
    analytics.customerMetrics.repeatCustomerRate = analytics.totalCustomers > 0
        ? (totalRepeatCustomers / analytics.totalCustomers) * 100
        : 0;
    analytics.customerMetrics.newCustomerRate = analytics.totalCustomers > 0
        ? (totalNewCustomers / analytics.totalCustomers) * 100
        : 0;

    // Efficiency metrics
    const activeStaffCount = analytics.staffPerformance.length;
    analytics.efficiencyMetrics.revenuePerStaff = activeStaffCount > 0
        ? analytics.totalRevenue / activeStaffCount
        : 0;
    analytics.efficiencyMetrics.customersPerStaff = activeStaffCount > 0
        ? analytics.totalCustomers / activeStaffCount
        : 0;
    analytics.efficiencyMetrics.expenseRatio = analytics.totalRevenue > 0
        ? (analytics.totalExpenses / analytics.totalRevenue) * 100
        : 0;

    // Generate insights
    if (analytics.profitMargin < 10) {
        analytics.insights.push("Low profit margin detected. Consider reviewing expenses or increasing prices.");
    }
    if (analytics.revenueGrowth < 0) {
        analytics.insights.push("Revenue is declining. Review marketing strategies and customer retention.");
    }
    if (analytics.customerMetrics.repeatCustomerRate < 30) {
        analytics.insights.push("Low repeat customer rate. Focus on customer retention strategies.");
    }
    if (analytics.topServices.length > 0) {
        const topService = analytics.topServices[0];
        analytics.insights.push(`${topService.name} is your top-performing service (${topService.percentage.toFixed(1)}% of revenue). Consider promoting it more.`);
    }
    if (analytics.efficiencyMetrics.expenseRatio > 70) {
        analytics.insights.push("High expense ratio detected. Review operational costs.");
    }

    return analytics;
};

/**
 * Validate business type and return appropriate service types
 * @param {string} businessType - Type of business (salon, spa, hotel)
 * @returns {Array} - Array of valid service types
 */
const getServiceTypesForBusiness = (businessType) => {
    const serviceTypes = {
        salon: ['hair', 'facial', 'nail', 'other'],
        spa: ['facial', 'massage', 'spa', 'other'],
        hotel: ['room', 'food', 'spa', 'other']
    };

    return serviceTypes[businessType] || ['other'];
};

/**
 * Generate business report data
 * @param {Object} business - Business object
 * @param {Array} transactions - Array of transactions
 * @param {Array} dailyBusiness - Array of daily business records
 * @param {Date} startDate - Report start date
 * @param {Date} endDate - Report end date
 * @returns {Object} - Formatted report data
 */
const generateBusinessReport = (business, transactions, dailyBusiness, startDate, endDate) => {
    const report = {
        business: {
            name: business.name,
            type: business.type,
            branch: business.branch,
            address: business.address
        },
        period: {
            start: startDate,
            end: endDate
        },
        summary: {
            totalRevenue: 0,
            totalCustomers: 0,
            totalTransactions: transactions.length,
            averageTransactionValue: 0,
            netProfit: 0
        },
        dailyBreakdown: [],
        serviceAnalysis: {},
        staffPerformance: {},
        recommendations: []
    };

    // Calculate summary
    transactions.forEach(transaction => {
        report.summary.totalRevenue += transaction.finalPrice || 0;
    });

    report.summary.totalCustomers = new Set(transactions.map(t => t.customerPhone)).size;
    report.summary.averageTransactionValue = transactions.length > 0
        ? report.summary.totalRevenue / transactions.length
        : 0;

    // Calculate net profit from daily business records
    dailyBusiness.forEach(record => {
        report.summary.netProfit += record.netProfit || 0;
    });

    // Generate recommendations
    if (report.summary.averageTransactionValue < 500) {
        report.recommendations.push("Consider upselling premium services to increase average transaction value");
    }

    if (report.summary.totalCustomers < 50) {
        report.recommendations.push("Focus on customer acquisition strategies");
    }

    return report;
};

/**
 * Format currency for display
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency code (default: INR)
 * @returns {string} - Formatted currency string
 */
const formatCurrency = (amount, currency = 'INR') => {
    const formatter = new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    });
    return formatter.format(amount);
};

/**
 * Calculate staff commission
 * @param {number} revenue - Revenue amount
 * @param {number} commissionRate - Commission rate (percentage)
 * @returns {number} - Commission amount
 */
const calculateCommission = (revenue, commissionRate) => {
    return (revenue * commissionRate) / 100;
};

/**
 * Check if a business is currently open based on working hours (IST/India Time)
 * @param {Object} workingHours - { open: "08:00", close: "22:00", days: ["monday", ...] }
 * @returns {boolean} - True if open, false if closed
 */
const isBusinessOpen = (workingHours) => {
    if (!workingHours || !workingHours.open || !workingHours.close) return true;

    try {
        // Get current time in India (IST)
        const indiaTime = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
        const now = new Date(indiaTime);
        const currentDay = now.toLocaleString("en-us", { weekday: "long" }).toLowerCase();

        // Check if today is an operating day
        if (workingHours.days && workingHours.days.length > 0) {
            if (!workingHours.days.includes(currentDay)) return false;
        }

        const currentTimeString = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');

        // Handle "Closed" or invalid time formats
        if (workingHours.open.toLowerCase() === 'closed') return false;
        if (workingHours.open === '00:00' && workingHours.close === '00:00') return true; // Always open

        return currentTimeString >= workingHours.open && currentTimeString <= workingHours.close;
    } catch (error) {
        console.error("Error in isBusinessOpen:", error);
        return true; // Default to open if error
    }
};

module.exports = {
    generateBusinessLink,
    calculateDailyMetrics,
    generateBusinessAnalytics,
    getServiceTypesForBusiness,
    generateBusinessReport,
    formatCurrency,
    calculateCommission,
    isBusinessOpen
};
