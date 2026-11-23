const { bookingRequestSchema } = require("../schema.js");
const ExpressError = require("../utils/ExpressError.js");
const bookingService = require("../services/booking.js");
const paymentService = require("../services/payments.js");
const config = require("../config.js");
const Listing = require("../models/listing.js");
const { getListingCoverImage } = require("../utils/listingImages.js");

module.exports.listAvailability = async (req, res, next) => {
    try {
        const result = await bookingService.listUnavailableRanges(req.params.id, req.query.from);
        res.json(result);
    } catch (error) {
        if (error instanceof ExpressError && error.statusCode < 500) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        next(error);
    }
};

module.exports.checkAvailability = async (req, res, next) => {
    const { error, value } = bookingRequestSchema.validate(req.body);
    if (error) {
        return res.status(400).json({
            available: false,
            message: error.details.map((detail) => detail.message).join(", "),
            unavailableRanges: [],
        });
    }

    try {
        const result = await bookingService.checkAvailability(req.params.id, value.booking);
        if (!result.available) {
            return res.status(409).json({
                available: false,
                message: "Those dates are unavailable. Please choose different dates.",
                unavailableRanges: result.unavailableRanges,
                priceSnapshot: result.priceSnapshot,
            });
        }
        res.json({
            available: true,
            priceSnapshot: result.priceSnapshot,
            unavailableRanges: result.unavailableRanges,
        });
    } catch (error) {
        if (error instanceof ExpressError && error.statusCode < 500) {
            return res.status(error.statusCode).json({
                available: false,
                message: error.message,
                unavailableRanges: [],
            });
        }
        next(error);
    }
};

module.exports.create = async (req, res) => {
    const booking = await bookingService.createPendingBooking(
        req.params.id,
        req.user._id,
        req.body.booking
    );
    req.flash(
        "success",
        config.razorpay.enabled
            ? "Dates held for 10 minutes. Continue to checkout; this booking is not confirmed until payment is verified."
            : "Dates held for 10 minutes. Portfolio Demo Mode has online payments disabled, so this booking is not confirmed."
    );
    res.redirect(`/bookings/${booking._id}`);
};

module.exports.show = async (req, res) => {
    const booking = await bookingService.expireBookingIfDue(res.locals.booking);
    const now = new Date();
    const listing = await Listing.findById(booking.listing)
        .select("_id title location images image")
        .lean();
    const payment = await paymentService.getGuestPayment(booking._id, req.user._id);
    res.render("bookings/show.ejs", {
        booking,
        listing,
        listingImageUrl: getListingCoverImage(listing || {}),
        payment,
        paymentCheckoutEnabled: config.razorpay.enabled,
        checkoutAvailable: config.razorpay.enabled
            && booking.status === "PENDING_PAYMENT"
            && booking.paymentExpiresAt > now
            && (!payment || ["ORDER_CREATED", "ORDER_FAILED"].includes(payment.status)),
        checkoutReconciling: payment?.status === "ORDER_CREATING",
        paymentCapturedPendingConfirmation: payment?.status === "CAPTURED"
            && ["PENDING_PAYMENT", "PAYMENT_PROCESSING"].includes(booking.status),
        canCancel: booking.status === "PENDING_PAYMENT"
            && booking.paymentExpiresAt > now,
    });
};

module.exports.cancel = async (req, res) => {
    await bookingService.cancelPendingBooking(req.params.bookingId, req.user._id);
    req.flash("success", "Your pending booking was cancelled and the dates were released.");
    res.redirect("/dashboard#cancelled");
};
