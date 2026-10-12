const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync.js");
const passport = require("passport");
const multer = require("multer");
const path = require("path");
const { storage, ensureCloudinaryConfigured } = require("../cloudConfig.js");
const {
    isLoggedIn,
    saveRedirectUrl,
    validateUser,
    isCurrentUser,
    verifyCsrfToken,
} = require("../middlware.js");
const rateLimiters = require("../utils/rateLimiters.js");
const userController = require("../controllers/user.js");
const profileUpload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
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
        if (allowedTypes[path.extname(file.originalname).toLowerCase()] !== file.mimetype) {
            const error = new Error("Please upload a JPG, PNG, or WebP profile photo.");
            error.statusCode = 400;
            return callback(error);
        }
        callback(null, true);
    },
});

router.route("/signup")
    .get(userController.renderSignupForm)
    .post(
        rateLimiters.authentication,
        validateUser,
        wrapAsync(userController.signup)
    );

router.route("/login")
    .get(userController.renderLoginForm)
    .post(rateLimiters.authentication,
        saveRedirectUrl,
        passport.authenticate("local", {
            failureRedirect: "/login",
            failureFlash: true
        }),
        wrapAsync(userController.login)
    );

router.get("/user/:id",
    wrapAsync(userController.userProfile)
);

router.get("/dashboard",
    isLoggedIn,
    wrapAsync(userController.myTrips)
);

router.route("/user/:id/edit")
    .get(isLoggedIn, isCurrentUser, userController.renderEditProfile)
    .post(isLoggedIn, isCurrentUser, profileUpload.single("profileImage"), verifyCsrfToken, wrapAsync(userController.updateProfile));

router.post("/logout", isLoggedIn, userController.logout);

module.exports = router;