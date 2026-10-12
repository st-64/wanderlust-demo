const express = require("express");
const router = express.Router({ mergeParams: true });
const wrapAsync = require("../utils/wrapAsync.js");
const { isLoggedIn, validateBookingRequest } = require("../middlware.js");
const bookingController = require("../controllers/booking.js");
const rateLimiters = require("../utils/rateLimiters.js");

router.post("/availability",
    wrapAsync(bookingController.checkAvailability)
);

router.get("/availability",
    wrapAsync(bookingController.listAvailability)
);

router.post("/",
    isLoggedIn,
    rateLimiters.bookingCreation,
    validateBookingRequest,
    wrapAsync(bookingController.create)
);

module.exports = router;
