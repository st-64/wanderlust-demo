const ExpressError = require("./ExpressError.js");

function createRateLimiter({ windowMs, max, message, now = Date.now, maxKeys = 20_000 }) {
    const hits = new Map();
    let lastPrunedAt = 0;

    return function rateLimiter(req, res, next) {
        const time = now();
        if (time - lastPrunedAt >= windowMs) {
            for (const [key, entry] of hits) {
                if (entry.resetAt <= time) hits.delete(key);
            }
            lastPrunedAt = time;
        }

        const clientKey = req.ip || req.socket?.remoteAddress || "unknown";
        let entry = hits.get(clientKey);
        if (!entry || entry.resetAt <= time) {
            if (hits.size >= maxKeys) {
                for (const [key, current] of hits) {
                    if (current.resetAt <= time) hits.delete(key);
                }
            }
            if (hits.size >= maxKeys) {
                res.setHeader("Retry-After", String(Math.ceil(windowMs / 1000)));
                return next(new ExpressError(503, "Request limiting is temporarily at capacity."));
            }
            entry = { count: 0, resetAt: time + windowMs };
            hits.set(clientKey, entry);
        }

        if (entry.count >= max) {
            res.setHeader("Retry-After", String(Math.max(1, Math.ceil((entry.resetAt - time) / 1000))));
            return next(new ExpressError(429, message));
        }
        entry.count++;
        next();
    };
}

module.exports = { createRateLimiter };
