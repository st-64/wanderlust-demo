const crypto = require("node:crypto");
const mongoose = require("mongoose");
const config = require("../config.js");
const User = require("../models/user.js");
const Listing = require("../models/listing.js");

async function findOrCreateDemoHost() {
    let host = await User.findOne({ username: "demo_host" });
    if (host) return host;

    const password = crypto.randomBytes(32).toString("base64url");
    host = new User({
        username: "demo_host",
        email: "demo_host@wanderlust.local",
        fullName: "Wanderlust Demo Host",
    });
    await User.register(host, password);
    return host;
}

async function main() {
    if (!config.mongoUrl) {
        throw new Error("MONGO_URL is required for the safe demo seed.");
    }

    await mongoose.connect(config.mongoUrl);

    const listingCount = await Listing.countDocuments();
    if (listingCount > 0) {
        console.log("Safe seed aborted: the database already contains listings.");
        return;
    }

    const host = await findOrCreateDemoHost();
    const listings = [
        {
            title: "Goa Beach House",
            description: "A bright coastal retreat near the beach with an airy terrace, comfortable rooms, and easy access to local cafes.",
            location: "Candolim, Goa",
            country: "India",
            city: "Candolim",
            state: "Goa",
            category: "Homes",
            type: "Beach",
            price: 4200,
            priceUnit: "night",
            geometry: { type: "Point", coordinates: [73.7691, 15.5183] },
            owner: host._id,
            images: [{ url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e", filename: "listing-placeholder-goa" }],
        },
        {
            title: "Manali Mountain Cabin",
            description: "A peaceful mountain cabin surrounded by pine views, ideal for quiet mornings and cool Himalayan evenings.",
            location: "Old Manali, Himachal Pradesh",
            country: "India",
            city: "Manali",
            state: "Himachal Pradesh",
            category: "Homes",
            type: "Mountains",
            price: 3600,
            priceUnit: "night",
            geometry: { type: "Point", coordinates: [77.1892, 32.2396] },
            owner: host._id,
            images: [{ url: "https://images.unsplash.com/photo-1501785888041-af3ef285b470", filename: "listing-placeholder-manali" }],
        },
        {
            title: "Jaipur Heritage Haveli",
            description: "A character-filled heritage stay with handcrafted interiors, courtyard seating, and local hospitality in the Pink City.",
            location: "Old City, Jaipur",
            country: "India",
            city: "Jaipur",
            state: "Rajasthan",
            category: "Homes",
            type: "Heritage",
            price: 5100,
            priceUnit: "night",
            geometry: { type: "Point", coordinates: [75.8267, 26.9239] },
            owner: host._id,
            images: [{ url: "https://images.unsplash.com/photo-1524498250077-390f9e378fc0", filename: "listing-placeholder-jaipur" }],
        },
        {
            title: "Udaipur Lakefront Villa",
            description: "A calm lake-view villa for relaxed stays, sunset dinners, and exploring Udaipur's historic lanes.",
            location: "Lake Pichola, Udaipur",
            country: "India",
            city: "Udaipur",
            state: "Rajasthan",
            category: "Homes",
            type: "Lake",
            price: 6800,
            priceUnit: "night",
            geometry: { type: "Point", coordinates: [73.6822, 24.5769] },
            owner: host._id,
            images: [{ url: "https://images.unsplash.com/photo-1470770841072-f978cf4d019e", filename: "listing-placeholder-udaipur" }],
        },
        {
            title: "Munnar Tea Estate Stay",
            description: "A green hillside stay near tea gardens, walking trails, and cool-weather viewpoints in Kerala.",
            location: "Munnar, Kerala",
            country: "India",
            city: "Munnar",
            state: "Kerala",
            category: "Experiences",
            type: "Nature",
            price: 3900,
            priceUnit: "night",
            geometry: { type: "Point", coordinates: [77.0595, 10.0889] },
            owner: host._id,
            images: [{ url: "https://images.unsplash.com/photo-1470214304380-aadaedcfff3b", filename: "listing-placeholder-munnar" }],
        },
    ];

    await Listing.insertMany(listings);
    console.log(`Safe demo seed inserted ${listings.length} listings for demo_host.`);
}

main()
    .catch((error) => {
        console.error("Safe demo seed failed:", error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });
