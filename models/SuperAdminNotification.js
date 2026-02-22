const mongoose = require("mongoose");

const superAdminNotificationSchema = new mongoose.Schema(
    {
        type: {
            type: String,
            enum: ["info", "success", "warning", "error"],
            default: "info",
        },
        title: { type: String, required: true },
        message: { type: String, required: true },
        read: { type: Boolean, default: false },
        link: { type: String }, // For frontend navigation
        metadata: { type: mongoose.Schema.Types.Mixed },
    },
    { timestamps: true }
);

superAdminNotificationSchema.index({ createdAt: -1 });
superAdminNotificationSchema.index({ read: 1 });

module.exports = mongoose.model("SuperAdminNotification", superAdminNotificationSchema);
