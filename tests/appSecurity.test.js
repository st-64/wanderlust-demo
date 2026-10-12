const test = require("node:test");
const assert = require("node:assert/strict");
const config = require("../config.js");
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
