const nodemailer = require("nodemailer");
const twilio = require("twilio");

// ---------- EMAIL ----------
const emailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: process.env.SMTP_PORT || 587,
    secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465', // true for 465
    auth: {
        user: process.env.SMTP_USER || process.env.EMAIL_USER,
        pass: process.env.SMTP_PASS || process.env.EMAIL_PASS,
    },
    tls: {
        // Allow self-signed certificates (set SMTP_REJECT_UNAUTHORIZED=true to enforce strict validation)
        rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED === 'true'
    }
});

// Verify transporter (optional)
emailTransporter.verify((err, success) => {
    if (err) {
        console.error("❌ Email transporter error:", err);
    } else {
        console.log("✅ Email transporter ready");
    }
});

// ---------- SMS ----------
const smsClient = twilio(
    process.env.TWILIO_ACCOUNT_SID || "your_TWILIO_ACCOUNT_SID",
    process.env.TWILIO_AUTH_TOKEN || "your_twilio_auth"
);

module.exports = {
    emailTransporter,
    smsClient,
};
