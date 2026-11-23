const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const User = require("../models/user.js");
const Listing = require("../models/listing.js");
const Booking = require("../models/booking.js");
const bookingService = require("../services/booking.js");

const integrationEnabled = process.env.RUN_MONGO_INTEGRATION === "1"
    && Boolean(process.env.TEST_MONGO_URL);

test("two concurrent overlapping booking holds allow exactly one guest", {
    skip: integrationEnabled ? false : "Set RUN_MONGO_INTEGRATION=1 and TEST_MONGO_URL to run MongoDB integration tests.",
}, async () => {
    await mongoose.connect(process.env.TEST_MONGO_URL);

    const suffix = new mongoose.Types.ObjectId().toString();
    let host;
    let guests;
    let listing;

    try {
        [host, ...guests] = await User.create([
            { email: `host-${suffix}@integration.test`, username: `host_${suffix}`, fullName: "Test Host" },
            { email: `guest1-${suffix}@integration.test`, username: `guest1_${suffix}`, fullName: "Guest One" },
            { email: `guest2-${suffix}@integration.test`, username: `guest2_${suffix}`, fullName: "Guest Two" },
        ]);

        listing = await Listing.create({
            title: "Concurrency Test Listing",
            description: "Temporary listing used only for the opt-in MongoDB concurrency integration test.",
            location: "Test City, India",
            country: "India",
            city: "Test City",
            state: "Test State",
            category: "Homes",
            type: "Nature",
            price: 1000,
            priceUnit: "night",
            images: [{
                url: "https://images.unsplash.com/photo-1501785888041-af3ef285b470",
                filename: "concurrency-placeholder",
            }],
            geometry: { type: "Point", coordinates: [77.5946, 12.9716] },
            owner: host._id,
        });

        const request = {
            checkIn: "2030-06-10",
            checkOut: "2030-06-13",
            guests: 2,
        };

        const attempts = await Promise.allSettled([
            bookingService.createPendingBooking(listing._id, guests[0]._id, request),
            bookingService.createPendingBooking(listing._id, guests[1]._id, request),
        ]);

        const fulfilled = attempts.filter((attempt) => attempt.status === "fulfilled");
        const rejected = attempts.filter((attempt) => attempt.status === "rejected");

        assert.equal(fulfilled.length, 1);
        assert.equal(rejected.length, 1);
        assert.equal(rejected[0].reason.statusCode, 409);
    } finally {
        if (listing) {
            await Booking.deleteMany({ listing: listing._id });
            await Listing.deleteOne({ _id: listing._id });
        }
        if (guests) {
            await User.deleteMany({ _id: { $in: guests.map((guest) => guest._id) } });
        }
        if (host) await User.deleteOne({ _id: host._id });
        await mongoose.disconnect();
    }
});
