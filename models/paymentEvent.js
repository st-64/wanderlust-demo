const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const paymentEventSchema = new Schema({
    provider: {
        type: String,
        enum: ["razorpay"],
        required: true,
        default: "razorpay",
    },
    providerEventId: {
        type: String,
        required: true,
        maxlength: 255,
    },
    eventType: {
        type: String,
        required: true,
        maxlength: 100,
    },
    providerOrderId: { type: String, maxlength: 64 },
    providerPaymentId: { type: String, maxlength: 64 },
    status: {
        type: String,
        enum: ["PENDING", "PROCESSING", "PROCESSED", "IGNORED"],
        default: "PENDING",
        required: true,
    },
    processingStartedAt: Date,
    processedAt: Date,
    attemptCount: { type: Number, default: 0, min: 0 },
}, { timestamps: true });

paymentEventSchema.index({ provider: 1, providerEventId: 1 }, { unique: true });
paymentEventSchema.index({ status: 1, processingStartedAt: 1 });

module.exports = mongoose.model("PaymentEvent", paymentEventSchema);
