"use strict";

const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = Number.isInteger(err.status) ? err.status : 500;
  const message = err.message || "internal server error";
  const payload = { error: message };
  if (process.env.NODE_ENV !== "production") {
    payload.details = err.stack || String(err);
  }
  return res.status(status).json(payload);
};

const notFoundHandler = (req, res) => {
  return res.status(404).json({ error: "not found" });
};

module.exports = {
  errorHandler,
  notFoundHandler
};
