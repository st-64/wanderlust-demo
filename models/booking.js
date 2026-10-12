const crypto = require("node:crypto");
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const priceSnapshotSchema = new Schema({
    unitPriceMinor: {
        type: Number,
        required: true,
        min: 0,
    },
    quantity: {
        type: Number,
        required: true,
        min: 1,
    },
    subtotalMinor: {
        type: Number,
        required: true,
        min: 0,
    },
    currency: {
        type: String,
        enum: ["INR"],
        required: true,
    },
    priceUnit: {
        type: String,
        enum: ["night", "person", "service"],
        required: true,
    },
    nights: {
        type: Number,
        required: true,
        min: 1,
    },
    guests: {
        type: Number,
        required: true,
        min: 1,
        max: 16,
    },
    calculatedAt: {
        type: Date,
        required: true,
    },
}, { _id: false, id: false });

const bookingSchema = new Schema({
    bookingReference: {
        type: String,
        required: true,
        unique: true,
        default: () => `WL-${crypto.randomBytes(6).toString("hex").toUpperCase()}`,
    },
    listing: {
        type: Schema.Types.ObjectId,
        ref: "Listing",
        required: true,
        index: true,
    },
    guest: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    host: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    listingSnapshot: {
        title: { type: String, required: true, maxlength: 120 },
        location: { type: String, required: true, maxlength: 200 },
    },
    checkIn: {
        type: Date,
        required: true,
    },
    checkOut: {
        type: Date,
        required: true,
    },
    guests: {
        type: Number,
        required: true,
        min: 1,
        max: 16,
        validate: {
            validator: Number.isInteger,
            message: "Guest count must be a whole number.",
        },
    },
    priceSnapshot: {
        type: priceSnapshotSchema,
        required: true,
        immutable: true,
    },
    status: {
        type: String,
        enum: [
            "PENDING_PAYMENT",
            "PAYMENT_PROCESSING",
            "CONFIRMED",
            "PAYMENT_FAILED",
            "EXPIRED",
            "CANCELLED",
            "REFUND_REQUIRED",
            "COMPLETED",
        ],
        default: "PENDING_PAYMENT",
        required: true,
        index: true,
    },
    cancellationStatus: {
        type: String,
        enum: ["NONE", "CANCELLED"],
        default: "NONE",
        required: true,
    },
    paymentExpiresAt: {
        type: Date,
        required: true,
        index: true,
    },
    cancelledAt: Date,
}, { timestamps: true });

bookingSchema.pre("validate", function validateDateRange() {
    if (this.checkIn && this.checkOut && this.checkOut <= this.checkIn) {
        this.invalidate("checkOut", "Check-out must be after check-in.");
    }
});

bookingSchema.index({ listing: 1, status: 1, checkIn: 1, checkOut: 1 });
bookingSchema.index({ host: 1, status: 1, checkIn: 1, checkOut: 1 });

module.exports = mongoose.model("Booking", bookingSchema);
