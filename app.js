const config = require("./config");
const express = require("express");
const app = express();
const mongoose = require("mongoose");
const path = require("path");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const ExpressError = require("./utils/ExpressError.js");
const session = require("express-session");
const flash = require("connect-flash");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const { MongoStore } = require("connect-mongo");
const User = require("./models/user.js");

const ListingRoute = require("./routes/listing.js");
const ReviewRoute = require("./routes/review.js");
const UserRoute = require("./routes/user.js");
const ListingBookingRoute = require("./routes/listingBooking.js");
const BookingRoute = require("./routes/booking.js");
const HostRoute = require("./routes/host.js");
const PaymentWebhookRoute = require("./routes/paymentWebhook.js");
const { startBookingExpiryWorker, expirePendingBookings } = require("./services/booking.js");
const paymentService = require("./services/payments.js");
const securityHeaders = require("./utils/securityHeaders.js");
const {
    initializeCsrfToken,
    csrfProtection,
} = require("./utils/csrf.js");
const rateLimiters = require("./utils/rateLimiters.js");

if (config.isProduction) config.validateRuntimeConfig();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.set("trust proxy", config.trustProxy ? 1 : false);
app.disable("x-powered-by");
app.use(securityHeaders);
app.use(express.urlencoded({ extended: true, limit: "32kb" }));
app.use(methodOverride("_method"));
app.engine("ejs", ejsMate);
app.use(express.static(path.join(__dirname, "/public")));

let connectSessionStoreClient;
const sessionClientPromise = new Promise((resolve) => {
    connectSessionStoreClient = resolve;
});
const sessionStore = MongoStore.create({
    clientPromise: sessionClientPromise,
    collectionName: "sessions",
    ttl: 7 * 24 * 60 * 60,
    autoRemove: "disabled",
});

const sessionOptions = {
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        httpOnly: true,
        sameSite: "lax",
        secure: config.isProduction,
    }
};

app.use(session(sessionOptions));
app.use(flash());
app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());
app.use(initializeCsrfToken);

app.get("/", (req, res) => {
    res.redirect("/listings");
});

app.use((req, res, next) => {
    res.locals.success = req.flash("success");
    res.locals.error = req.flash("error");
    res.locals.currUser = req.user;
    res.locals.mapToken = config.mapToken;
    res.locals.paymentCheckoutEnabled = config.razorpay.enabled;
    res.locals.portfolioDemoMode = !config.razorpay.enabled;
    next();
});

app.use(
    "/payments/razorpay/webhook",
    express.raw({ type: "application/json", limit: "1mb" }),
    PaymentWebhookRoute
);
app.use(csrfProtection);
app.use(rateLimiters.mutations);
app.use("/listings", ListingRoute);
app.use("/listings/:id/bookings", ListingBookingRoute);
app.use("/listings/:id/reviews", ReviewRoute);
app.use("/bookings", BookingRoute);
app.use("/host", HostRoute);
app.use("/", UserRoute);

app.get("/health", (req, res) => {
    const databaseReady = mongoose.connection.readyState === 1;
    res.status(databaseReady ? 200 : 503).json({ status: databaseReady ? "ok" : "unavailable" });
});

app.all(/(.*)/, (req, res, next) => {
    next(new ExpressError(404, "Page Not Found!"));
});

app.use((err, req, res, next) => {
    const statusCode = Number.isInteger(err.statusCode)
        ? err.statusCode
        : err.name === "MulterError"
            ? err.code === "LIMIT_FILE_SIZE" ? 413 : 400
            : err.name === "CastError" ? 404 : 500;
    const message = statusCode < 500 || !config.isProduction
        ? err.message
        : "Something went wrong. Please try again.";

    if (statusCode >= 500) {
        console.error(err);
    }

    res.status(statusCode).render("error.ejs", { message });
});

async function startServer() {
    config.validateRuntimeConfig();
    await mongoose.connect(config.mongoUrl);
    const mongoClient = mongoose.connection.getClient();
    await mongoClient.db().collection("sessions").createIndex(
        { expires: 1 },
        { expireAfterSeconds: 0 }
    );
    connectSessionStoreClient(mongoClient);
    const bookingExpiryTimer = startBookingExpiryWorker();
    const paymentReconciliationTimer = config.razorpay.enabled
        ? paymentService.startPaymentReconciliationWorker()
        : null;
    await expirePendingBookings();
    console.log("connected to DB");

    const server = app.listen(config.port, () => {
        console.log(`server is listening on port ${config.port}`);
    });

    let shuttingDown = false;
    const shutdown = (signal) => {
        if (shuttingDown) return;
        shuttingDown = true;
        console.log(`${signal} received; shutting down gracefully`);
        clearInterval(bookingExpiryTimer);
        if (paymentReconciliationTimer) clearInterval(paymentReconciliationTimer);
        server.close(async (error) => {
            try {
                await mongoose.disconnect();
                if (error) throw error;
                process.exitCode = 0;
            } catch (shutdownError) {
                console.error("Graceful shutdown failed:", shutdownError);
                process.exitCode = 1;
            }
        });
    };

    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));
    return server;
}

if (require.main === module) {
    startServer().catch((error) => {
        console.error("Application startup failed:", error.message);
        process.exitCode = 1;
    });
}

module.exports = { app, startServer };