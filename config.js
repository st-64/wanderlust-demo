if (process.env.NODE_ENV !== "production") {
    require("dotenv").config();
}

const isProduction = process.env.NODE_ENV === "production";

function positiveInteger(value, fallback, variableName) {
    if (value === undefined || value === "") return fallback;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1) {
        throw new Error(`${variableName} must be a positive integer.`);
    }
    return parsed;
}

const config = {
    isProduction,
    mongoUrl: process.env.MONGO_URL || (isProduction ? undefined : "mongodb://127.0.0.1:27017/wanderlust"),
    port: Number.parseInt(process.env.PORT || "8080", 10),
    sessionSecret: process.env.SESSION_SECRET || (isProduction ? undefined : "local-development-session-secret"),
    mapToken: process.env.MAP_TOKEN,
    cloudinary: {
        cloudName: process.env.CLOUD_NAME,
        apiKey: process.env.CLOUD_API_KEY,
        apiSecret: process.env.CLOUD_API_SECRET,
        folder: process.env.CLOUDINARY_FOLDER || (isProduction ? "wanderlust" : "wanderlust_DEV"),
    },
    razorpay: {
        keyId: process.env.RAZORPAY_KEY_ID,
        keySecret: process.env.RAZORPAY_KEY_SECRET,
        webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
        enabled: Boolean(
            process.env.RAZORPAY_KEY_ID
            && process.env.RAZORPAY_KEY_SECRET
            && process.env.RAZORPAY_WEBHOOK_SECRET
        ),
    },
    trustProxy: process.env.TRUST_PROXY === "true" || process.env.TRUST_PROXY === "1",
    cspMode: process.env.CSP_MODE || "report-only",
    rateLimits: {
        windowMs: positiveInteger(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000, "RATE_LIMIT_WINDOW_MS"),
        authMax: positiveInteger(process.env.RATE_LIMIT_AUTH_MAX, 10, "RATE_LIMIT_AUTH_MAX"),
        bookingMax: positiveInteger(process.env.RATE_LIMIT_BOOKING_MAX, 10, "RATE_LIMIT_BOOKING_MAX"),
        paymentOrderMax: positiveInteger(process.env.RATE_LIMIT_PAYMENT_ORDER_MAX, 10, "RATE_LIMIT_PAYMENT_ORDER_MAX"),
        paymentVerifyMax: positiveInteger(process.env.RATE_LIMIT_PAYMENT_VERIFY_MAX, 30, "RATE_LIMIT_PAYMENT_VERIFY_MAX"),
        mutationMax: positiveInteger(process.env.RATE_LIMIT_MUTATION_MAX, 120, "RATE_LIMIT_MUTATION_MAX"),
    },
};

function validateRuntimeConfig() {
    const missing = [];

    if (!config.mongoUrl) missing.push("MONGO_URL");
    if (!config.sessionSecret) missing.push("SESSION_SECRET");
    if (isProduction) {
        if (!config.mapToken) missing.push("MAP_TOKEN");
        if (!config.cloudinary.cloudName) missing.push("CLOUD_NAME");
        if (!config.cloudinary.apiKey) missing.push("CLOUD_API_KEY");
        if (!config.cloudinary.apiSecret) missing.push("CLOUD_API_SECRET");
        if (config.sessionSecret && config.sessionSecret.length < 32) {
            throw new Error("SESSION_SECRET must contain at least 32 characters in production.");
        }
    }
    if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
        throw new Error("PORT must be an integer between 1 and 65535.");
    }
    if (!["report-only", "enforce"].includes(config.cspMode)) {
        throw new Error("CSP_MODE must be either report-only or enforce.");
    }

    if (missing.length > 0) {
        throw new Error(`Missing required production environment variables: ${missing.join(", ")}`);
    }
}

module.exports = { ...config, validateRuntimeConfig };
