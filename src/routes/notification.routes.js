const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notification.controller');
const { authenticateToken } = require('../middleware/auth.middleware');

/**
 * @route POST /api/notifications/subscribe
 * @desc Save a new subscription to the database
 * @access Public
 */
router.post('/subscribe', notificationController.subscribe);

/**
 * @route POST /api/notifications/unsubscribe
 * @desc Remove an existing subscription from the database
 * @access Public
 */
router.post('/unsubscribe', notificationController.unsubscribe);

/**
 * @route GET /api/notifications/test-push
 * @desc TRIGGER Manual Push Test
 * @access Admin (Temporary)
 */
router.get('/test-push', notificationController.testPush);

/**
 * @route GET /api/notifications/count
 * @desc Get total number of active subscriptions
 * @access Public (Diagnostic)
 */
router.get('/count', notificationController.getSubCount);

/**
 * @route GET /api/notifications/logs
 * @desc Get recent backend logs for diagnostics
 * @access Public (Diagnostic)
 */
router.get('/logs', notificationController.getLogs);

/**
 * @route POST /api/notifications/broadcast
 * @desc MANUAL Broadcast push to all/specific semester
 * @access Admin
 */
router.post('/broadcast', authenticateToken, notificationController.broadcastGreeting);

/**
 * @route GET /api/notifications/reset
 * @desc RESET all push subscriptions for a clean start
 * @access Admin
 */
router.get('/reset', authenticateToken, notificationController.resetSubscriptions);

module.exports = router;
