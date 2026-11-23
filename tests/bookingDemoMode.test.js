const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const mongoose = require("mongoose");
const config = require("../config.js");
const bookingService = require("../services/booking.js");
const paymentService = require("../services/payments.js");
const razorpay = require("../services/razorpay.js");
const listingBookingRoute = require("../routes/listingBooking.js");

test("booking POST creates a hold and redirects to its guest page in Demo Mode", async () => {
    const originalRazorpay = { ...config.razorpay };
    const originalCreatePendingBooking = bookingService.createPendingBooking;
    const originalStartCheckout = paymentService.startCheckout;
    const originalCreateOrder = razorpay.createOrder;
    const listingId = new mongoose.Types.ObjectId();
    const guestId = new mongoose.Types.ObjectId();
    const bookingId = new mongoose.Types.ObjectId();
    const calls = { booking: null, checkout: 0, order: 0, flash: null };
    const app = express();
    app.use(express.urlencoded({ extended: true }));
    app.use((req, res, next) => {
        req.isAuthenticated = () => true;
        req.user = { _id: guestId };
        req.flash = (type, message) => {
            calls.flash = { type, message };
        };
        next();
    });
    app.use("/listings/:id/bookings", listingBookingRoute);
    app.use((error, req, res, next) => {
        res.status(error.statusCode || 500).json({ message: error.message });
    });

    config.razorpay.keyId = "";
    config.razorpay.keySecret = "";
    config.razorpay.webhookSecret = "";
    config.razorpay.enabled = false;
    bookingService.createPendingBooking = async (...args) => {
        calls.booking = args;
        return { _id: bookingId };
    };
    paymentService.startCheckout = async () => {
        calls.checkout++;
        assert.fail("Booking creation must not start checkout.");
    };
    razorpay.createOrder = async () => {
        calls.order++;
        assert.fail("Booking creation must not create a Razorpay order.");
    };

    const server = app.listen(0);
    try {
        await new Promise((resolve, reject) => {
            server.once("listening", resolve);
            server.once("error", reject);
        });
        const response = await fetch(
            `http://127.0.0.1:${server.address().port}/listings/${listingId}/bookings`,
            {
                method: "POST",
                headers: { "content-type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    _csrf: "a".repeat(64),
                    "booking[checkIn]": "2026-12-10",
                    "booking[checkOut]": "2026-12-13",
                    "booking[guests]": "2",
                }),
                redirect: "manual",
            }
        );

        assert.equal(response.status, 302);
        assert.equal(response.headers.get("location"), `/bookings/${bookingId}`);
        assert.deepEqual(calls.booking, [
            listingId.toString(),
            guestId,
            { checkIn: "2026-12-10", checkOut: "2026-12-13", guests: "2" },
        ]);
        assert.equal(calls.flash.type, "success");
        assert.match(calls.flash.message, /Demo Mode.*not confirmed/i);
        assert.equal(calls.checkout, 0);
        assert.equal(calls.order, 0);
    } finally {
        await new Promise((resolve) => server.close(resolve));
        Object.assign(config.razorpay, originalRazorpay);
        bookingService.createPendingBooking = originalCreatePendingBooking;
        paymentService.startCheckout = originalStartCheckout;
        razorpay.createOrder = originalCreateOrder;
    }
});
