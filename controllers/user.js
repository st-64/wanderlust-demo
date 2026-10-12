const User = require("../models/user.js");
const Listing = require("../models/listing.js");
const mongoose = require("mongoose");
const { deleteCloudinaryImages, getListingCoverImage } = require("../utils/listingImages.js");
const { profileSchema } = require("../schema.js");
const ExpressError = require("../utils/ExpressError.js");
const guestBookings = require("../services/guestBookings.js");

module.exports.renderSignupForm = (req, res) => {
    res.render("users/signup.ejs");
};

module.exports.signup = async (req, res, next) => {
    try {
        const { email, username, fullName, password } = req.body.user;
        let newUser = new User({ email, username, fullName });

        let registeredUser = await User.register(newUser, password);
        // console.log(registeredUser);
        req.login(registeredUser, (err) => {
            if (err) return next(err);

            req.flash("success", `Hi ${username}, Welcome to Wanderlust!`);
            res.redirect("/listings");
        });
    } catch (error) {
        if (error.name === "UserExistsError" || error.code === 11000) {
            req.flash("error", "That username or email is already in use.");
            return res.redirect("/signup");
        }
        next(error);
    }
};

module.exports.renderLoginForm = (req, res) => {
    res.render("users/login.ejs");
};

module.exports.login = async (req, res) => {
    const { username } = req.body;
    req.flash("success", `Welcome back ${username}!`);
    const redirectUrl = res.locals.redirectUrl || "/listings";
    res.redirect(redirectUrl);
};

module.exports.logout = (req, res, next) => {
    req.logOut((err) => {
        if (err) {
            return next(err);
        }
        req.flash("success", "You are logged out!");
        res.redirect("/listings");
    });
};

module.exports.myTrips = async (req, res) => {
    const sections = await guestBookings.getGuestBookings(req.user._id);
    for (const bookings of Object.values(sections)) {
        for (const booking of bookings) {
            const listing = booking.listing;
            booking.listingTitle = listing?.title || booking.listingSnapshot?.title || "Listing unavailable";
            booking.listingLocation = listing?.location || booking.listingSnapshot?.location || "Location unavailable";
            booking.listingImageUrl = getListingCoverImage(listing || {});
            booking.listingUrl = listing ? `/listings/${listing._id}` : null;
        }
    }
    res.render("bookings/index.ejs", { sections });
};

module.exports.userProfile = async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
        req.flash("error", "That profile could not be found.");
        return res.redirect("/listings");
    }

    const profileUser = await User.findById(id);
    if (!profileUser) {
        req.flash("error", "That profile could not be found.");
        return res.redirect("/listings");
    }
    const userListings = await Listing.find({ owner: id }).lean();
    userListings.forEach((listing) => {
        listing.coverImageUrl = getListingCoverImage(listing);
    });

    res.render("users/userProfile", {
        profileUser,
        userListings,
        isOwnProfile: req.user?._id.equals(profileUser._id) || false,
    });
};

module.exports.renderEditProfile = (req, res) => {
    res.render("users/editProfile.ejs", { profileUser: req.user });
};

module.exports.updateProfile = async (req, res) => {
    const { error } = profileSchema.validate(req.body.profile || {});
    if (error) {
        if (req.file) await deleteCloudinaryImages([{ filename: req.file.filename }]);
        throw new ExpressError(400, error.details.map((detail) => detail.message).join(", "));
    }

    const profileUser = await User.findById(req.user._id);
    if (!profileUser) {
        if (req.file) await deleteCloudinaryImages([{ filename: req.file.filename }]);
        throw new ExpressError(404, "The authenticated user could not be found.");
    }

    if (Object.prototype.hasOwnProperty.call(req.body.profile || {}, "fullName")) {
        profileUser.fullName = req.body.profile.fullName;
    }

    const oldImage = profileUser.profileImage
        ? { url: profileUser.profileImage.url, filename: profileUser.profileImage.filename }
        : null;
    if (req.file) {
        profileUser.set("profileImage.url", req.file.path);
        profileUser.set("profileImage.filename", req.file.filename);
    }

    try {
        await profileUser.save();
    } catch (error) {
        if (req.file) await deleteCloudinaryImages([{ filename: req.file.filename }]);
        throw error;
    }
    if (req.file && oldImage?.filename && oldImage.filename !== req.file.filename) {
        await deleteCloudinaryImages([oldImage]);
    }
    req.flash("success", "Your profile has been updated.");
    res.redirect(`/user/${profileUser._id}`);
};