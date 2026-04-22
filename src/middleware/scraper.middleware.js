const logger = require('../utils/logger');

/**
 * Middleware to authenticate the automated scraper bot
 * using a simple API key in the headers.
 */
function authenticateScraper(req, res, next) {
    const scraperKey = req.headers['x-scraper-key'];
    const validKey = process.env.SCRAPER_KEY;

    // Check if scraper key is provided and matches
    if (scraperKey && validKey && scraperKey === validKey) {
        // Mock a basic admin object for the controller
        req.admin = {
            adminId: 'MBA_SCRAPER_BOT',
            role: 'bot'
        };
        return next();
    }

    // If not a valid scraper key, let it fall through to other auth or fail
    // But since this is specific for the scraper, we'll return 401
    logger.warn('Unauthorized scraper access attempt', {
        ip: req.ip,
        path: req.path
    });

    return res.status(401).json({
        success: false,
        error: 'Invalid or missing Scraper API Key [REF: SCRAPER_AUTH_V1]'
    });
}

module.exports = { authenticateScraper };
