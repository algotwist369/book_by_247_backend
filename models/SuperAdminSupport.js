const mongoose = require("mongoose");
const { getMicroserviceConnection } = require("../config/microserviceDB");

const dbConnection = getMicroserviceConnection();

const SuperAdminSupport = new mongoose.Schema(
    {
        admin_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
            required: true,
        },
        admin_name: {
            type: String,
            required: true,
        },
        admin_email: {
            type: String,
            required: true,
        },
        admin_phone: {
            type: String,
            required: true,
        },
        admin_company_name: {
            type: String,
            required: true,
        },
        issue_type: {
            type: String,
            required: true,
        },
        priority: {
            type: String,
            enum: ["low", "medium", "high", "critical"],
            required: true,
        },
        business_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Business",
            required: false, // Optional for "All Businesses"
        },
        business_name: {
            type: String,
            required: true,
        },
        subject: {
            type: String,
            required: true,
        },
        description: {
            type: String,
            required: true,
        },
        status: {
            type: String,
            enum: ["open", "pending", "resolved", "closed"],
            default: "open"
        }
    },
    { timestamps: true }
);

SuperAdminSupport.index({ createdAt: -1 });

module.exports = dbConnection.model("SuperAdminSupport", SuperAdminSupport);
