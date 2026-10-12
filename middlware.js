const Listing = require("./models/listing.js");
const Review = require("./models/review.js");
const Booking = require("./models/booking.js");
const { listingSchema, userSchema, reviewSchema, bookingRequestSchema } = require("./schema.js");
const ExpressError = require("./utils/ExpressError.js");
const mongoose = require("mongoose");
const { deleteCloudinaryImages } = require("./utils/listingImages.js");

module.exports.isLoggedIn = (req, res, next) => {
    // console.log("req.user: ", req.user);
    if (!req.isAuthenticated()) {
        req.session.redirectUrl = req.originalUrl;
        req.flash("error", "you must be logged in first!");
        return res.redirect("/login");
    }
    next();
};

module.exports.saveRedirectUrl = (req, res, next) => {
    if (req.session.redirectUrl) {
        const redirectUrl = req.session.redirectUrl;
        res.locals.redirectUrl = redirectUrl.startsWith("/") && !redirectUrl.startsWith("//")
            ? redirectUrl
            : "/listings";
        delete req.session.redirectUrl;
    }
    next();
};

module.exports.isOwner = async (req, res, next) => {
    let { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new ExpressError(404, "Listing does not exist.");
    }
    let listing = await Listing.findById(id);

    if (!listing) {
        req.flash("error", "Listing does not exist!");
        return res.redirect("/listings");
    }


    if (!listing.owner || !listing.owner.equals(res.locals.currUser._id)) {
        req.flash("error", "You are not the owner of this listing");
        return res.redirect(`/listings/${id}`);
    }

    next();
};

module.exports.validateListing = async (req, res, next) => {
    let { error } = listingSchema.validate(req.body);
    if (error) {
        const uploaded = Object.values(req.files || {}).flat();
        await deleteCloudinaryImages(uploaded.map((file) => ({ filename: file.filename })));
        let errMsg = error.details.map((el) => el.message).join(",");
        throw new ExpressError(400, errMsg);
    }
    next();
};

module.exports.validateReview = (req, res, next) => {
    let { error } = reviewSchema.validate(req.body);
    if (error) {
        let errMsg = error.details.map((el) => el.message).join(",");
        throw new ExpressError(400, errMsg);
    } else {
        next();
    }
};

module.exports.validateUser = (req, res, next) => {
    let { error } = userSchema.validate(req.body.user);
    if (error) {
        let errMsg = error.details.map((el) => el.message).join(",");
        throw new ExpressError(400, errMsg);
    } else {
        next();
    }
};

module.exports.isReviewAuthor = async (req, res, next) => {
    let { id, reviewId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(reviewId)) {
        throw new ExpressError(404, "Review does not exist.");
    }
    let review = await Review.findById(reviewId);
    let listing = await Listing.findById(id);

    if (!listing || !review || !listing.reviews.some((listingReview) => listingReview.equals(review._id))) {
        req.flash("error", "Listing does not exist!");
        return res.redirect("/listings");
    }

    if (!review.author || !review.author.equals(res.locals.currUser._id)) {
        req.flash("error", "You are not the author of this listing");
        return res.redirect(`/listings/${id}`);
    }

    next();
};

module.exports.isCurrentUser = (req, res, next) => {
    if (!req.user || req.user._id.toString() !== req.params.id) {
        req.flash("error", "You can only edit your own profile.");
        return res.redirect("/listings");
    }
    next();
};

module.exports.validateBookingRequest = (req, res, next) => {
    const { error } = bookingRequestSchema.validate(req.body);
    if (error) {
        const message = error.details.map((detail) => detail.message).join(", ");
        throw new ExpressError(400, message);
    }
    next();
};

module.exports.isBookingGuest = async (req, res, next) => {
    const { bookingId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
        throw new ExpressError(404, "That booking could not be found.");
    }
    const booking = await Booking.findById(bookingId);
    if (!booking || !booking.guest.equals(res.locals.currUser._id)) {
        throw new ExpressError(404, "That booking could not be found.");
    }
    res.locals.booking = booking;
    next();
};

module.exports.isBookingHost = async (req, res, next) => {
    const { bookingId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
        throw new ExpressError(404, "That booking could not be found.");
    }
    const booking = await Booking.findById(bookingId).select("_id host");
    if (!booking || !booking.host.equals(res.locals.currUser._id)) {
        throw new ExpressError(404, "That booking could not be found.");
    }
    res.locals.booking = booking;
    next();
};

module.exports.verifyCsrfToken = require("./utils/csrf.js").verifyCsrfToken;