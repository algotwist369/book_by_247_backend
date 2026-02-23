const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const path = require("path");
const { errorHandler, notFoundHandler } = require("./middleware/errorHandler");
const seoRedirectMiddleware = require("./middleware/seoRedirectMiddleware");


// Routes
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const businessRoutes = require("./routes/businessRoutes");
const managerRoutes = require("./routes/managerRoutes");
const staffRoutes = require("./routes/staffRoutes");
const dailyBusinessRoutes = require("./routes/dailyBusinessRoutes");
const appointmentRoutes = require("./routes/appointmentRoutes");
const customerRoutes = require("./routes/customerRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const reportRoutes = require("./routes/reportRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const serviceRoutes = require("./routes/serviceRoutes");
const invoiceRoutes = require("./routes/invoiceRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const campaignRoutes = require("./routes/campaignRoutes");
const campaignSchedulerRoutes = require("./routes/campaignSchedulerRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const businessSettingsRoutes = require("./routes/businessSettingsRoutes");
const loyaltyRoutes = require("./routes/loyaltyRoutes");
const leadRoutes = require("./routes/leadRoutes");
const inquiryRoutes = require("./routes/inquiryRoutes");
const googleSheetRoutes = require("./routes/googleSheetRoutes");

const app = express();

// ================== Performance Optimizations ==================
// Enable trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// ================== Middleware ==================
// Compression middleware (should be first)
app.use(compression({
    level: 6, // Compression level (1-9, 6 is good balance)
    threshold: 1024, // Only compress responses > 1KB
    filter: (req, res) => {
        if (req.headers['x-no-compression']) {
            return false;
        }
        return compression.filter(req, res);
    }
}));

// CORS with robust settings
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : ['*'];

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (server-to-server, curl, mobile apps)
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.warn(`[CORS] Rejected origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    credentials: true,
    optionsSuccessStatus: 200,
    maxAge: 86400 // Cache preflight for 24 hours
}));



// Security headers
app.use(helmet({
    contentSecurityPolicy: false, // Disable for API
    crossOriginEmbedderPolicy: false
}));

// Rate limiting for API endpoints
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Limit each IP to 1000 requests per windowMs
    message: {
        success: false,
        message: 'Too many requests from this IP, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        // Skip rate limiting for health checks
        return req.path === '/';
    }
});

// Apply rate limiting to all API routes
app.use('/api/', limiter);

// Stricter rate limiting for auth endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // Limit each IP to 50 auth requests per windowMs
    message: {
        success: false,
        message: 'Too many authentication attempts, please try again later.'
    }
});

app.use('/api/auth/', authLimiter);

// Optimized logging (only in development)
if (process.env.NODE_ENV === 'development') {
    app.use(morgan("combined"));
} else {
    // Minimal logging for production
    app.use(morgan("tiny"));
}

// Optimized JSON parsing with size limits
app.use(express.json({
    limit: '10mb',
    verify: (req, res, buf) => {
        // Store raw body for webhook verification if needed
        req.rawBody = buf;
    }
}));

app.use(express.urlencoded({
    extended: true,
    limit: '10mb',
    parameterLimit: 1000
}));

app.use(cookieParser());

// ================== SEO Redirects ==================
// IMPORTANT: This must come BEFORE static files and routes
// to ensure legacy URLs are caught and redirected properly
app.use(seoRedirectMiddleware);


// ================== Static Files (Uploads) ==================
// Serve SEO files (sitemap, robots)
app.use('/seo', express.static(path.join(__dirname, '../client/public/seo'), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.xml')) {
            res.setHeader('Content-Type', 'application/xml');
        }
        if (filePath.endsWith('.txt')) {
            res.setHeader('Content-Type', 'text/plain');
        }
        if (filePath.endsWith('.json')) {
            res.setHeader('Content-Type', 'application/json');
        }
    }
}));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
    maxAge: '7d', // Cache static files for 7 days
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
        // Set proper CORS headers for uploaded images
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Cross-Origin-Resource-Policy', 'cross-origin');

        // Set caching based on file type
        if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg') ||
            filePath.endsWith('.png') || filePath.endsWith('.gif') ||
            filePath.endsWith('.webp')) {
            res.set('Cache-Control', 'public, max-age=604800'); // 7 days for images
        }
    }
}));

// ================== Routes ==================
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/business", businessRoutes);
app.use("/api/manager", managerRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/daily-business", dailyBusinessRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/campaigns", campaignRoutes);
app.use("/api/campaign-scheduler", campaignSchedulerRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/settings", businessSettingsRoutes);
app.use("/api/loyalty", loyaltyRoutes);
app.use("/api/leads", leadRoutes);
app.use("/api/inquiries", inquiryRoutes);
app.use("/api/support", require("./routes/superAdminSupportRoutes"));
app.use("/api/payments", require("./routes/paymentRoutes"));

// === PHASE 2 ENHANCEMENT: New Routes ===
app.use("/api/expenses", require("./routes/expenseRoutes"));
app.use("/api/inventory", require("./routes/inventoryRoutes"));
app.use("/api/inventory-management", require("./routes/inventoryManagementRoutes"));

// === WhatsApp Web.js Integration ===
app.use('/api/admin/whatsapp', require("./routes/whatsappQR"));

// === Google Sheets Integration ===
app.use("/api/google-sheets", googleSheetRoutes);

// === Super Admin Routes ===
app.use("/api/super-admin", require("./routes/superAdmin"));

// === SEO Routes (served at root level for crawlers) ===
const sitemapRoutes = require("./routes/sitemap");
app.use("/", sitemapRoutes);


// ================== Health Check ==================
app.get("/", (req, res) => res.send("Backend is running ✅"));

// ================== 404 Handler ==================
app.use(notFoundHandler);

// ================== Error Handler ==================
app.use(errorHandler);

module.exports = app;
