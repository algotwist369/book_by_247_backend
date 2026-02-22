// uploadRoutes.js - File upload routes
const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/uploadController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const {
    uploadBusinessLogo,
    uploadBusinessBanner,
    uploadBusinessGallery,
    uploadBusinessThumbnail,
    uploadBusinessQRCode,
    uploadBusinessImages,
    uploadStaffProfile,
    uploadManagerProfile,
    uploadAdminProfile,
    handleUploadError
} = require('../middleware/uploadMiddleware');

// ================== Business Image Uploads (Admin + Manager) ==================

// Upload single business logo
router.post('/business/logo',
    authMiddleware,
    roleMiddleware(['admin', 'manager']),
    (req, res, next) => {
        uploadBusinessLogo.single('logo')(req, res, (err) => {
            if (err) {
                return handleUploadError(err, req, res, next);
            }
            next();
        });
    },
    uploadController.uploadBusinessLogo
);

// Upload single business banner
router.post('/business/banner',
    authMiddleware,
    roleMiddleware(['admin', 'manager']),
    (req, res, next) => {
        uploadBusinessBanner.single('banner')(req, res, (err) => {
            if (err) {
                return handleUploadError(err, req, res, next);
            }
            next();
        });
    },
    uploadController.uploadBusinessBanner
);

// Upload business gallery images (multiple)
router.post('/business/gallery',
    authMiddleware,
    roleMiddleware(['admin', 'manager']),
    (req, res, next) => {
        uploadBusinessGallery.array('gallery', 10)(req, res, (err) => {
            if (err) {
                return handleUploadError(err, req, res, next);
            }
            next();
        });
    },
    uploadController.uploadBusinessGallery
);

// Upload business thumbnail
router.post('/business/thumbnail',
    authMiddleware,
    roleMiddleware(['admin', 'manager']),
    (req, res, next) => {
        uploadBusinessThumbnail.single('thumbnail')(req, res, (err) => {
            if (err) {
                return handleUploadError(err, req, res, next);
            }
            next();
        });
    },
    uploadController.uploadBusinessThumbnail
);

// Upload QR code
router.post('/business/qrcode',
    authMiddleware,
    roleMiddleware(['admin', 'manager']),
    (req, res, next) => {
        uploadBusinessQRCode.single('qrcode')(req, res, (err) => {
            if (err) {
                return handleUploadError(err, req, res, next);
            }
            next();
        });
    },
    uploadController.uploadQRCode
);

// Upload multiple business images at once
router.post('/business/images',
    authMiddleware,
    roleMiddleware(['admin', 'manager']),
    (req, res, next) => {
        uploadBusinessImages(req, res, (err) => {
            if (err) {
                return handleUploadError(err, req, res, next);
            }
            next();
        });
    },
    uploadController.uploadBusinessImages
);

// Delete business image
router.delete('/business/:filename',
    authMiddleware,
    roleMiddleware(['admin', 'manager']),
    uploadController.deleteBusinessImage
);

// ================== Profile Picture Uploads ==================

// Upload staff profile picture
router.post('/staff/profile',
    authMiddleware,
    roleMiddleware(['admin', 'manager']),
    (req, res, next) => {
        uploadStaffProfile.single('profile')(req, res, (err) => {
            if (err) {
                return handleUploadError(err, req, res, next);
            }
            next();
        });
    },
    uploadController.uploadProfile
);

// Upload manager profile picture
router.post('/manager/profile',
    authMiddleware,
    roleMiddleware(['admin', 'manager']),
    (req, res, next) => {
        uploadManagerProfile.single('profile')(req, res, (err) => {
            if (err) {
                return handleUploadError(err, req, res, next);
            }
            next();
        });
    },
    uploadController.uploadProfile
);

// Upload admin profile picture
router.post('/admin/profile',
    authMiddleware,
    roleMiddleware(['admin']),
    (req, res, next) => {
        uploadAdminProfile.single('profile')(req, res, (err) => {
            if (err) {
                return handleUploadError(err, req, res, next);
            }
            next();
        });
    },
    uploadController.uploadProfile
);

// ================== File Information ==================

// Get file information
router.get('/file/:filename',
    authMiddleware,
    uploadController.getFileInfo
);

module.exports = router;

