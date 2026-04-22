const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const { readDB, writeDB, transactDB } = require('../config/database');

/**
 * Authentication middleware with proper JWT verification
 * FIXED: 
 * - Algorithm explicitly specified (prevents algorithm confusion attacks)
 * - Optional IP binding for session security
 * - Proper issuer/audience validation
 * - Tracks last_accessed time for session monitoring
 */
async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        logger.warn('Authentication attempt without token', { 
            ip: req.ip,
            path: req.path,
            method: req.method
        });
        return res.status(401).json({ 
            success: false, 
            error: 'Authentication required' 
        });
    }

    try {
        // FIXED: Explicit algorithm specification and validation
        const decoded = jwt.verify(token, process.env.JWT_SECRET, {
            algorithms: ['HS256'], // FIXED: Prevent algorithm confusion attacks
            issuer: 'solmates-backend',
            audience: 'solmates-admin'
        });
        
        // Check if session still exists and is valid
        const db = await readDB();
        const session = (db.admin_sessions || []).find(s => s.id === decoded.sessionId);
        
        if (!session) {
            logger.warn('Token valid but session not found', { 
                sessionId: decoded.sessionId,
                ip: req.ip
            });
            return res.status(401).json({ 
                success: false, 
                error: 'Session expired. Please login again.' 
            });
        }
        
        // IP binding — DISABLED BY DEFAULT (set SESSION_IP_BINDING=true to enable)
        // Default is false because admin may use multiple devices or mobile networks
        // where IP changes frequently (WiFi <-> 4G). Enabling this will break
        // multi-device admin access.
        if (process.env.SESSION_IP_BINDING === 'true') {
            if (session.ip !== req.ip) {
                logger.warn('Session IP mismatch - possible session hijacking', {
                    sessionId: decoded.sessionId,
                    storedIP: session.ip,
                    requestIP: req.ip
                });
                return res.status(401).json({ 
                    success: false, 
                    error: 'Session security violation. Please login again.' 
                });
            }
        }
        
        // User-Agent validation (soft check - log but don't block)
        // Browser updates can change UA slightly
        if (session.user_agent !== req.get('user-agent')) {
            logger.info('Session User-Agent mismatch', {
                sessionId: decoded.sessionId,
                stored: session.user_agent,
                current: req.get('user-agent')
            });
        }
        
        // FIXED CRITICAL #3: Update last_accessed timestamp using transaction
        // PERFORMANCE FIX: Throttle updates to every 5 minutes to prevent lock contention
        try {
            const now = Date.now();
            const lastAccessed = session.last_accessed ? new Date(session.last_accessed).getTime() : 0;
            const timeSinceLastUpdate = now - lastAccessed;
            const FIVE_MINUTES = 5 * 60 * 1000;
            
            // Only update if more than 5 minutes since last update
            if (timeSinceLastUpdate > FIVE_MINUTES) {
                await transactDB(async (db) => {
                    const sessionIndex = (db.admin_sessions || []).findIndex(s => s.id === decoded.sessionId);
                    if (sessionIndex !== -1) {
                        db.admin_sessions[sessionIndex].last_accessed = new Date().toISOString();
                    }
                    return true; // commit
                });
            }
        } catch (writeError) {
            logger.error('Failed to update session last_accessed', { 
                error: writeError.message,
                sessionId: decoded.sessionId 
            });
            // Continue - timestamp update failure shouldn't block request
        }
        
        req.admin = decoded;
        req.session = session;
        next();
    } catch (error) {
        logger.warn('Invalid token attempt', { 
            error: error.message,
            ip: req.ip,
            path: req.path
        });
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                success: false, 
                error: 'Session expired. Please login again.' 
            });
        }
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(403).json({ 
                success: false, 
                error: 'Invalid authentication token' 
            });
        }
        
        return res.status(403).json({ 
            success: false, 
            error: 'Authentication failed' 
        });
    }
}

/**
 * Optional Authentication middleware
 * Does not block request if token is missing or invalid.
 * Used for public routes that have enhanced features for admins.
 */
async function optionalAuthenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return next();

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET, {
            algorithms: ['HS256'],
            issuer: 'solmates-backend',
            audience: 'solmates-admin'
        });
        
        const db = await readDB();
        const session = (db.admin_sessions || []).find(s => s.id === decoded.sessionId);
        
        if (session) {
            if (process.env.SESSION_IP_BINDING === 'true' && session.ip !== req.ip) {
                return next(); // IP mismatch, ignore token silently
            }
            req.admin = decoded;
            req.session = session;
        }
    } catch (error) {
        // Silently ignore invalid tokens for optional auth
    }
    next();
}

module.exports = { authenticateToken, optionalAuthenticateToken };
