"use strict";

const express = require("express");
const authController = require("../controllers/authController");
const { requireAuth } = require("../middlewares/auth.middleware");
const { rateLimiter } = require("../middlewares/rateLimiter");

const router = express.Router();
const authLimiter = rateLimiter({ windowMs: 60 * 1000, max: 20 });

router.post("/register", authLimiter, authController.register);
router.post("/login", authLimiter, authController.login);
router.get("/me", requireAuth, authController.getProfile);
router.put("/me", requireAuth, authController.updateProfile);
router.post("/logout", requireAuth, authController.logout);

module.exports = router;
