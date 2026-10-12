const mongoose = require("mongoose");
const Booking = require("../models/booking.js");
const Listing = require("../models/listing.js");
const ExpressError = require("../utils/ExpressError.js");
const { getListingCoverImage } = require("../utils/listingImages.js");
const { getExpiredBookingStatus } = require("./bookingLifecycle.js");

const PAGE_SIZE = 12;
const RESERVATION_FILTERS = ["all", "upcoming", "current", "past", "pending", "cancelled", "refund-required"];
const CONFIRMED_STATUSES = ["CONFIRMED", "COMPLETED"];

function parsePage(value) {
    if (value === undefined) return 1;
    if (typeof value !== "string" || !/^\d+$/.test(value)) {
        throw new ExpressError(400, "Page must be a positive whole number.");
    }
    const page = Number(value);
    if (!Number.isSafeInteger(page) || page < 1) {
        throw new ExpressError(400, "Page must be a positive whole number.");
    }
    return page;
}

function parseReservationFilter(value) {
    const filter = value === undefined ? "all" : value;
    if (typeof filter !== "string" || !RESERVATION_FILTERS.includes(filter)) {
        throw new ExpressError(400, "Choose a valid reservation status filter.");
    }
    return filter;
}

function buildReservationQuery(hostId, filter, now = new Date()) {
    const query = { host: hostId };
    switch (filter) {
        case "upcoming":
            query.status = "CONFIRMED";
            query.checkIn = { $gt: now };
            break;
        case "current":
            query.status = "CONFIRMED";
            query.checkIn = { $lte: now };
            query.checkOut = { $gt: now };
            break;
        case "past":
            query.$or = [
                { status: "COMPLETED" },
                { status: "CONFIRMED", checkOut: { $lte: now } },
            ];
            break;
        case "pending":
            query.$or = [
                { status: "PAYMENT_PROCESSING", paymentExpiresAt: { $gt: now } },
                { status: "PENDING_PAYMENT", paymentExpiresAt: { $gt: now } },
            ];
            break;
        case "cancelled":
            query.$or = [
                { status: { $in: ["CANCELLED", "EXPIRED", "PAYMENT_FAILED"] } },
                { status: "PENDING_PAYMENT", paymentExpiresAt: { $lte: now } },
            ];
            break;
        case "refund-required":
            query.status = "REFUND_REQUIRED";
            break;
        case "all":
            break;
        default:
            throw new ExpressError(400, "Choose a valid reservation status filter.");
    }
    return query;
}

function decorateReservation(booking, now = new Date()) {
    const listing = booking.listing;
    const guest = booking.guest;
    return {
        ...booking,
        displayStatus: getExpiredBookingStatus(booking, now),
        listingTitle: listing?.title || booking.listingSnapshot?.title || "Listing unavailable",
        listingLocation: listing?.location || booking.listingSnapshot?.location || "Location unavailable",
        listingImageUrl: getListingCoverImage(listing || {}),
        guestName: guest?.fullName || guest?.username || "Guest account unavailable",
    };
}

async function getHostDashboard(hostId, now = new Date()) {
    const [
        totalListings,
        upcomingReservations,
        currentStays,
        pendingHolds,
        grossValueResult,
    ] = await Promise.all([
        Listing.countDocuments({ owner: hostId }),
        Booking.countDocuments({
            host: hostId,
            status: "CONFIRMED",
            checkIn: { $gt: now },
        }),
        Booking.countDocuments({
            host: hostId,
            status: "CONFIRMED",
            checkIn: { $lte: now },
            checkOut: { $gt: now },
        }),
        Booking.countDocuments({
            host: hostId,
            $or: [
                { status: "PENDING_PAYMENT", paymentExpiresAt: { $gt: now } },
                { status: "PAYMENT_PROCESSING", paymentExpiresAt: { $gt: now } },
            ],
        }),
        Booking.aggregate([
            {
                $match: {
                    host: new mongoose.Types.ObjectId(hostId),
                    status: { $in: CONFIRMED_STATUSES },
                    "priceSnapshot.currency": "INR",
                },
            },
            {
                $group: {
                    _id: null,
                    bookingCount: { $sum: 1 },
                    subtotalMinor: { $sum: "$priceSnapshot.subtotalMinor" },
                },
            },
        ]),
    ]);

    return {
        totalListings,
        activeListings: totalListings,
        upcomingReservations,
        currentStays,
        pendingHolds,
        grossBookingValueMinor: grossValueResult[0]?.subtotalMinor || 0,
        grossBookingCount: grossValueResult[0]?.bookingCount || 0,
    };
}

async function getHostListings(hostId, requestedPage = 1) {
    const totalListings = await Listing.countDocuments({ owner: hostId });
    const totalPages = Math.max(1, Math.ceil(totalListings / PAGE_SIZE));
    const page = Math.min(requestedPage, totalPages);
    const listings = await Listing.find({ owner: hostId })
        .select("_id title location country price priceUnit category type image images")
        .sort({ title: 1, _id: 1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .lean();

    return {
        listings: listings.map((listing) => ({
            ...listing,
            coverImageUrl: getListingCoverImage(listing),
        })),
        page,
        totalPages,
        totalListings,
    };
}

async function getHostReservations(hostId, requestedFilter = "all", requestedPage = 1, now = new Date()) {
    const filter = parseReservationFilter(requestedFilter);
    const query = buildReservationQuery(hostId, filter, now);
    const totalReservations = await Booking.countDocuments(query);
    const totalPages = Math.max(1, Math.ceil(totalReservations / PAGE_SIZE));
    const page = Math.min(requestedPage, totalPages);
    const sort = filter === "upcoming" || filter === "current"
        ? { checkIn: 1, _id: 1 }
        : { createdAt: -1, _id: -1 };
    const reservations = await Booking.find(query)
        .select("bookingReference host listing guest listingSnapshot checkIn checkOut guests priceSnapshot status paymentExpiresAt createdAt")
        .populate({ path: "listing", select: "_id owner title location images image" })
        .populate({ path: "guest", select: "_id username fullName profileImage" })
        .sort(sort)
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .lean();

    return {
        reservations: reservations.map((reservation) => decorateReservation(reservation, now)),
        filter,
        page,
        totalPages,
        totalReservations,
    };
}

async function getHostReservation(bookingId, hostId, now = new Date()) {
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
        throw new ExpressError(404, "That reservation could not be found.");
    }

    const booking = await Booking.findOne({ _id: bookingId, host: hostId })
        .select("bookingReference host listing guest listingSnapshot checkIn checkOut guests priceSnapshot status paymentExpiresAt createdAt")
        .populate({ path: "listing", select: "_id owner title location images image" })
        .populate({ path: "guest", select: "_id username fullName profileImage" })
        .lean();

    if (!booking || (booking.listing && !booking.listing.owner?.equals(hostId))) {
        throw new ExpressError(404, "That reservation could not be found.");
    }
    return decorateReservation(booking, now);
}

module.exports = {
    PAGE_SIZE,
    RESERVATION_FILTERS,
    parsePage,
    parseReservationFilter,
    buildReservationQuery,
    getHostDashboard,
    getHostListings,
    getHostReservations,
    getHostReservation,
};
