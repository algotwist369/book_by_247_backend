

const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * 404 not found handler
 */
const notFoundHandler = (req, res, next) => {
    // Enhanced logging to track if frontend assets are accidentally hitting the backend
    console.warn(`[404] ${req.method} ${req.originalUrl} - From: ${req.get('referer') || 'Direct/Unknown'}`);

    res.status(404).json({
        success: false,
        message: `Endpoint ${req.method} ${req.originalUrl} not found`,
    });
}

/**
 * Express error handler middleware (4 args)
 */
const errorHandler = (err, req, res, next) => {
    // If response already sent delegate to default handler
    if (res.headersSent) {
        return next(err);
    }

    // Default status
    const statusCode = err.statusCode || err.status || 500;
    const message = err.message || 'Internal Server Error';

    // Minimal error body for production, extended for development
    const body = {
        success: false,
        message,
    };

    if (NODE_ENV !== 'production') {
        body.error = {
            message: err.message,
            stack: err.stack,
            name: err.name,
        };
    }

    // Optionally log server-side (console for now; replace with winston or pino)
    console.error(`[ERROR] ${req.method} ${req.originalUrl} - ${message}`);
    if (err.stack) console.error(err.stack);

    res.status(statusCode).json(body);
}

module.exports = {
    notFoundHandler,
    errorHandler,
};
