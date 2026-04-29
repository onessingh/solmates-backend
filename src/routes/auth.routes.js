const express = require('express');
const router = express.Router();
const { validate } = require('../middleware/validation.middleware');
const { authLimiter } = require('../middleware/rateLimiter.middleware');
const authController = require('../controllers/auth.controller');

/**
 * @route   POST /api/auth/login
 * @desc    Admin login with ID and password validation
 * @access  Public (rate limited)
 * @fixed   Now validates both admin ID and password
 */
router.post('/login', 
    authLimiter,
    validate('login'),
    authController.login
);

/**
 * @route   POST /api/auth/job-login
 * @desc    Job Admin login for the Job Portal
 * @access  Public (rate limited)
 */
router.post('/job-login', 
    authLimiter,
    authController.jobLogin
);

/**
 * @route   POST /api/auth/verify
 * @desc    Verify token validity
 * @access  Public
 */
router.post('/verify', authController.verifyToken);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout and destroy session
 * @access  Public
 */
router.post('/logout', authController.logout);

module.exports = router;
