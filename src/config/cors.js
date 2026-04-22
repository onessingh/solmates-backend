const logger = require('../utils/logger');

if (!process.env.NODE_ENV) {
    logger.error('NODE_ENV not set - defaulting to production for security');
    process.env.NODE_ENV = 'production';
}

function validateOriginURL(url) {
    try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) return false;
        if (!parsed.hostname || parsed.hostname.length === 0) return false;
        if (parsed.hostname.includes('@') || parsed.hostname.includes(' ')) return false;
        return true;
    } catch {
        return false;
    }
}

const rawOrigins = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map(url => url.trim())
    : ['http://localhost:8000', 'http://127.0.0.1:8000'];

const allowedOrigins = rawOrigins.filter(url => {
    const isValid = validateOriginURL(url);
    if (!isValid) logger.warn('Skipping invalid CORS origin', { url });
    return isValid;
});

// Explicitly allow solmates.in and subdomains
allowedOrigins.push('https://solmates.in', 'http://solmates.in', 'https://www.solmates.in', 'http://www.solmates.in');

if (allowedOrigins.length === 0) {
    logger.error('No valid CORS origins configured - using localhost defaults');
    allowedOrigins.push('http://localhost:8000', 'http://127.0.0.1:8000');
}

logger.info('CORS configured with origins', { allowedOrigins });

const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (server-side calls, keep-alive pings, curl)
        // CSRF protection is handled by JWT tokens, not CORS alone
        if (!origin) {
            return callback(null, true);
        }

        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        // FIX: Also allow Netlify deploy preview URLs (deploy-preview-*.netlify.app)
        // These change with every PR so can't be statically listed
        const isNetlifyPreview = /^https?:\/\/[a-z0-9-]+--[a-z0-9-]+\.netlify\.app$/.test(origin);
        if (isNetlifyPreview) {
            return callback(null, true);
        }

        logger.warn('CORS rejection', { origin, allowedOrigins });
        callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Content-Range', 'X-Content-Range']
};

module.exports = corsOptions;
