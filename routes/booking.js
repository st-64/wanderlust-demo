const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync.js");
const { isLoggedIn, isBookingGuest } = require("../middlware.js");
const bookingController = require("../controllers/booking.js");
const paymentController = require("../controllers/payment.js");
const rateLimiters = require("../utils/rateLimiters.js");

router.post("/:bookingId/checkout",
    isLoggedIn,
    paymentController.requireSameOrigin,
    rateLimiters.paymentOrder,
    wrapAsync(paymentController.startCheckout)
);

router.post("/:bookingId/verify",
    isLoggedIn,
    paymentController.requireSameOrigin,
    rateLimiters.paymentVerification,
    express.json({ limit: "4kb" }),
    wrapAsync(paymentController.verifyCheckout)
);

router.get("/:bookingId",
    isLoggedIn,
    wrapAsync(isBookingGuest),
    wrapAsync(bookingController.show)
);

router.post("/:bookingId/cancel",
    isLoggedIn,
    wrapAsync(isBookingGuest),
    wrapAsync(bookingController.cancel)
);

module.exports = router;
