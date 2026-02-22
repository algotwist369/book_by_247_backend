const mongoose = require("mongoose");

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/crm-dashboard");

        console.log(`✅ MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
    } catch (err) {
        console.error("❌ MongoDB connection failed:", err.message);
        process.exit(1); // stop server if DB not connected
    }
};

module.exports = connectDB;
