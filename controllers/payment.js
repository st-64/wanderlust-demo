const { paymentVerificationSchema } = require("../schema.js");
const ExpressError = require("../utils/ExpressError.js");
const paymentService = require("../services/payments.js");
const razorpay = require("../services/razorpay.js");

function requireSameOrigin(req, res, next) {
    const origin = req.get("origin");
    const host = req.get("host");
    let expectedOrigin;
    try {
        expectedOrigin = new URL(`${req.protocol}://${host}`).origin;
    } catch {
        throw new ExpressError(403, "Payment requests must come from this site.");
    }
    if (!origin || origin !== expectedOrigin || req.get("sec-fetch-site") === "cross-site") {
        throw new ExpressError(403, "Payment requests must come from this site.");
    }
    next();
}

module.exports.requireSameOrigin = requireSameOrigin;

module.exports.startCheckout = async (req, res) => {
    if (!razorpay.isConfigured()) {
        return res.status(503).json({
            status: "payments_disabled",
            message: "Portfolio Demo Mode - Live Payments Disabled. This booking cannot be paid or confirmed online.",
        });
    }
    const order = await paymentService.startCheckout(
        req.params.bookingId,
        req.user._id
    );
    res.json(order);
};

module.exports.verifyCheckout = async (req, res) => {
    if (!razorpay.isConfigured()) {
        return res.status(503).json({
            status: "payments_disabled",
            message: "Portfolio Demo Mode - Live Payments Disabled. Payment verification is unavailable.",
        });
    }
    const { error, value } = paymentVerificationSchema.validate(req.body, { abortEarly: false });
    if (error) {
        throw new ExpressError(400, "The payment response was incomplete or invalid.");
    }
    const result = await paymentService.verifyCheckoutPayment(
        req.params.bookingId,
        req.user._id,
        {
            orderId: value.razorpay_order_id,
            paymentId: value.razorpay_payment_id,
            signature: value.razorpay_signature,
        }
    );
    const messages = {
        confirmed: "Payment verified. Your booking is confirmed.",
        processing: "Payment is still processing. Your booking is not confirmed yet.",
        pending: "Payment was not captured. Your booking remains unconfirmed.",
        refund_required: "Payment was received, but the booking could not be confirmed. Please contact support for payment reconciliation.",
        rejected: "Payment could not be matched to this booking.",
    };
    res.status(result.status === "processing" ? 202 : 200).json({
        status: result.status,
        message: messages[result.status] || "Payment status is being checked.",
        bookingUrl: `/bookings/${req.params.bookingId}`,
    });
};

module.exports.webhook = async (req, res) => {
    if (!razorpay.verifyWebhookSignature(req.body, req.get("x-razorpay-signature"))) {
        throw new ExpressError(400, "Invalid payment webhook signature.");
    }

    let payload;
    try {
        payload = JSON.parse(req.body.toString("utf8"));
    } catch {
        throw new ExpressError(400, "Invalid payment webhook payload.");
    }
    const eventType = payload?.event;
    const entity = payload?.payload?.payment?.entity || {};
    if (typeof eventType !== "string"
        || ((eventType === "payment.captured" || eventType === "payment.failed")
            && (!entity || typeof entity !== "object"))) {
        throw new ExpressError(400, "Unsupported payment webhook payload.");
    }

    const result = await paymentService.processWebhook({
        eventId: req.get("x-razorpay-event-id"),
        eventType,
        entity,
    });
    res.status(result.processing ? 503 : 200).json({
        received: true,
        duplicate: result.duplicate,
        processing: Boolean(result.processing),
    });
};
