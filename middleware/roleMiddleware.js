// Factory to restrict endpoints to one or more roles
// Usage: app.get('/admin-only', authMiddleware, roleMiddleware(['admin']), handler)

function roleMiddleware(allowedRoles = []) {
    if (!Array.isArray(allowedRoles)) {
        allowedRoles = [String(allowedRoles)];
    }

    return (req, res, next) => {
        try {
            // authMiddleware must have run first
            if (!req.user || !req.user.role) {
                return res.status(401).json({ success: false, message: 'Not authenticated' });
            }

            if (!allowedRoles.includes(req.user.role)) {
                return res.status(403).json({ success: false, message: 'Access forbidden: insufficient permissions' });
            }

            return next();
        } catch (err) {
            return next(err);
        }
    };
}

module.exports = roleMiddleware;
