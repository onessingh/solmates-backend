const { rateLimit } = require('express-rate-limit');
const logger = require('../utils/logger');
const crypto = require('crypto');

/**
 * Generate fingerprint combining IP and User-Agent
 * ADDED: Enhanced rate limiting to prevent proxy rotation bypass
 */
function generateFingerprint(req) {
    const ip = req.ip || 'unknown';
    const ua = req.get('user-agent') || 'unknown';
    const acceptLang = req.get('accept-language') || 'unknown';
    
    const combined = `${ip}:${ua}:${acceptLang}`;
    const hash = crypto.createHash('sha256').update(combined).digest('hex');
    
    return hash.substring(0, 16);
}

// General API rate limiter
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute (Reduced from 15m for faster recovery)
    max: parseInt(process.env.RATE_LIMIT_MAX) || 300, // 300 requests per minute
    message: { 
        success: false, 
        error: 'Too many requests. Please try again later.' 
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logger.warn('Rate limit exceeded', {
            ip: req.ip,
            path: req.path,
            method: req.method
        });
        res.status(429).json({
            success: false,
            error: 'Rate limit exceeded. Please try again later.',
            retryAfter: req.rateLimit.resetTime
        });
    }
});

// STRICT rate limiter for authentication endpoints
// FIXED HIGH #3: Unified to 5 attempts per 15 minutes
// ADDED: Fingerprinting to prevent proxy rotation bypass
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 5, // FIXED: Changed from 3 to 5
    keyGenerator: generateFingerprint, // ADDED: Use fingerprint instead of just IP
    skipSuccessfulRequests: true, // Don't count successful logins
    skipFailedRequests: false, // Do count failed attempts
    message: { 
        success: false, 
        error: 'Too many login attempts. Please try again later.' 
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logger.warn('Auth rate limit exceeded', {
            ip: req.ip,
            path: req.path,
            method: req.method
        });
        res.status(429).json({
            success: false,
            error: 'Too many login attempts. Your account has been temporarily locked. Please try again in 15 minutes.',
            retryAfter: req.rateLimit.resetTime
        });
    }
});

// Rate limiter for file processing tools (convert, compress, remove-background)
const toolsLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: parseInt(process.env.TOOLS_RATE_LIMIT_MAX) || 20,
    message: {
        success: false,
        error: 'Too many tool requests. Please try again in a minute.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logger.warn('Tools rate limit exceeded', { ip: req.ip, path: req.path });
        res.status(429).json({
            success: false,
            error: 'Too many tool requests. Please try again in a minute.'
        });
    }
});

// Rate limiter for chatbot endpoint
const chatbotLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 messages per minute
    message: { 
        success: false, 
        error: 'Too many messages. Please slow down.' 
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logger.warn('Chatbot rate limit exceeded', {
            ip: req.ip
        });
        res.status(429).json({
            success: false,
            error: 'Too many messages. Please slow down.'
        });
    }
});

module.exports = { apiLimiter, authLimiter, chatbotLimiter, toolsLimiter };
