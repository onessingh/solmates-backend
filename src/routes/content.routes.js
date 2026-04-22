const express = require('express');
const router = express.Router();
const { validateQuery, validate } = require('../middleware/validation.middleware');
const { chatbotLimiter } = require('../middleware/rateLimiter.middleware');
const contentController = require('../controllers/content.controller');

/**
 * Public Content Routes
 */

// Get content by type with optional filtering
router.get('/content/:type',
    validateQuery('contentQuery'),
    contentController.getContent
);

// FIX: Apply validateQuery to YouTube videos (was missing — raw req.query was used)
router.get('/youtube',
    validateQuery('contentQuery'),
    contentController.getYouTubeVideos
);

// Get semester links
router.get('/semester-links',
    contentController.getSemesterLinks
);

// Get manual jobs
const jobsController = require('../controllers/jobs.controller');
router.get('/manual-jobs', jobsController.getJobs);

// FIX: Apply chatMessage validation schema (was missing — req.validatedBody.message would be undefined)
router.post('/chatbot',
    chatbotLimiter,
    validate('chatMessage'),
    contentController.chatbot
);

module.exports = router;
