const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync.js");
const { isLoggedIn } = require("../middlware.js");
const hostController = require("../controllers/host.js");

router.get("/dashboard", isLoggedIn, wrapAsync(hostController.dashboard));
router.get("/listings", isLoggedIn, wrapAsync(hostController.listings));
router.get("/reservations", isLoggedIn, wrapAsync(hostController.reservations));
router.get("/reservations/:bookingId", isLoggedIn, wrapAsync(hostController.reservation));

module.exports = router;
