const mongoose = require("mongoose");
const Inquiry = require("../models/Inquiry");
const Business = require("../models/Business");
const Otp = require("../models/OTP");
const AdminNotification = require("../models/AdminNotification");
const ManagerNotification = require("../models/ManagerNotification");
const Manager = require("../models/Manager");
const { createAndSendOTP, verifyOTP } = require("../utils/sendOTP");
const { sendTemplateMail } = require("../utils/sendMail");
const { emitToUser } = require("../config/socket");
const { sendInquiryWhatsApp } = require("../utils/whatsappSender");

// Send OTP for inquiry (Public)
const sendInquiryOTP = async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone) {
            return res.status(400).json({ success: false, message: "Phone number is required" });
        }

        const { otp, expiresAt, otpHash } = await createAndSendOTP({ mode: 'whatsapp', to: phone });

        await Otp.create({
            phone,
            otp: otpHash,
            expiresAt: new Date(expiresAt),
        });

        res.status(200).json({ success: true, message: "OTP sent successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Create inquiry (Public - with OTP)
const createInquiry = async (req, res) => {
    try {
        const { business_id, user_name, phone, inquiry_type, otp } = req.body;

        if (!business_id || !user_name || !phone || !otp) {
            return res.status(400).json({ success: false, message: "Missing required fields (including OTP)" });
        }

        // Verify OTP - Use lean() for read-only query
        const otpRecord = await Otp.findOne({
            phone,
            expiresAt: { $gt: new Date() }
        }).sort({ createdAt: -1 }).lean();

        if (!otpRecord) {
            return res.status(400).json({ success: false, message: "OTP not found or expired" });
        }

        const isValid = verifyOTP(otp, otpRecord.otp, otpRecord.expiresAt);
        if (!isValid) {
            return res.status(400).json({ success: false, message: "Invalid OTP" });
        }

        // Delete used OTP
        await Otp.findByIdAndDelete(otpRecord._id);

        // Find the source business to get admin and branch info - Use lean()
        const sourceBusiness = await Business.findById(business_id).lean().select('admin branch name');
        if (!sourceBusiness) {
            return res.status(404).json({ success: false, message: "Business not found" });
        }

        // Find all businesses owned by the same admin in the same branch - Use lean() and selection
        // Find all businesses owned by the same admin in the same branch - Use lean() and selection
        // Using regex for case-insensitive branch matching
        const relatedBusinesses = await Business.find({
            admin: sourceBusiness.admin,
            branch: { $regex: new RegExp(`^${sourceBusiness.branch}$`, 'i') },
            isActive: true
        }).lean().select('_id branch');

        console.log(`[Inquiry Sync] Found ${relatedBusinesses.length} businesses for branch '${sourceBusiness.branch}' (Admin: ${sourceBusiness.admin})`);

        // Create inquiries for all matching businesses - Use insertMany for better performance
        const groupId = new mongoose.Types.ObjectId();
        const syncCount = relatedBusinesses.length;

        const inquiriesData = relatedBusinesses.map(business => ({
            business_id: business._id,
            user_name,
            phone,
            inquiry_type,
            group_id: groupId,
            is_source: business._id.toString() === business_id, // Mark as source if it matches the requested business_id
            sync_count: business._id.toString() === business_id ? syncCount : 0 // Store count only on source for reference
        }));

        const inquiries = await Inquiry.insertMany(inquiriesData);

        // --- Notification Logic ---
        try {
            // 1. Notify Admin (Only once for the whole sync batch)
            const adminId = sourceBusiness.admin;
            const businessName = sourceBusiness.name;

            // Admin Dashboard Notification
            await AdminNotification.createSystemNotification(
                adminId,
                "New Inquiry Sync",
                `New inquiry from ${user_name} sychronized to ${inquiries.length} ${sourceBusiness.branch} branches.`,
                {
                    type: 'business',
                    priority: 'high',
                    actionUrl: `/admin/inquiries`,
                    metadata: { source: 'sync', category: 'inquiry' }
                }
            );

            // Admin Email
            const adminBusiness = await Business.findById(business_id).populate('admin', 'email');
            if (adminBusiness?.admin?.email) {
                sendTemplateMail({
                    to: adminBusiness.admin.email,
                    template: 'new_inquiry_admin',
                    data: {
                        businessName,
                        branchName: sourceBusiness.branch,
                        customerName: user_name,
                        customerPhone: phone,
                        inquiryType: inquiry_type || 'General',
                        date: new Date().toLocaleDateString('en-IN'),
                        actionUrl: `${process.env.FRONTEND_URL || ''}/admin/inquiries`
                    }
                }).catch(err => console.error("Admin Email Failed:", err));
            }

            // Admin Socket - Real-time Dashboard Popup
            emitToUser(adminId, 'new_notification', {
                title: 'New Inquiry Sync',
                message: `New inquiry from ${user_name} synchronized to your branches.`,
                type: 'business',
                priority: 'high',
                actionUrl: '/admin/inquiries'
            });

            // 2. Notify Managers - Optimized: Fetch all managers for all branches in one query
            const relatedIds = relatedBusinesses.map(b => b._id);
            const allManagers = await Manager.find({
                business: { $in: relatedIds },
                isActive: true
            }).lean();

            // Group managers by businessId for efficient notification
            const managersByBusiness = allManagers.reduce((acc, mgr) => {
                const bId = mgr.business.toString();
                if (!acc[bId]) acc[bId] = [];
                acc[bId].push(mgr);
                return acc;
            }, {});

            for (const business of relatedBusinesses) {
                const bId = business._id.toString();
                const managers = managersByBusiness[bId] || [];

                for (const manager of managers) {
                    // Manager Dashboard Notification (Async - non-blocking)
                    ManagerNotification.createNotification(
                        manager._id,
                        business._id,
                        "New Lead Received",
                        `You have a new inquiry from ${user_name}.`,
                        {
                            type: 'business',
                            priority: 'normal',
                            actionUrl: `/manager/inquiries`
                        }
                    ).catch(err => console.error("Manager Notification Failed:", err.message));

                    // Manager Socket - Real-time Dashboard Popup
                    emitToUser(manager._id, 'new_notification', {
                        title: 'New Lead Received',
                        message: `You have a new inquiry from ${user_name}.`,
                        type: 'business',
                        priority: 'normal',
                        actionUrl: '/manager/inquiries'
                    });

                    emitToUser(manager._id, 'new_inquiry', {
                        message: `New inquiry from ${user_name}`,
                        inquiry: inquiries.find(inq => inq.business_id.toString() === bId)
                    });

                    // Manager Email
                    if (manager.email) {
                        sendTemplateMail({
                            to: manager.email,
                            template: 'new_inquiry_manager',
                            data: {
                                businessName,
                                branchName: business.branch || sourceBusiness.branch,
                                customerName: user_name,
                                customerPhone: phone,
                                inquiryType: inquiry_type || 'General',
                                date: new Date().toLocaleDateString('en-IN'),
                                actionUrl: `${process.env.FRONTEND_URL || ''}/manager/inquiries`
                            }
                        }).catch(err => console.error(`Manager Email Failed (${manager.email}):`, err));
                    }
                }
            }

            // Admin Socket - Real-time Dashboard Popup
            emitToUser(adminId, 'new_notification', {
                title: 'New Inquiry Sync',
                message: `New inquiry from ${user_name} synchronized to ${inquiries.length} ${sourceBusiness.branch} branches.`,
                type: 'business',
                priority: 'high',
                actionUrl: '/admin/inquiries'
            });

        } catch (notifError) {
            console.error("Notification Error:", notifError);
            // Don't fail the response if notifications fail
        }

        // --- WhatsApp Notification to Customer (Non-blocking) ---
        try {
            // Get business link for booking URL
            const businessLink = sourceBusiness.link || sourceBusiness._id;
            const bookingUrl = `${process.env.FRONTEND_URL || 'https://spaadvisor.in'}/book/${businessLink}/services`;

            // Send WhatsApp message to customer (async, non-blocking)
            sendInquiryWhatsApp({
                customerName: user_name,
                phone: phone,
                businessName: sourceBusiness.name,
                inquiryType: inquiry_type || 'General Inquiry',
                bookingUrl: bookingUrl
            }).then(result => {
                if (result.success) {
                    console.log(`[Inquiry] WhatsApp sent to ${phone} via ${result.provider}`);
                } else {
                    console.warn(`[Inquiry] WhatsApp send failed for ${phone}`);
                }
            }).catch(err => {
                console.error(`[Inquiry] WhatsApp error for ${phone}:`, err.message);
            });
        } catch (whatsappError) {
            console.error("WhatsApp Notification Error:", whatsappError);
            // Don't fail the request even if WhatsApp fails
        }

        // Find the specific inquiry created for the requested business_id to return in response
        const primaryInquiry = inquiries.find(inq => inq.business_id.toString() === business_id);

        res.status(201).json({
            success: true,
            message: `Inquiry submitted successfully to ${inquiries.length} branch(es)`,
            data: primaryInquiry,
            syncCount: inquiries.length
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// get all inquiries (Protected)
const getAllInquiries = async (req, res) => {
    try {
        const { business_id, page = 1, limit = 10, search, status, type, startDate, endDate } = req.query;
        let skip = (parseInt(page) - 1) * parseInt(limit);

        const filter = {};

        // Security: Filter by business owner
        if (req.user.role === 'admin') {
            const myBusinesses = await Business.find({ admin: req.user.id }).distinct('_id');
            if (business_id) {
                if (!myBusinesses.some(id => id.toString() === business_id)) {
                    return res.status(403).json({ success: false, message: "Access denied for this business" });
                }
                filter.business_id = business_id;
            } else {
                filter.business_id = { $in: myBusinesses };
                // Admin viewing "All": Show only source inquiries OR old inquiries (no group_id)
                filter.$or = [
                    { is_source: true },
                    { group_id: { $exists: false } }
                ];
            }
        } else if (req.user.role === 'manager' || req.user.role === 'staff') {
            if (business_id && business_id !== req.user.businessId) {
                return res.status(403).json({ success: false, message: "Access denied for this business" });
            }
            filter.business_id = req.user.businessId;
        }

        // Additional Filters
        if (search) {
            const searchOr = [
                { user_name: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } }
            ];

            if (filter.$or) {
                filter.$and = [
                    { $or: filter.$or },
                    { $or: searchOr }
                ];
                delete filter.$or;
            } else {
                filter.$or = searchOr;
            }
        }

        if (status !== undefined && status !== '') {
            filter.is_recieved = status === 'true';
        }

        if (type) {
            filter.inquiry_type = type;
        }

        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                filter.createdAt.$lte = end;
            }
        }

        const inquiries = await Inquiry.find(filter)
            .populate('business_id', 'name branch')
            .skip(skip)
            .limit(parseInt(limit))
            .sort({ createdAt: -1 })
            .lean();

        const total = await Inquiry.countDocuments(filter);

        res.status(200).json({
            success: true,
            data: inquiries,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Delete inquiry (Protected)
const deleteInquiry = async (req, res) => {
    try {
        const inquiry = await Inquiry.findById(req.params.id);
        if (!inquiry) {
            return res.status(404).json({ success: false, message: "Inquiry not found" });
        }

        // Security: Check ownership - Use lean() for speed
        let isOwner = false;
        if (req.user.role === 'admin') {
            const business = await Business.findById(inquiry.business_id).lean().select('admin');
            if (business && business.admin.toString() === req.user.id) {
                isOwner = true;
            }
        } else if (req.user.role === 'manager' || req.user.role === 'staff') {
            if (inquiry.business_id.toString() === req.user.businessId) {
                isOwner = true;
            }
        }

        if (!isOwner) {
            return res.status(403).json({ success: false, message: "Not authorized to delete this inquiry" });
        }

        await Inquiry.findByIdAndDelete(req.params.id);

        res.status(200).json({
            success: true,
            message: "Inquiry deleted successfully"
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// mark as received the inquiry (Protected)
const markAsRecieved = async (req, res) => {
    try {
        const inquiry = await Inquiry.findById(req.params.id);
        if (!inquiry) {
            return res.status(404).json({ success: false, message: "Inquiry not found" });
        }

        // Security: Check ownership
        let isAuthorized = false;
        if (req.user.role === 'admin') {
            const business = await Business.findById(inquiry.business_id).lean().select('admin');
            if (business && business.admin.toString() === req.user.id) {
                isAuthorized = true;
            }
        } else if (req.user.role === 'manager' || req.user.role === 'staff') {
            if (inquiry.business_id.toString() === req.user.businessId) {
                isAuthorized = true;
            }
        }

        if (!isAuthorized) {
            return res.status(403).json({ success: false, message: "Not authorized to update this inquiry" });
        }

        inquiry.is_recieved = true;
        await inquiry.save();

        res.status(200).json({
            success: true,
            message: "Inquiry marked as received successfully"
        });

        // Socket Notification for real-time status update
        const adminId = inquiry.business_id.admin; // Need to ensure it's available or fetch it
        // Re-fetch with business info to get admin
        const detailedInquiry = await Inquiry.findById(inquiry._id).populate('business_id').lean();
        if (detailedInquiry) {
            const biz = detailedInquiry.business_id;
            // Notify Admin
            emitToUser(biz.admin, 'inquiry_updated', {
                id: inquiry._id,
                status: 'received'
            });
            // Notify Managers of this business
            const managers = await Manager.find({ business: biz._id, isActive: true }).lean();
            managers.forEach(mgr => {
                emitToUser(mgr._id, 'inquiry_updated', {
                    id: inquiry._id,
                    status: 'received'
                });
            });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Remark inquiry (Protected)
const remarkInquiry = async (req, res) => {
    try {
        const inquiry = await Inquiry.findById(req.params.id);
        if (!inquiry) {
            return res.status(404).json({ success: false, message: "Inquiry not found" });
        }

        // Authorization
        let isAuthorized = false;

        if (req.user.role === 'admin') {
            const business = await Business
                .findById(inquiry.business_id)
                .lean()
                .select('admin');

            if (business && business.admin.toString() === req.user.id) {
                isAuthorized = true;
            }
        } else if (req.user.role === 'manager' || req.user.role === 'staff') {
            if (inquiry.business_id.toString() === req.user.businessId) {
                isAuthorized = true;
            }
        }

        if (!isAuthorized) {
            return res.status(403).json({
                success: false,
                message: "Not authorized to update this inquiry"
            });
        }

        // Role restriction
        if (inquiry.remarked_by) {
            const isSameRole = inquiry.remarked_by_role === req.user.role;
            if (!isSameRole) {
                return res.status(403).json({
                    success: false,
                    message: "Only users with the same role can edit this remark"
                });
            }
        }

        const { remark, remark_color } = req.body;

        // Validate color
        const allowedColors = ['red', 'yellow', 'gray'];
        if (remark_color && !allowedColors.includes(remark_color)) {
            return res.status(400).json({
                success: false,
                message: "Invalid remark color"
            });
        }

        inquiry.remark = remark;
        inquiry.remark_color = remark_color || inquiry.remark_color || 'gray';

        // Tracking metadata
        if (req.user && req.user.id) {
            inquiry.remarked_by = req.user.id;
            inquiry.remarked_by_role = req.user.role || '';
            inquiry.remarked_at = new Date();
            inquiry.remarked_by_name =
                req.user.name ||
                req.user.username ||
                req.user.email ||
                '';
        }

        await inquiry.save();

        res.status(200).json({
            success: true,
            message: "Inquiry remarked successfully"
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// export inquiries (Protected)
const exportInquiries = async (req, res) => {
    try {
        const { business_id, search, status, type, startDate, endDate, format = 'csv' } = req.query;

        const filter = {};

        // Security: Filter by business owner
        if (req.user.role === 'admin') {
            const myBusinesses = await Business.find({ admin: req.user.id }).distinct('_id');
            if (business_id) {
                if (!myBusinesses.some(id => id.toString() === business_id)) {
                    return res.status(403).json({ success: false, message: "Access denied for this business" });
                }
                filter.business_id = business_id;
            } else {
                filter.business_id = { $in: myBusinesses };
            }
        } else if (req.user.role === 'manager' || req.user.role === 'staff') {
            filter.business_id = req.user.businessId;
        }

        if (search) {
            filter.$or = [
                { user_name: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } }
            ];
        }
        if (status !== undefined && status !== '') {
            filter.is_recieved = status === 'true';
        }
        if (type) {
            filter.inquiry_type = type;
        }
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                filter.createdAt.$lte = end;
            }
        }

        const inquiries = await Inquiry.find(filter)
            .populate('business_id', 'name branch')
            .sort({ createdAt: -1 })
            .lean();

        if (!inquiries.length) {
            return res.status(404).json({ success: false, message: "No inquiries found for export" });
        }

        const { exportInquiriesToCSV, exportInquiriesToPDF } = require("../utils/inquiryExport");

        if (format === "csv") {
            const csvFile = await exportInquiriesToCSV(inquiries);
            res.header("Content-Type", "text/csv");
            res.attachment(`inquiries-${new Date().toISOString().split('T')[0]}.csv`);
            return res.send(csvFile);
        }

        if (format === "pdf") {
            const pdfBuffer = await exportInquiriesToPDF(inquiries);
            res.header("Content-Type", "application/pdf");
            res.attachment(`inquiries-${new Date().toISOString().split('T')[0]}.pdf`);
            return res.send(pdfBuffer);
        }

        return res.status(400).json({ success: false, message: "Invalid format" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    sendInquiryOTP,
    createInquiry,
    getAllInquiries,
    markAsRecieved,
    deleteInquiry,
    remarkInquiry,
    exportInquiries
};
