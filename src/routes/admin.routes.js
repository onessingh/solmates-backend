const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validation.middleware');
const adminController = require('../controllers/admin.controller');
const recycleBinController = require('../controllers/recycle-bin.controller');

// All admin routes require authentication
router.use(authenticateToken);

/**
 * Content Management Routes
 */

// Add content
router.post('/content/:type', 
    validate('addContent'),
    adminController.addContent
);

// Update content (NEW)
router.put('/content/:type/:id', 
    validate('updateContent'),
    adminController.updateContent
);

// Delete content
router.delete('/content/:type/:id', 
    adminController.deleteContent
);

/**
 * YouTube Video Management Routes
 */

// Add YouTube video
router.post('/youtube', 
    validate('youtubeVideo'),
    adminController.addYouTubeVideo
);

// Update YouTube video (NEW)
router.put('/youtube/:id', 
    validate('updateYoutubeVideo'),
    adminController.updateYouTubeVideo
);

// Delete YouTube video
router.delete('/youtube/:id', 
    adminController.deleteYouTubeVideo
);

/**
 * Semester Links Management
 */

// Update semester links
router.post('/semester-links', 
    validate('semesterLink'),
    adminController.updateSemesterLink
);

/**
 * Manual Jobs Management
 */
const jobsController = require('../controllers/jobs.controller');

router.post('/manual-jobs', jobsController.addJob);
router.put('/manual-jobs/:id', jobsController.updateJob);
router.delete('/manual-jobs/:id', jobsController.deleteJob);

/**
 * Session Management
 */

// Get all admin sessions (for monitoring)
router.get('/sessions', 
    adminController.getSessions
);

/**
 * Recycle Bin Routes (v85.0)
 */
router.get('/recycle-bin', recycleBinController.getBinItems);
router.post('/recycle-bin/restore/:id', recycleBinController.restoreItem);
router.delete('/recycle-bin/:id', recycleBinController.permanentDelete);

module.exports = router;
