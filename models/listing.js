const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const Review = require("./review");
const { cloudinary } = require("../cloudConfig");

const bookingHoldSchema = new Schema({
    bookingId: {
        type: Schema.Types.ObjectId,
        required: true,
    },
    checkIn: {
        type: Date,
        required: true,
    },
    checkOut: {
        type: Date,
        required: true,
    },
    status: {
        type: String,
        enum: ["PENDING_PAYMENT", "PAYMENT_PROCESSING", "CONFIRMED"],
        required: true,
    },
    paymentExpiresAt: Date,
}, { _id: false });

const DEFAULT_IMAGE_URL =
    "https://images.unsplash.com/photo-1625505826533-5c80aca7d157?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60";

const imageSchema = new Schema({
    url: {
        type: String,
        required: true,
    },
    filename: {
        type: String,
        default: "listingimage",
    },
}, { _id: false });

const listingSchema = new Schema({
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120,
    },
    description: {
        type: String,
        required: true,
        trim: true,
        maxlength: 5000,
    },
    images: {
        type: [imageSchema],
        default: [],
    },
    // Kept for records created before the gallery was introduced.
    image: {
        url: {
            type: String,
            default: DEFAULT_IMAGE_URL,
            set: (v) => (v === "" ? DEFAULT_IMAGE_URL : v), // Replaces empty strings with default
        },
        filename: {
            type: String,
            default: "listingimage",
        },
    },
    price: {
        type: Number,
        required: true,
        min: 0,
    },
    location: {
        type: String,
        required: true,
        trim: true,
    },
    country: {
        type: String,
        required: true,
        trim: true,
    },
    reviews: [
        {
            type: Schema.Types.ObjectId,
            ref: "Review",
        },
    ],
    owner: {
        type: Schema.Types.ObjectId,
        ref: "User"
    },
    geometry: {
        type: {
            type: String, // Don't do `{ location: { type: String } }`
            enum: ['Point'], // 'location.type' must be 'Point'
            required: true
        },
        coordinates: {
            type: [Number],
            required: true,
            validate: {
                validator: (coordinates) =>
                    coordinates.length === 2 &&
                    coordinates.every(Number.isFinite) &&
                    coordinates[0] >= -180 && coordinates[0] <= 180 &&
                    coordinates[1] >= -90 && coordinates[1] <= 90,
                message: "Coordinates must be a valid [longitude, latitude] pair.",
            },
        }
    },
    category: {
        type: String,
        enum: ["Homes", "Experiences", "Services"],
        default: "Homes"
    },
    type: {
        type: String,
        enum: [
            "Beach", "Heritage", "Lake", "Camping", "Countryside",
            "Amazing Pools", "Mountains", "Culture", "Food", "Nature",
            "Chef", "Photography", "Transport", "Wellness"
        ]
    },
    city: String,
    state: String,
    priceUnit: {
        type: String,
        enum: ["night", "person", "service"],
        default: "night"
    },
    bookingHolds: {
        type: [bookingHoldSchema],
        default: [],
    }
});

listingSchema.post("findOneAndDelete", async (listing) => {
    if (listing) {
        try {
            await Review.deleteMany({ _id: { $in: listing.reviews } });
        } catch (error) {
            console.error(`Failed to remove reviews for deleted listing ${listing._id}:`, error);
        }

        const images = [
            ...(listing.images || []),
            ...(listing.image?.filename && listing.image.filename !== "listingimage" ? [listing.image] : []),
        ];
        const filenames = [...new Set(images
            .map((image) => image.filename)
            .filter((filename) => filename && filename !== "listingimage"))];

        const results = await Promise.allSettled(
            filenames.map((filename) => cloudinary.uploader.destroy(filename))
        );
        results.forEach((result, index) => {
            if (result.status === "rejected") {
                console.error(`Failed to delete listing image ${filenames[index]} from Cloudinary:`, result.reason);
            }
        });
    }
});

listingSchema.index({ geometry: "2dsphere" });
listingSchema.index({ category: 1, state: 1, city: 1 });
listingSchema.index({ owner: 1, title: 1 });

const Listing = mongoose.model("Listing", listingSchema);
module.exports = Listing;