const ExpressError = require("../utils/ExpressError.js");

const transitions = {
    PENDING_PAYMENT: ["PAYMENT_PROCESSING", "PAYMENT_FAILED", "EXPIRED", "CANCELLED", "REFUND_REQUIRED"],
    PAYMENT_PROCESSING: ["CONFIRMED", "PAYMENT_FAILED", "EXPIRED", "CANCELLED", "REFUND_REQUIRED"],
    CONFIRMED: ["COMPLETED", "CANCELLED"],
    PAYMENT_FAILED: ["REFUND_REQUIRED"],
    EXPIRED: ["REFUND_REQUIRED"],
    CANCELLED: ["REFUND_REQUIRED"],
    REFUND_REQUIRED: [],
    COMPLETED: [],
};

function assertBookingTransition(booking, nextStatus, { paymentVerified = false } = {}) {
    if (!transitions[booking.status]?.includes(nextStatus)) {
        throw new ExpressError(409, `A booking cannot transition from ${booking.status} to ${nextStatus}.`);
    }
    if (nextStatus === "CONFIRMED" && paymentVerified !== true) {
        throw new ExpressError(403, "A booking can only be confirmed after payment is verified.");
    }
}

function getExpiredBookingStatus(booking, now = new Date()) {
    return ["PENDING_PAYMENT", "PAYMENT_PROCESSING"].includes(booking.status)
        && booking.paymentExpiresAt <= now
        ? "EXPIRED"
        : booking.status;
}

module.exports = { assertBookingTransition, getExpiredBookingStatus };
