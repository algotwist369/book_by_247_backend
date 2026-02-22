// sendSMS.js - SMS sending utility using Twilio

// CRITICAL: Load environment variables FIRST before initializing Twilio
require('dotenv').config();

const twilio = require('twilio');

// Initialize Twilio client (only if credentials are available)
let client = null;
const accountSid = process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromPhone = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_PHONE;

if (accountSid && authToken) {
    client = twilio(accountSid, authToken);
    console.log('✅ Twilio client initialized successfully');
} else {
    console.warn("⚠️ Twilio Credentials Missing:",
        !accountSid ? "Account SID/TWILIO_SID" : "",
        !authToken ? "Auth Token" : ""
    );
}

const sendSMS = async (options) => {
    try {
        // Check if Twilio is configured
        if (!client || !fromPhone) {
            console.warn('Twilio not fully configured',
                !client ? "(Client init failed)" : "",
                !fromPhone ? "(Missing Phone Number)" : ""
            );
            console.warn('Twilio not configured, SMS will be logged instead of sent');
            console.log(`SMS to ${options.to}: ${options.message}`);
            return {
                success: true,
                messageId: 'mock-' + Date.now(),
                status: 'sent',
                mock: true
            };
        }

        // Format phone number: default to Indian (+91) if 10 digits
        let toPhone = options.to;
        if (toPhone && /^\d{10}$/.test(toPhone.toString())) {
            toPhone = `+91${toPhone}`;
        }

        console.log(`[SMS] Sending to: ${toPhone} | From: ${options.from || fromPhone}`);

        const result = await client.messages.create({
            body: options.message,
            from: options.from || fromPhone,
            to: toPhone
        });

        return {
            success: true,
            messageId: result.sid,
            status: result.status
        };
    } catch (error) {
        console.error('SMS sending failed:', error);
        throw new Error(`SMS sending failed: ${error.message}`);
    }
};

/**
 * Send bulk SMS
 * @param {Array} messages - Array of SMS options
 * @returns {Promise} - Send results
 */
const sendBulkSMS = async (messages) => {
    const results = [];

    for (const message of messages) {
        try {
            const result = await sendSMS(message);
            results.push({ success: true, phone: message.to, result });
        } catch (error) {
            results.push({ success: false, phone: message.to, error: error.message });
        }
    }

    return results;
};

const sendTemplateSMS = async (options) => {
    const templates = {
        appointment_confirmation: `Dear {{customerName}}, your appointment with {{businessName}} is confirmed for {{appointmentDate}} at {{startTime}}. Confirmation Code: {{confirmationCode}}. Please arrive 10 minutes early.`,
        appointment_reminder: `Reminder: You have an appointment with {{businessName}} tomorrow at {{startTime}}. Services: {{services}}. We look forward to seeing you!`,
        promotional_offer: `Special offer from {{businessName}}: {{offerDescription}} Get {{discountText}}! Valid until {{expiryDate}}. Book now: {{actionUrl}}`,
        welcome: `Welcome to {{businessName}}! Thank you for choosing us. We're excited to serve you. For bookings, visit: {{businessUrl}}`,
        feedback_request: `Hi {{customerName}}, how was your recent visit to {{businessName}}? We'd love your feedback! Rate us: {{feedbackUrl}}`
    };

    const template = templates[options.template];
    if (!template) {
        throw new Error(`Template '${options.template}' not found`);
    }

    // Replace template variables
    let message = template;
    Object.keys(options.data).forEach(key => {
        const placeholder = `{{${key}}}`;
        message = message.replace(new RegExp(placeholder, 'g'), options.data[key]);
    });

    return sendSMS({
        to: options.to,
        message: message
    });
};

const sendWhatsApp = async (options) => {
    try {
        const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER;

        if (!whatsappNumber) {
            console.warn('[WhatsApp] TWILIO_WHATSAPP_NUMBER not set. Skipping WhatsApp message.');
            return {
                success: false,
                status: 'skipped',
                message: 'WhatsApp not configured'
            };
        }

        // Format phone number: default to Indian (+91) if 10 digits
        let toPhone = options.to;
        if (toPhone && /^\d{10}$/.test(toPhone.toString())) {
            toPhone = `+91${toPhone}`;
        }

        // Ensure "whatsapp:" prefix isn't duplicated in toPhone if passed
        if (toPhone.startsWith('whatsapp:')) {
            toPhone = toPhone.replace('whatsapp:', '');
        }

        let fromPhone = whatsappNumber;
        if (fromPhone.startsWith('whatsapp:')) {
            fromPhone = fromPhone.replace('whatsapp:', '');
        }

        const messageConfig = {
            from: `whatsapp:${fromPhone}`,
            to: `whatsapp:${toPhone}`,
        };

        if (options.contentSid) {
            messageConfig.contentSid = options.contentSid;
            // Ensure contentVariables is a stringified JSON
            messageConfig.contentVariables = typeof options.contentVariables === 'string'
                ? options.contentVariables
                : JSON.stringify(options.contentVariables || {});
        } else {
            messageConfig.body = options.message;
            messageConfig.mediaUrl = options.media || [];
        }

        const result = await client.messages.create(messageConfig);

        return {
            success: true,
            messageId: result.sid,
            status: result.status
        };
    } catch (error) {
        // Handle invalid / misconfigured WhatsApp sender numbers gracefully
        // 63007: Channel not found
        // 21211: Invalid 'To' phone number
        // 21212: Invalid 'From' phone number, shortcode, or alphanumeric sender ID
        if (error.code === 63007 || error.code === 21211 || error.code === 21212) {
            console.warn('[WhatsApp] Sender not valid or not configured. Skipping WhatsApp.', error.message);
            return {
                success: false,
                status: 'skipped (invalid sender)',
                message: 'WhatsApp sender not valid'
            };
        }
        console.error('WhatsApp sending failed:', error);
        throw new Error(`WhatsApp sending failed: ${error.message}`);
    }
};

const sendTemplateWhatsApp = async (options) => {
    const templates = {
        appointment_confirmation: `🎉 *Appointment Confirmed!*

Dear {{customerName}},

Your appointment with *{{businessName}}* has been confirmed!

📅 *Date:* {{appointmentDate}}
⏰ *Time:* {{startTime}} - {{endTime}}
💼 *Services:* {{services}}
🔢 *Confirmation Code:* {{confirmationCode}}

Please arrive 10 minutes before your appointment time.

Thank you for choosing {{businessName}}! 🙏`,

        promotional_offer: `🎁 *Special Offer from {{businessName}}!*

Dear {{customerName}},

We have an exclusive offer just for you!

{{offerDescription}}

💰 *{{discountText}}*

⏰ *Valid until:* {{expiryDate}}

Book now: {{actionUrl}}

Don't miss out on this amazing deal! ✨`,

        appointment_reminder: `⏰ *Appointment Reminder*

Dear {{customerName}},

This is a friendly reminder about your upcoming appointment with *{{businessName}}*.

📅 *Date:* {{appointmentDate}}
⏰ *Time:* {{startTime}} - {{endTime}}
💼 *Services:* {{services}}

We look forward to seeing you! 😊`
    };

    const template = templates[options.template];
    if (!template) {
        throw new Error(`Template '${options.template}' not found`);
    }

    // Replace template variables
    let message = template;
    Object.keys(options.data).forEach(key => {
        const placeholder = `{{${key}}}`;
        message = message.replace(new RegExp(placeholder, 'g'), options.data[key]);
    });

    return sendWhatsApp({
        to: options.to,
        message: message
    });
};

const getSMSStatus = async (messageId) => {
    try {
        const message = await client.messages(messageId).fetch();
        return {
            success: true,
            status: message.status,
            errorCode: message.errorCode,
            errorMessage: message.errorMessage
        };
    } catch (error) {
        console.error('Failed to get SMS status:', error);
        throw new Error(`Failed to get SMS status: ${error.message}`);
    }
};

module.exports = {
    sendSMS,
    sendBulkSMS,
    sendTemplateSMS,
    sendWhatsApp,
    sendTemplateWhatsApp,
    getSMSStatus
};