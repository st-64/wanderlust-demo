const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const session = require("express-session");
const multer = require("multer");
const csrf = require("../utils/csrf.js");
const { createRateLimiter } = require("../utils/rateLimiter.js");
const config = require("../config.js");
const securityHeaders = require("../utils/securityHeaders.js");
const rateLimiters = require("../utils/rateLimiters.js");
const { app: application } = require("../app.js");
const { validateListing, validateReview, validateBookingRequest } = require("../middlware.js");

function csrfRequest(overrides = {}) {
    const headers = {
        host: "wanderlust.example",
        origin: "https://wanderlust.example",
        "sec-fetch-site": "same-origin",
        ...overrides.headers,
    };
    return {
        method: "POST",
        protocol: "https",
        session: { csrfToken: "a".repeat(64) },
        body: { _csrf: "a".repeat(64) },
        get(name) {
            return headers[name.toLowerCase()] || null;
        },
        is(type) {
            return type === "multipart/form-data"
                && headers["content-type"]?.startsWith("multipart/form-data");
        },
        ...overrides,
    };
}

function invoke(middleware, req) {
    return new Promise((resolve) => {
        try {
            const result = middleware(req, {
                setHeader() {},
            }, (error) => resolve(error || null));
            if (result && typeof result.catch === "function") {
                result.catch(resolve);
            }
        } catch (error) {
            resolve(error);
        }
    });
}

test("CSRF guard allows same-origin token-bearing browser mutations", async () => {
    assert.equal(await invoke(csrf.csrfProtection, csrfRequest()), null);
});

test("untrusted forwarded headers do not change the client IP with Express proxy trust disabled", async (t) => {
    const app = express();
    app.set("trust proxy", false);
    app.get("/ip", (req, res) => res.json({ ip: req.ip }));
    const server = app.listen(0, "127.0.0.1");
    t.after(() => new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
    }));
    await new Promise((resolve) => server.once("listening", resolve));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/ip`, {
        headers: { "X-Forwarded-For": "198.51.100.77" },
    });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.notEqual(result.ip, "198.51.100.77");
    assert.equal(application.get("trust proxy"), config.trustProxy ? 1 : false);
});

test("HSTS is omitted for non-secure requests", () => {
    const originalProduction = config.isProduction;
    config.isProduction = true;
    try {
        const headers = {};
        securityHeaders(
            { secure: false },
            { locals: {}, setHeader(name, value) { headers[name.toLowerCase()] = value; } },
            () => {}
        );
        assert.equal(headers["strict-transport-security"], undefined);
    } finally {
        config.isProduction = originalProduction;
    }
});

test("session-backed CSRF accepts a legitimate form and rejects missing or cross-site tokens", async (t) => {
    const app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use(session({
        secret: "isolated-csrf-test-secret",
        resave: false,
        saveUninitialized: false,
    }));
    app.use(csrf.initializeCsrfToken);
    app.get("/form", (req, res) => {
        res.type("html").send(`<form method="post"><input name="_csrf" value="${res.locals.csrfToken}"></form>`);
    });
    app.use(csrf.csrfProtection);
    let mutations = 0;
    app.post("/mutate", (req, res) => {
        mutations++;
        res.sendStatus(204);
    });
    app.use((error, req, res, next) => {
        res.status(error.statusCode || 500).end();
    });

    const server = app.listen(0, "127.0.0.1");
    t.after(() => new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
    }));
    await new Promise((resolve) => server.once("listening", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const formResponse = await fetch(`${origin}/form`);
    const html = await formResponse.text();
    const token = html.match(/value="([a-f\d]{64})"/)?.[1];
    const cookie = formResponse.headers.get("set-cookie")?.split(";")[0];
    assert.ok(token);
    assert.ok(cookie);
    assert.equal(formResponse.headers.get("cache-control"), "no-store");

    const post = (headers, body) => {
        const requestHeaders = {
            Origin: origin,
            "Sec-Fetch-Site": "same-origin",
            Cookie: cookie,
            "Content-Type": "application/x-www-form-urlencoded",
            ...headers,
        };
        for (const [name, value] of Object.entries(requestHeaders)) {
            if (value === undefined) delete requestHeaders[name];
        }
        return fetch(`${origin}/mutate`, { method: "POST", headers: requestHeaders, body });
    };
    assert.equal((await post({}, new URLSearchParams({ _csrf: token }))).status, 204);
    assert.equal((await post({}, new URLSearchParams())).status, 403);
    assert.equal((await post({}, new URLSearchParams({ _csrf: "b".repeat(64) }))).status, 403);
    assert.equal((await post({ Origin: "https://attacker.example" }, new URLSearchParams({ _csrf: token }))).status, 403);
    assert.equal((await post({
        Origin: undefined,
        "Sec-Fetch-Site": undefined,
        Referer: `${origin}/form`,
    }, new URLSearchParams({ _csrf: token }))).status, 204);
    assert.equal(mutations, 2);
});

test("verified CSRF form fields pass application Joi validators while invalid tokens and unknown fields fail", async () => {
    const token = "c".repeat(64);
    const requests = [
        [
            validateListing,
            {
                listing: {
                    title: "Valid listing",
                    description: "This is a valid listing description.",
                    location: "Test City",
                    country: "India",
                    price: "1200",
                    category: "Homes",
                },
                _csrf: token,
            },
        ],
        [
            validateReview,
            { review: { rating: "5", comment: "Lovely stay" }, _csrf: token },
        ],
        [
            validateBookingRequest,
            {
                booking: { checkIn: "2026-10-10", checkOut: "2026-10-13", guests: "2" },
                _csrf: token,
            },
        ],
    ];

    for (const [validator, body] of requests) {
        const req = csrfRequest({ body });
        req.session.csrfToken = token;
        assert.equal(await invoke(csrf.csrfProtection, req), null);
        assert.equal(await invoke(validator, req), null);

        const invalidTokenRequest = csrfRequest({ body: { ...body, _csrf: "d".repeat(64) } });
        invalidTokenRequest.session.csrfToken = token;
        assert.equal((await invoke(csrf.csrfProtection, invalidTokenRequest)).statusCode, 403);

        const unexpectedFieldRequest = csrfRequest({ body: { ...body, unrelated: true } });
        unexpectedFieldRequest.session.csrfToken = token;
        assert.equal(await invoke(csrf.csrfProtection, unexpectedFieldRequest), null);
        assert.equal((await invoke(validator, unexpectedFieldRequest)).statusCode, 400);
    }
});

test("multipart CSRF checks reject before upload middleware and accept a valid parsed form", async (t) => {
    const app = express();
    app.use(session({
        secret: "isolated-multipart-csrf-test-secret",
        resave: false,
        saveUninitialized: false,
    }));
    app.use(csrf.initializeCsrfToken);
    app.get("/form", (req, res) => res.send(
        `<input name="_csrf" value="${res.locals.csrfToken}">`
    ));
    app.use(csrf.csrfProtection);
    let uploadMiddlewareCalls = 0;
    app.post(
        "/upload",
        (req, res, next) => {
            uploadMiddlewareCalls++;
            next();
        },
        multer().single("profileImage"),
        csrf.verifyCsrfToken,
        (req, res) => res.sendStatus(204)
    );
    app.use((error, req, res, next) => res.status(error.statusCode || 500).end());

    const server = app.listen(0, "127.0.0.1");
    t.after(() => new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
    }));
    await new Promise((resolve) => server.once("listening", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const formResponse = await fetch(`${origin}/form`);
    const cookie = formResponse.headers.get("set-cookie")?.split(";")[0];
    const html = await formResponse.text();
    const token = html.match(/value="([a-f\d]{64})"/)?.[1];
    assert.ok(cookie);
    assert.ok(token);

    const submit = (requestOrigin, csrfToken) => {
        const body = new FormData();
        body.set("_csrf", csrfToken);
        body.set("profileImage", new Blob(["synthetic upload"]), "profile.txt");
        return fetch(`${origin}/upload`, {
            method: "POST",
            headers: {
                Origin: requestOrigin,
                Cookie: cookie,
            },
            body,
        });
    };
    assert.equal((await submit("https://attacker.example", token)).status, 403);
    assert.equal(uploadMiddlewareCalls, 0);
    assert.equal((await submit(origin, token)).status, 204);
    assert.equal(uploadMiddlewareCalls, 1);
});

test("CSRF guard rejects missing tokens, cross-origin requests, and cross-site fetches", async () => {
    const missingToken = csrfRequest({ body: {} });
    assert.equal((await invoke(csrf.csrfProtection, missingToken)).statusCode, 403);

    const crossOrigin = csrfRequest({ headers: { origin: "https://attacker.example" } });
    assert.equal((await invoke(csrf.csrfProtection, crossOrigin)).statusCode, 403);

    const crossSiteFetch = csrfRequest({
        headers: { "sec-fetch-site": "cross-site" },
    });
    assert.equal((await invoke(csrf.csrfProtection, crossSiteFetch)).statusCode, 403);
});

test("multipart mutations require same-origin first and validate the parsed form token", async () => {
    const request = csrfRequest({
        body: {},
        headers: { "content-type": "multipart/form-data; boundary=test" },
    });
    assert.equal(await invoke(csrf.csrfProtection, request), null);
    assert.equal(request.csrfMultipartPending, true);
    assert.equal((await invoke(csrf.verifyCsrfToken, request)).statusCode, 403);

    request.body._csrf = "a".repeat(64);
    assert.equal(await invoke(csrf.verifyCsrfToken, request), null);
    assert.equal(request.csrfMultipartPending, false);
});

test("CSRF token initialization stores a cryptographically random token in the session and locals", async () => {
    const req = { session: {} };
    const res = {
        locals: {},
        headers: {},
        setHeader(name, value) { this.headers[name] = value; },
    };
    await new Promise((resolve, reject) => csrf.initializeCsrfToken(req, res, (error) =>
        error ? reject(error) : resolve()
    ));
    assert.match(req.session.csrfToken, /^[a-f\d]{64}$/);
    assert.equal(res.locals.csrfToken, req.session.csrfToken);
    assert.equal(res.headers["Cache-Control"], "no-store");
});

test("rate limiter allows the configured number of requests, returns 429, and resets after the window", async () => {
    let now = 1000;
    const limiter = createRateLimiter({
        windowMs: 1000,
        max: 2,
        message: "Slow down.",
        now: () => now,
    });
    const request = { ip: "192.0.2.1" };
    assert.equal(await invoke(limiter, request), null);
    assert.equal(await invoke(limiter, request), null);
    assert.equal((await invoke(limiter, request)).statusCode, 429);

    const limitedResponse = {
        headers: {},
        setHeader(name, value) { this.headers[name] = value; },
    };
    const limitedError = await new Promise((resolve) => limiter(
        request,
        limitedResponse,
        (error) => resolve(error || null)
    ));
    assert.equal(limitedError.statusCode, 429);
    assert.equal(limitedResponse.headers["Retry-After"], "1");

    now += 1000;
    assert.equal(await invoke(limiter, request), null);
});

test("rate limiter frees expired IP buckets when its bounded store reaches capacity", async () => {
    let now = 1000;
    const limiter = createRateLimiter({ windowMs: 100, max: 2, maxKeys: 1, now: () => now });
    const first = { ip: "192.0.2.1" };
    const second = { ip: "192.0.2.2" };
    assert.equal(await invoke(limiter, first), null);
    assert.equal((await invoke(limiter, second)).statusCode, 503);
    now += 100;
    assert.equal(await invoke(limiter, second), null);
});

test("each configured limiter permits its allowance and rejects the next request", async () => {
    const configured = [
        [rateLimiters.mutations, config.rateLimits.mutationMax],
        [rateLimiters.authentication, config.rateLimits.authMax],
        [rateLimiters.bookingCreation, config.rateLimits.bookingMax],
        [rateLimiters.paymentOrder, config.rateLimits.paymentOrderMax],
        [rateLimiters.paymentVerification, config.rateLimits.paymentVerifyMax],
    ];
    for (const [limiter, max] of configured) {
        const request = { ip: `198.51.100.${Math.ceil(Math.random() * 200)}` };
        let nextError = null;
        const response = { headers: {}, setHeader(name, value) { this.headers[name] = value; } };
        for (let attempt = 0; attempt < max; attempt++) {
            nextError = await invoke(limiter, request);
            assert.equal(nextError, null);
        }
        nextError = await new Promise((resolve) => limiter(
            request,
            response,
            (error) => resolve(error || null)
        ));
        assert.equal(nextError.statusCode, 429);
        assert.ok(Number(response.headers["Retry-After"]) > 0);
    }
});

test("application mounts the webhook raw parser before the webhook router and CSRF guard", () => {
    const stack = application.router.stack;
    assert.equal(stack[0].handle, securityHeaders);
    const rawParserIndex = stack.findIndex((layer) => layer.handle.name === "rawParser");
    const webhookRouterIndex = stack.findIndex((layer) =>
        layer.handle === require("../routes/paymentWebhook.js")
    );
    const csrfIndex = stack.findIndex((layer) => layer.handle === csrf.csrfProtection);
    const generalLimiterIndex = stack.findIndex((layer) => layer.handle === rateLimiters.mutations);
    assert.ok(rawParserIndex >= 0);
    assert.ok(webhookRouterIndex > rawParserIndex);
    assert.ok(csrfIndex > webhookRouterIndex);
    assert.ok(generalLimiterIndex > csrfIndex);

    const guardedRouters = [
        require("../routes/listing.js"),
        require("../routes/review.js"),
        require("../routes/listingBooking.js"),
        require("../routes/booking.js"),
        require("../routes/user.js"),
    ];
    for (const router of guardedRouters) {
        const routerIndex = stack.findIndex((layer) => layer.handle === router);
        assert.ok(routerIndex > generalLimiterIndex);
    }
});

test("Razorpay webhook accepts raw signed payload without browser CSRF when isolated dependencies are mocked", async (t) => {
    const paymentService = require("../services/payments.js");
    const razorpay = require("../services/razorpay.js");
    const originalVerify = razorpay.verifyWebhookSignature;
    const originalProcess = paymentService.processWebhook;
    let rawBody;
    razorpay.verifyWebhookSignature = (body) => {
        rawBody = body;
        return Buffer.isBuffer(body);
    };
    paymentService.processWebhook = async () => ({
        duplicate: false,
        processing: false,
    });

    const app = express();
    app.use(
        "/payments/razorpay/webhook",
        express.raw({ type: "application/json", limit: "1mb" }),
        require("../routes/paymentWebhook.js")
    );
    app.use(csrf.csrfProtection);
    app.use((error, req, res, next) => res.status(error.statusCode || 500).end());
    const server = app.listen(0, "127.0.0.1");
    t.after(async () => {
        razorpay.verifyWebhookSignature = originalVerify;
        paymentService.processWebhook = originalProcess;
        await new Promise((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
        });
    });
    await new Promise((resolve) => server.once("listening", resolve));
    const payload = Buffer.from('{"event":"test.event","payload":{}}');
    const response = await fetch(
        `http://127.0.0.1:${server.address().port}/payments/razorpay/webhook`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
        }
    );
    assert.equal(response.status, 200);
    assert.deepEqual(rawBody, payload);
});

test("CSP response policy is nonce-based, defaults to report-only, and supports explicit enforcement", () => {
    const originalMode = config.cspMode;
    const run = (mode) => {
        config.cspMode = mode;
        const headers = {};
        const res = {
            locals: {},
            setHeader(name, value) { headers[name.toLowerCase()] = value; },
        };
        securityHeaders({ secure: false }, res, () => {});
        return { headers, nonce: res.locals.cspNonce };
    };
    try {
        const reportOnly = run("report-only");
        assert.ok(reportOnly.nonce);
        assert.match(reportOnly.headers["content-security-policy-report-only"], /script-src 'self' 'nonce-/);
        assert.doesNotMatch(reportOnly.headers["content-security-policy-report-only"], /script-src[^;]*unsafe-inline/);
        assert.doesNotMatch(reportOnly.headers["content-security-policy-report-only"], /script-src[^;]*cdnjs\.cloudflare\.com/);
        assert.doesNotMatch(reportOnly.headers["content-security-policy-report-only"], /script-src[^;]*\*\.razorpay\.com/);
        assert.match(reportOnly.headers["content-security-policy-report-only"], /style-src 'self' 'unsafe-inline'/);
        assert.match(reportOnly.headers["content-security-policy-report-only"], /img-src[^;]*https:\/\/res\.cloudinary\.com/);
        assert.match(reportOnly.headers["content-security-policy-report-only"], /img-src[^;]*https:\/\/images\.unsplash\.com/);
        assert.match(reportOnly.headers["content-security-policy-report-only"], /frame-ancestors 'none'/);

        const enforced = run("enforce");
        assert.match(enforced.headers["content-security-policy"], /script-src 'self' 'nonce-/);
        assert.equal(enforced.headers["content-security-policy-report-only"], undefined);
        assert.notEqual(enforced.nonce, reportOnly.nonce);
    } finally {
        config.cspMode = originalMode;
    }
});

test("sensitive routes mount their dedicated IP limiters", () => {
    const userRouter = require("../routes/user.js");
    const listingRouter = require("../routes/listing.js");
    const reviewRouter = require("../routes/review.js");
    const bookingRouter = require("../routes/booking.js");
    const listingBookingRouter = require("../routes/listingBooking.js");
    const routeHas = (router, pathname, handler) => router.stack
        .find((layer) => layer.route?.path === pathname)
        ?.route.stack.some((layer) => layer.handle === handler);

    for (const pathName of ["/signup", "/login"]) {
        const route = userRouter.stack.find((layer) => layer.route?.path === pathName);
        assert.ok(route.route.stack.some((layer) => layer.handle === rateLimiters.authentication));
    }

    const mutations = [
        [userRouter, "/signup", "post"],
        [userRouter, "/login", "post"],
        [userRouter, "/logout", "post"],
        [userRouter, "/user/:id/edit", "post"],
        [listingRouter, "/", "post"],
        [listingRouter, "/:id", "put"],
        [listingRouter, "/:id", "delete"],
        [reviewRouter, "/", "post"],
        [reviewRouter, "/:reviewId", "delete"],
        [listingBookingRouter, "/", "post"],
        [bookingRouter, "/:bookingId/cancel", "post"],
        [bookingRouter, "/:bookingId/checkout", "post"],
        [bookingRouter, "/:bookingId/verify", "post"],
    ];
    for (const [router, pathname, method] of mutations) {
        assert.ok(router.stack.some((layer) =>
            layer.route?.path === pathname && layer.route.methods[method]
        ), `${method.toUpperCase()} ${pathname} must remain mounted behind application CSRF protection`);
    }
    assert.equal(routeHas(listingBookingRouter, "/", rateLimiters.bookingCreation), true);
    assert.equal(routeHas(bookingRouter, "/:bookingId/checkout", rateLimiters.paymentOrder), true);
    assert.equal(routeHas(bookingRouter, "/:bookingId/verify", rateLimiters.paymentVerification), true);
});

test("multipart profile and listing routes validate the form token after parsing", () => {
    const { verifyCsrfToken } = require("../middlware.js");
    const userRouter = require("../routes/user.js");
    const listingRouter = require("../routes/listing.js");
    for (const [router, pathname] of [
        [userRouter, "/user/:id/edit"],
        [listingRouter, "/"],
        [listingRouter, "/:id"],
    ]) {
        const route = router.stack.find((layer) => layer.route?.path === pathname);
        assert.ok(route);
        const verifyIndex = route.route.stack.findIndex((layer) =>
            layer.handle === verifyCsrfToken
        );
        const uploadIndex = route.route.stack.findIndex((layer) =>
            layer.handle.name === "multerMiddleware"
        );
        assert.ok(verifyIndex > uploadIndex, `${pathname} must parse multipart fields before validating the form token`);
    }
});

test("every inline executable or JSON script template uses the response nonce", () => {
    const findTemplates = (directory) => fs.readdirSync(directory, { withFileTypes: true })
        .flatMap((entry) => {
            const entryPath = path.join(directory, entry.name);
            if (entry.isDirectory()) return findTemplates(entryPath);
            return entry.name.endsWith(".ejs") ? [entryPath] : [];
        });
    const templates = findTemplates(path.join(__dirname, "..", "views"));
    for (const template of templates) {
        const source = fs.readFileSync(template, "utf8");
        const inlineScripts = [...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
            .filter(([, , body]) => body.trim());
        for (const [tag] of inlineScripts) {
            assert.match(tag, /\bnonce="<%= cspNonce %>"/, `${path.relative(__dirname, template)} inline script needs a nonce`);
        }
    }
});

test("every browser mutation form includes a session CSRF token and payment fetches handle failures", () => {
    const viewsRoot = path.join(__dirname, "..", "views");
    const findTemplates = (directory) => fs.readdirSync(directory, { withFileTypes: true })
        .flatMap((entry) => {
            const entryPath = path.join(directory, entry.name);
            if (entry.isDirectory()) return findTemplates(entryPath);
            return entry.name.endsWith(".ejs") ? [entryPath] : [];
        });
    const mutationForm = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
    let checkedForms = 0;
    for (const template of findTemplates(viewsRoot)) {
        const source = fs.readFileSync(template, "utf8");
        for (const [, attributes, body] of source.matchAll(mutationForm)) {
            if (!/\bmethod=["'](?:post|put|patch|delete)["']/i.test(attributes)) continue;
            assert.match(body, /name=["']_csrf["']/, `${path.relative(viewsRoot, template)} mutation form needs a CSRF field`);
            checkedForms++;
        }
    }
    assert.ok(checkedForms > 0);

    const paymentSource = fs.readFileSync(
        path.join(__dirname, "..", "public", "js", "payment-checkout.js"),
        "utf8"
    );
    assert.equal((paymentSource.match(/"X-CSRF-Token":/g) || []).length, 2);
    assert.match(paymentSource, /if \(!orderResponse\.ok\)/);
    assert.match(paymentSource, /!response\.ok \|\| result\.status === "refund_required"/);
});

test("listing photo uploads optimize oversized images before the multipart request", () => {
    const uploadSource = fs.readFileSync(
        path.join(__dirname, "..", "public", "js", "image-upload.js"),
        "utf8"
    );
    assert.match(uploadSource, /const maximumImageDimension = 1920/);
    assert.match(uploadSource, /const optimizeAboveBytes = 1024 \* 1024/);
    assert.match(uploadSource, /createImageBitmap\(file\)/);
    assert.match(uploadSource, /canvas\.toBlob\(resolve, "image\/webp", 0\.82\)/);
    assert.match(uploadSource, /new DataTransfer\(\)/);
    assert.match(uploadSource, /await optimizeImage\(file\)/);
    assert.match(uploadSource, /form\.requestSubmit/);
    assert.match(uploadSource, /Photos could not be prepared for upload/);
});
