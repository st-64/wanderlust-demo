const Joi = require('joi');

const csrfToken = Joi.string().pattern(/^[a-f\d]{64}$/i).optional();

module.exports.listingSchema = Joi.object({
    _csrf: csrfToken,
    listing: Joi.object({
        title: Joi.string().trim().min(3).max(120).required(),
        description: Joi.string().trim().min(10).max(5000).required(),
        location: Joi.string().trim().min(2).max(200).required(),
        country: Joi.string().trim().min(2).max(100).required(),
        price: Joi.number().min(0).max(100000000).required(),
        category: Joi.string().valid("Homes", "Experiences", "Services").optional(),
        type: Joi.string().valid(
            "Beach", "Heritage", "Lake", "Camping", "Countryside", "Amazing Pools",
            "Mountains", "Culture", "Food", "Nature", "Chef", "Photography",
            "Transport", "Wellness"
        ).optional(),
        priceUnit: Joi.string().valid("night", "person", "service").optional(),
        city: Joi.string().trim().max(100).allow("").optional(),
        state: Joi.string().trim().max(100).allow("").optional(),
        removeImages: Joi.alternatives()
            .try(Joi.number().integer().min(0), Joi.array().items(Joi.number().integer().min(0)))
            .optional(),
    }).required()
});

module.exports.reviewSchema = Joi.object({
    _csrf: csrfToken,
    review: Joi.object({
        rating: Joi.number().integer().required().min(1).max(5),
        comment: Joi.string().trim().min(2).max(2000).required()
    }).required()
});

module.exports.userSchema = Joi.object({
    email: Joi
        .string()
        .required()
        .email(),
    username: Joi
        .string()
        .required()
        .min(2)
        .max(50),
    fullName: Joi.string().trim().max(80).allow("").optional(),
    password: Joi
        .string()
        .required()
        .min(6)
        .max(128)
});

module.exports.profileSchema = Joi.object({
    fullName: Joi.string().trim().max(80).allow("").optional(),
});

module.exports.bookingRequestSchema = Joi.object({
    _csrf: csrfToken,
    booking: Joi.object({
        checkIn: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
        checkOut: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
        guests: Joi.number().integer().min(1).max(16).required(),
    }).required(),
});

module.exports.paymentVerificationSchema = Joi.object({
    razorpay_order_id: Joi.string().pattern(/^order_[A-Za-z0-9]+$/).max(64).required(),
    razorpay_payment_id: Joi.string().pattern(/^pay_[A-Za-z0-9]+$/).max(64).required(),
    razorpay_signature: Joi.string().pattern(/^[a-f\d]{64}$/i).required(),
}).unknown(false);