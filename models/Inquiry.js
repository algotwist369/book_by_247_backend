const mongoose = require("mongoose");

const inquirySchema = new mongoose.Schema({
    business_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Business"
    },
    user_name: {
        type: String,
        required: true
    },
    phone: {
        type: String,
        required: true
    },
    inquiry_type: {
        type: String,
    },
    is_recieved: {
        type: Boolean,
        default: false
    },
    remark: {
        type: String,
    },
    remarked_by: {
        type: mongoose.Schema.Types.ObjectId
    },
    remarked_by_name: {
        type: String
    },
    remarked_by_role: {
        type: String
    },
    remarked_at: {
        type: Date
    },
    remark_color: {
        type: String,
        enum: ['red', 'green', 'yellow', 'gray'],
        default: 'gray'
    },
    group_id: {
        type: mongoose.Schema.Types.ObjectId,
        index: true
    },
    is_source: {
        type: Boolean,
        default: false
    },
    sync_count: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    },
});
inquirySchema.index({ business_id: 1, createdAt: -1 });
inquirySchema.index({ phone: 1 });

module.exports = mongoose.model("Inquiry", inquirySchema);