"use strict";

const express = require("express");
const analyticsController = require("../controllers/analyticsController");
const { requireAuth } = require("../middlewares/auth.middleware");

const router = express.Router();

router.post("/", requireAuth, analyticsController.logEvent);
router.get("/", requireAuth, analyticsController.listEvents);
router.get("/summary", requireAuth, analyticsController.summary);

module.exports = router;
