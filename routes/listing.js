const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync.js");
const {
    isLoggedIn,
    isOwner,
    validateListing,
    verifyCsrfToken,
} = require("../middlware.js");
const listingController = require("../controllers/listing.js");
const multer = require('multer');
const { storage, ensureCloudinaryConfigured } = require("../cloudConfig.js");
const upload = multer({
    storage,
    limits: { fileSize: 8 * 1024 * 1024, files: 8 },
    fileFilter: (req, file, callback) => {
        try {
            ensureCloudinaryConfigured();
        } catch (error) {
            return callback(error);
        }
        const allowedTypes = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".webp": "image/webp",
        };
        const extension = require("path").extname(file.originalname).toLowerCase();
        if (allowedTypes[extension] !== file.mimetype) {
            const error = new Error("Please upload JPG, PNG, or WebP images.");
            error.statusCode = 400;
            return callback(error);
        }
        callback(null, true);
    },
});
const listingImageFields = upload.fields([
    { name: "listing[images]", maxCount: 8 },
    { name: "listing[image]", maxCount: 1 },
]);

//Index Route & Create Route
router.route("/")
    .get(wrapAsync(listingController.index))
    .post(isLoggedIn,
        listingImageFields,
        verifyCsrfToken,
        validateListing,
        wrapAsync(listingController.createListing)
    );

//New Route
router.get("/new", isLoggedIn, listingController.renderNewForm);

// Show, Update, and Delete Routes
router.route("/:id")
    .get(wrapAsync(listingController.showListing))
    .put(isLoggedIn,
        isOwner,
        listingImageFields,
        verifyCsrfToken,
        validateListing,
        wrapAsync(listingController.updateListing)
    )
    .delete(isLoggedIn,
        isOwner,
        wrapAsync(listingController.destroyListing)
    );

//Edit Route
router.get("/:id/edit",
    isLoggedIn,
    isOwner,
    wrapAsync(listingController.renderEditForm)
);

module.exports = router;