// uploadMiddleware.js - File upload configuration using multer
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Base upload directory
const UPLOAD_DIR = path.join(__dirname, '../uploads');

// Create upload directories if they don't exist
const createUploadDirs = () => {
    const dirs = [
        UPLOAD_DIR,
        path.join(UPLOAD_DIR, 'business'),
        path.join(UPLOAD_DIR, 'business/logos'),
        path.join(UPLOAD_DIR, 'business/banners'),
        path.join(UPLOAD_DIR, 'business/gallery'),
        path.join(UPLOAD_DIR, 'business/thumbnails'),
        path.join(UPLOAD_DIR, 'business/qrcodes'),
        path.join(UPLOAD_DIR, 'staff'),
        path.join(UPLOAD_DIR, 'staff/profiles'),
        path.join(UPLOAD_DIR, 'managers'),
        path.join(UPLOAD_DIR, 'managers/profiles'),
        path.join(UPLOAD_DIR, 'admin'),
        path.join(UPLOAD_DIR, 'admin/profiles'),
        path.join(UPLOAD_DIR, 'temp')
    ];

    dirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`✅ Created directory: ${dir}`);
        }
    });
};

// Initialize directories
createUploadDirs();

// Configure storage for different upload types
const createStorage = (subfolder) => {
    return multer.diskStorage({
        destination: (req, file, cb) => {
            const uploadPath = path.join(UPLOAD_DIR, subfolder);
            cb(null, uploadPath);
        },
        filename: (req, file, cb) => {
            // Generate unique filename: timestamp-randomstring-originalname
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const ext = path.extname(file.originalname);
            const nameWithoutExt = path.basename(file.originalname, ext);
            const sanitizedName = nameWithoutExt.replace(/[^a-zA-Z0-9]/g, '_');
            cb(null, `${sanitizedName}-${uniqueSuffix}${ext}`);
        }
    });
};

// File filter for images only
const imageFileFilter = (req, file, cb) => {
    // Allowed image types
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.'), false);
    }
};

// Size limits (in bytes)
const FILE_SIZE_LIMITS = {
    logo: 5 * 1024 * 1024,      // 5MB
    banner: 10 * 1024 * 1024,   // 10MB
    gallery: 10 * 1024 * 1024,  // 10MB
    thumbnail: 2 * 1024 * 1024, // 2MB
    qrcode: 2 * 1024 * 1024,    // 2MB
    profile: 5 * 1024 * 1024    // 5MB
};

// Create upload middleware for different types
const createUploadMiddleware = (subfolder, fieldName, maxCount = 1, maxSize = 5 * 1024 * 1024) => {
    return multer({
        storage: createStorage(subfolder),
        fileFilter: imageFileFilter,
        limits: {
            fileSize: maxSize,
            files: maxCount
        }
    });
};

// Specific upload middlewares
const uploadBusinessLogo = createUploadMiddleware('business/logos', 'logo', 1, FILE_SIZE_LIMITS.logo);
const uploadBusinessBanner = createUploadMiddleware('business/banners', 'banner', 1, FILE_SIZE_LIMITS.banner);
const uploadBusinessGallery = createUploadMiddleware('business/gallery', 'gallery', 10, FILE_SIZE_LIMITS.gallery);
const uploadBusinessThumbnail = createUploadMiddleware('business/thumbnails', 'thumbnail', 1, FILE_SIZE_LIMITS.thumbnail);
const uploadBusinessQRCode = createUploadMiddleware('business/qrcodes', 'qrcode', 1, FILE_SIZE_LIMITS.qrcode);

const uploadStaffProfile = createUploadMiddleware('staff/profiles', 'profile', 1, FILE_SIZE_LIMITS.profile);
const uploadManagerProfile = createUploadMiddleware('managers/profiles', 'profile', 1, FILE_SIZE_LIMITS.profile);
const uploadAdminProfile = createUploadMiddleware('admin/profiles', 'profile', 1, FILE_SIZE_LIMITS.profile);

// Multiple uploads for business (all images at once)
const uploadBusinessImages = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            let subfolder = 'business';
            
            // Determine subfolder based on fieldname
            if (file.fieldname === 'logo') {
                subfolder = 'business/logos';
            } else if (file.fieldname === 'banner') {
                subfolder = 'business/banners';
            } else if (file.fieldname === 'gallery') {
                subfolder = 'business/gallery';
            } else if (file.fieldname === 'thumbnail') {
                subfolder = 'business/thumbnails';
            } else if (file.fieldname === 'qrcode') {
                subfolder = 'business/qrcodes';
            }
            
            const uploadPath = path.join(UPLOAD_DIR, subfolder);
            cb(null, uploadPath);
        },
        filename: (req, file, cb) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const ext = path.extname(file.originalname);
            const nameWithoutExt = path.basename(file.originalname, ext);
            const sanitizedName = nameWithoutExt.replace(/[^a-zA-Z0-9]/g, '_');
            cb(null, `${sanitizedName}-${uniqueSuffix}${ext}`);
        }
    }),
    fileFilter: imageFileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB max
        files: 15 // Maximum 15 files total
    }
}).fields([
    { name: 'logo', maxCount: 1 },
    { name: 'banner', maxCount: 1 },
    { name: 'gallery', maxCount: 10 },
    { name: 'thumbnail', maxCount: 1 },
    { name: 'qrcode', maxCount: 1 }
]);

// Helper function to delete file
const deleteFile = (filePath) => {
    try {
        if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`🗑️  Deleted file: ${filePath}`);
            return true;
        }
        return false;
    } catch (error) {
        console.error(`❌ Error deleting file: ${filePath}`, error);
        return false;
    }
};

// Helper function to delete multiple files
const deleteFiles = (filePaths) => {
    if (!Array.isArray(filePaths)) return false;
    
    let deletedCount = 0;
    filePaths.forEach(filePath => {
        if (deleteFile(filePath)) {
            deletedCount++;
        }
    });
    
    return deletedCount;
};

// Get file URL from path
const getFileUrl = (filePath) => {
    if (!filePath) return null;
    
    // If it's already a full path, extract relative path
    if (filePath.includes('/uploads/')) {
        return filePath;
    }
    
    // Convert absolute path to relative URL
    const relativePath = filePath.replace(UPLOAD_DIR, '').replace(/\\/g, '/');
    return `/uploads${relativePath}`;
};

// Error handler middleware for multer errors
const handleUploadError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        // Multer-specific errors
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'File size too large. Maximum size allowed is based on file type.',
                error: err.message
            });
        } else if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                success: false,
                message: 'Too many files uploaded.',
                error: err.message
            });
        } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({
                success: false,
                message: 'Unexpected field in upload.',
                error: err.message
            });
        }
        
        return res.status(400).json({
            success: false,
            message: 'File upload error',
            error: err.message
        });
    } else if (err) {
        // Other errors (like file type validation)
        return res.status(400).json({
            success: false,
            message: err.message || 'File upload failed',
            error: err.message
        });
    }
    
    next();
};

module.exports = {
    // Upload middlewares
    uploadBusinessLogo,
    uploadBusinessBanner,
    uploadBusinessGallery,
    uploadBusinessThumbnail,
    uploadBusinessQRCode,
    uploadBusinessImages,
    uploadStaffProfile,
    uploadManagerProfile,
    uploadAdminProfile,
    
    // Helper functions
    deleteFile,
    deleteFiles,
    getFileUrl,
    handleUploadError,
    
    // Constants
    UPLOAD_DIR,
    FILE_SIZE_LIMITS
};

