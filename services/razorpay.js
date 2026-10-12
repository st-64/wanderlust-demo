const crypto = require("node:crypto");
const config = require("../config.js");

const API_ORIGIN = "https://api.razorpay.com/v1";
const REQUEST_TIMEOUT_MS = 10_000;

function isConfigured() {
    return config.razorpay.enabled;
}

function paymentRequest(path, method, body) {
    if (!isConfigured()) {
        throw new Error("Razorpay payment configuration is incomplete.");
    }
    const credentials = Buffer.from(
        `${config.razorpay.keyId}:${config.razorpay.keySecret}`
    ).toString("base64");
    return fetch(`${API_ORIGIN}${path}`, {
        method,
        headers: {
            Authorization: `Basic ${credentials}`,
            Accept: "application/json",
            ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
}

async function parseProviderResponse(response) {
    let payload;
    try {
        payload = await response.json();
    } catch {
        throw new Error("Razorpay returned an invalid response.");
    }
    if (!response.ok) {
        const error = new Error("Razorpay request failed.");
        error.code = `RAZORPAY_HTTP_${response.status}`;
        throw error;
    }
    return payload;
}

async function createOrder({ amountMinor, currency, receipt, notes }) {
    try {
        const response = await paymentRequest("/orders", "POST", {
            amount: amountMinor,
            currency,
            receipt,
            notes,
        });
        return await parseProviderResponse(response);
    } catch (error) {
        if (error.code?.startsWith("RAZORPAY_HTTP_")) throw error;
        const providerError = new Error("Razorpay order creation could not be confirmed.");
        providerError.code = "RAZORPAY_ORDER_UNCONFIRMED";
        throw providerError;
    }
}

async function fetchPayment(paymentId) {
    if (!/^pay_[A-Za-z0-9]+$/.test(paymentId)) {
        throw new Error("Invalid Razorpay payment identifier.");
    }
    try {
        const response = await paymentRequest(
            `/payments/${encodeURIComponent(paymentId)}`,
            "GET"
        );
        return await parseProviderResponse(response);
    } catch (error) {
        if (error.code?.startsWith("RAZORPAY_HTTP_")) throw error;
        throw new Error("Razorpay payment status could not be retrieved.");
    }
}

function safeEqualHex(expectedHex, receivedHex) {
    if (typeof receivedHex !== "string" || !/^[a-f\d]{64}$/i.test(receivedHex)) {
        return false;
    }
    const expected = Buffer.from(expectedHex, "hex");
    const received = Buffer.from(receivedHex, "hex");
    return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

function verifyCheckoutSignature(orderId, paymentId, receivedSignature) {
    if (!isConfigured()
        || typeof orderId !== "string"
        || !/^order_[A-Za-z0-9]+$/.test(orderId)
        || typeof paymentId !== "string"
        || !/^pay_[A-Za-z0-9]+$/.test(paymentId)) {
        return false;
    }
    const expected = crypto
        .createHmac("sha256", config.razorpay.keySecret)
        .update(`${orderId}|${paymentId}`, "utf8")
        .digest("hex");
    return safeEqualHex(expected, receivedSignature);
}

function verifyWebhookSignature(rawBody, receivedSignature) {
    if (!isConfigured() || !Buffer.isBuffer(rawBody)) return false;
    const expected = crypto
        .createHmac("sha256", config.razorpay.webhookSecret)
        .update(rawBody)
        .digest("hex");
    return safeEqualHex(expected, receivedSignature);
}

module.exports = {
    API_ORIGIN,
    REQUEST_TIMEOUT_MS,
    isConfigured,
    createOrder,
    fetchPayment,
    verifyCheckoutSignature,
    verifyWebhookSignature,
};
