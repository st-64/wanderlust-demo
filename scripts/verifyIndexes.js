const mongoose = require("mongoose");
const config = require("../config.js");
const User = require("../models/user.js");
const Listing = require("../models/listing.js");
const Review = require("../models/review.js");
const Booking = require("../models/booking.js");
const Payment = require("../models/payment.js");
const PaymentEvent = require("../models/paymentEvent.js");

async function main() {
    if (!config.mongoUrl) {
        throw new Error("MONGO_URL is required for database index verification.");
    }

    await mongoose.connect(config.mongoUrl);

    const models = [User, Listing, Review, Booking, Payment, PaymentEvent];
    for (const model of models) {
        await model.syncIndexes();
        console.log(`Synced indexes: ${model.modelName}`);
    }

    const sessionIndexes = await mongoose.connection.db.collection("sessions").indexes();
    const ttlIndex = sessionIndexes.find((index) =>
        index.key?.expires === 1
        && index.expireAfterSeconds === 0
    );

    if (!ttlIndex) {
        throw new Error("The sessions.expires TTL index is missing or is not expireAfterSeconds=0.");
    }

    console.log("Verified sessions TTL index:", ttlIndex.name);
}

main()
    .catch((error) => {
        console.error("Index verification failed:", error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });
