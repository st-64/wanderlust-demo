const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const reconciliationPaymentSchema = new Schema({
    providerPaymentId: { type: String, required: true, maxlength: 64 },
    observedAt: { type: Date, required: true },
}, { _id: false, id: false });

const paymentSchema = new Schema({
    booking: {
        type: Schema.Types.ObjectId,
        ref: "Booking",
        required: true,
        unique: true,
    },
    guest: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    provider: {
        type: String,
        enum: ["razorpay"],
        required: true,
        default: "razorpay",
    },
    providerOrderId: {
        type: String,
        maxlength: 64,
        sparse: true,
        unique: true,
    },
    providerPaymentId: {
        type: String,
        maxlength: 64,
        sparse: true,
        unique: true,
    },
    amountMinor: {
        type: Number,
        required: true,
        min: 1,
        validate: Number.isSafeInteger,
    },
    currency: {
        type: String,
        enum: ["INR"],
        required: true,
    },
    status: {
        type: String,
        enum: ["ORDER_CREATING", "ORDER_CREATED", "ORDER_FAILED", "CAPTURED", "REFUND_REQUIRED"],
        required: true,
    },
    orderCreatedAt: Date,
    capturedAt: Date,
    bookingConfirmedAt: Date,
    confirmationLeaseUntil: Date,
    refundRequiredAt: Date,
    lastPaymentAttemptAt: Date,
    failureCode: { type: String, maxlength: 80 },
    verificationAttempts: { type: Number, default: 0, min: 0 },
    reconciliationPayments: {
        type: [reconciliationPaymentSchema],
        default: [],
    },
}, { timestamps: true });

paymentSchema.index({ booking: 1, guest: 1, provider: 1 });

module.exports = mongoose.model("Payment", paymentSchema);
