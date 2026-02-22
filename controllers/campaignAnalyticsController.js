// campaignAnalyticsController.js - Campaign analytics and best time to send
const Campaign = require("../models/Campaign");
const Customer = require("../models/Customer");
const Business = require("../models/Business");
const Manager = require("../models/Manager");

// ================== BEST TIME TO SEND ==================

// Analyze Best Time to Send for Business
const analyzeBestTimeToSend = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { businessId } = req.query;

        // Determine business
        let business;
        if (userRole === 'admin') {
            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: "Business ID is required"
                });
            }
            business = await Business.findOne({ _id: businessId, admin: userId });
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            business = await Business.findById(manager.business);
        }

        if (!business) {
            return res.status(404).json({
                success: false,
                message: "Business not found or access denied"
            });
        }

        // Get all completed campaigns with engagement data
        const campaigns = await Campaign.find({
            business: business._id,
            status: 'completed',
            'recipients.0': { $exists: true }
        }).select('scheduledDate recipients stats');

        if (campaigns.length === 0) {
            return res.json({
                success: true,
                message: "Not enough data to analyze",
                data: null
            });
        }

        // Analyze engagement by hour and day of week
        const hourlyEngagement = {};
        const dailyEngagement = {};

        for (let i = 0; i < 24; i++) {
            hourlyEngagement[i] = { sent: 0, opened: 0, clicked: 0 };
        }

        for (let i = 0; i < 7; i++) {
            dailyEngagement[i] = { sent: 0, opened: 0, clicked: 0 };
        }

        campaigns.forEach(campaign => {
            if (!campaign.scheduledDate) return;

            const date = new Date(campaign.scheduledDate);
            const hour = date.getHours();
            const dayOfWeek = date.getDay();

            hourlyEngagement[hour].sent += campaign.stats.sent || 0;
            hourlyEngagement[hour].opened += campaign.stats.opened || 0;
            hourlyEngagement[hour].clicked += campaign.stats.clicked || 0;

            dailyEngagement[dayOfWeek].sent += campaign.stats.sent || 0;
            dailyEngagement[dayOfWeek].opened += campaign.stats.opened || 0;
            dailyEngagement[dayOfWeek].clicked += campaign.stats.clicked || 0;
        });

        // Calculate rates
        const hourlyData = Object.keys(hourlyEngagement).map(hour => {
            const data = hourlyEngagement[hour];
            return {
                hour: parseInt(hour),
                hourLabel: `${hour}:00`,
                sent: data.sent,
                opened: data.opened,
                clicked: data.clicked,
                openRate: data.sent > 0 ? Math.round((data.opened / data.sent) * 100 * 100) / 100 : 0,
                clickRate: data.opened > 0 ? Math.round((data.clicked / data.opened) * 100 * 100) / 100 : 0
            };
        });

        const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dailyData = Object.keys(dailyEngagement).map(day => {
            const data = dailyEngagement[day];
            return {
                day: parseInt(day),
                dayName: daysOfWeek[day],
                sent: data.sent,
                opened: data.opened,
                clicked: data.clicked,
                openRate: data.sent > 0 ? Math.round((data.opened / data.sent) * 100 * 100) / 100 : 0,
                clickRate: data.opened > 0 ? Math.round((data.clicked / data.opened) * 100 * 100) / 100 : 0
            };
        });

        // Find best hour and day
        const bestHour = hourlyData.reduce((prev, current) => 
            (current.openRate > prev.openRate) ? current : prev
        );

        const bestDay = dailyData.reduce((prev, current) => 
            (current.openRate > prev.openRate) ? current : prev
        );

        return res.json({
            success: true,
            data: {
                bestTime: {
                    hour: bestHour.hour,
                    hourLabel: bestHour.hourLabel,
                    openRate: bestHour.openRate,
                    day: bestDay.day,
                    dayName: bestDay.dayName,
                    dayOpenRate: bestDay.openRate,
                    recommendation: `Best time to send is ${bestDay.dayName} at ${bestHour.hourLabel}`
                },
                hourlyAnalysis: hourlyData,
                dailyAnalysis: dailyData,
                totalCampaignsAnalyzed: campaigns.length
            }
        });
    } catch (err) {
        next(err);
    }
};

// Get Customer Engagement Patterns
const getCustomerEngagementPattern = async (req, res, next) => {
    try {
        const { customerId } = req.params;

        const customer = await Customer.findById(customerId);

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: "Customer not found"
            });
        }

        // Find campaigns where this customer was a recipient
        const campaigns = await Campaign.find({
            'recipients.customer': customerId,
            status: 'completed'
        }).select('scheduledDate recipients');

        if (campaigns.length === 0) {
            return res.json({
                success: true,
                message: "Not enough data for this customer",
                data: null
            });
        }

        // Analyze customer's engagement patterns
        const engagementByHour = {};
        for (let i = 0; i < 24; i++) {
            engagementByHour[i] = { sent: 0, opened: 0, clicked: 0 };
        }

        campaigns.forEach(campaign => {
            const recipient = campaign.recipients.find(r => 
                r.customer.toString() === customerId
            );

            if (recipient && campaign.scheduledDate) {
                const hour = new Date(campaign.scheduledDate).getHours();
                engagementByHour[hour].sent += 1;
                if (['opened', 'clicked'].includes(recipient.status)) {
                    engagementByHour[hour].opened += 1;
                }
                if (recipient.status === 'clicked') {
                    engagementByHour[hour].clicked += 1;
                }
            }
        });

        // Find best hour for this customer
        let bestHour = 10; // default
        let maxEngagementRate = 0;

        Object.keys(engagementByHour).forEach(hour => {
            const data = engagementByHour[hour];
            if (data.sent > 0) {
                const engagementRate = data.opened / data.sent;
                if (engagementRate > maxEngagementRate) {
                    maxEngagementRate = engagementRate;
                    bestHour = parseInt(hour);
                }
            }
        });

        return res.json({
            success: true,
            data: {
                customerId,
                customerName: `${customer.firstName} ${customer.lastName}`,
                bestTimeToSend: {
                    hour: bestHour,
                    hourLabel: `${bestHour}:00`,
                    engagementRate: Math.round(maxEngagementRate * 100 * 100) / 100
                },
                engagementPattern: engagementByHour,
                totalCampaignsReceived: campaigns.length
            }
        });
    } catch (err) {
        next(err);
    }
};

// ================== CAMPAIGN COMPARISON ==================

const compareCampaigns = async (req, res, next) => {
    try {
        const { campaignIds } = req.body;

        if (!campaignIds || campaignIds.length < 2) {
            return res.status(400).json({
                success: false,
                message: "At least 2 campaign IDs are required for comparison"
            });
        }

        const campaigns = await Campaign.find({
            _id: { $in: campaignIds }
        }).select('name type status stats deliveryRate openRate clickRate conversionRate roi createdAt');

        if (campaigns.length < 2) {
            return res.status(404).json({
                success: false,
                message: "Some campaigns not found"
            });
        }

        const comparison = campaigns.map(c => ({
            id: c._id,
            name: c.name,
            type: c.type,
            status: c.status,
            createdAt: c.createdAt,
            stats: {
                sent: c.stats.sent,
                delivered: c.stats.delivered,
                opened: c.stats.opened,
                clicked: c.stats.clicked,
                converted: c.stats.converted,
                deliveryRate: c.deliveryRate,
                openRate: c.openRate,
                clickRate: c.clickRate,
                conversionRate: c.conversionRate
            },
            roi: c.roi
        }));

        // Find best performer
        const bestPerformer = comparison.reduce((prev, current) => 
            (current.stats.conversionRate > prev.stats.conversionRate) ? current : prev
        );

        return res.json({
            success: true,
            data: {
                campaigns: comparison,
                bestPerformer: {
                    id: bestPerformer.id,
                    name: bestPerformer.name,
                    conversionRate: bestPerformer.stats.conversionRate
                }
            }
        });
    } catch (err) {
        next(err);
    }
};

// ================== CAMPAIGN INSIGHTS ==================

const getCampaignInsights = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { businessId, startDate, endDate } = req.query;

        // Determine business
        let business;
        if (userRole === 'admin') {
            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: "Business ID is required"
                });
            }
            business = await Business.findOne({ _id: businessId, admin: userId });
        } else if (userRole === 'manager') {
            const manager = await Manager.findById(userId);
            business = await Business.findById(manager.business);
        }

        if (!business) {
            return res.status(404).json({
                success: false,
                message: "Business not found or access denied"
            });
        }

        const query = {
            business: business._id,
            status: 'completed'
        };

        if (startDate && endDate) {
            query.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        const campaigns = await Campaign.find(query);

        if (campaigns.length === 0) {
            return res.json({
                success: true,
                message: "No completed campaigns found",
                data: null
            });
        }

        // Calculate insights
        const insights = {
            totalCampaigns: campaigns.length,
            
            // Performance metrics
            avgOpenRate: 0,
            avgClickRate: 0,
            avgConversionRate: 0,
            
            // Best/Worst performers
            bestCampaign: null,
            worstCampaign: null,
            
            // Trends
            improvementTrends: [],
            
            // Recommendations
            recommendations: []
        };

        // Calculate averages
        const totalOpenRate = campaigns.reduce((sum, c) => sum + (c.openRate || 0), 0);
        const totalClickRate = campaigns.reduce((sum, c) => sum + (c.clickRate || 0), 0);
        const totalConversionRate = campaigns.reduce((sum, c) => sum + (c.conversionRate || 0), 0);

        insights.avgOpenRate = Math.round((totalOpenRate / campaigns.length) * 100) / 100;
        insights.avgClickRate = Math.round((totalClickRate / campaigns.length) * 100) / 100;
        insights.avgConversionRate = Math.round((totalConversionRate / campaigns.length) * 100) / 100;

        // Find best and worst
        const sortedByConversion = [...campaigns].sort((a, b) => 
            (b.conversionRate || 0) - (a.conversionRate || 0)
        );

        insights.bestCampaign = {
            id: sortedByConversion[0]._id,
            name: sortedByConversion[0].name,
            conversionRate: sortedByConversion[0].conversionRate
        };

        insights.worstCampaign = {
            id: sortedByConversion[sortedByConversion.length - 1]._id,
            name: sortedByConversion[sortedByConversion.length - 1].name,
            conversionRate: sortedByConversion[sortedByConversion.length - 1].conversionRate
        };

        // Generate recommendations
        if (insights.avgOpenRate < 20) {
            insights.recommendations.push("Your average open rate is below industry standard (20-25%). Try improving your subject lines.");
        }
        if (insights.avgClickRate < 2.5) {
            insights.recommendations.push("Your average click rate is low. Consider adding clearer call-to-action buttons.");
        }
        if (insights.avgConversionRate < 1) {
            insights.recommendations.push("Conversion rate is low. Review your landing pages and offer relevance.");
        }

        return res.json({
            success: true,
            data: insights
        });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    analyzeBestTimeToSend,
    getCustomerEngagementPattern,
    compareCampaigns,
    getCampaignInsights
};

