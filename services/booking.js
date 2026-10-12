const mongoose = require("mongoose");
const Booking = require("../models/booking.js");
const ExpressError = require("../utils/ExpressError.js");
const {
    parseDateRange,
    validateGuestCount,
    calculatePrice,
    getAvailabilityWindow,
} = require("./bookingDates.js");
const {
    loadBookableListing,
    checkListingAvailability,
    getUnavailableRanges,
    acquireBookingHold,
    releaseBookingHold,
} = require("./availability.js");
const { assertBookingTransition, getExpiredBookingStatus } = require("./bookingLifecycle.js");

const PAYMENT_HOLD_MINUTES = 10;
const PAYMENT_HOLD_MS = PAYMENT_HOLD_MINUTES * 60 * 1000;

async function checkAvailability(listingId, request, now = new Date()) {
    const { checkIn, checkOut, nights } = parseDateRange(request.checkIn, request.checkOut, now);
    const guests = validateGuestCount(request.guests);
    const listing = await loadBookableListing(listingId);
    const priceSnapshot = calculatePrice(listing, nights, guests, now);
    const unavailableRanges = await getUnavailableRanges(listing, checkIn, checkOut, now);
    const available = unavailableRanges.length === 0;
    return {
        available,
        checkIn,
        checkOut,
        guests,
        priceSnapshot,
        unavailableRanges,
    };
}

async function listUnavailableRanges(listingId, from, now = new Date()) {
    const { from: windowStart, to: windowEnd } = getAvailabilityWindow(from, now);
    const listing = await loadBookableListing(listingId);
    const unavailableRanges = await getUnavailableRanges(listing, windowStart, windowEnd, now);
    return {
        from: windowStart.toISOString().slice(0, 10),
        to: windowEnd.toISOString().slice(0, 10),
        unavailableRanges,
    };
}

async function createPendingBooking(listingId, guestId, request, now = new Date()) {
    if (!mongoose.Types.ObjectId.isValid(guestId)) {
        throw new ExpressError(401, "Please sign in to reserve a listing.");
    }
    const { checkIn, checkOut, nights } = parseDateRange(request.checkIn, request.checkOut, now);
    const guests = validateGuestCount(request.guests);
    const listing = await loadBookableListing(listingId);
    if (!listing.owner) throw new ExpressError(409, "This listing is not available for booking.");
    if (listing.owner.equals(guestId)) {
        throw new ExpressError(400, "You cannot book your own listing.");
    }
    if (!await checkListingAvailability(listing, checkIn, checkOut, now)) {
        throw new ExpressError(409, "Those dates are no longer available. Please choose different dates.");
    }

    const paymentExpiresAt = new Date(now.getTime() + PAYMENT_HOLD_MS);
    const booking = new Booking({
        _id: new mongoose.Types.ObjectId(),
        listing: listing._id,
        guest: guestId,
        host: listing.owner,
        listingSnapshot: { title: listing.title, location: listing.location },
        checkIn,
        checkOut,
        guests,
        priceSnapshot: calculatePrice(listing, nights, guests, now),
        status: "PENDING_PAYMENT",
        cancellationStatus: "NONE",
        paymentExpiresAt,
    });
    const hold = {
        bookingId: booking._id,
        checkIn,
        checkOut,
        status: "PENDING_PAYMENT",
        paymentExpiresAt: booking.paymentExpiresAt,
    };

    const lockedListing = await acquireBookingHold(listing._id, hold, now);
    try {
        if (!lockedListing.owner) throw new ExpressError(409, "This listing is not available for booking.");
        if (lockedListing.owner.equals(guestId)) {
            throw new ExpressError(400, "You cannot book your own listing.");
        }
        booking.host = lockedListing.owner;
        booking.listingSnapshot = {
            title: lockedListing.title,
            location: lockedListing.location,
        };
        booking.priceSnapshot = calculatePrice(lockedListing, nights, guests, now);
        await booking.save();
    } catch (error) {
        await releaseBookingHold(listing._id, booking._id);
        throw error;
    }
    return booking;
}

async function expirePendingBookings(now = new Date()) {
    const expirableStatuses = ["PENDING_PAYMENT", "PAYMENT_PROCESSING"];
    const candidates = await Booking.find({
        status: { $in: expirableStatuses },
        paymentExpiresAt: { $lte: now },
    }).select("_id listing").lean();
    if (candidates.length === 0) return 0;

    const candidateIds = candidates.map((booking) => booking._id);
    await Booking.updateMany(
        {
            _id: { $in: candidateIds },
            status: { $in: expirableStatuses },
            paymentExpiresAt: { $lte: now },
        },
        { $set: { status: "EXPIRED" } },
        { runValidators: true }
    );
    const expiredBookings = await Booking.find({
        _id: { $in: candidateIds },
        status: "EXPIRED",
    }).select("_id listing").lean();
    await Promise.all(expiredBookings.map((booking) =>
        releaseBookingHold(booking.listing, booking._id)
    ));
    return expiredBookings.length;
}

async function expireBookingIfDue(booking, now = new Date()) {
    if (getExpiredBookingStatus(booking, now) !== "EXPIRED") return booking;
    const expiredBooking = await Booking.findOneAndUpdate(
        {
            _id: booking._id,
            status: { $in: ["PENDING_PAYMENT", "PAYMENT_PROCESSING"] },
            paymentExpiresAt: { $lte: now },
        },
        { $set: { status: "EXPIRED" } },
        { returnDocument: "after", runValidators: true }
    );
    if (expiredBooking) await releaseBookingHold(expiredBooking.listing, expiredBooking._id);
    return expiredBooking || Booking.findById(booking._id);
}

async function cancelPendingBooking(bookingId, guestId, now = new Date()) {
    assertBookingTransition({ status: "PENDING_PAYMENT" }, "CANCELLED");
    const booking = await Booking.findOneAndUpdate(
        {
            _id: bookingId,
            guest: guestId,
            status: "PENDING_PAYMENT",
            paymentExpiresAt: { $gt: now },
        },
        {
            $set: {
                status: "CANCELLED",
                cancellationStatus: "CANCELLED",
                cancelledAt: now,
            },
        },
        { returnDocument: "after", runValidators: true }
    );
    if (booking) {
        await releaseBookingHold(booking.listing, booking._id);
        return booking;
    }

    const currentBooking = await Booking.findOne({ _id: bookingId, guest: guestId });
    if (!currentBooking) throw new ExpressError(404, "That booking could not be found.");
    if (getExpiredBookingStatus(currentBooking, now) === "EXPIRED") {
        await expireBookingIfDue(currentBooking, now);
        throw new ExpressError(409, "This booking hold has expired and its dates are available again.");
    }
    throw new ExpressError(409, "This booking can no longer be cancelled.");
}

function startBookingExpiryWorker(intervalMs = 60_000) {
    const timer = setInterval(() => {
        expirePendingBookings().catch((error) => {
            console.error("Booking expiry task failed:", error);
        });
    }, intervalMs);
    timer.unref();
    return timer;
}

module.exports = {
    PAYMENT_HOLD_MINUTES,
    checkAvailability,
    listUnavailableRanges,
    createPendingBooking,
    expirePendingBookings,
    expireBookingIfDue,
    cancelPendingBooking,
    startBookingExpiryWorker,
};
