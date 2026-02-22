const { verifyAccessToken } = require('../utils/generateToken');
const SuperAdmin = require('../models/SuperAdmin');

/**
 * Middleware: verifies Super Admin JWT and role
 */
async function superAdminAuth(req, res, next) {
    try {
        const authHeader = req.headers.authorization || req.headers.Authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, message: 'No authorization token provided' });
        }

        const token = authHeader.split(' ')[1];
        let decoded;
        try {
            decoded = verifyAccessToken(token);
        } catch (err) {
            return res.status(401).json({ success: false, message: 'Invalid or expired token' });
        }

        if (decoded.role !== 'super-admin') {
            return res.status(403).json({ success: false, message: 'Access forbidden: Super Admin only' });
        }

        const superAdmin = await SuperAdmin.findById(decoded.id).select('-password').lean();
        if (!superAdmin) {
            return res.status(401).json({ success: false, message: 'Super Admin not found' });
        }

        req.user = {
            id: String(superAdmin._id),
            role: 'super-admin',
            user_name: superAdmin.user_name,
            email: superAdmin.email
        };

        next();
    } catch (err) {
        return next(err);
    }
}

module.exports = superAdminAuth;
