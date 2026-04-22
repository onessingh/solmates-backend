"use strict";

const authService = require("../services/auth.service");

const send = (res, status, data) => res.status(status).json(data);

const register = (req, res) => {
  try {
    const user = authService.register(req.body || {});
    return send(res, 201, { user });
  } catch (error) {
    return send(res, 400, { error: error.message });
  }
};

const login = (req, res) => {
  try {
    const result = authService.login(req.body || {});
    return send(res, 200, result);
  } catch (error) {
    return send(res, 401, { error: error.message });
  }
};

const getProfile = (req, res) => {
  try {
    const user = authService.getProfile(req.user?.id);
    return send(res, 200, { user });
  } catch (error) {
    return send(res, 404, { error: error.message });
  }
};

const updateProfile = (req, res) => {
  try {
    const user = authService.updateProfile(req.user?.id, req.body || {});
    return send(res, 200, { user });
  } catch (error) {
    return send(res, 400, { error: error.message });
  }
};

const logout = (req, res) => {
  try {
    authService.logout(req.user?.session_id);
    return send(res, 200, { success: true });
  } catch (error) {
    return send(res, 200, { success: true });
  }
};

module.exports = {
  register,
  login,
  getProfile,
  updateProfile,
  logout
};
