const ExpressError = require("../utils/ExpressError.js");

const MAX_BOOKING_NIGHTS = 90;
const MAX_GUESTS = 16;
const AVAILABILITY_WINDOW_DAYS = 365;

function parseDateOnly(value, field) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new ExpressError(400, `${field} must be a valid date.`);
    }
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
        throw new ExpressError(400, `${field} must be a valid date.`);
    }
    return date;
}

function getAvailabilityWindow(fromValue, now = new Date()) {
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const from = fromValue === undefined ? today : parseDateOnly(fromValue, "Start date");
    if (from < today) {
        throw new ExpressError(400, "Availability cannot be requested for dates before today.");
    }
    const to = new Date(from.getTime() + AVAILABILITY_WINDOW_DAYS * 86_400_000);
    return { from, to };
}

function parseDateRange(checkInValue, checkOutValue, now = new Date()) {
    const checkIn = parseDateOnly(checkInValue, "Check-in");
    const checkOut = parseDateOnly(checkOutValue, "Check-out");
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    if (checkIn < today) {
        throw new ExpressError(400, "Check-in must be today or a future date.");
    }
    if (checkOut <= checkIn) {
        throw new ExpressError(400, "Check-out must be after check-in.");
    }

    const nights = (checkOut.getTime() - checkIn.getTime()) / 86_400_000;
    if (nights > MAX_BOOKING_NIGHTS) {
        throw new ExpressError(400, `Bookings cannot exceed ${MAX_BOOKING_NIGHTS} nights.`);
    }

    return { checkIn, checkOut, nights };
}

function validateGuestCount(value) {
    const guests = Number(value);
    if (!Number.isInteger(guests) || guests < 1 || guests > MAX_GUESTS) {
        throw new ExpressError(400, `Guest count must be a whole number from 1 to ${MAX_GUESTS}.`);
    }
    return guests;
}

function calculatePrice(listing, nights, guests, calculatedAt = new Date()) {
    const price = Number(listing.price);
    if (!Number.isFinite(price) || price < 0) {
        throw new ExpressError(422, "This listing does not have a valid price.");
    }
    const priceUnit = ["night", "person", "service"].includes(listing.priceUnit)
        ? listing.priceUnit
        : "night";
    const unitPriceMinor = Math.round(price * 100);
    const quantity = priceUnit === "night" ? nights : priceUnit === "person" ? guests : 1;
    const subtotalMinor = unitPriceMinor * quantity;
    if (!Number.isSafeInteger(subtotalMinor)) {
        throw new ExpressError(422, "The calculated booking price is too large.");
    }

    return {
        unitPriceMinor,
        quantity,
        subtotalMinor,
        currency: "INR",
        priceUnit,
        nights,
        guests,
        calculatedAt,
    };
}

module.exports = {
    MAX_BOOKING_NIGHTS,
    MAX_GUESTS,
    AVAILABILITY_WINDOW_DAYS,
    parseDateOnly,
    getAvailabilityWindow,
    parseDateRange,
    validateGuestCount,
    calculatePrice,
};
