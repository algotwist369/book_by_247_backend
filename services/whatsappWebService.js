const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

const { redis } = require('../config/redis');

/**
 * WhatsApp Web Service - Manages single admin WhatsApp session for all businesses
 * Features: Persistent session, auto-reconnect, keep-alive
 */
class WhatsAppWebService extends EventEmitter {
    constructor() {
        super();
        this.client = null;
        this.qrCode = null;
        this.isInitialized = false;
        this.isClientReady = false;
        this.retryCount = 0;
        this.maxRetries = 5;
        this.sessionName = process.env.WHATSAPP_WEB_SESSION_NAME || 'crm-whatsapp';
        this.subClient = null; // Track Redis subscriber connection
    }

    /**
     * Initialize WhatsApp client with persistent LocalAuth
     */
    async initialize() {
        if (this.isInitialized) {
            console.log('[WhatsApp Web] Client already initialized');
            return;
        }

        const enabled = process.env.WHATSAPP_WEB_ENABLED === 'true';
        if (!enabled) {
            console.log('[WhatsApp Web] Service disabled via WHATSAPP_WEB_ENABLED');
            return;
        }

        try {
            console.log('[WhatsApp Web] Initializing client...');

            // Ensure clean slate
            if (this.client) {
                try {
                    await this.client.destroy();
                } catch (e) { /* ignore */ }
            }

            this.client = new Client({
                authStrategy: new LocalAuth({
                    clientId: this.sessionName,
                    dataPath: './.wwebjs_auth'
                }),
                puppeteer: {
                    headless: true,
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-accelerated-2d-canvas',
                        '--no-first-run',
                        '--no-zygote',
                        '--disable-gpu',
                        '--disable-extensions'
                    ]
                }
            });

            this._setupEventHandlers();

            // Set flag immediately to prevent race
            this.isInitialized = true;

            await this.client.initialize();

        } catch (error) {
            console.error('[WhatsApp Web] Initialization failed:', error.message);
            this.isInitialized = false; // Reset on failure
            this.emit('error', error);
        }
    }

    /**
     * Force re-initialization of the client
     */
    async reinitialize() {
        // Force clean slate
        this.isInitialized = false;
        this.isClientReady = false;
        this.qrCode = null;

        if (this.client) {
            try {
                console.log('[WhatsApp Web] destroying client...');
                await this.client.destroy();
            } catch (e) { console.error('Destroy failed', e); }
            this.client = null;
        }

        // Close Redis subscriber before restarting
        if (this.subClient) {
            try {
                console.log('[WhatsApp Web] Closing Redis subClient...');
                await this.subClient.quit();
                this.subClient = null;
            } catch (e) { /* ignore */ }
        }

        // Clean up session data
        const authPath = './.wwebjs_auth';
        if (fs.existsSync(authPath)) {
            try {
                console.log('[WhatsApp Web] Deleting session data...');
                fs.rmSync(authPath, { recursive: true, force: true });
            } catch (e) {
                console.error('[WhatsApp Web] Failed to delete session data:', e.message);
            }
        }

        // Wait a bit before restart
        await new Promise(resolve => setTimeout(resolve, 2000));

        await this.initialize();
    }

    /**
     * Setup event handlers for connection lifecycle
     */
    _setupEventHandlers() {
        this.client.on('qr', async (qr) => {
            console.log('[WhatsApp Web] QR Code received. Scan to authenticate.');
            try {
                this.qrCode = await QRCode.toDataURL(qr);
                this.emit('qr', this.qrCode);
                await redis.set('wa:qr', this.qrCode);
                await redis.set('wa:status', 'QR_READY');
                await redis.expire('wa:qr', 60);
            } catch (error) {
                console.error('[WhatsApp Web] QR generation failed:', error);
            }
        });

        this.client.on('authenticated', () => {
            console.log('[WhatsApp Web] ✅ Authenticated successfully');
            this.qrCode = null;
            this.retryCount = 0;
            redis.del('wa:qr');
            redis.set('wa:status', 'AUTHENTICATED');
            this.emit('authenticated');
        });

        this.client.on('auth_failure', (msg) => {
            console.error('[WhatsApp Web] ❌ Authentication failed:', msg);
            this.qrCode = null;
            redis.del('wa:qr');
            redis.set('wa:status', 'AUTH_FAILURE');
            this.emit('auth_failure', msg);
        });

        this.client.on('ready', () => {
            console.log('[WhatsApp Web] 🚀 Client ready! Session is active.');
            this.isClientReady = true;
            this.retryCount = 0;
            redis.set('wa:status', 'CONNECTED');
            this.emit('ready');
            this._startKeepAlive();
        });

        this.client.on('disconnected', (reason) => {
            console.log('[WhatsApp Web] Disconnected. Reason:', reason);
            this.isClientReady = false;
            redis.set('wa:status', 'DISCONNECTED');
            this.emit('disconnected', reason);

            if (reason !== 'LOGOUT') {
                this._handleReconnect();
            }
        });

        this.client.on('message_create', (msg) => {
            if (msg.fromMe) {
                console.log(`[WhatsApp Web] Message sent to ${msg.to}`);
            }
        });

        this.client.on('loading_screen', (percent, message) => {
            console.log(`[WhatsApp Web] Loading... ${percent}%`);
        });
    }

    _handleReconnect() {
        if (this.retryCount >= this.maxRetries) {
            console.error('[WhatsApp Web] Max retries reached. Please restart manually.');
            this.emit('max_retries_reached');
            return;
        }

        this.retryCount++;
        const delay = Math.min(1000 * Math.pow(2, this.retryCount), 60000);

        console.log(`[WhatsApp Web] Reconnecting in ${delay / 1000}s (Attempt ${this.retryCount}/${this.maxRetries})`);

        setTimeout(() => {
            console.log('[WhatsApp Web] Attempting to reconnect...');
            if (this.client) {
                this.client.initialize().catch((err) => {
                    console.error('[WhatsApp Web] Reconnect failed:', err.message);
                });
            }
        }, delay);
    }

    _startKeepAlive() {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
        }

        this.keepAliveInterval = setInterval(async () => {
            if (this.isClientReady && this.client) {
                try {
                    const state = await this.client.getState();
                    if (state !== 'CONNECTED') {
                        console.warn('[WhatsApp Web] Connection state:', state);
                    }
                } catch (error) {
                    console.error('[WhatsApp Web] Keep-alive check failed:', error.message);
                }
            }
        }, 30000);
    }

    async sendMessage(phone, message) {
        if (!this.isClientReady) {
            throw new Error('WhatsApp client not ready. Check connection status.');
        }

        try {
            let formattedPhone = phone.toString().replace(/\D/g, '');
            if (formattedPhone.length === 10) {
                formattedPhone = '91' + formattedPhone;
            }
            formattedPhone = formattedPhone.replace(/^\+/, '');

            const chatId = `${formattedPhone}@c.us`;
            console.log(`[WhatsApp Web] Sending message to ${chatId}`);

            const isRegistered = await this.client.isRegisteredUser(chatId);
            if (!isRegistered) {
                throw new Error('Number not registered on WhatsApp');
            }

            let chat;
            try {
                chat = await this.client.getChatById(chatId);
            } catch (err) {
                const numberId = await this.client.getNumberId(chatId);
                if (numberId) {
                    chat = await this.client.getChatById(numberId._serialized);
                }
            }

            let result;
            if (chat) {
                await chat.clearState();
                result = await chat.sendMessage(message);
            } else {
                result = await this.client.sendMessage(chatId, message);
            }

            return {
                success: true,
                messageId: result.id.id,
                timestamp: result.timestamp
            };

        } catch (error) {
            console.error('[WhatsApp Web] Message send failed:', error.message);
            throw new Error(`Failed to send WhatsApp message: ${error.message}`);
        }
    }

    async isReady() {
        if (this.isClientReady && this.client) {
            return true;
        }

        if (this.client) {
            try {
                const state = await this.client.getState();
                if (state === 'CONNECTED') {
                    this.isClientReady = true;
                    return true;
                }
            } catch (error) { /* ignore */ }
        }

        return false;
    }

    getQR() {
        return this.qrCode;
    }

    async waitForQR(timeoutMs = 45000) {
        if (this.qrCode) return this.qrCode;
        if (this.isClientReady) return null;

        console.log(`[WhatsApp Web] Waiting for QR (Timeout: ${timeoutMs}ms)...`);

        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                cleanup();
                console.log('[WhatsApp Web] WaitForQR timed out.');
                resolve(null);
            }, timeoutMs);

            const onQr = (qr) => {
                cleanup();
                resolve(qr);
            };

            const onReady = () => {
                cleanup();
                resolve(null);
            };

            const onClose = () => {
                cleanup();
                resolve(null);
            };

            const onError = (err) => {
                cleanup();
                console.error('[WhatsApp Web] Init Error caught in waitForQR:', err.message);
                resolve({ error: err.message });
            };

            const cleanup = () => {
                this.off('qr', onQr);
                this.off('ready', onReady);
                this.off('disconnected', onClose);
                this.off('error', onError);
                clearTimeout(timeout);
            };

            this.on('qr', onQr);
            this.on('ready', onReady);
            this.on('disconnected', onClose);
            this.on('error', onError);
        });
    }

    async getStatus() {
        if (!this.client) {
            return { connected: false, state: 'NOT_INITIALIZED' };
        }

        try {
            const state = await this.client.getState();
            const isConnected = state === 'CONNECTED' || this.isClientReady;

            return {
                connected: isConnected,
                state: state || (this.isClientReady ? 'CONNECTED' : 'DISCONNECTED'),
                qrAvailable: !!this.qrCode,
                retryCount: this.retryCount
            };
        } catch (error) {
            return {
                connected: false,
                state: 'ERROR',
                error: error.message
            };
        }
    }

    async logout() {
        if (!this.client) return;
        try {
            console.log('[WhatsApp Web] Logging out...');
            await this.client.logout();
            this.isClientReady = false;
            this.qrCode = null;
            console.log('[WhatsApp Web] Logged out successfully');
        } catch (error) {
            console.error('[WhatsApp Web] Logout failed:', error.message);
            throw error;
        }
    }

    async destroy() {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
        }

        if (this.client) {
            try {
                await this.client.destroy();
                console.log('[WhatsApp Web] Client destroyed gracefully');
            } catch (error) {
                console.error('[WhatsApp Web] Destroy error:', error.message);
            }
        }

        if (this.subClient) {
            try {
                await this.subClient.quit();
                console.log('[WhatsApp Web] Redis subClient closed');
                this.subClient = null;
            } catch (e) { /* ignore */ }
        }

        this.isInitialized = false;
        this.isClientReady = false;
        this.client = null;
    }

    async startCommandListener() {
        // Don't start listener if WhatsApp is disabled
        const enabled = process.env.WHATSAPP_WEB_ENABLED === 'true';
        if (!enabled) {
            console.log('[WhatsApp Web] Command listener skipped (service disabled)');
            return;
        }

        try {
            if (!this.subClient) {
                this.subClient = redis.duplicate();
                this.subClient.on('error', (err) => {
                    console.error('[WhatsApp Web] Command Listener Redis Error:', err.message);
                });
            }

            await this.subClient.subscribe('wa:cmd');

            this.subClient.on('message', async (channel, message) => {
                if (channel !== 'wa:cmd') return;

                try {
                    const params = JSON.parse(message);
                    console.log(`[WhatsApp Web] Received command: ${params.action}`);

                    switch (params.action) {
                        case 'reinit':
                            await this.reinitialize();
                            break;
                        case 'logout':
                            await this.logout();
                            break;
                        case 'send':
                            if (params.phone && params.message) {
                                await this.sendMessage(params.phone, params.message);
                            }
                            break;
                    }
                } catch (e) {
                    console.error('[WhatsApp Web] Command execution error:', e);
                }
            });
            console.log('[WhatsApp Web] Command listener started');
        } catch (error) {
            console.error('[WhatsApp Web] Failed to start command listener:', error);
        }
    }
}

const whatsappWebService = new WhatsAppWebService();
module.exports = whatsappWebService;
