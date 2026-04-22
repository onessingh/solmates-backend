"use strict";

const { decodeToken } = require("../services/auth.service");

const getTokenFromReq = (req) => {
  const header = req.headers.authorization || "";
  const parts = header.split(" ");
  if (parts[0] !== "Bearer") return null;
  return parts[1];
};

const requireAuth = (req, res, next) => {
  const token = getTokenFromReq(req);
  const payload = decodeToken(token);
  if (!payload) return res.status(401).json({ error: "unauthorized" });
  req.user = { id: payload.sub, session_id: payload.sid };
  return next();
};

module.exports = {
  requireAuth
};
