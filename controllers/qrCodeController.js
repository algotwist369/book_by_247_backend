const { redis } = require('../config/redis');

/**
 * Get QR code for WhatsApp authentication
 * Admin only
 */
const getQRCode = async (req, res) => {
    try {
        let qrCode = await redis.get('wa:qr');

        // If QR not immediately available, wait for it (polling Redis for up to 45s)
        if (!qrCode) {
            console.log('[QR Controller] QR not cached in Redis, waiting...');

            const startTime = Date.now();
            while (Date.now() - startTime < 45000) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                qrCode = await redis.get('wa:qr');
                if (qrCode) break;

                // Also check if status became connected
                const status = await redis.get('wa:status');
                if (status === 'CONNECTED' || status === 'AUTHENTICATED') {
                    return res.status(200).json({
                        success: true,
                        alreadyConnected: true,
                        message: 'WhatsApp is already connected'
                    });
                }
            }
        }

        if (qrCode) {
            return res.status(200).json({
                success: true,
                qrCode,
                message: 'Scan this QR code with your WhatsApp mobile app'
            });
        }

        // If still no QR code, something might be stuck. Trigger re-init.
        console.log('[QR Controller] QR generation timed out. Triggering service reload...');
        redis.publish('wa:cmd', JSON.stringify({ action: 'reinit' }));

        return res.status(503).json({
            success: false,
            message: 'WhatsApp service is reloading. Please click "Refresh QR Code" again in 10 seconds.',
            shouldRetry: true
        });

    } catch (error) {
        console.error('[QR Controller] Error fetching QR:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * Get WhatsApp connection status
 * Admin only
 */
const getConnectionStatus = async (req, res) => {
    try {
        const state = await redis.get('wa:status');
        const connected = state === 'CONNECTED' || state === 'AUTHENTICATED';
        const qrAvailable = await redis.exists('wa:qr');

        res.status(200).json({
            success: true,
            connected,
            state: state || 'UNKNOWN',
            qrAvailable: !!qrAvailable
        });
    } catch (error) {
        console.error('[QR Controller] Error fetching status:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * Logout from WhatsApp (disconnect session)
 * Admin only
 */
const logout = async (req, res) => {
    try {
        redis.publish('wa:cmd', JSON.stringify({ action: 'logout' }));

        res.status(200).json({
            success: true,
            message: 'WhatsApp logged out successfully. Scan QR code to reconnect.'
        });
    } catch (error) {
        console.error('[QR Controller] Logout error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * Force reset connection (Connect New WhatsApp)
 * Clears session and restarts service
 */
const resetConnection = async (req, res) => {
    try {
        console.log('[QR Controller] Manual reset requested');
        // Trigger re-init via Redis
        redis.publish('wa:cmd', JSON.stringify({ action: 'reinit' }));

        res.status(200).json({
            success: true,
            message: 'WhatsApp service is resetting. Please wait 10-15 seconds then refresh QR.',
            shouldRetry: true
        });
    } catch (error) {
        console.error('[QR Controller] Reset error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

module.exports = {
    getQRCode,
    getConnectionStatus,
    logout,
    resetConnection
};
