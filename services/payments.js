const mongoose = require("mongoose");
const Booking = require("../models/booking.js");
const Payment = require("../models/payment.js");
const PaymentEvent = require("../models/paymentEvent.js");
const config = require("../config.js");
const ExpressError = require("../utils/ExpressError.js");
const bookingService = require("./booking.js");
const { confirmBookingHold, releaseBookingHold } = require("./availability.js");
const { assertBookingTransition } = require("./bookingLifecycle.js");
const razorpay = require("./razorpay.js");

const VERIFICATION_ATTEMPT_LIMIT = 10;
const WEBHOOK_PROCESSING_LEASE_MS = 2 * 60 * 1000;
const REFUND_RECONCILIATION_BOOKING_STATUSES = [
    "PENDING_PAYMENT",
    "PAYMENT_PROCESSING",
    "EXPIRED",
    "CANCELLED",
    "PAYMENT_FAILED",
];

function providerUnavailable() {
    throw new ExpressError(503, "Online payments are not configured. This booking is not confirmed.");
}

function assertProviderConfigured() {
    if (!razorpay.isConfigured()) providerUnavailable();
}

function isDuplicateKeyError(error) {
    return error && error.code === 11000;
}

function validProviderIdentifier(value, prefix) {
    return typeof value === "string" && new RegExp(`^${prefix}_[A-Za-z0-9]+$`).test(value);
}

function asObjectId(value) {
    if (!mongoose.Types.ObjectId.isValid(value)) {
        throw new ExpressError(404, "That booking could not be found.");
    }
    return value;
}

async function findGuestBooking(bookingId, guestId) {
    const booking = await Booking.findOne({ _id: asObjectId(bookingId), guest: guestId });
    if (!booking) throw new ExpressError(404, "That booking could not be found.");
    return booking;
}

function assertSnapshotAmount(booking, payment) {
    const amount = booking.priceSnapshot?.subtotalMinor;
    if (!Number.isSafeInteger(amount)
        || amount < 1
        || payment.amountMinor !== amount
        || payment.currency !== booking.priceSnapshot.currency
        || payment.currency !== "INR") {
        throw new ExpressError(409, "The saved booking amount does not match its payment order.");
    }
}

function checkoutOrderResponse(payment) {
    return {
        keyId: config.razorpay.keyId,
        orderId: payment.providerOrderId,
        amount: payment.amountMinor,
        currency: payment.currency,
    };
}

async function startCheckout(bookingId, guestId, now = new Date()) {
    assertProviderConfigured();
    let booking = await findGuestBooking(bookingId, guestId);
    booking = await bookingService.expireBookingIfDue(booking, now);
    if (booking.status !== "PENDING_PAYMENT" || booking.paymentExpiresAt <= now) {
        throw new ExpressError(409, "This booking hold is no longer active.");
    }
    if (booking.priceSnapshot.currency !== "INR"
        || !Number.isSafeInteger(booking.priceSnapshot.subtotalMinor)
        || booking.priceSnapshot.subtotalMinor < 1) {
        throw new ExpressError(400, "This booking amount cannot be paid online.");
    }

    let payment = await Payment.findOne({ booking: booking._id, guest: guestId, provider: "razorpay" });
    if (payment) {
        assertSnapshotAmount(booking, payment);
        if (payment.status === "ORDER_CREATED" && payment.providerOrderId) {
            return checkoutOrderResponse(payment);
        }
        if (payment.status === "ORDER_FAILED" && !payment.providerOrderId) {
            payment = await Payment.findOneAndUpdate(
                { _id: payment._id, status: "ORDER_FAILED", providerOrderId: { $exists: false } },
                {
                    $set: { status: "ORDER_CREATING" },
                    $unset: { failureCode: "" },
                },
                { returnDocument: "after", runValidators: true }
            );
            if (!payment) {
                throw new ExpressError(409, "Payment order creation is already in progress.");
            }
        } else {
            throw new ExpressError(409, payment.status === "ORDER_CREATING"
                ? "Payment order creation is being reconciled. Please check back shortly."
                : "This booking can no longer start a new payment.");
        }
    } else {
        payment = new Payment({
            booking: booking._id,
            guest: guestId,
            provider: "razorpay",
            amountMinor: booking.priceSnapshot.subtotalMinor,
            currency: booking.priceSnapshot.currency,
            status: "ORDER_CREATING",
        });
        try {
            await payment.save();
        } catch (error) {
            if (!isDuplicateKeyError(error)) throw error;
            payment = await Payment.findOne({ booking: booking._id, guest: guestId, provider: "razorpay" });
            if (!payment) throw error;
            assertSnapshotAmount(booking, payment);
            if (payment.status === "ORDER_CREATED" && payment.providerOrderId) {
                return checkoutOrderResponse(payment);
            }
            throw new ExpressError(409, "Payment order creation is already in progress.");
        }
    }

    const receipt = `wl_${booking._id}`;
    let order;
    try {
        order = await razorpay.createOrder({
            amountMinor: payment.amountMinor,
            currency: payment.currency,
            receipt,
            notes: {
                bookingId: String(booking._id),
                guestId: String(guestId),
            },
        });
    } catch (error) {
        if (/^RAZORPAY_HTTP_4\d\d$/.test(error.code || "")) {
            await Payment.updateOne(
                { _id: payment._id, status: "ORDER_CREATING" },
                { $set: { status: "ORDER_FAILED", failureCode: "provider_rejected" } }
            );
            throw new ExpressError(502, "The payment provider rejected this order. No payment was taken.");
        }
        throw new ExpressError(502, "Order creation could not be confirmed. Do not retry until this booking has been reconciled.");
    }
    if (!validProviderIdentifier(order?.id, "order")
        || order.amount !== payment.amountMinor
        || order.currency !== payment.currency) {
        throw new ExpressError(502, "The payment provider returned an invalid order. Please contact support before retrying.");
    }

    const update = await Payment.updateOne(
        { _id: payment._id, status: "ORDER_CREATING", providerOrderId: { $exists: false } },
        {
            $set: {
                providerOrderId: order.id,
                status: "ORDER_CREATED",
                orderCreatedAt: now,
            },
        },
        { runValidators: true }
    );
    if (update.modifiedCount !== 1) {
        throw new ExpressError(409, "The payment order is being reconciled. Please check the booking status.");
    }
    payment.providerOrderId = order.id;
    payment.status = "ORDER_CREATED";
    return checkoutOrderResponse(payment);
}

async function getGuestPayment(bookingId, guestId) {
    if (!mongoose.Types.ObjectId.isValid(bookingId)) return null;
    return Payment.findOne({ booking: bookingId, guest: guestId, provider: "razorpay" })
        .select("status providerOrderId amountMinor currency failureCode reconciliationPayments")
        .lean();
}

async function markRefundRequired(payment, booking, now, reconciliationPayment) {
    const update = {
        $set: { status: "REFUND_REQUIRED", refundRequiredAt: now },
        $unset: { confirmationLeaseUntil: "" },
    };
    if (reconciliationPayment) {
        update.$addToSet = { reconciliationPayments: reconciliationPayment };
    }
    await Payment.updateOne({ _id: payment._id }, update, { runValidators: true });
    if (!booking || !REFUND_RECONCILIATION_BOOKING_STATUSES.includes(booking.status)) return;
    assertBookingTransition(booking, "REFUND_REQUIRED");

    const changedBooking = await Booking.findOneAndUpdate(
        {
            _id: booking._id,
            status: { $in: REFUND_RECONCILIATION_BOOKING_STATUSES },
        },
        { $set: { status: "REFUND_REQUIRED" } },
        { returnDocument: "after", runValidators: true }
    );
    if (changedBooking) {
        await releaseBookingHold(changedBooking.listing, changedBooking._id);
    }
}

async function recordSecondaryCapturedPayment(payment, paymentEntity, now) {
    if ((payment.reconciliationPayments || []).some(
        (record) => record.providerPaymentId === paymentEntity.id
    )) {
        return { status: "refund_required" };
    }
    const booking = await Booking.findById(payment.booking);
    await markRefundRequired(payment, booking, now, {
        providerPaymentId: paymentEntity.id,
        observedAt: now,
    });
    return { status: "refund_required" };
}

async function claimCapturedPayment(payment, paymentEntity, now) {
    if (payment.providerPaymentId) {
        if (payment.providerPaymentId === paymentEntity.id) {
            return payment.status === "REFUND_REQUIRED" ? "refund_required" : "claimed";
        }
        await recordSecondaryCapturedPayment(payment, paymentEntity, now);
        return "refund_required";
    }
    if (payment.status === "REFUND_REQUIRED") return "refund_required";

    try {
        const result = await Payment.updateOne(
            {
                _id: payment._id,
                status: { $in: ["ORDER_CREATED", "CAPTURED"] },
                providerPaymentId: { $exists: false },
            },
            {
                $set: {
                    providerPaymentId: paymentEntity.id,
                    status: "CAPTURED",
                    capturedAt: now,
                },
            },
            { runValidators: true }
        );
        if (result.modifiedCount === 1) return "claimed";
    } catch (error) {
        if (!isDuplicateKeyError(error)) throw error;
        return recordSecondaryCapturedPayment(payment, paymentEntity, now);
    }

    const currentPayment = await Payment.findById(payment._id);
    if (currentPayment?.providerPaymentId === paymentEntity.id) {
        return currentPayment.status === "REFUND_REQUIRED" ? "refund_required" : "claimed";
    }
    if (currentPayment?.providerPaymentId) {
        return recordSecondaryCapturedPayment(currentPayment, paymentEntity, now);
    }
    return "refund_required";
}

async function confirmCapturedPayment(payment, paymentEntity, now = new Date()) {
    let currentPayment = await Payment.findById(payment._id);
    if (!currentPayment
        || currentPayment.provider !== "razorpay"
        || currentPayment.providerOrderId !== paymentEntity.order_id
        || !validProviderIdentifier(paymentEntity.id, "pay")) {
        return { status: "rejected" };
    }
    const claim = await claimCapturedPayment(currentPayment, paymentEntity, now);
    if (claim === "refund_required") return { status: "refund_required" };

    const leasedPayment = await Payment.findOneAndUpdate(
        {
            _id: currentPayment._id,
            status: "CAPTURED",
            providerPaymentId: paymentEntity.id,
            $or: [
                { confirmationLeaseUntil: { $exists: false } },
                { confirmationLeaseUntil: { $lte: now } },
            ],
        },
        { $set: { confirmationLeaseUntil: new Date(now.getTime() + WEBHOOK_PROCESSING_LEASE_MS) } },
        { returnDocument: "after" }
    );
    if (!leasedPayment) {
        const latestPayment = await Payment.findById(currentPayment._id);
        const latestBooking = latestPayment
            ? await Booking.findById(latestPayment.booking)
            : null;
        if (latestPayment?.status === "REFUND_REQUIRED") return { status: "refund_required" };
        if (latestBooking?.status === "CONFIRMED") return { status: "confirmed" };
        return { status: "processing" };
    }
    currentPayment = leasedPayment;

    try {
        const booking = await Booking.findById(currentPayment.booking);
        if (!booking || !booking.guest.equals(currentPayment.guest)) {
            await markRefundRequired(currentPayment, booking, now);
            return { status: "refund_required" };
        }
        if (paymentEntity.amount !== currentPayment.amountMinor
            || paymentEntity.currency !== currentPayment.currency
            || paymentEntity.amount !== booking.priceSnapshot.subtotalMinor
            || paymentEntity.currency !== booking.priceSnapshot.currency) {
            await markRefundRequired(currentPayment, booking, now);
            return { status: "refund_required" };
        }
        assertSnapshotAmount(booking, currentPayment);

        if (booking.status === "CONFIRMED") {
            await Payment.updateOne(
                { _id: currentPayment._id, providerPaymentId: paymentEntity.id, status: "CAPTURED" },
                { $set: { bookingConfirmedAt: booking.updatedAt || now } }
            );
            return { status: "confirmed" };
        }
        if (booking.status === "REFUND_REQUIRED") return { status: "refund_required" };

        let processingBooking = booking;
        if (booking.status === "PENDING_PAYMENT" && booking.paymentExpiresAt > now) {
            assertBookingTransition(booking, "PAYMENT_PROCESSING");
            processingBooking = await Booking.findOneAndUpdate(
                {
                    _id: booking._id,
                    guest: currentPayment.guest,
                    status: "PENDING_PAYMENT",
                    paymentExpiresAt: { $gt: now },
                },
                { $set: { status: "PAYMENT_PROCESSING" } },
                { returnDocument: "after", runValidators: true }
            );
        }
        if (!processingBooking
            || processingBooking.status !== "PAYMENT_PROCESSING"
            || processingBooking.paymentExpiresAt <= now) {
            await markRefundRequired(currentPayment, await Booking.findById(booking._id), now);
            return { status: "refund_required" };
        }

        const holdConfirmed = await confirmBookingHold(processingBooking, now);
        if (!holdConfirmed) {
            await markRefundRequired(currentPayment, await Booking.findById(booking._id), now);
            return { status: "refund_required" };
        }

        assertBookingTransition(processingBooking, "CONFIRMED", { paymentVerified: true });
        const confirmedBooking = await Booking.findOneAndUpdate(
            {
                _id: processingBooking._id,
                guest: currentPayment.guest,
                status: "PAYMENT_PROCESSING",
                paymentExpiresAt: { $gt: now },
            },
            { $set: { status: "CONFIRMED" } },
            { returnDocument: "after", runValidators: true }
        );
        if (!confirmedBooking) {
            const latestBooking = await Booking.findById(processingBooking._id);
            if (latestBooking?.status === "CONFIRMED") {
                await Payment.updateOne(
                    { _id: currentPayment._id, providerPaymentId: paymentEntity.id, status: "CAPTURED" },
                    { $set: { bookingConfirmedAt: latestBooking.updatedAt || now } }
                );
                return { status: "confirmed" };
            }
            await markRefundRequired(currentPayment, latestBooking, now);
            return { status: "refund_required" };
        }

        await Payment.updateOne(
            { _id: currentPayment._id, providerPaymentId: paymentEntity.id, status: "CAPTURED" },
            { $set: { bookingConfirmedAt: now } }
        );
        return { status: "confirmed" };
    } finally {
        await Payment.updateOne(
            {
                _id: currentPayment._id,
                providerPaymentId: paymentEntity.id,
                status: "CAPTURED",
            },
            { $unset: { confirmationLeaseUntil: "" } }
        );
    }
}

async function recordFailedPayment({ orderId, paymentId, amount, currency, failureCode }, now = new Date()) {
    if (!validProviderIdentifier(orderId, "order")
        || !validProviderIdentifier(paymentId, "pay")
        || !Number.isSafeInteger(amount)
        || typeof currency !== "string") {
        return { status: "ignored" };
    }
    const payment = await Payment.findOne({
        provider: "razorpay",
        providerOrderId: orderId,
    });
    if (!payment
        || payment.status !== "ORDER_CREATED"
        || payment.amountMinor !== amount
        || payment.currency !== currency) {
        return { status: "ignored" };
    }
    const safeFailureCode = typeof failureCode === "string"
        ? failureCode.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 80)
        : "";
    await Payment.updateOne(
        { _id: payment._id, status: "ORDER_CREATED" },
        {
            $set: {
                failureCode: safeFailureCode || "payment_failed",
                lastPaymentAttemptAt: now,
            },
        }
    );
    return { status: "pending" };
}

async function verifyCheckoutPayment(bookingId, guestId, callback, now = new Date()) {
    assertProviderConfigured();
    const booking = await findGuestBooking(bookingId, guestId);
    const payment = await Payment.findOne({
        booking: booking._id,
        guest: guestId,
        provider: "razorpay",
    });
    if (!payment || !payment.providerOrderId
        || callback.orderId !== payment.providerOrderId
        || !razorpay.verifyCheckoutSignature(
            callback.orderId,
            callback.paymentId,
            callback.signature
        )) {
        throw new ExpressError(400, "Payment verification failed. This booking remains unconfirmed.");
    }

    if (payment.status === "REFUND_REQUIRED") return { status: "refund_required" };
    if (payment.status === "CAPTURED" && payment.providerPaymentId === callback.paymentId) {
        return confirmCapturedPayment(payment, {
            id: callback.paymentId,
            order_id: callback.orderId,
            amount: payment.amountMinor,
            currency: payment.currency,
        }, now);
    }
    if (payment.status !== "ORDER_CREATED") {
        throw new ExpressError(409, "This payment order is not ready for verification.");
    }

    const attempt = await Payment.updateOne(
        { _id: payment._id, status: "ORDER_CREATED", verificationAttempts: { $lt: VERIFICATION_ATTEMPT_LIMIT } },
        { $inc: { verificationAttempts: 1 } }
    );
    if (attempt.modifiedCount !== 1) {
        throw new ExpressError(429, "Too many payment verification attempts. Please try again later.");
    }

    let providerPayment;
    try {
        providerPayment = await razorpay.fetchPayment(callback.paymentId);
    } catch {
        throw new ExpressError(502, "Payment status could not be checked with the provider. Please try again.");
    }
    if (providerPayment?.id !== callback.paymentId
        || providerPayment?.order_id !== payment.providerOrderId) {
        throw new ExpressError(400, "Payment details do not match this booking.");
    }
    if (providerPayment.status === "failed") {
        await recordFailedPayment({
            orderId: providerPayment.order_id,
            paymentId: providerPayment.id,
            amount: providerPayment.amount,
            currency: providerPayment.currency,
            failureCode: providerPayment.error_code,
        }, now);
        return { status: "pending" };
    }
    if (providerPayment.status !== "captured" || providerPayment.captured !== true) {
        return { status: "processing" };
    }
    return confirmCapturedPayment(payment, providerPayment, new Date());
}

async function processWebhook({ eventId, eventType, entity }, now = new Date()) {
    if (typeof eventId !== "string" || eventId.length < 1 || eventId.length > 255) {
        throw new ExpressError(400, "Invalid payment event identifier.");
    }
    let event;
    try {
        event = await PaymentEvent.create({
            provider: "razorpay",
            providerEventId: eventId,
            eventType: String(eventType || "unknown").slice(0, 100),
            providerOrderId: typeof entity?.order_id === "string" ? entity.order_id : undefined,
            providerPaymentId: typeof entity?.id === "string" ? entity.id : undefined,
            status: "PENDING",
        });
    } catch (error) {
        if (!isDuplicateKeyError(error)) throw error;
        event = await PaymentEvent.findOne({ provider: "razorpay", providerEventId: eventId });
    }
    if (!event) throw new ExpressError(500, "Payment event could not be recorded.");
    if (["PROCESSED", "IGNORED"].includes(event.status)) return { duplicate: true };

    const staleBefore = new Date(now.getTime() - WEBHOOK_PROCESSING_LEASE_MS);
    const claimedEvent = await PaymentEvent.findOneAndUpdate(
        {
            _id: event._id,
            $or: [
                { status: "PENDING" },
                { status: "PROCESSING", processingStartedAt: { $lte: staleBefore } },
            ],
        },
        {
            $set: { status: "PROCESSING", processingStartedAt: now },
            $inc: { attemptCount: 1 },
        },
        { returnDocument: "after", runValidators: true }
    );
    if (!claimedEvent) {
        const currentEvent = await PaymentEvent.findById(event._id);
        return currentEvent?.status === "PROCESSING"
            ? { duplicate: true, processing: true }
            : { duplicate: true };
    }

    try {
        let result = { status: "ignored" };
        if (eventType === "payment.captured"
            && entity?.status === "captured"
            && entity?.captured === true) {
            const payment = await Payment.findOne({
                provider: "razorpay",
                providerOrderId: entity.order_id,
            });
            if (payment) result = await confirmCapturedPayment(payment, entity, new Date());
        } else if (eventType === "payment.failed") {
            result = await recordFailedPayment({
                orderId: entity?.order_id,
                paymentId: entity?.id,
                amount: entity?.amount,
                currency: entity?.currency,
                failureCode: entity?.error_code,
            }, now);
        }
        if (result.status === "processing") {
            await PaymentEvent.updateOne(
                { _id: claimedEvent._id, status: "PROCESSING" },
                {
                    $set: { status: "PENDING" },
                    $unset: { processingStartedAt: "" },
                }
            );
            return { duplicate: false, processing: true, status: "processing" };
        }
        await PaymentEvent.updateOne(
            { _id: claimedEvent._id, status: "PROCESSING" },
            {
                $set: {
                    status: result.status === "ignored" ? "IGNORED" : "PROCESSED",
                    processedAt: now,
                },
                $unset: { processingStartedAt: "" },
            }
        );
        return { duplicate: false, ...result };
    } catch (error) {
        await PaymentEvent.updateOne(
            { _id: claimedEvent._id, status: "PROCESSING" },
            {
                $set: { status: "PENDING" },
                $unset: { processingStartedAt: "" },
            }
        );
        throw error;
    }
}

async function reconcileCapturedPayments(now = new Date()) {
    if (!razorpay.isConfigured()) return 0;
    const candidates = await Payment.find({
        provider: "razorpay",
        status: "CAPTURED",
        providerPaymentId: { $exists: true },
        bookingConfirmedAt: { $exists: false },
        $or: [
            { confirmationLeaseUntil: { $exists: false } },
            { confirmationLeaseUntil: { $lte: now } },
        ],
    })
        .sort({ capturedAt: 1 })
        .limit(10)
        .lean();

    let reconciled = 0;
    for (const payment of candidates) {
        try {
            const providerPayment = await razorpay.fetchPayment(payment.providerPaymentId);
            if (providerPayment?.status === "captured" && providerPayment.captured === true) {
                const result = await confirmCapturedPayment(payment, providerPayment, new Date());
                if (result.status === "confirmed" || result.status === "refund_required") reconciled++;
            }
        } catch (error) {
            console.error(
                `Payment reconciliation failed for record ${payment._id}:`,
                error.message
            );
        }
    }
    return reconciled;
}

function startPaymentReconciliationWorker(intervalMs = 60_000) {
    let running = false;
    const run = () => {
        if (running) return;
        running = true;
        reconcileCapturedPayments()
            .catch((error) => console.error("Payment reconciliation task failed:", error.message))
            .finally(() => { running = false; });
    };
    run();
    const timer = setInterval(run, intervalMs);
    timer.unref();
    return timer;
}

module.exports = {
    VERIFICATION_ATTEMPT_LIMIT,
    WEBHOOK_PROCESSING_LEASE_MS,
    startCheckout,
    getGuestPayment,
    verifyCheckoutPayment,
    recordFailedPayment,
    confirmCapturedPayment,
    processWebhook,
    reconcileCapturedPayments,
    startPaymentReconciliationWorker,
};
