const mongoose = require("mongoose");
const config = require("../config.js");
const initData = require("./data.js");
const Listing = require("../models/listing.js");
const Review = require("../models/review.js");
const User = require("../models/user.js");
const { deleteCloudinaryImages } = require("../utils/listingImages.js");

async function initDB() {
    if (config.isProduction) {
        throw new Error("The seed reset is disabled in production.");
    }
    if (!process.env.SEED_OWNER_ID || !mongoose.Types.ObjectId.isValid(process.env.SEED_OWNER_ID)) {
        throw new Error("Set SEED_OWNER_ID to an existing local User before running the seed script.");
    }

    await mongoose.connect(config.mongoUrl);
    try {
        const ownerExists = await User.exists({ _id: process.env.SEED_OWNER_ID });
        if (!ownerExists) {
            throw new Error("SEED_OWNER_ID does not match an existing User; no listing data was changed.");
        }

        const previousListings = await Listing.find({}).select("reviews images image").lean();
        const reviewIds = previousListings.flatMap((listing) => listing.reviews || []);
        const imageAssets = previousListings.flatMap((listing) => [
            ...(listing.images || []),
            ...(listing.image ? [listing.image] : []),
        ]);

        await Review.deleteMany({ _id: { $in: reviewIds } });
        await Listing.deleteMany({});
        await deleteCloudinaryImages(imageAssets);

        const seedListings = initData.data.map((listing) => ({
            ...listing,
            images: listing.image?.url ? [listing.image] : [],
            owner: process.env.SEED_OWNER_ID,
        }));
        await Listing.insertMany(seedListings);
        console.log(`Initialized ${seedListings.length} listings.`);
    } finally {
        await mongoose.disconnect();
    }
}

initDB().catch((error) => {
    console.error("Seed initialization failed:", error.message);
    process.exitCode = 1;
});