const nodemailer = require('nodemailer');
const path = require('path');


const TEMPLATE_MAP = {
    'appointment_confirmation': 'appointmentConfirmation',
    'appointment_reminder': 'appointmentReminder',
    'promotional_offer': 'promotionalOffer',
    'new_booking_admin': 'newBookingAdmin',
    'new_booking_manager': 'newBookingManager',
    'new_inquiry_admin': 'newInquiryAdmin',
    'new_inquiry_manager': 'newInquiryManager',
    'appointment_cancelled': 'appointmentCancelled',
    'appointment_rescheduled': 'appointmentRescheduled',
    'appointment_status_update': 'appointmentStatusUpdate',
    'appointment_completed': 'appointmentCompleted',
    'birthday_greeting': 'birthdayGreeting',
    'anniversary_greeting': 'anniversaryGreeting',
    're_engagement': 'reEngagement'
};

// Singleton transporter instance
let transporterInstance = null;

// Queue Configuration
const QUEUE_CONCURRENCY = 5; // Process 5 emails at a time
const QUEUE_DELAY = 100; // Small delay between batches to relieve event loop
const emailQueue = [];
let isProcessingQueue = false;

const getTransporter = () => {
    if (transporterInstance) return transporterInstance;

    const smtpUser = process.env.SMTP_USER || process.env.EMAIL_USER;
    const smtpPass = process.env.SMTP_PASS || process.env.EMAIL_PASS;

    if (!smtpUser || !smtpPass) {
        if (!global.mockEmailWarned) {
            console.warn('⚠️ EMAIL: Credentials missing. Emails will be MOCKED.');
            global.mockEmailWarned = true;
        }
        return null; // Mock mode
    }

    const transportConfig = process.env.SMTP_HOST
        ? {
            pool: true, // Enable pooling for high performance
            maxConnections: 5,
            maxMessages: 100,
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
            auth: { user: smtpUser, pass: smtpPass },
            tls: { rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED === 'true' }
        }
        : {
            service: process.env.EMAIL_SERVICE || 'gmail',
            auth: { user: smtpUser, pass: smtpPass },
            tls: { rejectUnauthorized: false }
        };

    transporterInstance = nodemailer.createTransport(transportConfig);

    transporterInstance.verify((error) => {
        if (error) {
            console.error('❌ EMAIL: Connection failed:', error.message);
            transporterInstance = null;
        } else {
            console.log('✅ EMAIL: Ready (Pooled Connection)');
        }
    });

    return transporterInstance;
};

/**
 * Compile template string
 */
const compileTemplate = (templateStr, data) => {
    if (!templateStr) return '';
    return templateStr.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
        return data[key] !== undefined && data[key] !== null ? data[key] : '';
    });
};

/**
 * Process the email queue
 */
const processQueue = async () => {
    if (isProcessingQueue || emailQueue.length === 0) return;
    isProcessingQueue = true;

    try {
        const batch = emailQueue.splice(0, QUEUE_CONCURRENCY);
        const transporter = getTransporter();

        if (!transporter) {
            // Mock mode: Log batch and resolve instantly
            batch.forEach(item => {
                // Simplified logging for high concurrency
                console.log(`📧 MOCK SENT to ${item.options.to} | Subject: ${item.options.subject}`);
                item.resolve({ success: true, mock: true, messageId: `mock-${Date.now()}`, response: 'Logged' });
            });
        } else {
            // Real Send
            await Promise.all(batch.map(async (item) => {
                try {
                    const info = await transporter.sendMail(item.options);
                    item.resolve({ success: true, messageId: info.messageId, response: info.response });
                } catch (err) {
                    console.error(`❌ EMAIL FAILED to ${item.options.to}:`, err.message);
                    item.resolve({ success: false, error: err.message }); // Resolve to strictly avoid crash
                }
            }));
        }
    } catch (criticalErr) {
        console.error('❌ CRITICAL QUEUE ERROR:', criticalErr);
    } finally {
        isProcessingQueue = false;
        if (emailQueue.length > 0) {
            setTimeout(processQueue, QUEUE_DELAY);
        }
    }
};

/**
 * Enqueue email for sending
 */
const enqueueEmail = (mailOptions) => {
    return new Promise((resolve, reject) => {
        emailQueue.push({ options: mailOptions, resolve, reject });
        processQueue();
    });
};

/**
 * Send email (Queued)
 */
const sendMail = async (options) => {
    const mailOptions = {
        from: process.env.EMAIL_FROM || process.env.SMTP_USER || process.env.EMAIL_USER,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        attachments: options.attachments || []
    };

    return enqueueEmail(mailOptions);
};

/**
 * Send bulk emails
 */
const sendBulkMail = async (emails) => {
    // Simply map to individual queued calls
    return Promise.all(emails.map(email => sendMail(email)));
};

/**
 * Send email using a predefined template
 */
const sendTemplateMail = async (options) => {
    const { to, template, data = {} } = options;

    try {
        const templateName = TEMPLATE_MAP[template] || template;
        const templatePath = path.join(__dirname, '..', 'emailTemplates', `${templateName}.js`);

        let templateModule;
        try {
            templateModule = require(templatePath);
        } catch (err) {
            console.error(`❌ EMAIL: Template missing: ${templateName}`);
            return { success: false, error: 'Template not found' };
        }

        const templateData = { year: new Date().getFullYear(), ...data };
        const subjectWrapper = compileTemplate(templateModule.subject, templateData);
        const htmlWrapper = compileTemplate(templateModule.html, templateData);

        return sendMail({
            to,
            subject: subjectWrapper,
            html: htmlWrapper
        });

    } catch (error) {
        console.error(`❌ EMAIL ERROR (${template}):`, error.message);
        return { success: false, error: error.message };
    }
};

module.exports = {
    sendMail,
    sendBulkMail,
    sendTemplateMail
};