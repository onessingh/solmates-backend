"use strict";

const express = require("express");
const { evaluateJdWithAi } = require("../controllers/jdController");

const router = express.Router();

router.post("/ai", evaluateJdWithAi);

module.exports = router;
