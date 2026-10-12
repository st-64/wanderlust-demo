const Listing = require("../models/listing");
const Review = require("../models/review");
const Booking = require("../models/booking.js");
const { expirePendingBookings } = require("../services/booking.js");
const { cloudinary } = require("../cloudConfig");
const config = require("../config");
const ExpressError = require("../utils/ExpressError");
const {
    getListingImages,
    getListingCoverImage,
    uploadedListingImages,
    deleteCloudinaryImages,
} = require("../utils/listingImages");
const mbxGeocoding = require("@mapbox/mapbox-sdk/services/geocoding");
const geocodingClient = config.mapToken
    ? mbxGeocoding({ accessToken: config.mapToken })
    : null;

const pageSize = 12;

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getUploadedFiles(req) {
    return [
        ...(req.files?.["listing[images]"] || []),
        ...(req.files?.["listing[image]"] || []),
    ];
}

async function geocodeLocation(location) {
    if (!geocodingClient) {
        throw new ExpressError(503, "Location lookup is unavailable right now.");
    }

    try {
        const response = await geocodingClient.forwardGeocode({ query: location, limit: 1 }).send();
        const geometry = response.body.features?.[0]?.geometry;
        const coordinates = geometry?.coordinates;
        if (
            geometry?.type !== "Point" ||
            !Array.isArray(coordinates) ||
            coordinates.length !== 2 ||
            !coordinates.every(Number.isFinite) ||
            coordinates[0] < -180 || coordinates[0] > 180 ||
            coordinates[1] < -90 || coordinates[1] > 90
        ) {
            throw new ExpressError(422, "We couldn't locate that address. Please enter a more specific location.");
        }
        return geometry;
    } catch (error) {
        if (error instanceof ExpressError) throw error;
        console.error("Mapbox geocoding failed:", error.message);
        throw new ExpressError(502, "We couldn't look up that location right now. Please try again.");
    }
}

module.exports.index = async (req, res) => {
    const { category, type, state, city, q } = req.query;
    const filters = {};
    if (typeof category === "string" && category) filters.category = category;
    if (typeof type === "string" && type) filters.type = type;
    if (typeof state === "string" && state) filters.state = state;
    if (typeof city === "string" && city) filters.city = city;
    const normalizedQuery = typeof q === "string" ? q.trim().slice(0, 100) : "";
    if (normalizedQuery) {
        const query = new RegExp(escapeRegExp(normalizedQuery), "i");
        filters.$or = [
            { title: query },
            { location: query },
            { city: query },
            { state: query },
        ];
    }

    const totalListings = await Listing.countDocuments(filters);
    const totalPages = Math.max(1, Math.ceil(totalListings / pageSize));
    const requestedPage = Number.parseInt(req.query.page, 10);
    const page = Number.isInteger(requestedPage)
        ? Math.min(Math.max(requestedPage, 1), totalPages)
        : 1;

    const allListings = await Listing.find(filters)
        .sort({ state: 1, city: 1, title: 1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean();

    allListings.forEach((listing) => {
        listing.coverImageUrl = getListingCoverImage(listing);
    });

    const reviewIds = allListings.flatMap((listing) => listing.reviews || []);
    const reviews = reviewIds.length
        ? await Review.find({ _id: { $in: reviewIds } }).select("rating").lean()
        : [];
    const ratingsById = new Map(reviews.map((review) => [review._id.toString(), review.rating]));

    for (const listing of allListings) {
        const ratings = (listing.reviews || [])
            .map((reviewId) => ratingsById.get(reviewId.toString()))
            .filter(Number.isFinite);
        listing.reviewCount = ratings.length;
        listing.averageRating = ratings.length
            ? (ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(1)
            : null;
    }

    const groupedListings = allListings.reduce((groups, listing) => {
        const group = listing.state || listing.location?.split(",")[1]?.trim() || "Popular Destinations";
        if (!groups[group]) groups[group] = [];
        groups[group].push(listing);
        return groups;
    }, Object.create(null));

    const queryParams = { category, type, state, city, q };
    const paginationQuery = new URLSearchParams();
    for (const [key, value] of Object.entries(queryParams)) {
        if (typeof value === "string" && value) paginationQuery.set(key, value);
    }

    res.render("listings/index.ejs", {
        groupedListings,
        currCategory: category,
        currType: type,
        currState: state,
        currCity: city,
        searchQuery: normalizedQuery,
        page,
        totalPages,
        paginationQuery: paginationQuery.toString(),
        showSearch: true,
    });
};

module.exports.renderNewForm = (req, res) => {
    res.render("listings/new.ejs");
};

module.exports.createListing = async (req, res) => {
    const images = uploadedListingImages(getUploadedFiles(req));
    if (images.length === 0) {
        throw new ExpressError(400, "Please add at least one listing photo.");
    }

    let geometry;
    try {
        geometry = await geocodeLocation(req.body.listing.location);
    } catch (error) {
        await deleteCloudinaryImages(images);
        throw error;
    }

    const { removeImages, ...listingData } = req.body.listing;
    const newListing = new Listing({
        ...listingData,
        images,
        image: images[0],
        geometry,
        owner: req.user._id,
    });

    try {
        await newListing.save();
    } catch (error) {
        await deleteCloudinaryImages(images);
        throw error;
    }
    req.flash("success", "New listing created!");
    res.redirect(`/listings/${newListing._id}`);
};

module.exports.showListing = async (req, res) => {
    const listing = await Listing.findById(req.params.id)
        .populate({
            path: "reviews",
            populate: { path: "author" },
        })
        .populate("owner");

    if (!listing) {
        req.flash("error", "The listing you requested does not exist.");
        return res.redirect("/listings");
    }

    const reviews = listing.reviews.filter((review) => review && review.author);
    const averageRating = reviews.length
        ? (reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length).toFixed(1)
        : null;
    const todayDate = new Date().toISOString().slice(0, 10);

    res.render("listings/show.ejs", {
        listing,
        listingImages: getListingImages(listing),
        averageRating,
        reviewCount: reviews.length,
        todayDate,
    });
};

module.exports.renderEditForm = async (req, res) => {
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
        req.flash("error", "The listing you requested does not exist.");
        return res.redirect("/listings");
    }

    res.render("listings/edit.ejs", {
        listing,
        listingImages: getListingImages(listing),
    });
};

module.exports.updateListing = async (req, res) => {
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
        req.flash("error", "The listing you requested does not exist.");
        return res.redirect("/listings");
    }

    const { removeImages = [], ...listingData } = req.body.listing;
    const addedImages = uploadedListingImages(getUploadedFiles(req));
    const scalarFields = [
        "title", "description", "price", "location", "country",
        "category", "type", "priceUnit", "city", "state",
    ];
    const locationChanged = listingData.location !== listing.location;
    let geometry = listing.geometry;
    if (locationChanged) {
        try {
            geometry = await geocodeLocation(listingData.location);
        } catch (error) {
            await deleteCloudinaryImages(addedImages);
            throw error;
        }
    }

    const currentImages = getListingImages(listing);
    const indicesToRemove = new Set(
        (Array.isArray(removeImages) ? removeImages : [removeImages])
            .map(Number)
            .filter((index) => Number.isInteger(index) && index >= 0 && index < currentImages.length)
    );
    const removedImages = currentImages.filter((image, index) => indicesToRemove.has(index));
    const retainedImages = currentImages.filter((image, index) => !indicesToRemove.has(index));
    const nextImages = [...retainedImages, ...addedImages];

    scalarFields.forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(listingData, field)) {
            listing[field] = listingData[field];
        }
    });
    listing.geometry = geometry;
    listing.images = nextImages;
    listing.image = nextImages[0] || {};

    try {
        await listing.save();
    } catch (error) {
        await deleteCloudinaryImages(addedImages);
        throw error;
    }
    await deleteCloudinaryImages(removedImages);

    req.flash("success", "Listing updated.");
    res.redirect(`/listings/${listing._id}`);
};

module.exports.destroyListing = async (req, res) => {
    await expirePendingBookings();
    const activeBooking = await Booking.exists({
        listing: req.params.id,
        status: { $in: ["PENDING_PAYMENT", "PAYMENT_PROCESSING", "CONFIRMED"] },
    });
    if (activeBooking) {
        req.flash("error", "This listing cannot be deleted while it has active bookings.");
        return res.redirect(`/listings/${req.params.id}`);
    }
    await Listing.findByIdAndDelete(req.params.id);
    req.flash("success", "Listing deleted.");
    res.redirect("/listings");
};
