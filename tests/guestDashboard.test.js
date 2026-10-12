const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Booking = require("../models/booking.js");
const bookingController = require("../controllers/booking.js");
const userController = require("../controllers/user.js");
const { isLoggedIn } = require("../middlware.js");
const guestBookingService = require("../services/guestBookings.js");
const bookingService = require("../services/booking.js");

const testNow = new Date("2026-10-12T12:00:00.000Z");

function booking(status, checkIn, checkOut, extra = {}) {
    return {
        status,
        checkIn: new Date(checkIn),
        checkOut: new Date(checkOut),
        paymentExpiresAt: new Date("2026-10-12T12:10:00.000Z"),
        ...extra,
    };
}

test("guest dashboard categorizes trips by lifecycle status and UTC server time", () => {
    const sections = guestBookingService.categorizeGuestBookings([
        booking("CONFIRMED", "2026-10-15T00:00:00.000Z", "2026-10-18T00:00:00.000Z"),
        booking("CONFIRMED", "2026-10-10T00:00:00.000Z", "2026-10-13T00:00:00.000Z"),
        booking("CONFIRMED", "2026-10-10T00:00:00.000Z", "2026-10-12T12:00:00.000Z"),
        booking("COMPLETED", "2026-10-01T00:00:00.000Z", "2026-10-03T00:00:00.000Z"),
        booking("CANCELLED", "2026-10-15T00:00:00.000Z", "2026-10-18T00:00:00.000Z"),
        booking("PENDING_PAYMENT", "2026-10-15T00:00:00.000Z", "2026-10-18T00:00:00.000Z"),
        booking("PENDING_PAYMENT", "2026-10-15T00:00:00.000Z", "2026-10-18T00:00:00.000Z", {
            paymentExpiresAt: new Date("2026-10-12T11:59:59.000Z"),
        }),
        booking("PAYMENT_PROCESSING", "2026-10-15T00:00:00.000Z", "2026-10-18T00:00:00.000Z"),
        booking("PAYMENT_FAILED", "2026-10-15T00:00:00.000Z", "2026-10-18T00:00:00.000Z"),
    ], testNow);

    assert.equal(sections.upcoming.length, 1);
    assert.equal(sections.current.length, 1);
    assert.equal(sections.past.length, 2);
    assert.equal(sections.cancelled.length, 1);
    assert.equal(sections.updates.length, 4);
    assert.equal(sections.updates.find((item) => item.displayStatus === "EXPIRED").status, "PENDING_PAYMENT");
    assert.equal(sections.current[0].checkOut > testNow, true);
});

test("guest booking lookup scopes its Mongo query to the authenticated guest", async () => {
    const originalFind = Booking.find;
    const guestId = new mongoose.Types.ObjectId();
    let query;
    Booking.find = (filter) => {
        query = filter;
        return {
            select() {
                return this;
            },
            populate() {
                return this;
            },
            sort() {
                return this;
            },
            lean: async () => [],
        };
    };

    try {
        const sections = await guestBookingService.getGuestBookings(guestId, testNow);
        assert.deepEqual(query, { guest: guestId });
        assert.deepEqual(sections, {
            upcoming: [],
            current: [],
            past: [],
            cancelled: [],
            updates: [],
        });
    } finally {
        Booking.find = originalFind;
    }
});

test("dashboard uses the session guest and keeps deleted-listing bookings readable", async () => {
    const originalGetGuestBookings = guestBookingService.getGuestBookings;
    const guestId = new mongoose.Types.ObjectId();
    let queriedGuest;
    const bookingRecord = {
        _id: new mongoose.Types.ObjectId(),
        listing: null,
        listingSnapshot: { title: "Old lakeside stay", location: "Udaipur, India" },
    };
    guestBookingService.getGuestBookings = async (id) => {
        queriedGuest = id;
        return {
            upcoming: [bookingRecord],
            current: [],
            past: [],
            cancelled: [],
            updates: [],
        };
    };
    let rendered;
    const res = {
        render(view, locals) {
            rendered = { view, locals };
        },
    };

    try {
        await userController.myTrips({
            user: { _id: guestId },
            query: { guest: new mongoose.Types.ObjectId().toString() },
        }, res);
        assert.equal(queriedGuest, guestId);
        assert.equal(rendered.view, "bookings/index.ejs");
        assert.equal(rendered.locals.sections.upcoming[0].listingTitle, "Old lakeside stay");
        assert.equal(rendered.locals.sections.upcoming[0].listingLocation, "Udaipur, India");
        assert.equal(rendered.locals.sections.upcoming[0].listingUrl, null);
        assert.equal(rendered.locals.sections.upcoming[0].listingImageUrl, "/images/listing-placeholder.svg");
    } finally {
        guestBookingService.getGuestBookings = originalGetGuestBookings;
    }
});

test("unauthenticated dashboard requests follow the existing login redirect convention", () => {
    const req = {
        isAuthenticated: () => false,
        session: {},
        originalUrl: "/dashboard",
    };
    let redirected;
    const res = {
        redirect(path) {
            redirected = path;
        },
    };
    req.flash = (type, message) => {
        assert.equal(type, "error");
        assert.match(message, /logged in/i);
    };

    isLoggedIn(req, res, () => assert.fail("Unauthenticated request must not continue."));
    assert.equal(req.session.redirectUrl, "/dashboard");
    assert.equal(redirected, "/login");
});

test("cancellation controller ignores client booking, status, price, and payment fields", async () => {
    const originalCancelPendingBooking = bookingService.cancelPendingBooking;
    const bookingId = new mongoose.Types.ObjectId();
    const guestId = new mongoose.Types.ObjectId();
    let cancellationArgs;
    bookingService.cancelPendingBooking = async (...args) => {
        cancellationArgs = args;
    };
    let redirect;
    const req = {
        params: { bookingId: bookingId.toString() },
        user: { _id: guestId },
        body: {
            guest: new mongoose.Types.ObjectId().toString(),
            status: "CONFIRMED",
            price: "0",
            total: "0",
            paymentStatus: "PAID",
            listing: new mongoose.Types.ObjectId().toString(),
        },
        flash() {},
    };
    const res = {
        redirect(path) {
            redirect = path;
        },
    };

    try {
        await bookingController.cancel(req, res);
        assert.deepEqual(cancellationArgs, [bookingId.toString(), guestId]);
        assert.equal(redirect, "/dashboard#cancelled");
    } finally {
        bookingService.cancelPendingBooking = originalCancelPendingBooking;
    }
});
