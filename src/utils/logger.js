const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
// NOTE: Sync at startup only — acceptable single blocking call during process init
const logsDir = path.join(__dirname, '../../logs');
try {
    fs.mkdirSync(logsDir, { recursive: true });
} catch (e) {
    // Directory already exists — safe to ignore
}

/**
 * Sanitize input for logging to prevent log injection.
 * Removes newlines, control characters, and truncates long inputs.
 */
function sanitizeForLog(input) {
    if (input === null || input === undefined) return input;

    if (typeof input === 'object') {
        const sanitized = {};
        for (const [key, value] of Object.entries(input)) {
            sanitized[sanitizeForLog(key)] = sanitizeForLog(value);
        }
        return sanitized;
    }

    if (typeof input !== 'string') return input;

    return input
        .replace(/[\r\n]/g, '')         // Remove newlines (log injection)
        .replace(/[^\x20-\x7E]/g, '')   // Remove non-printable chars
        .slice(0, 500);                  // Truncate to prevent log flooding
}

const sanitizingFormat = winston.format((info) => {
    const sanitizedInfo = { ...info };
    if (sanitizedInfo.metadata) sanitizedInfo.metadata = sanitizeForLog(sanitizedInfo.metadata);
    if (sanitizedInfo.adminId) sanitizedInfo.adminId = sanitizeForLog(sanitizedInfo.adminId);
    if (sanitizedInfo.ip) sanitizedInfo.ip = sanitizeForLog(sanitizedInfo.ip);
    if (sanitizedInfo.path) sanitizedInfo.path = sanitizeForLog(sanitizedInfo.path);
    if (sanitizedInfo.error) sanitizedInfo.error = sanitizeForLog(sanitizedInfo.error);
    return sanitizedInfo;
});

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        sanitizingFormat(),
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({
            filename: path.join(logsDir, 'error.log'),
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),
        new winston.transports.File({
            filename: path.join(logsDir, 'combined.log'),
            maxsize: 5242880,
            maxFiles: 5
        })
    ]
});

// Always add console transport if enabled or in development
if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_CONSOLE_LOGS === 'true') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            sanitizingFormat(),
            winston.format.colorize(),
            process.env.NODE_ENV === 'production' ? winston.format.json() : winston.format.simple()
        )
    }));
}

module.exports = logger;
module.exports.sanitizeForLog = sanitizeForLog;
