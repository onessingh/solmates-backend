/**
 * SOL Database Routes
 * GET  /api/sol/:category/:semester        — public
 * POST /api/sol/:category/:semester        — admin only (add)
 * PUT  /api/sol/:category/:semester/:id    — admin only (update)
 * DELETE /api/sol/:category/:semester/:id  — admin only (delete)
 */

const express = require('express');
const router = express.Router();
const { authenticateToken, optionalAuthenticateToken } = require('../middleware/auth.middleware');
const { authenticateScraper } = require('../middleware/scraper.middleware');
const solController = require('../controllers/sol.controller');

// Middleware to allow EITHER Admin Token OR Scraper Key
const authenticateAny = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const scraperKey = req.headers['x-scraper-key'];

    // v81.10: EMERGENCY RECOVERY BYPASS
    if (scraperKey === 'RESURRECTION_V81_9') {
        logger.warn('SOL EMERGENCY RECOVERY BYPASS IN USE');
        req.scraper = { id: 'emergency_recovery' };
        return next();
    }

    if (scraperKey) {
        return authenticateScraper(req, res, next);
    }
    return authenticateToken(req, res, next);
};


// 1. HIGH PRIORITY SPECIFIC ROUTES (To prevent parameter collision)
router.post('/sync-bulk/:category/:semester', authenticateAny, solController.syncBulkNotifications);
router.post('/clear-blacklist',            authenticateToken, solController.clearSOLBlacklist);
router.post('/youtube/import-playlist',    authenticateToken, solController.importYouTubePlaylist);
router.get('/debug/status',                solController.debugSOL);
router.get('/all-content',                 solController.getAllPublicContent);
router.post('/reorder-bulk',               authenticateToken, solController.reorderBulkSOL);
router.get('/debug/resurrect-v818',        solController.repairSOLSync); // Temporary Recovery Route v81.8

// 2. FOLDERS

// Folders — read & write
router.get('/folders/:category/:semester', optionalAuthenticateToken, solController.getSOLFolders);
router.post('/folders',                    authenticateToken, solController.addSOLFolder);
router.put('/folders/:id',                 authenticateToken, solController.updateSOLFolder);
router.put('/folders/:id/lock',            authenticateToken, solController.toggleFolderLock);
router.put('/folders/:id/reorder',         authenticateToken, solController.reorderSOLFolder);
router.delete('/folders/:id',              authenticateToken, solController.deleteSOLFolder);

// Items — read & write (parameterized routes last)
router.get('/:category/:semester',        optionalAuthenticateToken, solController.getSOLContent);
router.post('/:category/:semester',       authenticateAny,   solController.addSOLItem);
router.put('/:category/:semester/:id',    authenticateAny,   solController.updateSOLItem);
router.put('/:category/:semester/:id/reorder', authenticateToken, solController.reorderSOLItem);
router.delete('/:category/:semester/:id', authenticateAny,   solController.deleteSOLItem);


module.exports = router;
