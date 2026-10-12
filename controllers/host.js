const ExpressError = require("../utils/ExpressError.js");
const hostDashboard = require("../services/hostDashboard.js");

module.exports.dashboard = async (req, res) => {
    const summary = await hostDashboard.getHostDashboard(req.user._id);
    res.render("host/dashboard.ejs", { summary });
};

module.exports.listings = async (req, res) => {
    const page = hostDashboard.parsePage(req.query.page);
    const result = await hostDashboard.getHostListings(req.user._id, page);
    res.render("host/listings.ejs", result);
};

module.exports.reservations = async (req, res) => {
    const page = hostDashboard.parsePage(req.query.page);
    const filter = hostDashboard.parseReservationFilter(req.query.status);
    const result = await hostDashboard.getHostReservations(req.user._id, filter, page);
    res.render("host/reservations.ejs", result);
};

module.exports.reservation = async (req, res) => {
    const reservation = await hostDashboard.getHostReservation(req.params.bookingId, req.user._id);
    res.render("host/reservation.ejs", { reservation });
};
