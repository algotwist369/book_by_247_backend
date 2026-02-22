const mongoose = require("mongoose");
const { getMicroserviceConnection } = require("../config/microserviceDB");

const dbConnection = getMicroserviceConnection();

const superAdminSupportNotificationSchema = new mongoose.Schema(
    {
        type: {
            type: String,
            enum: ["low", "medium", "high", "critical"],
            default: "low",
        },
        title: { type: String, required: true },
        message: { type: String, required: true },
        read: { type: Boolean, default: false },
        delivered: { type: Boolean, default: false },
        link: { type: String },
        metadata: { type: mongoose.Schema.Types.Mixed },
    },
    { timestamps: true }
);

superAdminSupportNotificationSchema.index({ createdAt: -1 });
superAdminSupportNotificationSchema.index({ read: 1 });
superAdminSupportNotificationSchema.index({ delivered: 1 });

module.exports = dbConnection.model("SuperAdminSupportNotification", superAdminSupportNotificationSchema);
