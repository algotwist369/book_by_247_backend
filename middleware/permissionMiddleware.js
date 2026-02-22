const Manager = require('../models/Manager');

/**
 * Permission Middleware - Granular Permission-Based Access Control (PBAC)
 * Phase 2 Enhancement
 * 
 * Checks if a manager has specific permissions for a resource and action
 * Also enforces branch-level and time-based access restrictions
 */

/**
 * Check if manager has permission for a specific resource and action
 * @param {string} resource - Resource name (staff, customers, financial, appointments, inventory, reports)
 * @param {string} action - Action name (view, create, edit, delete, etc.)
 * @returns {Function} Express middleware
 */
function checkPermission(resource, action) {
    return async (req, res, next) => {
        try {
            const user = req.user;

            // Admins bypass all permission checks
            if (user.role === 'admin') {
                return next();
            }

            // Only managers are subject to granular permissions
            if (user.role !== 'manager') {
                return res.status(403).json({
                    success: false,
                    message: 'Access forbidden'
                });
            }

            // Fetch manager with permissions
            const manager = await Manager.findById(user.id);

            if (!manager || !manager.isActive) {
                return res.status(403).json({
                    success: false,
                    message: 'Manager account is inactive'
                });
            }

            // Check time-based access restrictions
            if (manager.accessPeriod) {
                const now = new Date();
                if (manager.accessPeriod.startDate && now < manager.accessPeriod.startDate) {
                    return res.status(403).json({
                        success: false,
                        message: 'Access period has not started yet'
                    });
                }
                if (manager.accessPeriod.endDate && now > manager.accessPeriod.endDate) {
                    return res.status(403).json({
                        success: false,
                        message: 'Access period has expired'
                    });
                }
            }

            // Check granular permission
            const hasPermission = manager.permissions?.[resource]?.[action];

            if (!hasPermission) {
                return res.status(403).json({
                    success: false,
                    message: `You don't have permission to ${action} ${resource}`,
                    requiredPermission: `${resource}.${action}`
                });
            }

            // Attach manager to request for further use
            req.manager = manager;

            next();
        } catch (error) {
            next(error);
        }
    };
}

/**
 * Check branch access for multi-location businesses
 * Ensures manager can only access data from their assigned branches
 * @returns {Function} Express middleware
 */
function checkBranchAccess() {
    return async (req, res, next) => {
        try {
            const user = req.user;

            // Admins bypass branch restrictions
            if (user.role === 'admin') {
                return next();
            }

            // Only managers are subject to branch restrictions
            if (user.role !== 'manager') {
                return next();
            }

            const manager = req.manager || await Manager.findById(user.id);

            if (!manager) {
                return res.status(404).json({
                    success: false,
                    message: 'Manager not found'
                });
            }

            // If manager has all_branches access, allow
            if (manager.accessScope === 'all_branches') {
                return next();
            }

            // Check if requesting specific branch
            const requestedBranch = req.query.branch || req.body.branch;

            if (manager.accessScope === 'specific_branches') {
                if (requestedBranch && !manager.assignedBranches.includes(requestedBranch)) {
                    return res.status(403).json({
                        success: false,
                        message: 'You do not have access to this branch',
                        allowedBranches: manager.assignedBranches
                    });
                }

                // If no specific branch requested, restrict query to assigned branches
                if (!requestedBranch) {
                    // Add branch filter to query
                    req.branchFilter = { branch: { $in: manager.assignedBranches } };
                }
            }

            next();
        } catch (error) {
            next(error);
        }
    };
}

/**
 * Filter response data based on manager permissions
 * Removes sensitive fields if manager doesn't have permission to view them
 * @param {string} resource - Resource name
 * @returns {Function} Express middleware
 */
function filterResponseData(resource) {
    return async (req, res, next) => {
        try {
            const user = req.user;

            // Admins get full data
            if (user.role === 'admin') {
                return next();
            }

            if (user.role !== 'manager') {
                return next();
            }

            const manager = req.manager || await Manager.findById(user.id);

            // Store original res.json
            const originalJson = res.json.bind(res);

            // Override res.json to filter data
            res.json = function (data) {
                if (data && data.data) {
                    data.data = filterSensitiveFields(data.data, manager, resource);
                }
                return originalJson(data);
            };

            next();
        } catch (error) {
            next(error);
        }
    };
}

/**
 * Filter sensitive fields from response data
 * @param {Object|Array} data - Response data
 * @param {Object} manager - Manager object
 * @param {string} resource - Resource name
 * @returns {Object|Array} Filtered data
 */
function filterSensitiveFields(data, manager, resource) {
    const isArray = Array.isArray(data);
    const items = isArray ? data : [data];

    const filteredItems = items.map(item => {
        if (!item || typeof item !== 'object') return item;

        const filtered = { ...item };

        // Filter based on resource type and permissions
        switch (resource) {
            case 'staff':
                if (!manager.permissions?.staff?.viewSalary) {
                    delete filtered.salary;
                    delete filtered.commission;
                }
                break;

            case 'financial':
                if (!manager.permissions?.financial?.viewExpenses) {
                    delete filtered.totalExpenses;
                    delete filtered.expenses;
                }
                if (!manager.permissions?.financial?.viewProfitMargin) {
                    delete filtered.netProfit;
                    delete filtered.profitMargin;
                }
                break;

            case 'inventory':
                if (!manager.permissions?.inventory?.viewCost) {
                    delete filtered.costPrice;
                    delete filtered.margin;
                }
                break;
        }

        return filtered;
    });

    return isArray ? filteredItems : filteredItems[0];
}

/**
 * Combined permission check - checks both resource permission and branch access
 * @param {string} resource - Resource name
 * @param {string} action - Action name
 * @returns {Function} Express middleware
 */
function requirePermission(resource, action) {
    return [
        checkPermission(resource, action),
        checkBranchAccess()
    ];
}

/**
 * Check if manager can approve expenses
 * Specialized permission check for expense approval
 * @returns {Function} Express middleware
 */
function canApproveExpenses() {
    return checkPermission('financial', 'approveExpenses');
}

/**
 * Check if manager can adjust inventory
 * Specialized permission check for stock adjustments
 * @returns {Function} Express middleware
 */
function canAdjustInventory() {
    return checkPermission('inventory', 'adjustStock');
}

/**
 * Check if manager can export data
 * Specialized permission check for data export
 * @param {string} dataType - Type of data being exported
 * @returns {Function} Express middleware
 */
function canExportData(dataType) {
    return (req, res, next) => {
        const user = req.user;

        if (user.role === 'admin') {
            return next();
        }

        if (user.role !== 'manager') {
            return res.status(403).json({
                success: false,
                message: 'Only managers and admins can export data'
            });
        }

        // Check specific export permissions
        Manager.findById(user.id).then(manager => {
            if (!manager) {
                return res.status(404).json({ success: false, message: 'Manager not found' });
            }

            let hasPermission = false;

            switch (dataType) {
                case 'customers':
                    hasPermission = manager.permissions?.customers?.exportData;
                    break;
                case 'reports':
                    hasPermission = manager.permissions?.reports?.exportReports;
                    break;
                default:
                    hasPermission = false;
            }

            if (!hasPermission) {
                return res.status(403).json({
                    success: false,
                    message: `You don't have permission to export ${dataType}`
                });
            }

            next();
        }).catch(next);
    };
}

module.exports = {
    checkPermission,
    checkBranchAccess,
    filterResponseData,
    requirePermission,
    canApproveExpenses,
    canAdjustInventory,
    canExportData
};
