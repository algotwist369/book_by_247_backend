const DailyClickCount = require("../models/DailyClickCount");
const IpPageJourney = require("../models/IpPageJourney");
const Business = require("../models/Business");
const Inquiry = require("../models/Inquiry");
const mongoose = require("mongoose");

// Helper to get start of day in local time or UTC (using simplified YYYY-MM-DD string as per model)
const getTodayDateString = () => {
    return new Date().toISOString().split('T')[0];
};

// Helper to extract robust IP
const getClientIp = (req) => {
    let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
    if (ip && ip.includes(',')) ip = ip.split(',')[0].trim();
    if (ip === '::1' || ip === '::ffff:127.0.0.1') ip = '127.0.0.1'; // Normalize localhost
    if (ip && ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', ''); // Normalize IPv4-mapped
    return ip;
};

exports.trackLead = async (req, res) => {
    try {
        const { businessId, leadType, page } = req.body;

        // Extract IP address (handle proxies if deployed behind Nginx/Cloudflare)
        const ipAddress = getClientIp(req);

        // Validation
        if (!businessId || !leadType) {
            return res.status(400).json({ success: false, message: "Missing required fields" });
        }

        const date = getTodayDateString();
        const updateFields = {};

        // 1. Update Daily Click Count
        if (leadType === 'call') updateFields.callClicks = 1;
        else if (leadType === 'whatsapp') updateFields.whatsappClicks = 1;
        else if (leadType === 'booking') updateFields.bookingClicks = 1;

        const dailyClickPromise = DailyClickCount.findOneAndUpdate(
            { businessId, date },
            { $inc: updateFields },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        // 2. Update IP Page Journey
        // Only keep last 10 pages to avoid unbounded array growth
        const journeyUpdate = {
            $push: {
                pagesVisited: {
                    $each: [{ page, timestamp: new Date() }],
                    $slice: -10 // Keep only last 10
                }
            },
            $set: {
                lastPageVisited: page,
                lastVisitedAt: new Date(),
                ipAddress: ipAddress // Refresh IP in case it changed slightly but same session
            }
        };

        // Only increment totalClicks for interaction events, not passive page views
        if (['call', 'whatsapp', 'booking'].includes(leadType)) {
            journeyUpdate.$inc = { totalClicks: 1 };
        }

        const ipJourneyPromise = IpPageJourney.findOneAndUpdate(
            { businessId, ipAddress },
            journeyUpdate,
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        // Execute both concurrently
        await Promise.all([dailyClickPromise, ipJourneyPromise]);

        res.status(200).json({ success: true, message: "Tracked successfully" });

    } catch (error) {
        console.error("Tracking Error:", error);
        // Fail silently to client, but log error
        res.status(500).json({ success: false, message: "Tracking failed silently" });
    }
};

exports.getAnalyticsSummary = async (req, res) => {
    try {
        const { date, startDate, endDate, businessId } = req.query;
        const queryDate = date || getTodayDateString();

        // 1. Get businesses owned by this admin
        // req.user is attached by protect middleware
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: "Access denied" });
        }

        const adminId = req.user.id;
        // Fetch all business IDs owned by this admin
        const myBusinesses = await Business.find({ admin: adminId }).distinct('_id');

        if (myBusinesses.length === 0) {
            return res.status(200).json({
                success: true,
                data: {
                    totalCallClicks: 0,
                    totalWhatsappClicks: 0,
                    totalBookingClicks: 0,
                    totalClicks: 0,
                    totalVisits: 0
                }
            });
        }

        // Build date filter - support both single date and date range
        let dateFilter = {};
        if (startDate && endDate) {
            // Date range query
            dateFilter = { date: { $gte: startDate, $lte: endDate } };
        } else {
            // Single date query (default)
            dateFilter = { date: queryDate };
        }

        const matchStage = { ...dateFilter };

        // 2. Filter by businessId for click counts
        if (businessId) {
            // Check if admin owns this business
            const isOwner = myBusinesses.some(id => id.toString() === businessId);
            if (!isOwner) {
                return res.status(403).json({ success: false, message: "You do not have permission to view stats for this business" });
            }
            matchStage.businessId = new mongoose.Types.ObjectId(businessId);
        } else {
            // If no specific business requested, sum up for ALL their businesses
            matchStage.businessId = { $in: myBusinesses };
        }

        // 3. Build date range for IpPageJourney and Inquiry
        let visitStartDate, visitEndDate;
        if (startDate && endDate) {
            // Custom date range
            visitStartDate = new Date(startDate);
            visitStartDate.setHours(0, 0, 0, 0);
            visitEndDate = new Date(endDate);
            visitEndDate.setHours(23, 59, 59, 999);
        } else {
            // Single day (default)
            visitStartDate = new Date(queryDate);
            visitStartDate.setHours(0, 0, 0, 0);
            visitEndDate = new Date(queryDate);
            visitEndDate.setHours(23, 59, 59, 999);
        }

        const visitMatchStage = {
            lastVisitedAt: { $gte: visitStartDate, $lte: visitEndDate }
        };

        if (businessId) {
            visitMatchStage.businessId = new mongoose.Types.ObjectId(businessId);
        } else {
            visitMatchStage.businessId = { $in: myBusinesses };
        }

        const inquiryMatchStage = {
            createdAt: { $gte: visitStartDate, $lte: visitEndDate },
            business_id: { $ne: null } // Only count inquiries that have a business_id
        };

        if (businessId) {
            inquiryMatchStage.business_id = new mongoose.Types.ObjectId(businessId);
        } else {
            inquiryMatchStage.business_id = { $in: myBusinesses };
        }

        // Run all aggregations in parallel for performance
        const [todayStats, visitStats, totalInquiries] = await Promise.all([
            // Aggregate total clicks for the date (and optional business)
            DailyClickCount.aggregate([
                { $match: matchStage },
                {
                    $group: {
                        _id: null,
                        totalCallClicks: { $sum: "$callClicks" },
                        totalWhatsappClicks: { $sum: "$whatsappClicks" },
                        totalBookingClicks: { $sum: "$bookingClicks" },
                        totalClicks: {
                            $sum: { $add: ["$callClicks", "$whatsappClicks", "$bookingClicks"] }
                        }
                    }
                }
            ]),
            // Count unique visitors (unique IPs) for the date
            IpPageJourney.aggregate([
                { $match: visitMatchStage },
                {
                    $group: {
                        _id: "$ipAddress" // Group by unique IP
                    }
                },
                {
                    $count: "totalVisits"
                }
            ]),
            // Count unique inquiries by group_id (to avoid counting synced inquiries multiple times)
            Inquiry.aggregate([
                { $match: inquiryMatchStage },
                { $group: { _id: "$group_id" } },
                { $count: "uniqueInquiries" }
            ])
        ]);

        const clickStats = todayStats[0] || {
            totalCallClicks: 0,
            totalWhatsappClicks: 0,
            totalBookingClicks: 0,
            totalClicks: 0
        };

        const totalVisits = visitStats[0]?.totalVisits || 0;
        const totalInquiryCount = totalInquiries[0]?.uniqueInquiries || 0;

        res.status(200).json({
            success: true,
            data: {
                ...clickStats,
                totalVisits,
                totalInquiries: totalInquiryCount
            }
        });
    } catch (error) {
        console.error("Analytics Summary Error:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

exports.getBusinessBreakdown = async (req, res) => {
    try {
        const { date, startDate, endDate, businessId, sortBy = 'totalClicks', order = 'desc', limit = 20, page = 1 } = req.query;
        const queryDate = date || getTodayDateString();

        const limitNum = Math.min(parseInt(limit), 50); // Cap limit at 50
        const skip = (parseInt(page) - 1) * limitNum;
        const sortOrder = order === 'desc' ? -1 : 1;

        // 1. Security Check
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: "Access denied" });
        }

        const adminId = req.user.id;
        const myBusinesses = await Business.find({ admin: adminId }).select('_id').lean();
        const myBusinessIds = myBusinesses.map(b => b._id);

        if (myBusinessIds.length === 0) {
            return res.status(200).json({
                success: true,
                data: [],
                pagination: { total: 0, page: 1, pages: 0 }
            });
        }

        // Build date filter - support both single date and date range
        let dateFilter = {};
        if (startDate && endDate) {
            // Date range query
            dateFilter = { date: { $gte: startDate, $lte: endDate } };
        } else {
            // Single date query (default)
            dateFilter = { date: queryDate };
        }

        const matchStage = { ...dateFilter };

        // 2. Filter by business
        if (businessId) {
            const isOwner = myBusinessIds.some(id => id.toString() === businessId);
            if (!isOwner) {
                return res.status(403).json({ success: false, message: "Permission denied for this business" });
            }
            matchStage.businessId = new mongoose.Types.ObjectId(businessId);
        } else {
            matchStage.businessId = { $in: myBusinessIds };
        }

        const breakdown = await DailyClickCount.aggregate([
            { $match: matchStage },
            // Group by business to aggregate across date range
            {
                $group: {
                    _id: "$businessId",
                    callClicks: { $sum: "$callClicks" },
                    whatsappClicks: { $sum: "$whatsappClicks" },
                    bookingClicks: { $sum: "$bookingClicks" },
                    totalClicks: { $sum: { $add: ["$callClicks", "$whatsappClicks", "$bookingClicks"] } }
                }
            },
            // Join with Business collection to get name
            {
                $lookup: {
                    from: "businesses",
                    localField: "_id",
                    foreignField: "_id",
                    as: "business",
                    pipeline: [{ $project: { name: 1, branch: 1 } }] // Only fetch needed fields
                }
            },
            { $unwind: "$business" },
            {
                $project: {
                    _id: 0,
                    businessName: "$business.name",
                    branch: "$business.branch",
                    callClicks: 1,
                    whatsappClicks: 1,
                    bookingClicks: 1,
                    totalClicks: 1
                }
            },
            { $sort: { [sortBy]: sortOrder } },
            { $skip: skip },
            { $limit: limitNum }
        ]);

        // Get total count for pagination
        const totalCountResult = await DailyClickCount.aggregate([
            { $match: matchStage },
            { $group: { _id: "$businessId" } },
            { $count: "total" }
        ]);

        const totalCount = totalCountResult[0]?.total || 0;

        res.status(200).json({
            success: true,
            data: breakdown,
            pagination: {
                total: totalCount,
                page: parseInt(page),
                pages: Math.ceil(totalCount / limitNum)
            }
        });
    } catch (error) {
        console.error("Business Breakdown Error:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

exports.getIpJourneys = async (req, res) => {
    try {
        const { date, startDate, endDate, businessId, page = 1, limit = 20 } = req.query;
        const limitNum = Math.min(parseInt(limit), 50); // Cap limit at 50
        const pageNum = Math.max(1, parseInt(page));

        // 1. Security
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: "Access denied" });
        }

        const adminId = req.user.id;
        const myBusinesses = await Business.find({ admin: adminId }).select('_id').lean();
        const myBusinessIds = myBusinesses.map(id => id._id);

        const filter = {};

        if (businessId) {
            if (!myBusinessIds.some(id => id.toString() === businessId)) {
                return res.status(403).json({ success: false, message: "Permission denied for this business" });
            }
            filter.businessId = businessId;
        } else {
            // Restrict to ANY of my businesses
            filter.businessId = { $in: myBusinessIds };
        }

        // Filter by date - support both single date and date range
        if (startDate && endDate) {
            // Date range query
            const rangeStartDate = new Date(startDate);
            rangeStartDate.setHours(0, 0, 0, 0);
            const rangeEndDate = new Date(endDate);
            rangeEndDate.setHours(23, 59, 59, 999);

            filter.lastVisitedAt = {
                $gte: rangeStartDate,
                $lte: rangeEndDate
            };
        } else if (date) {
            // Single date query
            const singleDate = new Date(date);
            singleDate.setHours(0, 0, 0, 0);
            const singleDateEnd = new Date(date);
            singleDateEnd.setHours(23, 59, 59, 999);

            filter.lastVisitedAt = {
                $gte: singleDate,
                $lte: singleDateEnd
            };
        }

        // Fetch only necessary fields to reduce memory usage
        const journeys = await IpPageJourney.find(filter)
            .select('ipAddress lastPageVisited lastVisitedAt totalClicks pagesVisited businessId')
            .populate('businessId', 'name branch')
            .sort({ lastVisitedAt: -1 })
            .limit(limitNum)
            .skip((pageNum - 1) * limitNum)
            .lean();

        const count = await IpPageJourney.countDocuments(filter);

        res.status(200).json({
            success: true,
            data: journeys,
            pagination: {
                total: count,
                totalPages: Math.ceil(count / limitNum),
                currentPage: pageNum
            }
        });
    } catch (error) {
        console.error("IP Journey Error:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};
