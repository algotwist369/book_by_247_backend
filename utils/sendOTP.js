const crypto = require('crypto');
const { sendMail } = require('./sendMail');
const { sendSMS, sendWhatsApp } = require('./sendSMS');
const { sendWhatsAppOTPDoubleTick } = require('./sendWhatsAppDoubleTick');


const OTP_LENGTH = parseInt(process.env.OTP_LENGTH, 10) || 4;
const OTP_TTL_MIN = parseInt(process.env.OTP_TTL_MIN, 10) || 5; // minutes
const OTP_SECRET = process.env.OTP_SECRET || 'otp-secret-change-me';


const generateOTP = () => {
    const otp = Array.from({ length: OTP_LENGTH })
        .map(() => Math.floor(Math.random() * 10))
        .join('');

    console.log("Generated OTP:", otp);

    const expiresAt = new Date(Date.now() + OTP_TTL_MIN * 60 * 1000).toISOString();
    const hash = crypto
        .createHmac('sha256', OTP_SECRET)
        .update(`${otp}.${expiresAt}`)
        .digest('hex');

    // Persist otpHash + expiresAt + recipient (phone/email) in DB (OTP collection)
    return {
        otp,
        expiresAt,
        otpHash: hash,
    };
}


const verifyOTP = (otp, otpHash, expiresAt) => {
    if (!otp || !otpHash || !expiresAt) return false;
    const now = new Date();
    // Allow for Date object or string
    const expDate = new Date(expiresAt);
    if (now > expDate) return false;

    // Use ISO string for hashing to match generateOTP
    const expString = expDate.toISOString();

    const computed = crypto
        .createHmac('sha256', OTP_SECRET)
        .update(`${otp}.${expString}`)
        .digest('hex');

    // constant-time compare to avoid timing attacks
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(otpHash));
}

const createAndSendOTP = async ({ mode, to, template }) => {
    const { otp, expiresAt, otpHash } = generateOTP();
    const message = template ? `${template} ${otp}` : `Your verification OTP is ${otp}. It expires in ${OTP_TTL_MIN} minutes.`;

    if (mode === 'sms') {
        try {
            await sendSMS({ to, message });
        } catch (error) {
            // If Twilio fails (auth error, etc), log for development
            if (error.message.includes('Authenticate') || error.message.includes('not fully configured')) {
                console.log(`[OTP] ⚠️  Twilio not configured. OTP would be sent to ${to}:`);
                console.log(`[OTP] 📱 OTP CODE: ${otp}`);
                console.log(`[OTP] ⏰ Expires: ${new Date(expiresAt).toLocaleString()}`);
                // Don't throw - allow OTP to be used
            } else {
                throw error; // Re-throw unexpected errors
            }
        }
    } else if (mode === 'whatsapp') {
        let otpDelivered = false;

        // Tier 1: Try DoubleTick.io first
        try {
            console.log(`[OTP] 🚀 Attempting WhatsApp delivery via DoubleTick.io to ${to}...`);
            const result = await sendWhatsAppOTPDoubleTick({
                to,
                otp
            });

            if (result && result.success === true) {
                console.log(`[OTP] ✅ DoubleTick.io delivery successful: ${result.messageId}`);
                otpDelivered = true;
            } else {
                const errorMsg = result?.message || 'DoubleTick.io not configured or failed';
                throw new Error(errorMsg);
            }
        } catch (doubleTickError) {
            console.warn(`[OTP] ⚠️  DoubleTick.io delivery failed: ${doubleTickError.message}`);
            console.log(`[OTP] 🔄 Falling back to Twilio WhatsApp...`);

            // Tier 2: Try Twilio WhatsApp as fallback
            try {
                console.log(`[OTP] Attempting Twilio WhatsApp delivery to ${to} using template HX9bd6...`);
                const twilioWhatsAppResult = await sendWhatsApp({
                    to,
                    contentSid: 'HX9bd6542a11a4b04ab43f99275a8d41ea',
                    contentVariables: { 1: otp }
                });

                if (twilioWhatsAppResult && twilioWhatsAppResult.success !== false) {
                    console.log(`[OTP] ✅ Twilio WhatsApp delivery successful: ${twilioWhatsAppResult.messageId}`);
                    otpDelivered = true;
                } else {
                    const errorMsg = twilioWhatsAppResult?.message || twilioWhatsAppResult?.error || 'Twilio WhatsApp delivery error';
                    throw new Error(errorMsg);
                }
            } catch (twilioWhatsAppError) {
                console.warn(`[OTP] ⚠️  Twilio WhatsApp delivery failed: ${twilioWhatsAppError.message}`);
                console.log(`[OTP] 🔄 Falling back to Twilio SMS...`);

                // Tier 3: Try Twilio SMS as final fallback
                try {
                    await sendSMS({ to, message });
                    console.log(`[OTP] ✅ SMS Fallback delivered successfully.`);
                    otpDelivered = true;
                } catch (smsError) {
                    // If SMS also fails due to auth, log OTP for development
                    if (smsError.message.includes('Authenticate') || smsError.message.includes('not fully configured')) {
                        console.log(`[OTP] ⚠️  All delivery methods failed - Twilio not configured.`);
                        console.log(`[OTP] 📱 OTP would be sent to ${to}:`);
                        console.log(`[OTP] 🔐 OTP CODE: ${otp}`);
                        console.log(`[OTP] ⏰ Expires: ${new Date(expiresAt).toLocaleString()}`);
                        otpDelivered = true; // Don't throw - allow OTP to be used in dev mode
                    } else {
                        throw smsError; // Re-throw unexpected errors
                    }
                }
            }
        }

        if (!otpDelivered) {
            throw new Error('Failed to deliver OTP through any available channel');
        }

    } else if (mode === 'email') {
        await sendMail({ to, subject: 'Your OTP', text: message });
    } else {
        throw new Error('Invalid mode for createAndSendOTP');
    }

    return { otp, expiresAt, otpHash };
}

module.exports = {
    generateOTP,
    verifyOTP,
    createAndSendOTP,
};
