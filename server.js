// Load environment variables reliably and quietly
require("dotenv").config({ quiet: true });

const http = require("http");
const { connectDB } = require("./config/database");
const { initializeSocket } = require("./config/socket");
const { startCampaignScheduler } = require("./utils/campaignScheduler");
const whatsappWebService = require("./services/whatsappWebService");
const { startGoogleSheetSync, stopGoogleSheetSync } = require("./services/googleSheetSyncService");
const { startPlanExpiryScheduler } = require("./utils/planExpiryScheduler");
const cluster = require('cluster');
const os = require('os');

const numCPUs = process.env.NODE_ENV === 'production' ? os.cpus().length : Math.min(os.cpus().length, 2);
const PORT = process.env.PORT || 9004;

if (cluster.isPrimary) {
    console.log(`🚀 Master process ${process.pid} is running`);
    console.log(`[Server] Cluster mode: Using ${numCPUs} workers`);

    // ================================================================
    // MASTER PROCESS - BACKGROUND SERVICES ONLY
    // ================================================================

    // Connect to MongoDB first (required for background services)
    connectDB().then(() => {
        console.log('✅ Master process connected to MongoDB');

        // 1. WhatsApp Web Service (Singleton)
        whatsappWebService.initialize()
            .then(() => whatsappWebService.startCommandListener())
            .catch(err => {
                console.error('[Server] WhatsApp initialization failed:', err.message);
            });

        // 2. Campaign Scheduler (Singleton)
        startCampaignScheduler();

        // 3. Google Sheets Sync (Singleton)
        startGoogleSheetSync();

        // 4. Plan Expiry Scheduler (Singleton)
        startPlanExpiryScheduler();
    }).catch(err => {
        console.error('❌ Master process failed to connect to MongoDB:', err.message);
        process.exit(1);
    });

    // Fork workers
    console.log(`Forking ${numCPUs} workers...`);
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    // Handle worker exit
    cluster.on('exit', (worker, code, signal) => {
        console.log(`❌ Worker ${worker.process.pid} died. Respawning...`);
        cluster.fork();
    });

    // Graceful shutdown for Master
    const shutdownMaster = async () => {
        console.log('Shutting down Master gracefully...');
        stopGoogleSheetSync();
        await whatsappWebService.destroy();
        process.exit(0);
    };

    process.on('SIGTERM', shutdownMaster);
    process.on('SIGINT', shutdownMaster);

} else {
    // ================================================================
    // WORKER PROCESS - HTTP & SOCKET SERVER
    // ================================================================

    // Async wrapper to ensure DB connects before starting server
    (async () => {
        try {
            // Load app here so it doesn't load in Master
            const app = require("./app");

            // Connect to MongoDB (each worker needs its own connection)
            await connectDB();
            console.log(`✅ Worker ${process.pid} connected to MongoDB`);

            // Create HTTP server
            const server = http.createServer(app);

            // Initialize Socket.IO (each worker handles its own sockets, synced via Redis Adapter)
            initializeSocket(server);

            server.listen(PORT, () => {
                console.log(`🟢 Worker ${process.pid} started on port ${PORT}`);
            });

            // Graceful shutdown for Worker
            const shutdownWorker = () => {
                console.log(`Worker ${process.pid} shutting down...`);
                server.close(() => {
                    process.exit(0);
                });
            };

            process.on('SIGTERM', shutdownWorker);
            process.on('SIGINT', shutdownWorker);
        } catch (err) {
            console.error(`❌ Worker ${process.pid} failed to start:`, err.message);
            process.exit(1);
        }
    })();
}