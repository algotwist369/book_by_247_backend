const Razorpay = require("razorpay");
const crypto = require("crypto");
const Business = require("../models/Business");
// Enhanced credential loading with comprehensive whitespace removal
const cleanCredential = (value) => {
    if (!value) return value;
    // Remove ALL whitespace characters including spaces, tabs, newlines, carriage returns
    return value.replace(/\s/g, '');
};

const RAZORPAY_KEY_ID = cleanCredential(process.env.RAZORPAY_KEY_ID);
const RAZORPAY_KEY_SECRET = cleanCredential(process.env.RAZORPAY_KEY_SECRET);

// Validate credentials
const validateCredentials = (silent = false) => {
    const errors = [];

    if (!RAZORPAY_KEY_ID) {
        errors.push('RAZORPAY_KEY_ID is missing from environment');
    } else if (!RAZORPAY_KEY_ID.startsWith('rzp_')) {
        errors.push(`RAZORPAY_KEY_ID has invalid format: ${RAZORPAY_KEY_ID}`);
    }

    if (!RAZORPAY_KEY_SECRET) {
        errors.push('RAZORPAY_KEY_SECRET is missing from environment');
    } else if (RAZORPAY_KEY_SECRET.length < 20) {
        errors.push(`RAZORPAY_KEY_SECRET seems too short (length: ${RAZORPAY_KEY_SECRET.length})`);
    }

    if (errors.length > 0 && !silent) {
        console.error(`[PaymentController] Credential validation failed:`);
        errors.forEach(err => console.error(`  - ${err}`));
        return false;
    }

    return errors.length === 0;
};

// Validate credentials silently on startup to avoid cluttering logs
const credentialsValid = validateCredentials(true);

// Initialize Razorpay instance
const instance = credentialsValid ? new Razorpay({
    key_id: RAZORPAY_KEY_ID,
    key_secret: RAZORPAY_KEY_SECRET,
}) : null;

exports.createOrder = async (req, res) => {
    try {
        // Check if Razorpay instance is initialized
        if (!instance) {
            console.error(`[PaymentController] ❌ Cannot create order - Razorpay instance not initialized`);
            return res.status(500).json({
                success: false,
                message: "Payment gateway not configured properly. Please contact support.",
                debug: "Razorpay credentials are invalid or missing"
            });
        }

        const { amount, currency = "INR", receipt, businessId } = req.body;

        if (!businessId) {
            return res.status(400).json({ success: false, message: "Business ID is required" });
        }

        const business = await Business.findById(businessId);
        if (!business) {
            return res.status(404).json({ success: false, message: "Business not found" });
        }

        // Check if ANY online payment method is enabled
        const pm = business.paymentMethods;
        const isOnlineEnabled = pm.card || pm.upi || pm.netBanking || pm.wallet;

        if (!isOnlineEnabled) {
            return res.status(400).json({
                success: false,
                message: "Online payments are not facilitated by this business. Please contact the business for alternative payment options."
            });
        }

        // Apply Online Discount (if configured)
        const discountPercentage = process.env.ONLINE_DISCOUNT ? parseInt(process.env.ONLINE_DISCOUNT) : 0;
        let finalAmount = amount;
        let discountAmount = 0;

        if (discountPercentage > 0) {
            discountAmount = (amount * discountPercentage) / 100;
            finalAmount = amount - discountAmount;
        }

        const options = {
            amount: Math.round(finalAmount * 100),
            currency,
            receipt,
        };

        const order = await instance.orders.create(options);

        if (!order) return res.status(500).json({ success: false, message: "Server Error" });

        res.status(200).json({
            success: true,
            order,
            discount: {
                percentage: discountPercentage,
                amount: discountAmount,
                finalAmount: finalAmount
            }
        });
    } catch (error) {
        console.error(`[PaymentController] Order creation failed:`, error.error?.description || error.message);

        res.status(500).json({
            success: false,
            message: "Failed to create payment order",
            error: error.error?.description || "Authentication or configuration error",
            details: process.env.NODE_ENV === 'development' ? {
                statusCode: error.statusCode,
                errorCode: error.error?.code
            } : undefined
        });
    }
};

exports.verifyPayment = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        const body = razorpay_order_id + "|" + razorpay_payment_id;

        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest("hex");

        const isAuthentic = expectedSignature === razorpay_signature;

        if (isAuthentic) {
            // Payment verified
            // Here you can save transaction details to DB or perform other post-payment actions
            res.status(200).json({
                success: true,
                message: "Payment Verified Successfully",
                data: {
                    referenceId: razorpay_payment_id,
                    orderId: razorpay_order_id
                }
            });
        } else {
            res.status(400).json({
                success: false,
                message: "Invalid Signature",
            });
        }
    } catch (error) {
        console.error("Razorpay Payment Verification Error:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

exports.getRazorpayKey = async (req, res) => {
    res.status(200).json({
        success: true,
        key: RAZORPAY_KEY_ID || 'Not configured'
    });
};

// Diagnostic endpoint to check Razorpay configuration
exports.checkConfig = async (req, res) => {
    res.status(200).json({
        success: true,
        configured: !!instance,
        keyIdPresent: !!RAZORPAY_KEY_ID,
        keyIdFormat: RAZORPAY_KEY_ID ? (RAZORPAY_KEY_ID.startsWith('rzp_') ? 'valid' : 'invalid') : 'missing',
        keyIdValue: RAZORPAY_KEY_ID ? `${RAZORPAY_KEY_ID.substring(0, 12)}...` : 'Not set',
        keySecretPresent: !!RAZORPAY_KEY_SECRET,
        keySecretLength: RAZORPAY_KEY_SECRET?.length || 0,
        mode: RAZORPAY_KEY_ID?.includes('live') ? 'LIVE' : RAZORPAY_KEY_ID?.includes('test') ? 'TEST' : 'UNKNOWN'
    });
};
