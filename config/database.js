const mongoose = require('mongoose');

// Database connection options for high performance
const dbOptions = {
    // Connection pool settings
    maxPoolSize: 20, // Maintain up to 20 socket connections
    minPoolSize: 5,  // Maintain a minimum of 5 socket connections
    maxIdleTimeMS: 30000, // Close connections after 30 seconds of inactivity
    serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
    socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity

    // Write concern for better performance
    writeConcern: {
        w: 'majority',
        j: true,
        wtimeout: 10000
    },

    // Read preference for better performance
    readPreference: 'primaryPreferred',

    // Compression
    compressors: ['zlib'],

    // Connection timeout
    connectTimeoutMS: 10000,

    // Heartbeat frequency
    heartbeatFrequencyMS: 10000
};

// Connect to MongoDB with optimized settings
const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGO_URI || 'mongodb+srv://infoalgotwist_db_user:55zhwdorMn07uanx@cluster0.ejdcjld.mongodb.net/crm_dashboard';

        const conn = await mongoose.connect(mongoURI, dbOptions);

        console.log(`MongoDB Connected: ${conn.connection.host}`);

        // Connection event listeners for monitoring
        mongoose.connection.on('connected', () => {
            console.log('Mongoose connected to MongoDB');
        });

        mongoose.connection.on('error', (err) => {
            console.error('Mongoose connection error:', err);
        });

        mongoose.connection.on('disconnected', () => {
            console.log('Mongoose disconnected from MongoDB');
        });

        // Graceful shutdown
        process.on('SIGINT', async () => {
            await mongoose.connection.close();
            console.log('Mongoose connection closed through app termination');
            process.exit(0);
        });

        return conn;
    } catch (error) {
        console.error('Database connection error:', error);
        process.exit(1);
    }
};

// Get connection stats
const getConnectionStats = () => {
    const conn = mongoose.connection;
    return {
        readyState: conn.readyState,
        host: conn.host,
        port: conn.port,
        name: conn.name,
        collections: Object.keys(conn.collections).length
    };
};

// Health check for database
const checkDatabaseHealth = async () => {
    try {
        const stats = await mongoose.connection.db.stats();
        return {
            healthy: true,
            stats: {
                collections: stats.collections,
                dataSize: stats.dataSize,
                indexSize: stats.indexSize,
                storageSize: stats.storageSize
            }
        };
    } catch (error) {
        return {
            healthy: false,
            error: error.message
        };
    }
};

module.exports = {
    connectDB,
    getConnectionStats,
    checkDatabaseHealth
};
