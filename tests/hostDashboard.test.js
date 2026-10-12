const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Booking = require("../models/booking.js");
const Listing = require("../models/listing.js");
const hostDashboard = require("../services/hostDashboard.js");
const hostController = require("../controllers/host.js");
const hostRoutes = require("../routes/host.js");
const { isLoggedIn } = require("../middlware.js");

const testNow = new Date("2026-10-12T12:00:00.000Z");

function queryChain(result) {
    const chain = {
        selected: "",
        populations: [],
        sortOrder: null,
        skipped: 0,
        limited: 0,
        select(fields) {
            this.selected = fields;
            return this;
        },
        populate(options) {
            this.populations.push(options);
            return this;
        },
        sort(order) {
            this.sortOrder = order;
            return this;
        },
        skip(count) {
            this.skipped = count;
            return this;
        },
        limit(count) {
            this.limited = count;
            return this;
        },
        lean: async () => result,
    };
    return chain;
}

test("every host route requires the existing login middleware", () => {
    const routeLayers = hostRoutes.stack.filter((layer) => layer.route);
    assert.equal(routeLayers.length, 4);
    for (const layer of routeLayers) {
        assert.equal(layer.route.stack[0].handle, isLoggedIn);
    }
});

test("unauthenticated host dashboard access follows the existing login redirect", () => {
    const req = {
        isAuthenticated: () => false,
        session: {},
        originalUrl: "/host/dashboard",
        flash(type, message) {
            assert.equal(type, "error");
            assert.match(message, /logged in/i);
        },
    };
    let redirect;
    isLoggedIn(req, { redirect(path) { redirect = path; } }, () => assert.fail("Login is required."));
    assert.equal(req.session.redirectUrl, "/host/dashboard");
    assert.equal(redirect, "/login");
});

test("host dashboard metrics are all scoped to the authenticated host", async () => {
    const originalListingCount = Listing.countDocuments;
    const originalBookingCount = Booking.countDocuments;
    const originalAggregate = Booking.aggregate;
    const hostId = new mongoose.Types.ObjectId();
    const listingFilters = [];
    const bookingFilters = [];
    let aggregation;
    Listing.countDocuments = async (filter) => {
        listingFilters.push(filter);
        return 3;
    };
    Booking.countDocuments = async (filter) => {
        bookingFilters.push(filter);
        return 2;
    };
    Booking.aggregate = async (pipeline) => {
        aggregation = pipeline;
        return [{ bookingCount: 2, subtotalMinor: 253000 }];
    };
    try {
        const summary = await hostDashboard.getHostDashboard(hostId, testNow);
        assert.deepEqual(listingFilters, [{ owner: hostId }]);
        assert.equal(bookingFilters.length, 3);
        assert.ok(bookingFilters.every((filter) => filter.host.equals(hostId)));
        assert.equal(summary.totalListings, 3);
        assert.equal(summary.activeListings, 3);
        assert.equal(summary.grossBookingValueMinor, 253000);
        assert.equal(summary.grossBookingCount, 2);
        const match = aggregation[0].$match;
        assert.ok(match.host.equals(hostId));
        assert.deepEqual(match.status, { $in: ["CONFIRMED", "COMPLETED"] });
        assert.equal(match["priceSnapshot.currency"], "INR");
        assert.equal(aggregation[1].$group.subtotalMinor.$sum, "$priceSnapshot.subtotalMinor");
    } finally {
        Listing.countDocuments = originalListingCount;
        Booking.countDocuments = originalBookingCount;
        Booking.aggregate = originalAggregate;
    }
});

test("an empty host dashboard renders server-provided zero-listing summary", async () => {
    const originalGetHostDashboard = hostDashboard.getHostDashboard;
    const hostId = new mongoose.Types.ObjectId();
    hostDashboard.getHostDashboard = async (id) => {
        assert.equal(id, hostId);
        return {
            totalListings: 0,
            activeListings: 0,
            upcomingReservations: 0,
            currentStays: 0,
            pendingHolds: 0,
            grossBookingValueMinor: 0,
            grossBookingCount: 0,
        };
    };
    let rendered;
    try {
        await hostController.dashboard({ user: { _id: hostId } }, {
            render(view, locals) { rendered = { view, locals }; },
        });
        assert.equal(rendered.view, "host/dashboard.ejs");
        assert.equal(rendered.locals.summary.totalListings, 0);
        assert.equal(rendered.locals.summary.grossBookingValueMinor, 0);
    } finally {
        hostDashboard.getHostDashboard = originalGetHostDashboard;
    }
});

test("host listing queries use only the authenticated owner's ID", async () => {
    const originalCount = Listing.countDocuments;
    const originalFind = Listing.find;
    const hostId = new mongoose.Types.ObjectId();
    const listing = {
        _id: new mongoose.Types.ObjectId(),
        title: "Legacy listing",
        image: { url: "https://example.test/legacy.jpg" },
    };
    let countFilter;
    let findFilter;
    let query;
    Listing.countDocuments = async (filter) => {
        countFilter = filter;
        return 1;
    };
    Listing.find = (filter) => {
        findFilter = filter;
        query = queryChain([listing]);
        return query;
    };
    try {
        const result = await hostDashboard.getHostListings(hostId, 9);
        assert.deepEqual(countFilter, { owner: hostId });
        assert.deepEqual(findFilter, { owner: hostId });
        assert.equal(result.page, 1);
        assert.equal(result.totalListings, 1);
        assert.equal(result.listings[0].coverImageUrl, "https://example.test/legacy.jpg");
        assert.equal(query.limited, hostDashboard.PAGE_SIZE);
        assert.equal(query.skipped, 0);
    } finally {
        Listing.countDocuments = originalCount;
        Listing.find = originalFind;
    }
});

test("reservation filters preserve host scope and exclude expired holds from pending", () => {
    const hostId = new mongoose.Types.ObjectId();
    const upcoming = hostDashboard.buildReservationQuery(hostId, "upcoming", testNow);
    assert.ok(upcoming.host.equals(hostId));
    assert.equal(upcoming.status, "CONFIRMED");
    assert.deepEqual(upcoming.checkIn, { $gt: testNow });

    const pending = hostDashboard.buildReservationQuery(hostId, "pending", testNow);
    assert.ok(pending.host.equals(hostId));
    assert.deepEqual(pending.$or, [
        { status: "PAYMENT_PROCESSING", paymentExpiresAt: { $gt: testNow } },
        { status: "PENDING_PAYMENT", paymentExpiresAt: { $gt: testNow } },
    ]);

    const expired = hostDashboard.buildReservationQuery(hostId, "cancelled", testNow);
    assert.ok(expired.host.equals(hostId));
    assert.ok(expired.$or.some((condition) =>
        condition.status === "PENDING_PAYMENT" && condition.paymentExpiresAt.$lte === testNow
    ));
    assert.deepEqual(
        hostDashboard.buildReservationQuery(hostId, "refund-required", testNow),
        { host: hostId, status: "REFUND_REQUIRED" }
    );
});

test("host reservation filters and page numbers reject invalid query values", () => {
    assert.equal(hostDashboard.parseReservationFilter(undefined), "all");
    assert.equal(hostDashboard.parseReservationFilter("current"), "current");
    assert.throws(() => hostDashboard.parseReservationFilter(["all", "pending"]), { statusCode: 400 });
    assert.throws(() => hostDashboard.parseReservationFilter("owner=someone-else"), { statusCode: 400 });
    assert.equal(hostDashboard.parsePage("2"), 2);
    assert.throws(() => hostDashboard.parsePage("0"), { statusCode: 400 });
    assert.throws(() => hostDashboard.parsePage("1e9"), { statusCode: 400 });
    assert.throws(() => hostDashboard.parsePage(["1", "2"]), { statusCode: 400 });
});

test("host reservation lists are scoped to server-recorded host and paginate safely", async () => {
    const originalCount = Booking.countDocuments;
    const originalFind = Booking.find;
    const hostId = new mongoose.Types.ObjectId();
    let countFilter;
    let findFilter;
    let query;
    Booking.countDocuments = async (filter) => {
        countFilter = filter;
        return 30;
    };
    Booking.find = (filter) => {
        findFilter = filter;
        query = queryChain([]);
        return query;
    };
    try {
        const result = await hostDashboard.getHostReservations(hostId, "past", 99, testNow);
        assert.ok(countFilter.host.equals(hostId));
        assert.deepEqual(countFilter.$or, [
            { status: "COMPLETED" },
            { status: "CONFIRMED", checkOut: { $lte: testNow } },
        ]);
        assert.deepEqual(findFilter, countFilter);
        assert.equal(result.page, 3);
        assert.equal(result.totalPages, 3);
        assert.equal(query.skipped, 24);
        assert.equal(query.limited, hostDashboard.PAGE_SIZE);
        assert.ok(!query.selected.includes("email"));
    } finally {
        Booking.countDocuments = originalCount;
        Booking.find = originalFind;
    }
});

test("missing listings and guests fall back safely in host reservation rows", async () => {
    const originalCount = Booking.countDocuments;
    const originalFind = Booking.find;
    const hostId = new mongoose.Types.ObjectId();
    const booking = {
        _id: new mongoose.Types.ObjectId(),
        status: "PENDING_PAYMENT",
        paymentExpiresAt: new Date("2026-10-12T11:59:00.000Z"),
        listing: null,
        guest: null,
        listingSnapshot: { title: "Saved listing title", location: "Saved location" },
        priceSnapshot: { subtotalMinor: 12000 },
    };
    Booking.countDocuments = async () => 1;
    Booking.find = () => queryChain([booking]);
    try {
        const result = await hostDashboard.getHostReservations(hostId, "all", 1, testNow);
        assert.equal(result.reservations[0].displayStatus, "EXPIRED");
        assert.equal(result.reservations[0].listingTitle, "Saved listing title");
        assert.equal(result.reservations[0].listingLocation, "Saved location");
        assert.equal(result.reservations[0].listingImageUrl, "/images/listing-placeholder.svg");
        assert.equal(result.reservations[0].guestName, "Guest account unavailable");
        assert.equal(result.reservations[0].priceSnapshot.subtotalMinor, 12000);
    } finally {
        Booking.countDocuments = originalCount;
        Booking.find = originalFind;
    }
});

test("host reservation detail requires the requested booking's host ID", async () => {
    const originalFindOne = Booking.findOne;
    const hostId = new mongoose.Types.ObjectId();
    const otherHostId = new mongoose.Types.ObjectId();
    const bookingId = new mongoose.Types.ObjectId();
    let filter;
    Booking.findOne = (query) => {
        filter = query;
        return queryChain(null);
    };
    try {
        await assert.rejects(
            hostDashboard.getHostReservation(bookingId.toString(), hostId),
            { statusCode: 404 }
        );
        assert.equal(filter._id, bookingId.toString());
        assert.ok(filter.host.equals(hostId));
        assert.ok(!filter.host.equals(otherHostId));
    } finally {
        Booking.findOne = originalFindOne;
    }
});

test("host reservation detail fails closed when a linked listing belongs to another user", async () => {
    const originalFindOne = Booking.findOne;
    const hostId = new mongoose.Types.ObjectId();
    const otherHostId = new mongoose.Types.ObjectId();
    const booking = {
        _id: new mongoose.Types.ObjectId(),
        host: hostId,
        status: "CONFIRMED",
        listing: { _id: new mongoose.Types.ObjectId(), owner: otherHostId },
        guest: null,
        listingSnapshot: { title: "Listing", location: "Place" },
    };
    Booking.findOne = () => queryChain(booking);
    try {
        await assert.rejects(
            hostDashboard.getHostReservation(booking._id.toString(), hostId),
            { statusCode: 404 }
        );
    } finally {
        Booking.findOne = originalFindOne;
    }
});
