const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const mongoose = require("mongoose");
const config = require("../config.js");
const rateLimiters = require("../utils/rateLimiters.js");
const securityHeaders = require("../utils/securityHeaders.js");
const { app } = require("../app.js");

test("security middleware adds baseline headers and HSTS only for secure production requests", () => {
    const originalProduction = config.isProduction;
    const headers = {};
    let nextCalled = false;
    config.isProduction = true;
    try {
        securityHeaders(
            { secure: true },
            {
                locals: {},
                setHeader(name, value) { headers[name.toLowerCase()] = value; },
            },
            () => { nextCalled = true; }
        );

        assert.equal(headers["x-content-type-options"], "nosniff");
        assert.equal(headers["x-frame-options"], "DENY");
        assert.equal(headers["referrer-policy"], "strict-origin-when-cross-origin");
        assert.equal(
            headers["permissions-policy"],
            "camera=(), microphone=(), geolocation=()"
        );
        assert.equal(headers["strict-transport-security"], "max-age=31536000");
        assert.ok(headers["content-security-policy-report-only"]);
        assert.equal(app.get("x-powered-by"), false);
        assert.equal(nextCalled, true);
    } finally {
        config.isProduction = originalProduction;
    }
});

test("health checks bypass the global limiter while normal routes remain limited", async () => {
    const stack = app.router.stack;
    const healthIndex = stack.findIndex((layer) =>
        layer.route?.path === "/health" && layer.route.methods.get
    );
    const globalLimiterIndex = stack.findIndex((layer) =>
        layer.handle === rateLimiters.mutations
    );
    const normalRouters = [
        require("../routes/listing.js"),
        require("../routes/review.js"),
        require("../routes/listingBooking.js"),
        require("../routes/booking.js"),
        require("../routes/host.js"),
        require("../routes/user.js"),
    ];

    assert.ok(healthIndex >= 0);
    assert.ok(globalLimiterIndex > healthIndex);
    for (const router of normalRouters) {
        const routerIndex = stack.findIndex((layer) => layer.handle === router);
        assert.ok(routerIndex > globalLimiterIndex);
    }

    const originalReadyState = mongoose.connection.readyState;
    mongoose.connection.readyState = 1;
    const healthServer = app.listen(0);
    const normalApp = express();
    normalApp.use(rateLimiters.mutations);
    normalApp.get("/normal", (req, res) => res.sendStatus(200));
    normalApp.use((error, req, res, next) => {
        res.sendStatus(error.statusCode || 500);
    });
    const normalServer = normalApp.listen(0);

    try {
        await Promise.all([
            new Promise((resolve, reject) => {
                healthServer.once("listening", resolve);
                healthServer.once("error", reject);
            }),
            new Promise((resolve, reject) => {
                normalServer.once("listening", resolve);
                normalServer.once("error", reject);
            }),
        ]);

        const healthUrl = `http://127.0.0.1:${healthServer.address().port}/health`;
        for (let attempt = 0; attempt <= config.rateLimits.mutationMax; attempt++) {
            const response = await fetch(healthUrl);
            assert.equal(response.status, 200);
        }

        const normalUrl = `http://127.0.0.1:${normalServer.address().port}/normal`;
        for (let attempt = 0; attempt < config.rateLimits.mutationMax; attempt++) {
            const response = await fetch(normalUrl);
            assert.equal(response.status, 200);
        }
        assert.equal((await fetch(normalUrl)).status, 429);
    } finally {
        await Promise.all([
            new Promise((resolve) => healthServer.close(resolve)),
            new Promise((resolve) => normalServer.close(resolve)),
        ]);
        mongoose.connection.readyState = originalReadyState;
    }
});
