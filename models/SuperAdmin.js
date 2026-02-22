const mongoose = require("mongoose");

const superAdminSchema = new mongoose.Schema(
    {
        user_name: {
            type: String,
            required: true,
            trim: true
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true
        },
        password: {
            type: String,
            required: true
        },
        phone_number: {
            type: String,
            required: true,
            unique: true
        },
        profile_pic: {
            type: String,
            default: ""
        },
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("SuperAdmin", superAdminSchema);
