const express = require('express');
const router = express.Router();
const mediaController = require('../controllers/media.controller');

/**
 * Media Routes
 * Handle high-performance downloads that bypass CORS and browser restrictions
 */

// YouTube Download Proxy (720p Optimized)
router.get('/download/youtube', mediaController.downloadYouTube);

// PDF Download Proxy (Redirector)
router.get('/download/pdf', mediaController.downloadPDF);

module.exports = router;
