const Admin = require("../../models/Admin");
const Business = require("../../models/Business");
const Customer = require("../../models/Customer");
const Appointment = require("../../models/Appointment");
const Inquiry = require("../../models/Inquiry");
const GoogleSheetLead = require("../../models/GoogleSheetLead");

// Get Platform Wide Statistics
const getPlatformStats = async (req, res, next) => {
    try {
        // --- Admin Stats ---
        const total_admin = await Admin.countDocuments();
        const active_admin = await Admin.countDocuments({ isActive: { $ne: false } });

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const new_admin = await Admin.countDocuments({ createdAt: { $gte: thirtyDaysAgo } });

        // --- Business Stats ---
        const total_business = await Business.countDocuments();

        // Active: Both isActive and isActiveFromSuperAdmin must not be false
        const active_business = await Business.countDocuments({
            isActive: { $ne: false },
            isActiveFromSuperAdmin: { $ne: false }
        });

        // Inactive: Either isActive or isActiveFromSuperAdmin is false
        const inactive_business = total_business - active_business;

        // Paid/Free based on plan field (including defaults)
        const total_paid_business = await Business.countDocuments({ plan: "paid" });
        const total_free_business = await Business.countDocuments({
            $or: [{ plan: "free" }, { plan: { $exists: false } }]
        });

        // --- Inquiry Stats ---
        const total_enquiry = await Inquiry.countDocuments();

        // --- Customer Stats ---
        const total_customers = await Customer.countDocuments();

        // --- WhatsApp Leads Stats ---
        const total_whatsapp_leads = await GoogleSheetLead.countDocuments();

        // --- Appointment & Revenue Stats ---
        const appointmentStats = await Appointment.aggregate([
            {
                $match: { status: { $ne: "cancelled" } } // Optional: exclude cancelled? User didn't specify, but usually better.
            },
            {
                $group: {
                    _id: null,
                    count: { $sum: 1 },
                    revenue: { $sum: "$totalAmount" }
                }
            }
        ]);

        const total_appointments = appointmentStats.length > 0 ? appointmentStats[0].count : 0;
        const total_revenue = appointmentStats.length > 0 ? appointmentStats[0].revenue : 0;

        return res.json({
            success: true,
            data: {
                total_business,
                active_business,
                inactive_business,
                total_admin,
                active_admin,
                new_admin,
                total_enquiry,
                total_revenue,
                total_appointments,
                total_paid_business,
                total_free_business,
                total_customers,
                total_whatsapp_leads
            }
        });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    getPlatformStats
};
