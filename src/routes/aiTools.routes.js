/**
 * SOLMATES — Unified AI Tools Routes
 * File: src/routes/aiTools.routes.js
 */

const express = require('express');
const router = express.Router();
const aiToolsController = require('../controllers/aiTools.controller');

router.post('/generate', aiToolsController.generateToolData);
router.post('/submit', aiToolsController.submitTestResult);
router.post('/explain', aiToolsController.explainAnswer);

module.exports = router;
