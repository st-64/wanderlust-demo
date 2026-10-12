const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync.js");
const paymentController = require("../controllers/payment.js");

router.post("/", wrapAsync(paymentController.webhook));

module.exports = router;
