const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { Readable, Writable } = require("node:stream");
const Listing = require("../models/listing.js");
const User = require("../models/user.js");
const Booking = require("../models/booking.js");
const { cloudinary, storage } = require("../cloudConfig.js");
const { data } = require("../init/data.js");
const {
    listingSchema,
    reviewSchema,
    userSchema,
    profileSchema,
    bookingRequestSchema,
} = require("../schema.js");
const { getListingImages, getListingCoverImage } = require("../utils/listingImages.js");
const { isReviewAuthor, isBookingGuest, isBookingHost } = require("../middlware.js");
const userController = require("../controllers/user.js");
const listingController = require("../controllers/listing.js");
const {
    parseDateRange,
    calculatePrice,
    getAvailabilityWindow,
} = require("../services/bookingDates.js");
const {
    hasConflictingHold,
    getUnavailableRanges,
    acquireBookingHold,
} = require("../services/availability.js");
const {
    assertBookingTransition,
    getExpiredBookingStatus,
} = require("../services/bookingLifecycle.js");
const bookingService = require("../services/booking.js");
const ExpressError = require("../utils/ExpressError.js");

const validListingInput = {
    listing: {
        title: "A quiet lake-side home",
        description: "A peaceful place with a view of the lake.",
        location: "Udaipur, Rajasthan",
        country: "India",
        price: "1200",
        category: "Homes",
        type: "Lake",
        priceUnit: "night",
    },
};

test("listing request validation accepts supported listing fields", () => {
    const { error } = listingSchema.validate(validListingInput);
    assert.equal(error, undefined);
    assert.equal(listingSchema.validate({
        ...validListingInput,
        _csrf: "a".repeat(64),
    }).error, undefined);
    assert.ok(listingSchema.validate({
        ...validListingInput,
        unexpected: true,
    }).error);
    assert.ok(listingSchema.validate({
        ...validListingInput,
        _csrf: "invalid",
    }).error);
});

test("listing request validation rejects negative prices and unsupported enums", () => {
    assert.ok(listingSchema.validate({
        listing: { ...validListingInput.listing, price: -1 },
    }).error);
    assert.ok(listingSchema.validate({
        listing: { ...validListingInput.listing, category: "Unknown" },
    }).error);
    assert.ok(listingSchema.validate({
        listing: { ...validListingInput.listing, priceUnit: "week" },
    }).error);
});

test("review and account input validation enforces bounds", () => {
    assert.equal(reviewSchema.validate({ review: { rating: "5", comment: "Lovely stay" } }).error, undefined);
    assert.equal(reviewSchema.validate({
        _csrf: "a".repeat(64),
        review: { rating: "5", comment: "Lovely stay" },
    }).error, undefined);
    assert.ok(reviewSchema.validate({
        _csrf: "a".repeat(64),
        unexpected: true,
        review: { rating: "5", comment: "Lovely stay" },
    }).error);
    assert.ok(reviewSchema.validate({
        _csrf: "invalid",
        review: { rating: "5", comment: "Lovely stay" },
    }).error);
    assert.ok(reviewSchema.validate({ review: { rating: 6, comment: "Lovely stay" } }).error);
    assert.ok(userSchema.validate({
        email: "guest@example.com",
        username: "guest",
        password: "short",
    }).error);
    assert.equal(profileSchema.validate({ fullName: "Guest Name" }).error, undefined);
});

test("booking request validation accepts dates and guests but rejects client prices or status", () => {
    const validRequest = { booking: { checkIn: "2026-10-10", checkOut: "2026-10-13", guests: "2" } };
    assert.equal(bookingRequestSchema.validate(validRequest).error, undefined);
    assert.equal(bookingRequestSchema.validate({
        ...validRequest,
        _csrf: "a".repeat(64),
    }).error, undefined);
    assert.ok(bookingRequestSchema.validate({
        ...validRequest,
        unexpected: true,
    }).error);
    assert.ok(bookingRequestSchema.validate({
        ...validRequest,
        _csrf: "invalid",
    }).error);
    assert.ok(bookingRequestSchema.validate({
        booking: { ...validRequest.booking, total: 1 },
    }).error);
    assert.ok(bookingRequestSchema.validate({
        booking: { ...validRequest.booking, status: "CONFIRMED" },
    }).error);
    assert.ok(bookingRequestSchema.validate({
        booking: { ...validRequest.booking, guests: 17 },
    }).error);
});

test("booking model validates positive half-open date ranges and payment snapshots", async () => {
    const bookingData = {
        listing: new mongoose.Types.ObjectId(),
        guest: new mongoose.Types.ObjectId(),
        host: new mongoose.Types.ObjectId(),
        listingSnapshot: { title: "Lake House", location: "Udaipur, India" },
        checkIn: new Date("2026-10-10T00:00:00.000Z"),
        checkOut: new Date("2026-10-13T00:00:00.000Z"),
        guests: 2,
        priceSnapshot: {
            unitPriceMinor: 120000,
            quantity: 3,
            subtotalMinor: 360000,
            currency: "INR",
            priceUnit: "night",
            nights: 3,
            guests: 2,
            calculatedAt: new Date("2026-10-08T00:00:00.000Z"),
        },
        paymentExpiresAt: new Date("2026-10-08T00:10:00.000Z"),
    };
    await new Booking(bookingData).validate();
    await assert.rejects(
        new Booking({ ...bookingData, checkOut: bookingData.checkIn }).validate(),
        (error) => error.name === "ValidationError" && Boolean(error.errors.checkOut)
    );
    await assert.rejects(
        new Booking({ ...bookingData, guests: 0 }).validate(),
        (error) => error.name === "ValidationError"
    );
});

test("booking dates reject malformed, past, reversed, and excessive stays", () => {
    const now = new Date("2026-10-08T12:00:00.000Z");
    const valid = parseDateRange("2026-10-10", "2026-10-13", now);
    assert.equal(valid.nights, 3);
    assert.equal(valid.checkOut.toISOString(), "2026-10-13T00:00:00.000Z");
    for (const dates of [
        ["2026-02-30", "2026-03-02"],
        ["2026-10-07", "2026-10-09"],
        ["2026-10-10", "2026-10-10"],
        ["2026-10-10", "2027-01-10"],
    ]) {
        assert.throws(() => parseDateRange(dates[0], dates[1], now), ExpressError);
    }
});

test("availability windows use UTC dates and reject malformed or past starts", () => {
    const now = new Date("2026-10-08T23:30:00.000Z");
    const currentWindow = getAvailabilityWindow(undefined, now);
    assert.equal(currentWindow.from.toISOString(), "2026-10-08T00:00:00.000Z");
    assert.equal(
        currentWindow.to.getTime() - currentWindow.from.getTime(),
        365 * 86_400_000
    );
    assert.throws(() => getAvailabilityWindow("2026-10-07", now), ExpressError);
    assert.throws(() => getAvailabilityWindow("2026-02-30", now), ExpressError);
});

test("booking prices are calculated in minor currency units from listing prices", () => {
    const at = new Date("2026-10-08T00:00:00.000Z");
    assert.deepEqual(
        calculatePrice({ price: 1234.56, priceUnit: "night" }, 3, 2, at),
        {
            unitPriceMinor: 123456,
            quantity: 3,
            subtotalMinor: 370368,
            currency: "INR",
            priceUnit: "night",
            nights: 3,
            guests: 2,
            calculatedAt: at,
        }
    );
    assert.equal(calculatePrice({ price: 500, priceUnit: "person" }, 2, 3, at).subtotalMinor, 150000);
    assert.equal(calculatePrice({ price: 500, priceUnit: "service" }, 2, 3, at).subtotalMinor, 50000);
});

test("availability uses half-open dates and ignores expired holds", () => {
    const checkIn = new Date("2026-10-10T00:00:00.000Z");
    const checkOut = new Date("2026-10-13T00:00:00.000Z");
    const now = new Date("2026-10-08T00:00:00.000Z");
    const hold = {
        checkIn,
        checkOut,
        status: "PENDING_PAYMENT",
        paymentExpiresAt: new Date("2026-10-08T00:10:00.000Z"),
    };
    assert.equal(hasConflictingHold([hold], checkOut, new Date("2026-10-15T00:00:00.000Z"), now), false);
    assert.equal(hasConflictingHold([hold], new Date("2026-10-12T00:00:00.000Z"), new Date("2026-10-14T00:00:00.000Z"), now), true);
    assert.equal(hasConflictingHold([{ ...hold, paymentExpiresAt: new Date("2026-10-07T23:59:00.000Z") }], checkIn, checkOut, now), false);
    assert.equal(hasConflictingHold([{ ...hold, status: "CONFIRMED", paymentExpiresAt: undefined }], checkIn, checkOut, now), true);
});

test("half-open availability handles overlap boundaries and nested ranges", () => {
    const now = new Date("2026-10-08T00:00:00.000Z");
    const existing = {
        checkIn: new Date("2026-10-10T00:00:00.000Z"),
        checkOut: new Date("2026-10-15T00:00:00.000Z"),
        status: "CONFIRMED",
    };
    const conflicts = [
        ["2026-10-10", "2026-10-11"],
        ["2026-10-14", "2026-10-16"],
        ["2026-10-11", "2026-10-14"],
        ["2026-10-09", "2026-10-16"],
    ];
    for (const [checkIn, checkOut] of conflicts) {
        assert.equal(
            hasConflictingHold(
                [existing],
                new Date(`${checkIn}T00:00:00.000Z`),
                new Date(`${checkOut}T00:00:00.000Z`),
                now
            ),
            true,
            `${checkIn} to ${checkOut} should overlap`
        );
    }
    for (const [checkIn, checkOut] of [
        ["2026-10-05", "2026-10-10"],
        ["2026-10-15", "2026-10-18"],
    ]) {
        assert.equal(
            hasConflictingHold(
                [existing],
                new Date(`${checkIn}T00:00:00.000Z`),
                new Date(`${checkOut}T00:00:00.000Z`),
                now
            ),
            false,
            `${checkIn} to ${checkOut} should be adjacent and available`
        );
    }
});

test("availability ranges include confirmed and active holds but exclude expired and cancelled bookings", async () => {
    const originalFind = Booking.find;
    const now = new Date("2026-10-08T00:00:00.000Z");
    const listingId = new mongoose.Types.ObjectId();
    const from = new Date("2026-10-08T00:00:00.000Z");
    const to = new Date("2026-10-20T00:00:00.000Z");
    const dateRange = {
        checkIn: new Date("2026-10-10T00:00:00.000Z"),
        checkOut: new Date("2026-10-12T00:00:00.000Z"),
    };
    const bookings = [
        { ...dateRange, status: "CONFIRMED" },
        {
            checkIn: new Date("2026-10-12T00:00:00.000Z"),
            checkOut: new Date("2026-10-14T00:00:00.000Z"),
            status: "PENDING_PAYMENT",
            paymentExpiresAt: new Date("2026-10-08T00:10:00.000Z"),
        },
        {
            checkIn: new Date("2026-10-14T00:00:00.000Z"),
            checkOut: new Date("2026-10-16T00:00:00.000Z"),
            status: "PENDING_PAYMENT",
            paymentExpiresAt: new Date("2026-10-07T23:59:00.000Z"),
        },
        {
            checkIn: new Date("2026-10-16T00:00:00.000Z"),
            checkOut: new Date("2026-10-18T00:00:00.000Z"),
            status: "CANCELLED",
        },
        {
            checkIn: new Date("2026-10-18T00:00:00.000Z"),
            checkOut: new Date("2026-10-20T00:00:00.000Z"),
            status: "EXPIRED",
        },
        {
            checkIn: new Date("2026-10-10T00:00:00.000Z"),
            checkOut: new Date("2026-10-12T00:00:00.000Z"),
            status: "PAYMENT_PROCESSING",
            paymentExpiresAt: new Date("2026-10-08T00:10:00.000Z"),
        },
    ];
    let query;
    Booking.find = (filter) => {
        query = filter;
        return {
            select() {
                return { lean: async () => bookings };
            },
        };
    };
    try {
        const ranges = await getUnavailableRanges({
            _id: listingId,
            bookingHolds: [{
                ...dateRange,
                status: "PENDING_PAYMENT",
                paymentExpiresAt: new Date("2026-10-08T00:10:00.000Z"),
            }],
        }, from, to, now);
        assert.deepEqual(ranges, [
            { checkIn: "2026-10-10", checkOut: "2026-10-12" },
            { checkIn: "2026-10-12", checkOut: "2026-10-14" },
        ]);
        assert.equal(query.listing, listingId);
        assert.ok(query.status.$in.includes("CONFIRMED"));
        assert.ok(query.status.$in.includes("PENDING_PAYMENT"));
        assert.ok(query.status.$in.includes("CANCELLED"));
        assert.equal(query.checkIn.$lt, to);
        assert.equal(query.checkOut.$gt, from);
    } finally {
        Booking.find = originalFind;
    }
});

test("availability estimate returns server price and conflicting ranges, not client totals", async () => {
    const originalFindById = Listing.findById;
    const originalBookingFind = Booking.find;
    const listingId = new mongoose.Types.ObjectId();
    const listing = {
        _id: listingId,
        price: 1200,
        priceUnit: "night",
        bookingHolds: [],
    };
    let bookings = [];
    Listing.findById = () => ({ select: () => ({ lean: async () => listing }) });
    Booking.find = () => ({
        select() {
            return { lean: async () => bookings };
        },
    });
    try {
        const available = await bookingService.checkAvailability(
            listingId.toString(),
            { checkIn: "2026-10-10", checkOut: "2026-10-13", guests: 2, total: 1 },
            new Date("2026-10-08T00:00:00.000Z")
        );
        assert.equal(available.available, true);
        assert.equal(available.priceSnapshot.subtotalMinor, 360000);
        assert.deepEqual(available.unavailableRanges, []);

        bookings = [{
            checkIn: new Date("2026-10-10T00:00:00.000Z"),
            checkOut: new Date("2026-10-15T00:00:00.000Z"),
            status: "CONFIRMED",
        }];
        const unavailable = await bookingService.checkAvailability(
            listingId.toString(),
            { checkIn: "2026-10-10", checkOut: "2026-10-13", guests: 2 },
            new Date("2026-10-08T00:00:00.000Z")
        );
        assert.equal(unavailable.available, false);
        assert.equal(unavailable.priceSnapshot.subtotalMinor, 360000);
        assert.deepEqual(unavailable.unavailableRanges, [
            { checkIn: "2026-10-10", checkOut: "2026-10-15" },
        ]);
        await assert.rejects(
            bookingService.checkAvailability(
                listingId.toString(),
                { checkIn: "2026-10-10", checkOut: "2026-10-10", guests: 2 },
                new Date("2026-10-08T00:00:00.000Z")
            ),
            ExpressError
        );
    } finally {
        Listing.findById = originalFindById;
        Booking.find = originalBookingFind;
    }
});

test("date hold acquisition uses one atomic no-overlap listing update", async () => {
    const originalFindById = Listing.findById;
    const originalUpdateOne = Listing.updateOne;
    const originalFindOneAndUpdate = Listing.findOneAndUpdate;
    const originalExists = Listing.exists;
    const listingId = new mongoose.Types.ObjectId();
    const bookingId = new mongoose.Types.ObjectId();
    const now = new Date("2026-10-08T00:00:00.000Z");
    let atomicFilter;
    let conflictMode = false;
    Listing.findById = () => ({ select: () => ({ lean: async () => ({ bookingHolds: [] }) }) });
    Listing.updateOne = async () => ({ acknowledged: true });
    Listing.findOneAndUpdate = (filter) => {
        atomicFilter = filter;
        return { select: async () => conflictMode ? null : { _id: listingId } };
    };
    Listing.exists = async () => ({ _id: listingId });
    try {
        await acquireBookingHold(listingId, {
            bookingId,
            checkIn: new Date("2026-10-10T00:00:00.000Z"),
            checkOut: new Date("2026-10-13T00:00:00.000Z"),
            status: "PENDING_PAYMENT",
            paymentExpiresAt: new Date(now.getTime() + 600_000),
        }, now);
        assert.ok(atomicFilter.bookingHolds.$not.$elemMatch);
        assert.equal(atomicFilter.bookingHolds.$not.$elemMatch.checkIn.$lt.toISOString(), "2026-10-13T00:00:00.000Z");
        conflictMode = true;
        await assert.rejects(
            acquireBookingHold(listingId, {
                bookingId,
                checkIn: new Date("2026-10-10T00:00:00.000Z"),
                checkOut: new Date("2026-10-13T00:00:00.000Z"),
                status: "PENDING_PAYMENT",
                paymentExpiresAt: new Date(now.getTime() + 600_000),
            }, now),
            (error) => error.statusCode === 409
        );
    } finally {
        Listing.findById = originalFindById;
        Listing.updateOne = originalUpdateOne;
        Listing.findOneAndUpdate = originalFindOneAndUpdate;
        Listing.exists = originalExists;
    }
});

test("atomic hold acquisition removes stale holds for cancelled bookings", async () => {
    const originalFindById = Listing.findById;
    const originalFind = Booking.find;
    const originalUpdateOne = Listing.updateOne;
    const originalFindOneAndUpdate = Listing.findOneAndUpdate;
    const originalExists = Listing.exists;
    const listingId = new mongoose.Types.ObjectId();
    const cancelledBookingId = new mongoose.Types.ObjectId();
    const now = new Date("2026-10-08T00:00:00.000Z");
    const updates = [];
    Listing.findById = () => ({
        select: () => ({
            lean: async () => ({
                bookingHolds: [{ bookingId: cancelledBookingId }],
            }),
        }),
    });
    Booking.find = () => ({
        select: () => ({
            lean: async () => [{ _id: cancelledBookingId, status: "CANCELLED" }],
        }),
    });
    Listing.updateOne = async (filter, update) => {
        updates.push(update);
        return { acknowledged: true };
    };
    Listing.findOneAndUpdate = () => ({
        select: async () => ({ _id: listingId }),
    });
    Listing.exists = async () => ({ _id: listingId });
    try {
        await acquireBookingHold(listingId, {
            bookingId: new mongoose.Types.ObjectId(),
            checkIn: new Date("2026-10-10T00:00:00.000Z"),
            checkOut: new Date("2026-10-13T00:00:00.000Z"),
            status: "PENDING_PAYMENT",
            paymentExpiresAt: new Date(now.getTime() + 600_000),
        }, now);
        assert.equal(updates[0].$pull.bookingHolds.bookingId.$in[0], cancelledBookingId);
    } finally {
        Listing.findById = originalFindById;
        Booking.find = originalFind;
        Listing.updateOne = originalUpdateOne;
        Listing.findOneAndUpdate = originalFindOneAndUpdate;
        Listing.exists = originalExists;
    }
});

test("booking lifecycle expires holds from server time and requires verified payment to confirm", () => {
    const expiresAt = new Date("2026-10-08T00:10:00.000Z");
    const pending = { status: "PENDING_PAYMENT", paymentExpiresAt: expiresAt };
    assert.equal(getExpiredBookingStatus(pending, new Date("2026-10-08T00:09:59.000Z")), "PENDING_PAYMENT");
    assert.equal(getExpiredBookingStatus(pending, expiresAt), "EXPIRED");
    assert.throws(
        () => assertBookingTransition({ status: "PAYMENT_PROCESSING" }, "CONFIRMED"),
        (error) => error.statusCode === 403
    );
    assert.doesNotThrow(() => assertBookingTransition(
        { status: "PAYMENT_PROCESSING" },
        "CONFIRMED",
        { paymentVerified: true }
    ));
    assert.throws(
        () => assertBookingTransition({ status: "EXPIRED" }, "CONFIRMED", { paymentVerified: true }),
        (error) => error.statusCode === 409
    );
});

test("creating a booking snapshots server price and starts a ten-minute payment hold", async () => {
    const originalFindById = Listing.findById;
    const originalUpdateOne = Listing.updateOne;
    const originalFindOneAndUpdate = Listing.findOneAndUpdate;
    const originalBookingExists = Booking.exists;
    const originalBookingFind = Booking.find;
    const originalBookingSave = Booking.prototype.save;
    const listingId = new mongoose.Types.ObjectId();
    const guestId = new mongoose.Types.ObjectId();
    const hostId = new mongoose.Types.ObjectId();
    const now = new Date("2026-10-08T00:00:00.000Z");
    const listing = {
        _id: listingId,
        owner: hostId,
        title: "Lake House",
        location: "Udaipur, India",
        price: 1200,
        priceUnit: "night",
        bookingHolds: [],
    };
    let acquiredHold;
    let savedBooking;
    Listing.findById = () => ({ select: () => ({ lean: async () => listing }) });
    Booking.exists = async () => null;
    Booking.find = () => ({
        select: () => ({ lean: async () => [] }),
    });
    Listing.updateOne = async () => ({ acknowledged: true });
    Listing.findOneAndUpdate = (filter, update) => {
        acquiredHold = update.$push.bookingHolds;
        return { select: async () => listing };
    };
    Booking.prototype.save = async function save() {
        savedBooking = this;
        return this;
    };
    try {
        const booking = await bookingService.createPendingBooking(
            listingId.toString(),
            guestId.toString(),
            { checkIn: "2026-10-10", checkOut: "2026-10-13", guests: "2" },
            now
        );
        assert.equal(booking.status, "PENDING_PAYMENT");
        assert.equal(booking.priceSnapshot.subtotalMinor, 360000);
        assert.equal(booking.paymentExpiresAt.getTime(), now.getTime() + 600_000);
        assert.equal(acquiredHold.bookingId.toString(), booking._id.toString());
        assert.equal(savedBooking, booking);
    } finally {
        Listing.findById = originalFindById;
        Listing.updateOne = originalUpdateOne;
        Listing.findOneAndUpdate = originalFindOneAndUpdate;
        Booking.exists = originalBookingExists;
        Booking.find = originalBookingFind;
        Booking.prototype.save = originalBookingSave;
    }
});

test("booking cancellation is guest-scoped and releases the date hold", async () => {
    const originalFindOneAndUpdate = Booking.findOneAndUpdate;
    const originalUpdateOne = Listing.updateOne;
    const bookingId = new mongoose.Types.ObjectId();
    const listingId = new mongoose.Types.ObjectId();
    const guestId = new mongoose.Types.ObjectId();
    let bookingFilter;
    let releaseUpdate;
    const cancelledBooking = { _id: bookingId, listing: listingId, status: "CANCELLED" };
    Booking.findOneAndUpdate = async (filter) => {
        bookingFilter = filter;
        return cancelledBooking;
    };
    Listing.updateOne = async (filter, update) => {
        releaseUpdate = update;
        return { acknowledged: true };
    };
    try {
        const booking = await bookingService.cancelPendingBooking(bookingId, guestId);
        assert.equal(booking, cancelledBooking);
        assert.equal(bookingFilter.guest, guestId);
        assert.equal(bookingFilter.status, "PENDING_PAYMENT");
        assert.equal(releaseUpdate.$pull.bookingHolds.bookingId, bookingId);
    } finally {
        Booking.findOneAndUpdate = originalFindOneAndUpdate;
        Listing.updateOne = originalUpdateOne;
    }
});

test("expired pending bookings transition to EXPIRED and release their listing holds", async () => {
    const originalFind = Booking.find;
    const originalUpdateMany = Booking.updateMany;
    const originalListingUpdateOne = Listing.updateOne;
    const bookingId = new mongoose.Types.ObjectId();
    const listingId = new mongoose.Types.ObjectId();
    const findFilters = [];
    let bookingUpdateFilter;
    let releasedHold;
    Booking.find = (filter) => ({
        select: () => ({
            lean: async () => {
                findFilters.push(filter);
                return [{ _id: bookingId, listing: listingId }];
            },
        }),
    });
    Booking.updateMany = async (filter) => {
        bookingUpdateFilter = filter;
        return { modifiedCount: 1 };
    };
    Listing.updateOne = async (filter, update) => {
        releasedHold = update.$pull.bookingHolds;
        return { acknowledged: true };
    };
    try {
        const now = new Date("2026-10-08T00:10:00.000Z");
        assert.equal(await bookingService.expirePendingBookings(now), 1);
        assert.deepEqual(findFilters[0].status.$in, ["PENDING_PAYMENT", "PAYMENT_PROCESSING"]);
        assert.deepEqual(bookingUpdateFilter.status.$in, ["PENDING_PAYMENT", "PAYMENT_PROCESSING"]);
        assert.equal(findFilters[1].status, "EXPIRED");
        assert.equal(releasedHold.bookingId, bookingId);
    } finally {
        Booking.find = originalFind;
        Booking.updateMany = originalUpdateMany;
        Listing.updateOne = originalListingUpdateOne;
    }
});

test("booking guest and host authorization hide records from unrelated users", async () => {
    const originalFindById = Booking.findById;
    const bookingId = new mongoose.Types.ObjectId();
    const guestId = new mongoose.Types.ObjectId();
    const hostId = new mongoose.Types.ObjectId();
    const outsiderId = new mongoose.Types.ObjectId();
    const booking = { _id: bookingId, guest: guestId, host: hostId };
    const response = (userId) => ({ locals: { currUser: { _id: userId } } });
    Booking.findById = async () => booking;
    try {
        let guestNext = false;
        const guestRes = response(guestId);
        await isBookingGuest({ params: { bookingId: bookingId.toString() } }, guestRes, () => { guestNext = true; });
        assert.equal(guestNext, true);
        assert.equal(guestRes.locals.booking, booking);

        await assert.rejects(
            isBookingGuest({ params: { bookingId: bookingId.toString() } }, response(outsiderId), () => {}),
            (error) => error.statusCode === 404
        );
        Booking.findById = () => ({ select: async () => booking });
        let hostNext = false;
        await isBookingHost(
            { params: { bookingId: bookingId.toString() } },
            response(hostId),
            () => { hostNext = true; }
        );
        assert.equal(hostNext, true);
        await assert.rejects(
            isBookingHost({ params: { bookingId: bookingId.toString() } }, response(outsiderId), () => {}),
            (error) => error.statusCode === 404
        );
    } finally {
        Booking.findById = originalFindById;
    }
});

test("listing deletion is blocked while it has a live booking", async () => {
    const originalFind = Booking.find;
    const originalExists = Booking.exists;
    const originalFindByIdAndDelete = Listing.findByIdAndDelete;
    let deletedListing = false;
    let redirectPath;
    let errorFlash;
    Booking.find = () => ({ select: () => ({ lean: async () => [] }) });
    Booking.exists = async () => ({ _id: new mongoose.Types.ObjectId() });
    Listing.findByIdAndDelete = async () => { deletedListing = true; };
    try {
        await listingController.destroyListing({
            params: { id: new mongoose.Types.ObjectId().toString() },
            flash(type, message) { if (type === "error") errorFlash = message; },
        }, {
            redirect(path) { redirectPath = path; },
        });
        assert.equal(deletedListing, false);
        assert.match(errorFlash, /active bookings/);
        assert.match(redirectPath, /^\/listings\//);
    } finally {
        Booking.find = originalFind;
        Booking.exists = originalExists;
        Listing.findByIdAndDelete = originalFindByIdAndDelete;
    }
});

test("all sample seed records satisfy the current listing model", async () => {
    for (const item of data) {
        const listing = new Listing({
            ...item,
            images: item.image ? [item.image] : [],
            owner: new mongoose.Types.ObjectId(),
        });
        await listing.validate();
    }
});

test("listing model rejects invalid coordinates and negative prices", async () => {
    const validListing = {
        title: "A quiet lake-side home",
        description: "A peaceful place with a view of the lake.",
        price: 1200,
        location: "Udaipur, Rajasthan",
        country: "India",
        owner: new mongoose.Types.ObjectId(),
        geometry: { type: "Point", coordinates: [73.68, 24.58] },
    };
    await assert.rejects(
        new Listing({ ...validListing, price: -1 }).validate(),
        (error) => error.name === "ValidationError"
    );
    await assert.rejects(
        new Listing({ ...validListing, geometry: { type: "Point", coordinates: [200, 24.58] } }).validate(),
        (error) => error.name === "ValidationError"
    );
});

test("legacy single-image records remain usable alongside galleries", () => {
    const legacyImage = { url: "https://example.test/legacy.jpg", filename: "legacy-id" };
    assert.deepEqual(getListingImages({ image: legacyImage }), [legacyImage]);

    const gallery = [legacyImage, { url: "https://example.test/second.jpg", filename: "second-id" }];
    assert.deepEqual(getListingImages({ images: gallery, image: { url: "fallback" } }), gallery);
});

test("listing cards select a gallery or legacy cover and tolerate missing images", () => {
    assert.equal(
        getListingCoverImage({ images: [{ url: "https://example.test/gallery.jpg" }] }),
        "https://example.test/gallery.jpg"
    );
    assert.equal(
        getListingCoverImage({ image: { url: "https://example.test/legacy.jpg" } }),
        "https://example.test/legacy.jpg"
    );
    assert.equal(getListingCoverImage({}), "/images/listing-placeholder.svg");
});

test("profile photo updates persist new Cloudinary metadata and remove only the old photo", async () => {
    const originalFindById = User.findById;
    const originalDestroy = cloudinary.uploader.destroy;
    const profileUser = new User({
        username: "member",
        email: "member@example.test",
        profileImage: { url: "https://images.example.test/old.jpg", filename: "old-photo" },
    });
    const deletedImages = [];
    let redirectedTo;
    profileUser.save = async () => profileUser;
    User.findById = async () => profileUser;
    cloudinary.uploader.destroy = async (filename) => {
        deletedImages.push(filename);
        return { result: "ok" };
    };

    try {
        await userController.updateProfile(
            {
                body: { profile: {} },
                user: { _id: profileUser._id },
                file: { path: "https://images.example.test/new.jpg", filename: "new-photo" },
                flash() {},
            },
            { redirect(path) { redirectedTo = path; } }
        );
        assert.equal(profileUser.profileImage.url, "https://images.example.test/new.jpg");
        assert.equal(profileUser.profileImage.filename, "new-photo");
        assert.deepEqual(deletedImages, ["old-photo"]);
        assert.equal(redirectedTo, `/user/${profileUser._id}`);
    } finally {
        User.findById = originalFindById;
        cloudinary.uploader.destroy = originalDestroy;
    }
});

test("Cloudinary Multer storage streams uploads and returns expected file metadata", async () => {
    const originalUploadStream = cloudinary.uploader.upload_stream;
    let uploadOptions;
    cloudinary.uploader.upload_stream = (options, callback) => {
        uploadOptions = options;
        const chunks = [];
        return new Writable({
            write(chunk, encoding, done) {
                chunks.push(chunk);
                done();
            },
            final(done) {
                callback(null, {
                    secure_url: "https://images.example.test/listing.jpg",
                    public_id: "wanderlust/test-image",
                    bytes: Buffer.concat(chunks).length,
                });
                done();
            },
        });
    };

    try {
        const uploadedFile = await new Promise((resolve, reject) => {
            storage._handleFile(
                {},
                { stream: Readable.from([Buffer.from("test image")]) },
                (error, file) => error ? reject(error) : resolve(file)
            );
        });
        assert.equal(uploadedFile.path, "https://images.example.test/listing.jpg");
        assert.equal(uploadedFile.filename, "wanderlust/test-image");
        assert.equal(uploadedFile.size, Buffer.byteLength("test image"));
        assert.equal(uploadOptions.timeout, 180_000);
    } finally {
        cloudinary.uploader.upload_stream = originalUploadStream;
    }
});

test("application exports its Express app without starting the server", () => {
    const { app, startServer } = require("../app.js");
    assert.equal(typeof app, "function");
    assert.equal(typeof startServer, "function");
});

test("listing detail render context includes today's UTC date and existing listing data", async () => {
    const originalFindById = Listing.findById;
    const listing = {
        _id: new mongoose.Types.ObjectId(),
        reviews: [],
        images: [],
    };
    const query = {
        populate() {
            return this;
        },
        then(resolve, reject) {
            return Promise.resolve(listing).then(resolve, reject);
        },
    };
    let renderedView;
    let renderedContext;
    Listing.findById = () => query;

    try {
        await listingController.showListing(
            { params: { id: listing._id.toString() }, flash() {} },
            {
                render(view, context) {
                    renderedView = view;
                    renderedContext = context;
                },
            }
        );
        assert.equal(renderedView, "listings/show.ejs");
        assert.match(renderedContext.todayDate, /^\d{4}-\d{2}-\d{2}$/);
        assert.equal(renderedContext.todayDate, new Date().toISOString().slice(0, 10));
        assert.equal(renderedContext.listing, listing);
        assert.deepEqual(renderedContext.listingImages, []);
        assert.equal(renderedContext.averageRating, null);
        assert.equal(renderedContext.reviewCount, 0);
    } finally {
        Listing.findById = originalFindById;
    }
});

test("review deletion rejects an author's review through the wrong listing URL", async () => {
    const originalListingFindById = Listing.findById;
    const Review = require("../models/review.js");
    const originalReviewFindById = Review.findById;
    const listingId = new mongoose.Types.ObjectId();
    const reviewId = new mongoose.Types.ObjectId();
    const authorId = new mongoose.Types.ObjectId();
    const redirects = [];
    let nextCalled = false;

    Listing.findById = async () => ({ reviews: [] });
    Review.findById = async () => ({ _id: reviewId, author: authorId });
    try {
        await isReviewAuthor(
            {
                params: { id: listingId.toString(), reviewId: reviewId.toString() },
                flash() {},
            },
            {
                locals: { currUser: { _id: authorId } },
                redirect(path) { redirects.push(path); },
            },
            () => { nextCalled = true; }
        );
        assert.deepEqual(redirects, ["/listings"]);
        assert.equal(nextCalled, false);
    } finally {
        Listing.findById = originalListingFindById;
        Review.findById = originalReviewFindById;
    }
});

test("map popup content assigns listing titles as text, not HTML", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const mapScript = fs.readFileSync(path.join(__dirname, "..", "public", "js", "map.js"), "utf8");
    assert.match(mapScript, /title\.textContent\s*=\s*mapElement\.dataset\.title/);
    assert.doesNotMatch(mapScript, /\.setHTML\s*\(/);
});

test("all EJS templates compile", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const ejs = require("ejs");
    const templates = [];
    const walk = (directory) => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const filePath = path.join(directory, entry.name);
            if (entry.isDirectory()) walk(filePath);
            else if (filePath.endsWith(".ejs")) templates.push(filePath);
        }
    };

    walk(path.join(__dirname, "..", "views"));
    for (const filePath of templates) {
        ejs.compile(fs.readFileSync(filePath, "utf8"), { filename: filePath });
    }
    assert.ok(templates.length > 0);
});
