"use strict";

const analyticsService = require("../services/analytics.service");

const send = (res, status, data) => res.status(status).json(data);

const logEvent = (req, res) => {
  try {
    const event = analyticsService.logEvent(req.body || {});
    return send(res, 201, { event });
  } catch (error) {
    return send(res, 400, { error: error.message });
  }
};

const listEvents = (req, res) => {
  try {
    const events = analyticsService.listEvents(req.query || {});
    return send(res, 200, { events });
  } catch (error) {
    return send(res, 400, { error: error.message });
  }
};

const summary = (req, res) => {
  try {
    const result = analyticsService.summary();
    return send(res, 200, result);
  } catch (error) {
    return send(res, 400, { error: error.message });
  }
};

module.exports = {
  logEvent,
  listEvents,
  summary
};
