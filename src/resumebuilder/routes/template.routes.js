"use strict";

const express = require("express");
const templateController = require("../controllers/templateController");
const { requireAuth } = require("../middlewares/auth.middleware");

const router = express.Router();

router.get("/", requireAuth, templateController.list);

module.exports = router;
