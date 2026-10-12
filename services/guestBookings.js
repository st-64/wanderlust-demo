const Booking = require("../models/booking.js");
const { getExpiredBookingStatus } = require("./bookingLifecycle.js");

function categorizeGuestBookings(bookings, now = new Date()) {
    const sections = {
        upcoming: [],
        current: [],
        past: [],
        cancelled: [],
        updates: [],
    };

    for (const booking of bookings) {
        const status = getExpiredBookingStatus(booking, now);
        const dashboardBooking = { ...booking, displayStatus: status };

        if (status === "CANCELLED") {
            sections.cancelled.push(dashboardBooking);
        } else if (status === "CONFIRMED") {
            if (booking.checkOut <= now) {
                sections.past.push(dashboardBooking);
            } else if (booking.checkIn <= now) {
                sections.current.push(dashboardBooking);
            } else {
                sections.upcoming.push(dashboardBooking);
            }
        } else if (status === "COMPLETED") {
            sections.past.push(dashboardBooking);
        } else {
            sections.updates.push(dashboardBooking);
        }
    }

    return sections;
}

async function getGuestBookings(guestId, now = new Date()) {
    const bookings = await Booking.find({ guest: guestId })
        .select(
            "listing guest listingSnapshot checkIn checkOut guests priceSnapshot status cancellationStatus paymentExpiresAt bookingReference createdAt"
        )
        .populate({
            path: "listing",
            select: "title location images image",
        })
        .sort({ checkIn: -1, createdAt: -1 })
        .lean();

    return categorizeGuestBookings(bookings, now);
}

module.exports = { categorizeGuestBookings, getGuestBookings };
