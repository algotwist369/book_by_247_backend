// Verifies access JWT, loads the corresponding user model (Admin / Manager / Staff)
// Attaches req.user = { id, role, businessId, companyId (admin id) } for downstream use.

const { verifyAccessToken } = require('../utils/generateToken');
const Admin = require('../models/Admin');
const Manager = require('../models/Manager');
const Staff = require('../models/Staff');
const Business = require('../models/Business');

/**
 * Extract Bearer token from Authorization header
 */
function getTokenFromHeader(req) {
    const auth = req.headers.authorization || req.headers.Authorization;
    if (!auth) return null;
    const parts = auth.split(' ');
    if (parts.length === 2 && /^Bearer$/i.test(parts[0])) return parts[1];
    return null;
}

/**
 * Middleware: verifies JWT and loads user details
 */
async function authMiddleware(req, res, next) {
    try {
        const token = getTokenFromHeader(req);
        if (!token) return res.status(401).json({ success: false, message: 'No authorization token provided' });

        let decoded;
        try {
            decoded = verifyAccessToken(token);
        } catch (err) {
            return res.status(401).json({ success: false, message: 'Invalid or expired token' });
        }

        // Expect token to contain { id, role } - role should be 'admin' | 'manager' | 'staff'
        const { id: tokenUserId, role: tokenRole } = decoded;
        if (!tokenUserId || !tokenRole) {
            return res.status(401).json({ success: false, message: 'Token payload missing id or role' });
        }

        // Load user from DB based on role and attach normalized req.user
        if (tokenRole === 'admin') {
            const admin = await Admin.findById(tokenUserId).select('-password -refreshToken').lean();
            if (!admin) return res.status(401).json({ success: false, message: 'Admin not found' });

            // Check if Admin is active
            if (admin.isActive === false) {
                return res.status(403).json({
                    success: false,
                    isInactive: true,
                    message: "Your admin account is deactivated by Super Admin.",
                    remark: admin.superAdminRemark || ""
                });
            }

            req.user = {
                id: String(admin._id),
                role: 'admin',
                companyId: String(admin._id), // admin is company owner
                name: admin.name,
                email: admin.email,
                phone: admin.phone,
            };
            return next();
        }

        if (tokenRole === 'manager') {
            const manager = await Manager.findById(tokenUserId).populate({
                path: 'business',
                populate: { path: 'admin', select: 'isActive superAdminRemark' }
            }).lean();
            if (!manager) return res.status(401).json({ success: false, message: 'Manager not found' });

            if (!manager.isActive) {
                return res.status(403).json({ success: false, message: 'Your manager account is inactive.' });
            }

            const business = manager.business;
            if (business && (business.isActiveFromSuperAdmin === false || (business.admin && business.admin.isActive === false))) {
                const remark = (business.isActiveFromSuperAdmin === false) ? business.superAdminRemark : business.admin.superAdminRemark;
                return res.status(403).json({
                    success: false,
                    isInactive: true,
                    message: "The business or admin account is deactivated by Super Admin.",
                    remark: remark || ""
                });
            }

            const companyId = business ? String(business.admin._id) : null;

            req.user = {
                id: String(manager._id),
                role: 'manager',
                name: manager.name,
                username: manager.username,
                businessId: business ? String(business._id) : null,
                companyId,
            };
            return next();
        }

        if (tokenRole === 'staff') {
            const staff = await Staff.findById(tokenUserId).lean();
            if (!staff) return res.status(401).json({ success: false, message: 'Staff not found' });

            if (!staff.isActive) {
                return res.status(403).json({ success: false, message: 'Your staff account is inactive.' });
            }

            // To get business + company + admin status we need to load manager -> business -> admin
            const manager = await Manager.findById(staff.manager).populate({
                path: 'business',
                populate: { path: 'admin', select: 'isActive superAdminRemark' }
            }).lean();
            const business = manager ? manager.business : null;

            if (business && (business.isActiveFromSuperAdmin === false || (business.admin && business.admin.isActive === false))) {
                const remark = (business.isActiveFromSuperAdmin === false) ? business.superAdminRemark : business.admin.superAdminRemark;
                return res.status(403).json({
                    success: false,
                    isInactive: true,
                    message: "The business or admin account is deactivated by Super Admin.",
                    remark: remark || ""
                });
            }

            const companyId = business ? String(business.admin._id) : null;

            req.user = {
                id: String(staff._id),
                role: 'staff',
                name: staff.name,
                managerId: manager ? String(manager._id) : null,
                businessId: business ? String(business._id) : null,
                companyId,
            };
            return next();
        }

        // Unknown role in token
        return res.status(401).json({ success: false, message: 'Unrecognized role in token' });
    } catch (err) {
        // Pass to centralized error handler
        return next(err);
    }
}

module.exports = authMiddleware;
