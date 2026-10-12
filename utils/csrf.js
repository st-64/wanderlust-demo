const crypto = require("node:crypto");
const ExpressError = require("./ExpressError.js");

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function expectedOrigin(req) {
    const host = req.get("host");
    if (!host) return null;
    try {
        return new URL(`${req.protocol}://${host}`).origin;
    } catch {
        return null;
    }
}

function requestOrigin(req) {
    const origin = req.get("origin");
    if (origin) {
        try {
            return new URL(origin).origin;
        } catch {
            return null;
        }
    }
    const referer = req.get("referer");
    if (referer) {
        try {
            return new URL(referer).origin;
        } catch {
            return null;
        }
    }
    return null;
}

function isSameOrigin(req) {
    const targetOrigin = expectedOrigin(req);
    const sourceOrigin = requestOrigin(req);
    return Boolean(
        targetOrigin
        && sourceOrigin
        && sourceOrigin === targetOrigin
        && req.get("sec-fetch-site") !== "cross-site"
    );
}

function hasValidToken(sessionToken, submittedToken) {
    if (typeof sessionToken !== "string"
        || !/^[a-f\d]{64}$/i.test(sessionToken)
        || typeof submittedToken !== "string"
        || !/^[a-f\d]{64}$/i.test(submittedToken)) {
        return false;
    }
    return crypto.timingSafeEqual(
        Buffer.from(sessionToken, "hex"),
        Buffer.from(submittedToken, "hex")
    );
}

function initializeCsrfToken(req, res, next) {
    if (!req.session) return next(new ExpressError(500, "Secure session is unavailable."));
    if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString("hex");
    res.setHeader("Cache-Control", "no-store");
    res.locals.csrfToken = req.session.csrfToken;
    next();
}

function csrfProtection(req, res, next) {
    if (SAFE_METHODS.has(req.method)) return next();
    if (!isSameOrigin(req)) {
        return next(new ExpressError(403, "This request could not be verified. Reload the page and try again."));
    }

    if (req.is("multipart/form-data")) {
        req.csrfMultipartPending = true;
        return next();
    }
    return verifyCsrfToken(req, res, next);
}

function verifyCsrfToken(req, res, next) {
    const submittedToken = req.get("x-csrf-token") || req.body?._csrf;
    if (!hasValidToken(req.session?.csrfToken, submittedToken)) {
        return next(new ExpressError(403, "This request could not be verified. Reload the page and try again."));
    }
    req.csrfMultipartPending = false;
    next();
}

module.exports = {
    hasValidToken,
    initializeCsrfToken,
    csrfProtection,
    verifyCsrfToken,
    isSameOrigin,
};
