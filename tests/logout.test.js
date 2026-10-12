const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const session = require("express-session");
const flash = require("connect-flash");
const passportModule = require("passport");
const csrf = require("../utils/csrf.js");
const { isLoggedIn } = require("../middlware.js");
const userController = require("../controllers/user.js");
const userRouter = require("../routes/user.js");

function createLogoutApp() {
    const app = express();
    const passport = new passportModule.Authenticator();
    passport.serializeUser((user, done) => done(null, user.id));
    passport.deserializeUser((id, done) => done(null, { id }));

    app.use(express.urlencoded({ extended: false }));
    app.use(session({
        secret: "isolated-logout-test-secret",
        resave: false,
        saveUninitialized: false,
    }));
    app.use(flash());
    app.use(passport.initialize());
    app.use(passport.session());
    app.use(csrf.initializeCsrfToken);

    app.get("/login", (req, res, next) => {
        req.login({ id: "synthetic-user" }, (error) => {
            if (error) return next(error);
            csrf.initializeCsrfToken(req, res, next);
        });
    }, (req, res) => {
        res.type("html").send(`<form method="post" action="/logout"><input name="_csrf" value="${res.locals.csrfToken}"></form>`);
    });

    app.use(csrf.csrfProtection);
    app.post("/logout", isLoggedIn, userController.logout);
    app.get("/protected", isLoggedIn, (req, res) => res.send("authenticated"));
    app.use((error, req, res, next) => {
        res.status(error.statusCode || 500).send(error.message);
    });
    return app;
}

test("authenticated CSRF-protected logout redirects and invalidates the session", async (t) => {
    const app = createLogoutApp();
    const server = app.listen(0, "127.0.0.1");
    t.after(() => new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
    }));
    await new Promise((resolve) => server.once("listening", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const loginResponse = await fetch(`${origin}/login`);
    const html = await loginResponse.text();
    const csrfToken = html.match(/value="([a-f\d]{64})"/)?.[1];
    const cookie = loginResponse.headers.get("set-cookie")?.split(";")[0];
    assert.ok(csrfToken);
    assert.ok(cookie);

    const protectedResponse = await fetch(`${origin}/protected`, {
        headers: { Cookie: cookie },
        redirect: "manual",
    });
    assert.equal(protectedResponse.status, 200);
    assert.equal(await protectedResponse.text(), "authenticated");

    const logoutResponse = await fetch(`${origin}/logout`, {
        method: "POST",
        headers: {
            Origin: origin,
            "Sec-Fetch-Site": "same-origin",
            Cookie: cookie,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ _csrf: csrfToken }),
        redirect: "manual",
    });
    assert.equal(logoutResponse.status, 302);
    assert.equal(logoutResponse.headers.get("location"), "/listings");

    const afterLogoutResponse = await fetch(`${origin}/protected`, {
        headers: { Cookie: cookie },
        redirect: "manual",
    });
    assert.equal(afterLogoutResponse.status, 302);
    assert.equal(afterLogoutResponse.headers.get("location"), "/login");
});

test("logout rejects missing and invalid CSRF tokens without invalidating authentication", async (t) => {
    const app = createLogoutApp();
    const server = app.listen(0, "127.0.0.1");
    t.after(() => new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
    }));
    await new Promise((resolve) => server.once("listening", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const loginResponse = await fetch(`${origin}/login`);
    const html = await loginResponse.text();
    const csrfToken = html.match(/value="([a-f\d]{64})"/)?.[1];
    const cookie = loginResponse.headers.get("set-cookie")?.split(";")[0];

    for (const body of [
        new URLSearchParams(),
        new URLSearchParams({ _csrf: "f".repeat(64) }),
    ]) {
        const response = await fetch(`${origin}/logout`, {
            method: "POST",
            headers: {
                Origin: origin,
                "Sec-Fetch-Site": "same-origin",
                Cookie: cookie,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body,
            redirect: "manual",
        });
        assert.equal(response.status, 403);
    }

    assert.match(csrfToken, /^[a-f\d]{64}$/);
    const protectedResponse = await fetch(`${origin}/protected`, {
        headers: { Cookie: cookie },
    });
    assert.equal(await protectedResponse.text(), "authenticated");
});

test("logout passes Passport session errors to Express without flashing or redirecting success", async () => {
    const sessionError = new Error("synthetic session destruction failure");
    const req = {
        logOut(callback) {
            callback(sessionError);
        },
        flash() {
            assert.fail("logout must not report success after session invalidation fails");
        },
    };
    let redirected = false;
    let forwardedError;

    userController.logout(req, {
        redirect() { redirected = true; },
    }, (error) => {
        forwardedError = error;
    });

    assert.equal(forwardedError, sessionError);
    assert.equal(redirected, false);
});

test("logout route uses callback-aware controller directly, not promise-only wrapAsync", () => {
    const route = userRouter.stack.find((layer) => layer.route?.path === "/logout");
    assert.ok(route);
    assert.equal(route.route.methods.post, true);
    assert.equal(route.route.stack.some((layer) => layer.handle === isLoggedIn), true);
    assert.equal(route.route.stack.some((layer) => layer.handle === userController.logout), true);
    assert.equal(route.route.stack.some((layer) => layer.handle.name === "wrap"), false);
});
