const crypto = require("node:crypto");
const config = require("../config.js");

module.exports = (req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (config.isProduction && req.secure) {
        res.setHeader("Strict-Transport-Security", "max-age=31536000");
    }
    const nonce = crypto.randomBytes(18).toString("base64");
    res.locals.cspNonce = nonce;
    const policy = [
        "default-src 'self'",
        `script-src 'self' 'nonce-${nonce}' 'wasm-unsafe-eval' https://cdn.jsdelivr.net https://api.mapbox.com https://checkout.razorpay.com`,
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://api.mapbox.com https://fonts.googleapis.com",
        "img-src 'self' data: blob: https://res.cloudinary.com https://images.unsplash.com https://api.mapbox.com",
        "font-src 'self' data: https://cdnjs.cloudflare.com https://fonts.gstatic.com",
        "connect-src 'self' https://api.mapbox.com https://events.mapbox.com https://*.tiles.mapbox.com https://*.mapbox.com https://api.razorpay.com https://*.razorpay.com",
        "frame-src https://api.razorpay.com https://checkout.razorpay.com https://*.razorpay.com",
        "worker-src 'self' blob:",
        "child-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self' https://api.razorpay.com https://checkout.razorpay.com https://*.razorpay.com",
        "frame-ancestors 'none'",
    ].join("; ");
    res.setHeader(
        config.cspMode === "enforce"
            ? "Content-Security-Policy"
            : "Content-Security-Policy-Report-Only",
        policy
    );
    next();
};
