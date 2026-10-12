const express = require("express");
const router = express.Router({ mergeParams: true });
const wrapAsync = require("../utils/wrapAsync.js");
const { isLoggedIn, validateReview, isReviewAuthor } = require("../middlware.js");
const reviewController = require("../controllers/review.js");
const Listing = require("../models/listing.js");

// Post Review Route
router.post("/",
    isLoggedIn,
    wrapAsync(async (req, res, next) => {
        const listing = await Listing.findById(req.params.id).select("_id");
        if (!listing) {
            req.flash("error", "That listing could not be found.");
            return res.redirect("/listings");
        }
        next();
    }),
    validateReview,
    wrapAsync(reviewController.createReview)
);

// Delete Review Route
router.delete("/:reviewId",
    isLoggedIn,
    isReviewAuthor,
    wrapAsync(reviewController.destroyReview)
);

module.exports = router;