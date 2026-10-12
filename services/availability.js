const mongoose = require("mongoose");
const Listing = require("../models/listing.js");
const Booking = require("../models/booking.js");
const ExpressError = require("../utils/ExpressError.js");

const HOLD_STATUSES = ["PENDING_PAYMENT", "PAYMENT_PROCESSING"];
const BOOKING_STATUSES = [
    "PENDING_PAYMENT",
    "PAYMENT_PROCESSING",
    "CONFIRMED",
    "PAYMENT_FAILED",
    "EXPIRED",
    "CANCELLED",
    "COMPLETED",
];

function isActiveBooking(booking, now = new Date()) {
    if (booking.status === "CONFIRMED") return true;
    return HOLD_STATUSES.includes(booking.status)
        && booking.paymentExpiresAt
        && new Date(booking.paymentExpiresAt) > now;
}

function activeBookingQuery(listingId, checkIn, checkOut) {
    return {
        listing: listingId,
        checkIn: { $lt: checkOut },
        checkOut: { $gt: checkIn },
        status: { $in: BOOKING_STATUSES },
    };
}

function toDateOnly(value) {
    return new Date(value).toISOString().slice(0, 10);
}

function hasConflictingHold(holds = [], checkIn, checkOut, now = new Date()) {
    return holds.some((hold) => {
        if (!hold || !hold.checkIn || !hold.checkOut) return false;
        const active = hold.status === "CONFIRMED"
            || (HOLD_STATUSES.includes(hold.status)
                && hold.paymentExpiresAt
                && new Date(hold.paymentExpiresAt) > now);
        return active
            && new Date(hold.checkIn) < checkOut
            && new Date(hold.checkOut) > checkIn;
    });
}

async function loadBookableListing(listingId) {
    if (!mongoose.Types.ObjectId.isValid(listingId)) {
        throw new ExpressError(404, "That listing could not be found.");
    }
    const listing = await Listing.findById(listingId)
        .select("_id owner title location price priceUnit bookingHolds")
        .lean();
    if (!listing) throw new ExpressError(404, "That listing could not be found.");
    return listing;
}

async function checkListingAvailability(listing, checkIn, checkOut, now = new Date()) {
    const unavailableRanges = await getUnavailableRanges(listing, checkIn, checkOut, now);
    return unavailableRanges.length === 0;
}

async function getUnavailableRanges(listing, from, to, now = new Date()) {
    const bookings = await Booking.find(activeBookingQuery(listing._id, from, to))
        .select("_id checkIn checkOut status paymentExpiresAt")
        .lean();
    const bookingIds = new Set(bookings.map((booking) => String(booking._id)));
    const ranges = [
        ...bookings.filter((booking) => isActiveBooking(booking, now)),
        ...(listing.bookingHolds || []).filter((hold) => {
            const hasBookingRecord = hold.bookingId && bookingIds.has(String(hold.bookingId));
            return !hasBookingRecord && hasConflictingHold([hold], from, to, now);
        }),
    ];
    const uniqueRanges = new Map();
    for (const range of ranges) {
        const checkIn = toDateOnly(range.checkIn);
        const checkOut = toDateOnly(range.checkOut);
        uniqueRanges.set(`${checkIn}/${checkOut}`, { checkIn, checkOut });
    }
    return [...uniqueRanges.values()].sort((left, right) =>
        left.checkIn.localeCompare(right.checkIn) || left.checkOut.localeCompare(right.checkOut)
    );
}

async function removeInactiveBookingHolds(listingId, now) {
    const listing = await Listing.findById(listingId).select("bookingHolds").lean();
    const bookingIds = (listing?.bookingHolds || [])
        .map((hold) => hold.bookingId)
        .filter(Boolean);
    if (bookingIds.length === 0) return;

    const bookings = await Booking.find({ _id: { $in: bookingIds } })
        .select("_id status paymentExpiresAt")
        .lean();
    const inactiveBookingIds = bookings
        .filter((booking) => !isActiveBooking(booking, now))
        .map((booking) => booking._id);
    if (inactiveBookingIds.length > 0) {
        await Listing.updateOne(
            { _id: listingId },
            { $pull: { bookingHolds: { bookingId: { $in: inactiveBookingIds } } } }
        );
    }
}

async function acquireBookingHold(listingId, hold, now = new Date()) {
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    await removeInactiveBookingHolds(listingId, now);
    await Listing.updateOne(
        { _id: listingId },
        {
            $pull: {
                bookingHolds: {
                    $or: [
                        { status: { $in: HOLD_STATUSES }, paymentExpiresAt: { $lte: now } },
                        { status: "CONFIRMED", checkOut: { $lte: today } },
                    ],
                },
            },
        }
    );

    const conflict = {
        checkIn: { $lt: hold.checkOut },
        checkOut: { $gt: hold.checkIn },
        $or: [
            { status: { $in: HOLD_STATUSES }, paymentExpiresAt: { $gt: now } },
            { status: "CONFIRMED" },
        ],
    };
    const updatedListing = await Listing.findOneAndUpdate(
        {
            _id: listingId,
            bookingHolds: { $not: { $elemMatch: conflict } },
        },
        { $push: { bookingHolds: hold } },
        { returnDocument: "after", runValidators: true }
    ).select("_id owner title location price priceUnit");

    if (updatedListing) return updatedListing;
    const listingExists = await Listing.exists({ _id: listingId });
    if (!listingExists) throw new ExpressError(404, "That listing could not be found.");
    throw new ExpressError(409, "Those dates are no longer available. Please choose different dates.");
}

async function releaseBookingHold(listingId, bookingId) {
    await Listing.updateOne(
        { _id: listingId },
        { $pull: { bookingHolds: { bookingId } } }
    );
}

async function confirmBookingHold(booking, now = new Date()) {
    const activeStatuses = ["PENDING_PAYMENT", "PAYMENT_PROCESSING"];
    const conflictingBookingQuery = {
        ...activeBookingQuery(booking.listing, booking.checkIn, booking.checkOut),
        _id: { $ne: booking._id },
    };
    const conflictingBookings = await Booking.find(conflictingBookingQuery)
        .select("_id status paymentExpiresAt")
        .lean();
    if (conflictingBookings.some((candidate) => isActiveBooking(candidate, now))) {
        return false;
    }

    const conflictingHold = {
        bookingId: { $ne: booking._id },
        checkIn: { $lt: booking.checkOut },
        checkOut: { $gt: booking.checkIn },
        $or: [
            { status: "CONFIRMED" },
            { status: { $in: activeStatuses }, paymentExpiresAt: { $gt: now } },
        ],
    };
    const updatedListing = await Listing.findOneAndUpdate(
        {
            _id: booking.listing,
            bookingHolds: {
                $elemMatch: {
                    bookingId: booking._id,
                    $or: [
                        { status: "CONFIRMED" },
                        {
                            status: { $in: activeStatuses },
                            paymentExpiresAt: { $gt: now },
                        },
                    ],
                },
            },
            $nor: [{ bookingHolds: { $elemMatch: conflictingHold } }],
        },
        { $set: { "bookingHolds.$.status": "CONFIRMED" } },
        { returnDocument: "after", runValidators: true }
    ).select("_id");
    return Boolean(updatedListing);
}

module.exports = {
    hasConflictingHold,
    isActiveBooking,
    loadBookableListing,
    checkListingAvailability,
    getUnavailableRanges,
    acquireBookingHold,
    confirmBookingHold,
    releaseBookingHold,
};
