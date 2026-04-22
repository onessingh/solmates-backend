const logger = require('../utils/logger');

function notFoundHandler(req, res) {
    logger.warn('404 Not Found', { 
        path: req.path,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('user-agent')
    });
    
    res.status(404).json({
        success: false,
        error: 'Resource not found'
    });
}

function errorHandler(err, req, res, next) {
    // Log the error
    logger.error('Error occurred', {
        error: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('user-agent')
    });

    // Handle specific error types
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            error: 'Validation error',
            details: err.details || err.message
        });
    }

    if (err.name === 'UnauthorizedError') {
        return res.status(401).json({
            success: false,
            error: 'Unauthorized access'
        });
    }

    // CORS errors
    if (err.message && err.message.includes('CORS')) {
        return res.status(403).json({
            success: false,
            error: 'CORS policy violation'
        });
    }

    // FIXED MEDIUM #2: Never leak error details - log internally only
    // Log full error details for debugging
    logger.error('Full error details', {
        error: err.message,
        stack: err.stack,
        status: err.status
    });
    
    // Return sanitized error to client (no stack traces ever)
    const status = err.status || err.statusCode || 500;
    res.status(status).json({
        success: false,
        error: 'An error occurred while processing your request'
    });
}

module.exports = { errorHandler, notFoundHandler };
