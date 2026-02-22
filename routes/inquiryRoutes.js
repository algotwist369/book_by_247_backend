const express = require('express');
const router = express.Router();
const inquiryController = require('../controllers/inquiry.controller');
const authMiddleware = require('../middleware/authMiddleware');

// Public Routes
router.post('/send-otp', inquiryController.sendInquiryOTP);
router.post('/', inquiryController.createInquiry);

// Protected Routes
router.get('/', authMiddleware, inquiryController.getAllInquiries);
router.get('/export', authMiddleware, inquiryController.exportInquiries);
router.patch('/:id/receive', authMiddleware, inquiryController.markAsRecieved);
router.delete('/:id', authMiddleware, inquiryController.deleteInquiry);
router.patch('/:id/remark', authMiddleware, inquiryController.remarkInquiry);

module.exports = router;
