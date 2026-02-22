// uploadController.js - Handle file upload operations
const path = require('path');
const fs = require('fs');
const { getFileUrl, deleteFile, UPLOAD_DIR } = require('../middleware/uploadMiddleware');
const Business = require('../models/Business');
const Manager = require('../models/Manager');
const Admin = require('../models/Admin');

// ================== Upload Business Logo ==================
const uploadBusinessLogo = async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        const fileUrl = getFileUrl(req.file.path);

        return res.status(200).json({
            success: true,
            message: 'Logo uploaded successfully',
            data: {
                filename: req.file.filename,
                url: fileUrl,
                path: req.file.path,
                size: req.file.size,
                mimetype: req.file.mimetype
            }
        });
    } catch (err) {
        // Delete uploaded file if there's an error
        if (req.file) {
            deleteFile(req.file.path);
        }
        next(err);
    }
};

// ================== Upload Business Banner ==================
const uploadBusinessBanner = async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        const fileUrl = getFileUrl(req.file.path);

        return res.status(200).json({
            success: true,
            message: 'Banner uploaded successfully',
            data: {
                filename: req.file.filename,
                url: fileUrl,
                path: req.file.path,
                size: req.file.size,
                mimetype: req.file.mimetype
            }
        });
    } catch (err) {
        if (req.file) {
            deleteFile(req.file.path);
        }
        next(err);
    }
};

// ================== Upload Business Gallery Images ==================
const uploadBusinessGallery = async (req, res, next) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No files uploaded'
            });
        }

        const uploadedFiles = req.files.map(file => ({
            filename: file.filename,
            url: getFileUrl(file.path),
            path: file.path,
            size: file.size,
            mimetype: file.mimetype
        }));

        return res.status(200).json({
            success: true,
            message: `${uploadedFiles.length} image(s) uploaded successfully`,
            data: uploadedFiles
        });
    } catch (err) {
        // Delete uploaded files if there's an error
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => deleteFile(file.path));
        }
        next(err);
    }
};

// ================== Upload Business Thumbnail ==================
const uploadBusinessThumbnail = async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        const fileUrl = getFileUrl(req.file.path);

        return res.status(200).json({
            success: true,
            message: 'Thumbnail uploaded successfully',
            data: {
                filename: req.file.filename,
                url: fileUrl,
                path: req.file.path,
                size: req.file.size,
                mimetype: req.file.mimetype
            }
        });
    } catch (err) {
        if (req.file) {
            deleteFile(req.file.path);
        }
        next(err);
    }
};

// ================== Upload QR Code ==================
const uploadQRCode = async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        const fileUrl = getFileUrl(req.file.path);

        return res.status(200).json({
            success: true,
            message: 'QR Code uploaded successfully',
            data: {
                filename: req.file.filename,
                url: fileUrl,
                path: req.file.path,
                size: req.file.size,
                mimetype: req.file.mimetype
            }
        });
    } catch (err) {
        if (req.file) {
            deleteFile(req.file.path);
        }
        next(err);
    }
};

// ================== Upload Multiple Business Images ==================
const uploadBusinessImages = async (req, res, next) => {
    try {
        if (!req.files || Object.keys(req.files).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No files uploaded'
            });
        }

        const result = {};
        let totalUploaded = 0;

        // Process each field
        if (req.files.logo && req.files.logo[0]) {
            result.logo = {
                filename: req.files.logo[0].filename,
                url: getFileUrl(req.files.logo[0].path),
                path: req.files.logo[0].path,
                size: req.files.logo[0].size
            };
            totalUploaded++;
        }

        if (req.files.banner && req.files.banner[0]) {
            result.banner = {
                filename: req.files.banner[0].filename,
                url: getFileUrl(req.files.banner[0].path),
                path: req.files.banner[0].path,
                size: req.files.banner[0].size
            };
            totalUploaded++;
        }

        if (req.files.thumbnail && req.files.thumbnail[0]) {
            result.thumbnail = {
                filename: req.files.thumbnail[0].filename,
                url: getFileUrl(req.files.thumbnail[0].path),
                path: req.files.thumbnail[0].path,
                size: req.files.thumbnail[0].size
            };
            totalUploaded++;
        }

        if (req.files.qrcode && req.files.qrcode[0]) {
            result.qrcode = {
                filename: req.files.qrcode[0].filename,
                url: getFileUrl(req.files.qrcode[0].path),
                path: req.files.qrcode[0].path,
                size: req.files.qrcode[0].size
            };
            totalUploaded++;
        }

        if (req.files.gallery && req.files.gallery.length > 0) {
            result.gallery = req.files.gallery.map(file => ({
                filename: file.filename,
                url: getFileUrl(file.path),
                path: file.path,
                size: file.size
            }));
            totalUploaded += req.files.gallery.length;
        }

        return res.status(200).json({
            success: true,
            message: `${totalUploaded} file(s) uploaded successfully`,
            data: result
        });
    } catch (err) {
        // Delete all uploaded files if there's an error
        if (req.files) {
            Object.values(req.files).flat().forEach(file => {
                deleteFile(file.path);
            });
        }
        next(err);
    }
};

// ================== Delete Business Image ==================
const deleteBusinessImage = async (req, res, next) => {
    try {
        const { filename } = req.params;
        const { type } = req.query; // logo, banner, gallery, thumbnail, qrcode
        
        if (!type) {
            return res.status(400).json({
                success: false,
                message: 'Image type is required'
            });
        }

        // Construct file path based on type
        let subfolder;
        switch (type) {
            case 'logo':
                subfolder = 'business/logos';
                break;
            case 'banner':
                subfolder = 'business/banners';
                break;
            case 'gallery':
                subfolder = 'business/gallery';
                break;
            case 'thumbnail':
                subfolder = 'business/thumbnails';
                break;
            case 'qrcode':
                subfolder = 'business/qrcodes';
                break;
            default:
                return res.status(400).json({
                    success: false,
                    message: 'Invalid image type'
                });
        }

        const filePath = path.join(UPLOAD_DIR, subfolder, filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }

        const deleted = deleteFile(filePath);

        if (deleted) {
            return res.json({
                success: true,
                message: 'File deleted successfully'
            });
        } else {
            return res.status(500).json({
                success: false,
                message: 'Failed to delete file'
            });
        }
    } catch (err) {
        next(err);
    }
};

// ================== Upload Staff/Manager/Admin Profile ==================
const uploadProfile = async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        const fileUrl = getFileUrl(req.file.path);

        return res.status(200).json({
            success: true,
            message: 'Profile picture uploaded successfully',
            data: {
                filename: req.file.filename,
                url: fileUrl,
                path: req.file.path,
                size: req.file.size,
                mimetype: req.file.mimetype
            }
        });
    } catch (err) {
        if (req.file) {
            deleteFile(req.file.path);
        }
        next(err);
    }
};

// ================== Get File Info ==================
const getFileInfo = async (req, res, next) => {
    try {
        const { filename } = req.params;
        const { type } = req.query;

        if (!type) {
            return res.status(400).json({
                success: false,
                message: 'File type is required'
            });
        }

        let subfolder;
        switch (type) {
            case 'logo':
                subfolder = 'business/logos';
                break;
            case 'banner':
                subfolder = 'business/banners';
                break;
            case 'gallery':
                subfolder = 'business/gallery';
                break;
            case 'thumbnail':
                subfolder = 'business/thumbnails';
                break;
            case 'qrcode':
                subfolder = 'business/qrcodes';
                break;
            case 'profile':
                subfolder = 'staff/profiles'; // Can be expanded based on user type
                break;
            default:
                return res.status(400).json({
                    success: false,
                    message: 'Invalid file type'
                });
        }

        const filePath = path.join(UPLOAD_DIR, subfolder, filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }

        const stats = fs.statSync(filePath);

        return res.json({
            success: true,
            data: {
                filename,
                url: getFileUrl(filePath),
                size: stats.size,
                created: stats.birthtime,
                modified: stats.mtime
            }
        });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    uploadBusinessLogo,
    uploadBusinessBanner,
    uploadBusinessGallery,
    uploadBusinessThumbnail,
    uploadQRCode,
    uploadBusinessImages,
    deleteBusinessImage,
    uploadProfile,
    getFileInfo
};

