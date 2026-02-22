const Business = require("../../models/Business");
const Manager = require("../../models/Manager");

// Toggle Admin Sidebar (effectively Business Sidebar Settings for ALL businesses of this Admin)
const toggleAdminSidebar = async (req, res, next) => {
    try {
        const { id } = req.params; // Admin ID
        let updates = req.body;

        // Handle case where updates are wrapped in "sidebarSettings"
        if (updates.sidebarSettings) {
            updates = updates.sidebarSettings;
        }

        if (!updates || Object.keys(updates).length === 0) {
            return res.status(400).json({ success: false, message: "No update fields provided" });
        }

        const updateFields = {};
        for (const [key, value] of Object.entries(updates)) {
            // Prevent recursive nesting if mistakenly passed
            if (key === 'sidebarSettings') continue;
            updateFields[`sidebarSettings.${key}`] = value;
        }

        // Update all businesses of this admin
        const result = await Business.updateMany(
            { admin: id },
            { $set: updateFields }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ success: false, message: "No businesses found for this admin" });
        }

        // Fetch one business to return the updated settings (assuming uniformity)
        const updatedBusiness = await Business.findOne({ admin: id }).select('sidebarSettings');

        // 3. Emit real-time update event via socket
        const io = req.app.get('io');
        if (io) {
            io.to(`admin_${id}`).emit('sidebar_settings_updated', {
                sidebarSettings: updates
            });
            // Also emit to each business room
            const businesses = await Business.find({ admin: id }).select('_id');
            businesses.forEach(biz => {
                io.to(`business_${biz._id}`).emit('sidebar_settings_updated', {
                    sidebarSettings: updates
                });
            });
        }

        return res.json({
            success: true,
            message: `Admin sidebar updated successfully for ${result.modifiedCount} businesses`,
            data: updatedBusiness ? updatedBusiness.sidebarSettings : {}
        });
    } catch (err) {
        next(err);
    }
};

// Toggle Manager Sidebar (All Managers under an Admin)
const toggleAdmin_sManagerSidebar = async (req, res, next) => {
    try {
        const { adminId } = req.params;
        let updates = req.body;

        if (updates.sidebarSettings) {
            updates = updates.sidebarSettings;
        }

        if (!updates || Object.keys(updates).length === 0) {
            return res.status(400).json({ success: false, message: "No update fields provided" });
        }

        const updateFields = {};
        for (const [key, value] of Object.entries(updates)) {
            if (key === 'sidebarSettings') continue;
            updateFields[`sidebarSettings.${key}`] = value;
        }

        // 1. Find all businesses owned by this admin
        const businesses = await Business.find({ admin: adminId }).select('_id');

        if (!businesses || businesses.length === 0) {
            return res.status(404).json({ success: false, message: "No businesses found for this admin" });
        }

        const businessIds = businesses.map(b => b._id);

        // 2. Update all managers linked to these businesses
        const result = await Manager.updateMany(
            { business: { $in: businessIds } },
            { $set: updateFields }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ success: false, message: "No managers found for this admin's businesses" });
        }

        // 3. Emit real-time update event via socket
        const io = req.app.get('io');
        if (io) {
            businessIds.forEach(bizId => {
                io.to(`business_${bizId}`).emit('sidebar_settings_updated', {
                    sidebarSettings: updates
                });
            });
        }

        return res.json({
            success: true,
            message: `Sidebar settings updated for ${result.modifiedCount} managers across ${businesses.length} businesses`,
            data: updates // Returning the updates applied as we can't return all manager settings easily
        });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    toggleAdminSidebar,
    toggleAdmin_sManagerSidebar
};
