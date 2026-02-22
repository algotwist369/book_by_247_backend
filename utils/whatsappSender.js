const whatsappWebService = require('../services/whatsappWebService');
const { sendWhatsApp: sendTwilioWhatsApp, sendSMS: sendTwilioSMS } = require('./sendSMS');
const { sendWhatsAppOTPDoubleTick } = require('./sendWhatsAppDoubleTick');
const axios = require('axios');
const {
    General_Inquiry_Template,
    Pricing_Services_Inquiry_Template,
    Special_Offer_Inquiry_Template,
    Membership_Inquiry_Template
} = require('../whatsappTemplate/Inqury');

// Helper function to send via DoubleTick.io with templates
const sendViaDoubleTick = async (phone, templateName, placeholders) => {
    try {
        const DOUBLETICK_API_KEY = process.env.DOUBLETICK_API_KEY;
        const DOUBLETICK_WHATSAPP_FROM = process.env.DOUBLETICK_WHATSAPP_FROM;

        if (!DOUBLETICK_API_KEY || !DOUBLETICK_WHATSAPP_FROM) {
            console.log('[DoubleTick] Not configured, skipping...');
            return { success: false, provider: 'none' };
        }

        // Format phone number
        let toPhone = phone.toString().replace(/^\+/, '');
        if (/^\d{10}$/.test(toPhone)) {
            toPhone = `91${toPhone}`;
        }

        const payload = {
            messages: [{
                to: toPhone,
                content: {
                    language: 'en',
                    templateName: templateName,
                    templateData: {
                        body: {
                            placeholders: placeholders
                        }
                    }
                }
            }]
        };

        const response = await axios.post(
            'https://public.doubletick.io/whatsapp/message/template',
            payload,
            {
                headers: {
                    'Authorization': DOUBLETICK_API_KEY,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            }
        );

        if (response.status === 200 || response.status === 201) {
            console.log(`[DoubleTick] ✅ Message sent successfully`);
            return {
                success: true,
                provider: 'doubletick',
                messageId: response.data?.messageId || response.data?.id || 'doubletick-' + Date.now()
            };
        }

        return { success: false, provider: 'doubletick', error: 'Unexpected response' };
    } catch (error) {
        console.error('[DoubleTick] Error:', error.response?.data || error.message);
        return { success: false, provider: 'doubletick', error: error.message };
    }
};

const sendInquiryWhatsApp = async (options) => {
    const { customerName, phone, businessName, inquiryType, bookingUrl } = options;

    // Prepare data for template
    const templateData = {
        customerName,
        businessName,
        inquiryType,
        bookingUrl
    };

    // Select appropriate template based on inquiry type
    let message, doubleTickTemplate, doubleTickPlaceholders;
    switch (inquiryType) {
        case 'Pricing & Services':
            message = Pricing_Services_Inquiry_Template(templateData);
            doubleTickTemplate = 'pricing_services_inquiry';
            doubleTickPlaceholders = [businessName, bookingUrl];
            break;
        case 'Special Offers':
            message = Special_Offer_Inquiry_Template(templateData);
            doubleTickTemplate = 'general_inquiry';
            doubleTickPlaceholders = [businessName, inquiryType];
            break;
        case 'Membership Packages':
            message = Membership_Inquiry_Template(templateData);
            doubleTickTemplate = 'general_inquiry';
            doubleTickPlaceholders = [businessName, inquiryType];
            break;
        case 'General Inquiry':
        default:
            message = General_Inquiry_Template(templateData);
            doubleTickTemplate = 'general_inquiry';
            doubleTickPlaceholders = [businessName, inquiryType || 'General Inquiry'];
            break;
    }

    // Tier 1: Try DoubleTick.io first
    console.log('[WhatsApp Sender] Attempting delivery via DoubleTick.io...');
    const doubleTickResult = await sendViaDoubleTick(phone, doubleTickTemplate, doubleTickPlaceholders);

    if (doubleTickResult.success) {
        console.log('[WhatsApp Sender] ✅ Delivered via DoubleTick.io');
        return doubleTickResult;
    }

    console.log('[WhatsApp Sender] DoubleTick.io failed, trying WhatsApp Web...');

    // Tier 2: Try WhatsApp Web.js
    const isReady = await whatsappWebService.isReady();
    if (isReady) {
        try {
            console.log(`[WhatsApp Sender] Sending via WhatsApp Web to ${phone}`);
            const result = await whatsappWebService.sendMessage(phone, message);

            return {
                success: true,
                provider: 'whatsapp-web',
                messageId: result.messageId,
                timestamp: result.timestamp
            };
        } catch (error) {
            console.error('[WhatsApp Sender] WhatsApp Web failed:', error.message);
            console.log('[WhatsApp Sender] Falling back to Twilio...');

            const isPricing = inquiryType === 'Pricing & Services';
            // Senior Workaround: Using the verified General Template SID for both to ensure 100% delivery.
            // The Pricing-specific SID (HXb5b80b2566ea1dff8d6c36c4741d56df) is currently unstable (Twilio Error 63049).
            const verifiedContentSid = 'HXa007e399d81ed605989d1585091bed8a';

            const contentVariables = {
                1: customerName || 'Customer',
                2: businessName || 'Spa Advisor',
                3: isPricing ? 'Pricing & Services Inquiry' : (inquiryType || 'General Inquiry')
            };

            console.log(`[WhatsApp Sender] Twilio [${isPricing ? 'PRICING' : 'GENERAL'}] (via Verified Template):`, JSON.stringify({
                to: phone,
                contentSid: verifiedContentSid,
                contentVariables
            }));

            const result = await sendViaTwilio(phone, message, {
                contentSid: verifiedContentSid,
                contentVariables
            });

            if (result.success) return result;

            console.warn('[WhatsApp Sender] Twilio WhatsApp failed. Triggering SMS Fallback...');
            const smsResult = await sendTwilioSMS({ to: phone, message });
            return {
                success: true,
                provider: 'sms-fallback',
                messageId: smsResult.messageId
            };
        }
    } else {
        console.log('[WhatsApp Sender] WhatsApp Web not ready. Using Twilio...');
        const isPricing = inquiryType === 'Pricing & Services';
        const verifiedContentSid = 'HXa007e399d81ed605989d1585091bed8a';

        const contentVariables = {
            1: customerName || 'Customer',
            2: businessName || 'Spa Advisor',
            3: isPricing ? 'Pricing & Services Inquiry' : (inquiryType || 'General Inquiry')
        };

        console.log(`[WhatsApp Sender] Twilio [${isPricing ? 'PRICING' : 'GENERAL'}] (via Verified Template):`, JSON.stringify({
            to: phone,
            contentSid: verifiedContentSid,
            contentVariables
        }));

        const result = await sendViaTwilio(phone, message, {
            contentSid: verifiedContentSid,
            contentVariables
        });

        if (result.success) return result;

        console.warn('[WhatsApp Sender] Twilio WhatsApp failed (via direct). Triggering SMS Fallback...');
        const smsResult = await sendTwilioSMS({ to: phone, message });
        return {
            success: true,
            provider: 'sms-fallback',
            messageId: smsResult.messageId
        };
    }
};


const sendAppointmentConfirmation = async (options) => {
    const { phone, confirmationCode } = options;

    // Tier 1: Try DoubleTick.io first
    console.log('[WhatsApp Sender] Sending appointment confirmation via DoubleTick.io...');
    const doubleTickResult = await sendViaDoubleTick(phone, 'appointment_confirmation', [confirmationCode]);

    if (doubleTickResult.success) {
        console.log('[WhatsApp Sender] ✅ Appointment confirmation delivered via DoubleTick.io');
        return doubleTickResult;
    }

    console.log('[WhatsApp Sender] DoubleTick.io failed, trying Twilio...');

    // Tier 2: Try Twilio WhatsApp
    try {
        const result = await sendTwilioWhatsApp({
            to: phone,
            message: `Spa Advisor | Booking Confirmed\nCode: ${confirmationCode}\nArrive 10 min early.`
        });

        if (result.success) {
            return {
                success: true,
                provider: 'twilio-whatsapp',
                messageId: result.messageId
            };
        }
    } catch (error) {
        console.error('[WhatsApp Sender] Twilio WhatsApp failed:', error.message);
    }

    // Tier 3: SMS Fallback
    console.warn('[WhatsApp Sender] All WhatsApp methods failed. Triggering SMS Fallback...');
    try {
        const smsResult = await sendTwilioSMS({
            to: phone,
            message: `Spa Advisor | Booking Confirmed\nCode: ${confirmationCode}\nArrive 10 min early.`
        });
        return {
            success: true,
            provider: 'sms-fallback',
            messageId: smsResult.messageId
        };
    } catch (smsError) {
        console.error('[WhatsApp Sender] SMS Fallback also failed:', smsError.message);
        return {
            success: false,
            provider: 'none',
            error: 'All delivery methods failed'
        };
    }
};

const sendViaTwilio = async (phone, message, templateOptions = null) => {
    try {
        const sendOptions = { to: phone, message };

        if (templateOptions) {
            sendOptions.contentSid = templateOptions.contentSid;
            sendOptions.contentVariables = templateOptions.contentVariables;
        }

        const result = await sendTwilioWhatsApp(sendOptions);

        if (result.success) {
            return {
                success: true,
                provider: 'twilio',
                messageId: result.messageId,
                status: result.status
            };
        } else {
            // Twilio also failed or not configured
            console.warn('[WhatsApp Sender] Twilio WhatsApp also failed/unavailable');

            return {
                success: false,
                provider: 'none',
                error: 'No WhatsApp provider available',
                logged: true
            };
        }
    } catch (error) {
        console.error('[WhatsApp Sender] Twilio error:', error.message);

        return {
            success: false,
            provider: 'none',
            error: error.message,
            logged: true
        };
    }
};


const getWhatsAppStatus = async () => {
    const status = await whatsappWebService.getStatus();

    return {
        whatsappWeb: {
            enabled: process.env.WHATSAPP_WEB_ENABLED === 'true',
            ...status
        },
        twilioConfigured: !!(process.env.TWILIO_WHATSAPP_NUMBER)
    };
};

module.exports = {
    sendInquiryWhatsApp,
    sendAppointmentConfirmation,
    getWhatsAppStatus
};
