const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const mongoose = require("mongoose");
const Booking = require("../models/booking.js");
const Listing = require("../models/listing.js");
const Payment = require("../models/payment.js");
const PaymentEvent = require("../models/paymentEvent.js");
const config = require("../config.js");
const paymentService = require("../services/payments.js");
const razorpay = require("../services/razorpay.js");
const paymentController = require("../controllers/payment.js");
const { paymentVerificationSchema } = require("../schema.js");
const { confirmBookingHold } = require("../services/availability.js");

const testNow = new Date("2026-10-08T12:00:00.000Z");
const bookingId = new mongoose.Types.ObjectId();
const guestId = new mongoose.Types.ObjectId();
const hostId = new mongoose.Types.ObjectId();
const listingId = new mongoose.Types.ObjectId();
const orderId = "order_test123";
const paymentId = "pay_test123";

function bookingRecord(overrides = {}) {
    return {
        _id: bookingId,
        listing: listingId,
        guest: guestId,
        host: hostId,
        status: "PENDING_PAYMENT",
        paymentExpiresAt: new Date(testNow.getTime() + 600_000),
        checkIn: new Date("2026-10-10T00:00:00.000Z"),
        checkOut: new Date("2026-10-13T00:00:00.000Z"),
        priceSnapshot: { subtotalMinor: 360000, currency: "INR" },
        ...overrides,
    };
}

function paymentRecord(overrides = {}) {
    return {
        _id: new mongoose.Types.ObjectId(),
        booking: bookingId,
        guest: guestId,
        provider: "razorpay",
        providerOrderId: orderId,
        amountMinor: 360000,
        currency: "INR",
        status: "ORDER_CREATED",
        ...overrides,
    };
}

function setOverride(object, key, value, restore) {
    const original = object[key];
    object[key] = value;
    restore.push(() => { object[key] = original; });
}

function restoreAll(restore) {
    restore.reverse().forEach((restoreFunction) => restoreFunction());
}

function activeProvider(restore) {
    setOverride(razorpay, "isConfigured", () => true, restore);
}

function providerCallback(overrides = {}) {
    return {
        orderId,
        paymentId,
        signature: "a".repeat(64),
        ...overrides,
    };
}

function capturedEntity(overrides = {}) {
    return {
        id: paymentId,
        order_id: orderId,
        amount: 360000,
        currency: "INR",
        status: "captured",
        captured: true,
        ...overrides,
    };
}

test("Razorpay checkout and webhook signatures use HMAC-SHA256 and constant-time comparison", () => {
    const originalRazorpay = { ...config.razorpay };
    Object.assign(config.razorpay, {
        keyId: "rzp_test_public",
        keySecret: "test_key_secret_only",
        webhookSecret: "test_webhook_secret_only",
        enabled: true,
    });
    try {
        const checkoutSignature = crypto
            .createHmac("sha256", config.razorpay.keySecret)
            .update(`${orderId}|${paymentId}`)
            .digest("hex");
        assert.equal(razorpay.verifyCheckoutSignature(orderId, paymentId, checkoutSignature), true);
        assert.equal(razorpay.verifyCheckoutSignature(orderId, paymentId, "f".repeat(64)), false);
        assert.equal(razorpay.verifyCheckoutSignature("order_wrong", paymentId, checkoutSignature), false);

        const rawBody = Buffer.from('{"event":"payment.captured"}');
        const webhookSignature = crypto
            .createHmac("sha256", config.razorpay.webhookSecret)
            .update(rawBody)
            .digest("hex");
        assert.equal(razorpay.verifyWebhookSignature(rawBody, webhookSignature), true);
        assert.equal(razorpay.verifyWebhookSignature(Buffer.from("{}"), webhookSignature), false);
        assert.equal(razorpay.verifyWebhookSignature(rawBody, "not-a-signature"), false);
    } finally {
        Object.assign(config.razorpay, originalRazorpay);
    }
});

test("Razorpay order API receives only the server-calculated amount and currency", async () => {
    const originalFetch = global.fetch;
    const originalRazorpay = { ...config.razorpay };
    Object.assign(config.razorpay, {
        keyId: "rzp_test_public",
        keySecret: "test_key_secret_only",
        webhookSecret: "test_webhook_secret_only",
        enabled: true,
    });
    global.fetch = async (url, options) => {
        assert.equal(url, `${razorpay.API_ORIGIN}/orders`);
        assert.equal(options.method, "POST");
        assert.equal(options.headers.Authorization.startsWith("Basic "), true);
        return {
            ok: true,
            json: async () => ({ id: orderId, amount: 360000, currency: "INR" }),
        };
    };
    try {
        const result = await razorpay.createOrder({
            amountMinor: 360000,
            currency: "INR",
            receipt: `wl_${bookingId}`,
            notes: { bookingId: String(bookingId), guestId: String(guestId) },
        });
        assert.equal(result.amount, 360000);
        assert.equal(result.currency, "INR");
    } finally {
        global.fetch = originalFetch;
        Object.assign(config.razorpay, originalRazorpay);
    }
});

test("checkout creates one guest-scoped order using the immutable booking snapshot", async () => {
    const restore = [];
    const originalConfig = { ...config.razorpay };
    activeProvider(restore);
    config.razorpay.keyId = "rzp_test_public";
    const booking = bookingRecord();
    let savedPayment;
    let providerCalls = 0;
    setOverride(Booking, "findOne", async (filter) => {
        assert.deepEqual(filter, { _id: bookingId, guest: guestId });
        return booking;
    }, restore);
    setOverride(Payment, "findOne", async () => savedPayment || null, restore);
    setOverride(Payment.prototype, "save", async function save() {
        savedPayment = this;
        return this;
    }, restore);
    setOverride(Payment, "updateOne", async (filter, update) => {
        savedPayment.providerOrderId = update.$set.providerOrderId;
        savedPayment.status = update.$set.status;
        return { modifiedCount: 1 };
    }, restore);
    setOverride(razorpay, "createOrder", async (orderInput) => {
        providerCalls++;
        assert.equal(orderInput.amountMinor, booking.priceSnapshot.subtotalMinor);
        assert.equal(orderInput.currency, booking.priceSnapshot.currency);
        assert.equal(orderInput.notes.bookingId, String(bookingId));
        assert.equal(orderInput.notes.guestId, String(guestId));
        return { id: orderId, amount: 360000, currency: "INR" };
    }, restore);

    try {
        const first = await paymentService.startCheckout(bookingId, guestId, testNow);
        const repeated = await paymentService.startCheckout(bookingId, guestId, testNow);
        assert.deepEqual(first, {
            keyId: "rzp_test_public",
            orderId,
            amount: 360000,
            currency: "INR",
        });
        assert.deepEqual(repeated, first);
        assert.equal(providerCalls, 1);
    } finally {
        restoreAll(restore);
        Object.assign(config.razorpay, originalConfig);
    }
});

test("checkout rejects another guest's booking and unavailable payment configuration", async () => {
    const restore = [];
    activeProvider(restore);
    setOverride(Booking, "findOne", async () => null, restore);
    setOverride(razorpay, "createOrder", async () => assert.fail("No provider order may be created."), restore);
    try {
        await assert.rejects(
            paymentService.startCheckout(bookingId, new mongoose.Types.ObjectId(), testNow),
            (error) => error.statusCode === 404
        );
        setOverride(razorpay, "isConfigured", () => false, restore);
        await assert.rejects(
            paymentService.startCheckout(bookingId, guestId, testNow),
            (error) => error.statusCode === 503
        );
    } finally {
        restoreAll(restore);
    }
});

test("checkout never retries an ambiguous provider order creation", async () => {
    const restore = [];
    const originalConfig = { ...config.razorpay };
    activeProvider(restore);
    config.razorpay.keyId = "rzp_test_public";
    const booking = bookingRecord();
    let savedPayment;
    let providerCalls = 0;
    setOverride(Booking, "findOne", async () => booking, restore);
    setOverride(Payment, "findOne", async () => savedPayment || null, restore);
    setOverride(Payment.prototype, "save", async function save() {
        savedPayment = this;
        return this;
    }, restore);
    setOverride(razorpay, "createOrder", async () => {
        providerCalls++;
        throw new Error("network timeout");
    }, restore);
    try {
        await assert.rejects(
            paymentService.startCheckout(bookingId, guestId, testNow),
            (error) => error.statusCode === 502
        );
        assert.equal(savedPayment.status, "ORDER_CREATING");
        await assert.rejects(
            paymentService.startCheckout(bookingId, guestId, testNow),
            (error) => error.statusCode === 409
        );
        assert.equal(providerCalls, 1);
    } finally {
        restoreAll(restore);
        Object.assign(config.razorpay, originalConfig);
    }
});

test("a definitive provider rejection is retryable without reusing an unknown order", async () => {
    const restore = [];
    const originalConfig = { ...config.razorpay };
    activeProvider(restore);
    config.razorpay.keyId = "rzp_test_public";
    const booking = bookingRecord();
    const payment = paymentRecord({
        status: "ORDER_FAILED",
        providerOrderId: undefined,
    });
    let orderRequests = 0;
    setOverride(Booking, "findOne", async () => booking, restore);
    setOverride(Payment, "findOne", async () => payment, restore);
    setOverride(Payment, "findOneAndUpdate", async (_filter, update) => {
        payment.status = update.$set.status;
        return payment;
    }, restore);
    setOverride(razorpay, "createOrder", async () => {
        orderRequests++;
        return { id: orderId, amount: 360000, currency: "INR" };
    }, restore);
    setOverride(Payment, "updateOne", async (_filter, update) => {
        payment.providerOrderId = update.$set.providerOrderId;
        payment.status = update.$set.status;
        return { modifiedCount: 1 };
    }, restore);
    try {
        const result = await paymentService.startCheckout(bookingId, guestId, testNow);
        assert.equal(result.orderId, orderId);
        assert.equal(orderRequests, 1);
        assert.equal(payment.status, "ORDER_CREATED");
    } finally {
        restoreAll(restore);
        Object.assign(config.razorpay, originalConfig);
    }
});

test("checkout callback must have a strict shape and a valid server-checked signature", async () => {
    const restore = [];
    activeProvider(restore);
    const booking = bookingRecord();
    const payment = paymentRecord();
    let providerFetches = 0;
    setOverride(Booking, "findOne", async () => booking, restore);
    setOverride(Payment, "findOne", async () => payment, restore);
    setOverride(razorpay, "verifyCheckoutSignature", () => false, restore);
    setOverride(razorpay, "fetchPayment", async () => {
        providerFetches++;
        return capturedEntity();
    }, restore);
    try {
        assert.equal(paymentVerificationSchema.validate({
            razorpay_order_id: orderId,
            razorpay_payment_id: paymentId,
            razorpay_signature: "a".repeat(64),
        }).error, undefined);
        assert.ok(paymentVerificationSchema.validate({
            razorpay_order_id: orderId,
            razorpay_payment_id: paymentId,
            razorpay_signature: "a".repeat(64),
            amount: 1,
            status: "CONFIRMED",
        }).error);
        await assert.rejects(
            paymentService.verifyCheckoutPayment(bookingId, guestId, providerCallback(), testNow),
            (error) => error.statusCode === 400
        );
        assert.equal(providerFetches, 0);
    } finally {
        restoreAll(restore);
    }
});

test("a provider failure leaves the booking unconfirmed and its active hold unchanged", async () => {
    const restore = [];
    activeProvider(restore);
    const booking = bookingRecord();
    const payment = paymentRecord();
    let bookingStatus = booking.status;
    setOverride(Booking, "findOne", async () => booking, restore);
    setOverride(Payment, "findOne", async () => payment, restore);
    setOverride(razorpay, "verifyCheckoutSignature", () => true, restore);
    setOverride(razorpay, "fetchPayment", async () => ({
        id: paymentId,
        order_id: orderId,
        amount: 360000,
        currency: "INR",
        status: "failed",
        error_code: "BAD_REQUEST_ERROR",
    }), restore);
    setOverride(Payment, "updateOne", async () => ({ modifiedCount: 1 }), restore);
    setOverride(Booking, "findOneAndUpdate", async () => {
        bookingStatus = "CONFIRMED";
        return booking;
    }, restore);
    try {
        const result = await paymentService.verifyCheckoutPayment(
            bookingId,
            guestId,
            providerCallback(),
            testNow
        );
        assert.equal(result.status, "pending");
        assert.equal(bookingStatus, "PENDING_PAYMENT");
    } finally {
        restoreAll(restore);
    }
});

test("payment amount or currency mismatch moves a captured payment to reconciliation, never confirmation", async () => {
    const restore = [];
    const payment = paymentRecord({ status: "CAPTURED", providerPaymentId: paymentId });
    const booking = bookingRecord();
    let bookingConfirmed = false;
    const paymentUpdates = [];
    setOverride(Payment, "findById", async () => payment, restore);
    setOverride(Payment, "findOneAndUpdate", async () => payment, restore);
    setOverride(Payment, "updateOne", async (_filter, update) => {
        paymentUpdates.push(update);
        if (update.$set?.status) payment.status = update.$set.status;
        return { modifiedCount: 1 };
    }, restore);
    setOverride(Booking, "findById", async () => booking, restore);
    setOverride(Booking, "findOneAndUpdate", async (_filter, update) => {
        if (update.$set.status === "CONFIRMED") bookingConfirmed = true;
        if (update.$set.status === "REFUND_REQUIRED") booking.status = "REFUND_REQUIRED";
        return booking;
    }, restore);
    setOverride(Listing, "updateOne", async () => ({ acknowledged: true }), restore);
    try {
        const result = await paymentService.confirmCapturedPayment(
            payment,
            capturedEntity({ amount: 1, currency: "USD" }),
            testNow
        );
        assert.equal(result.status, "refund_required");
        assert.equal(bookingConfirmed, false);
        assert.equal(booking.status, "REFUND_REQUIRED");
        assert.ok(paymentUpdates.some((update) => update.$set?.status === "REFUND_REQUIRED"));
    } finally {
        restoreAll(restore);
    }
});

test("a captured payment after hold expiry is marked refund-required and dates are released", async () => {
    const restore = [];
    const payment = paymentRecord({ status: "CAPTURED", providerPaymentId: paymentId });
    const booking = bookingRecord({
        status: "EXPIRED",
        paymentExpiresAt: new Date(testNow.getTime() - 1),
    });
    let released;
    setOverride(Payment, "findById", async () => payment, restore);
    setOverride(Payment, "findOneAndUpdate", async () => payment, restore);
    setOverride(Payment, "updateOne", async (_filter, update) => {
        if (update.$set?.status) payment.status = update.$set.status;
        return { modifiedCount: 1 };
    }, restore);
    setOverride(Booking, "findById", async () => booking, restore);
    setOverride(Booking, "findOneAndUpdate", async (_filter, update) => {
        if (update.$set.status === "REFUND_REQUIRED") booking.status = "REFUND_REQUIRED";
        return booking;
    }, restore);
    setOverride(Listing, "updateOne", async (_filter, update) => {
        released = update.$pull.bookingHolds.bookingId;
        return { acknowledged: true };
    }, restore);
    try {
        const result = await paymentService.confirmCapturedPayment(payment, capturedEntity(), testNow);
        assert.equal(result.status, "refund_required");
        assert.equal(booking.status, "REFUND_REQUIRED");
        assert.equal(released, bookingId);
    } finally {
        restoreAll(restore);
    }
});

test("duplicate verification during confirmation is idempotent and does not force a refund", async () => {
    const restore = [];
    const payment = paymentRecord({
        status: "CAPTURED",
        providerPaymentId: paymentId,
        confirmationLeaseUntil: new Date(testNow.getTime() + 30_000),
    });
    const booking = bookingRecord({ status: "PAYMENT_PROCESSING" });
    setOverride(Payment, "findById", async () => payment, restore);
    setOverride(Payment, "updateOne", async () => ({ modifiedCount: 1 }), restore);
    setOverride(Payment, "findOneAndUpdate", async () => null, restore);
    setOverride(Booking, "findById", async () => booking, restore);
    setOverride(Booking, "findOneAndUpdate", async () => {
        assert.fail("A competing verifier owns the confirmation lease.");
    }, restore);
    try {
        const result = await paymentService.confirmCapturedPayment(payment, capturedEntity(), testNow);
        assert.equal(result.status, "processing");
        assert.equal(booking.status, "PAYMENT_PROCESSING");
    } finally {
        restoreAll(restore);
    }
});

test("successful verification uses an atomic non-overlap hold promotion before confirming", async () => {
    const restore = [];
    const payment = paymentRecord({ status: "CAPTURED", providerPaymentId: paymentId });
    const booking = bookingRecord({ status: "PAYMENT_PROCESSING" });
    let listingFilter;
    let bookingConfirmationCount = 0;
    setOverride(Payment, "findById", async () => payment, restore);
    setOverride(Payment, "findOneAndUpdate", async () => payment, restore);
    setOverride(Payment, "updateOne", async () => ({ modifiedCount: 1 }), restore);
    setOverride(Booking, "findById", async () => booking, restore);
    setOverride(Booking, "find", () => ({
        select() {
            return { lean: async () => [] };
        },
    }), restore);
    setOverride(Booking, "findOneAndUpdate", async (filter, update) => {
        if (update.$set.status === "CONFIRMED") {
            bookingConfirmationCount++;
            booking.status = "CONFIRMED";
            return booking;
        }
        return booking;
    }, restore);
    setOverride(Listing, "findOneAndUpdate", (filter) => {
        listingFilter = filter;
        return { select: async () => ({ _id: listingId }) };
    }, restore);
    try {
        const result = await paymentService.confirmCapturedPayment(payment, capturedEntity(), testNow);
        assert.equal(result.status, "confirmed");
        assert.equal(booking.status, "CONFIRMED");
        assert.equal(bookingConfirmationCount, 1);
        assert.deepEqual(listingFilter.bookingHolds.$elemMatch.bookingId, bookingId);
        assert.ok(listingFilter.bookingHolds.$elemMatch.$or.some(
            (condition) => condition.paymentExpiresAt?.$gt === testNow
        ));
        assert.ok(listingFilter.bookingHolds.$elemMatch.$or.some(
            (condition) => condition.status === "CONFIRMED"
        ));
        assert.ok(listingFilter.$nor[0].bookingHolds.$elemMatch.bookingId.$ne.equals(bookingId));
    } finally {
        restoreAll(restore);
    }
});

test("concurrent overlapping confirmations retain the atomic listing no-overlap guard", async () => {
    const restore = [];
    const booking = bookingRecord({ status: "PAYMENT_PROCESSING" });
    let filter;
    setOverride(Booking, "find", () => ({
        select() {
            return { lean: async () => [] };
        },
    }), restore);
    setOverride(Listing, "findOneAndUpdate", (query) => {
        filter = query;
        return { select: async () => null };
    }, restore);
    try {
        assert.equal(await confirmBookingHold(booking, testNow), false);
        assert.ok(filter.bookingHolds.$elemMatch.bookingId.equals(bookingId));
        assert.ok(filter.$nor[0].bookingHolds.$elemMatch.bookingId.$ne.equals(bookingId));
        assert.equal(
            filter.$nor[0].bookingHolds.$elemMatch.checkIn.$lt,
            booking.checkOut
        );
    } finally {
        restoreAll(restore);
    }
});

test("duplicate Razorpay webhook IDs are acknowledged without reprocessing", async () => {
    const restore = [];
    setOverride(PaymentEvent, "create", async () => {
        throw Object.assign(new Error("duplicate"), { code: 11000 });
    }, restore);
    setOverride(PaymentEvent, "findOne", async () => ({
        _id: new mongoose.Types.ObjectId(),
        status: "PROCESSED",
    }), restore);
    try {
        const result = await paymentService.processWebhook({
            eventId: "evt_test123",
            eventType: "payment.captured",
            entity: capturedEntity(),
        }, testNow);
        assert.deepEqual(result, { duplicate: true });
    } finally {
        restoreAll(restore);
    }
});

test("a webhook that finds confirmation in progress remains retryable", async () => {
    const restore = [];
    const paymentEventId = new mongoose.Types.ObjectId();
    let retryUpdate;
    setOverride(PaymentEvent, "create", async () => ({
        _id: paymentEventId,
        status: "PENDING",
    }), restore);
    setOverride(PaymentEvent, "findOneAndUpdate", async () => ({
        _id: paymentEventId,
        status: "PROCESSING",
    }), restore);
    setOverride(PaymentEvent, "updateOne", async (filter, update) => {
        retryUpdate = { filter, update };
        return { modifiedCount: 1 };
    }, restore);
    setOverride(Payment, "findOne", async () => paymentRecord({
        status: "CAPTURED",
        providerPaymentId: paymentId,
    }), restore);
    setOverride(Payment, "findById", async () => paymentRecord({
        status: "CAPTURED",
        providerPaymentId: paymentId,
    }), restore);
    setOverride(Payment, "findOneAndUpdate", async () => null, restore);
    setOverride(Booking, "findById", async () => bookingRecord({
        status: "PAYMENT_PROCESSING",
    }), restore);
    try {
        const result = await paymentService.processWebhook({
            eventId: "evt_retry123",
            eventType: "payment.captured",
            entity: capturedEntity(),
        }, testNow);
        assert.deepEqual(result, {
            duplicate: false,
            processing: true,
            status: "processing",
        });
        assert.deepEqual(retryUpdate.update, {
            $set: { status: "PENDING" },
            $unset: { processingStartedAt: "" },
        });
    } finally {
        restoreAll(restore);
    }
});

test("captured payment reconciliation retries incomplete booking confirmations", async () => {
    const restore = [];
    const payment = paymentRecord({
        status: "CAPTURED",
        providerPaymentId: paymentId,
    });
    let candidateFilter;
    let confirmationAttempts = 0;
    activeProvider(restore);
    setOverride(Payment, "find", (filter) => {
        candidateFilter = filter;
        const query = {
            sort() { return this; },
            limit() { return this; },
            lean: async () => [payment],
        };
        return query;
    }, restore);
    setOverride(razorpay, "fetchPayment", async (id) => {
        assert.equal(id, paymentId);
        return capturedEntity();
    }, restore);
    setOverride(Payment, "findById", async () => payment, restore);
    setOverride(Payment, "findOneAndUpdate", async () => {
        confirmationAttempts++;
        return payment;
    }, restore);
    setOverride(Payment, "updateOne", async () => ({ modifiedCount: 1 }), restore);
    setOverride(Booking, "findById", async () => bookingRecord({
        status: "CONFIRMED",
    }), restore);
    try {
        assert.equal(await paymentService.reconcileCapturedPayments(testNow), 1);
        assert.equal(confirmationAttempts, 1);
        assert.equal(candidateFilter.status, "CAPTURED");
        assert.equal(candidateFilter.bookingConfirmedAt.$exists, false);
    } finally {
        restoreAll(restore);
    }
});

test("checkout and verification routes retain the existing authentication gate", () => {
    const bookingRouter = require("../routes/booking.js");
    const { isLoggedIn } = require("../middlware.js");
    for (const path of ["/:bookingId/checkout", "/:bookingId/verify"]) {
        const route = bookingRouter.stack.find((layer) => layer.route?.path === path);
        assert.ok(route, `expected ${path} route`);
        assert.equal(route.route.stack[0].handle, isLoggedIn);
    }
});

test("a repeated captured callback for a confirmed booking is a no-op", async () => {
    const restore = [];
    const payment = paymentRecord({ status: "CAPTURED", providerPaymentId: paymentId });
    const booking = bookingRecord({ status: "CONFIRMED" });
    let bookingWrites = 0;
    setOverride(Payment, "findById", async () => payment, restore);
    setOverride(Payment, "findOneAndUpdate", async () => payment, restore);
    setOverride(Payment, "updateOne", async () => ({ modifiedCount: 1 }), restore);
    setOverride(Booking, "findById", async () => booking, restore);
    setOverride(Booking, "findOneAndUpdate", async () => {
        bookingWrites++;
        return booking;
    }, restore);
    try {
        const result = await paymentService.confirmCapturedPayment(payment, capturedEntity(), testNow);
        assert.equal(result.status, "confirmed");
        assert.equal(bookingWrites, 0);
    } finally {
        restoreAll(restore);
    }
});

test("confirmation rechecks booking records immediately and refuses an overlapping stay", async () => {
    const restore = [];
    const conflictingBooking = bookingRecord({
        _id: new mongoose.Types.ObjectId(),
        status: "CONFIRMED",
    });
    let listingWriteAttempted = false;
    setOverride(Booking, "find", () => ({
        select() {
            return { lean: async () => [conflictingBooking] };
        },
    }), restore);
    setOverride(Listing, "findOneAndUpdate", () => {
        listingWriteAttempted = true;
        return { select: async () => ({ _id: listingId }) };
    }, restore);
    try {
        assert.equal(await confirmBookingHold(bookingRecord({ status: "PAYMENT_PROCESSING" }), testNow), false);
        assert.equal(listingWriteAttempted, false);
    } finally {
        restoreAll(restore);
    }
});

test("guest trips and host reservation filters surface refund-required bookings as unconfirmed", () => {
    const guestBookings = require("../services/guestBookings.js");
    const hostDashboard = require("../services/hostDashboard.js");
    const sections = guestBookings.categorizeGuestBookings([
        bookingRecord({ status: "REFUND_REQUIRED" }),
    ], testNow);
    assert.equal(sections.upcoming.length, 0);
    assert.equal(sections.updates[0].displayStatus, "REFUND_REQUIRED");
    assert.deepEqual(
        hostDashboard.buildReservationQuery(hostId, "refund-required", testNow),
        { host: hostId, status: "REFUND_REQUIRED" }
    );
});

test("invalid webhook signatures are rejected before event processing", async () => {
    const restore = [];
    setOverride(razorpay, "verifyWebhookSignature", () => false, restore);
    setOverride(paymentService, "processWebhook", async () => {
        assert.fail("An invalidly signed event must never be processed.");
    }, restore);
    const req = {
        body: Buffer.from('{"event":"payment.captured"}'),
        get(name) {
            return name === "x-razorpay-signature" ? "invalid" : "evt_test123";
        },
    };
    try {
        await assert.rejects(
            paymentController.webhook(req, {}),
            (error) => error.statusCode === 400
        );
    } finally {
        restoreAll(restore);
    }
});
