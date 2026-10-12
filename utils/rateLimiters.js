const config = require("../config.js");
const { createRateLimiter } = require("./rateLimiter.js");

const { windowMs } = config.rateLimits;

module.exports = {
    mutations: createRateLimiter({
        windowMs,
        max: config.rateLimits.mutationMax,
        message: "Too many requests. Please wait before trying again.",
    }),
    authentication: createRateLimiter({
        windowMs,
        max: config.rateLimits.authMax,
        message: "Too many sign-in or sign-up attempts. Please wait before trying again.",
    }),
    bookingCreation: createRateLimiter({
        windowMs,
        max: config.rateLimits.bookingMax,
        message: "Too many booking requests. Please wait before trying again.",
    }),
    paymentOrder: createRateLimiter({
        windowMs,
        max: config.rateLimits.paymentOrderMax,
        message: "Too many checkout requests. Please wait before trying again.",
    }),
    paymentVerification: createRateLimiter({
        windowMs,
        max: config.rateLimits.paymentVerifyMax,
        message: "Too many verification requests. Please wait before trying again.",
    }),
};
