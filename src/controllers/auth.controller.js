const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { readDB, transactDB } = require('../config/database');

/**
 * FIX: Valid pre-generated bcrypt hash for timing attack protection.
 * The original used an INVALID hash string — bcryptjs detects invalid hashes
 * and returns false immediately without doing real bcrypt work, destroying
 * the constant-time guarantee. This is a real hash of a throwaway string.
 *
 * Generated with: bcrypt.hash('timing-protection-dummy', 12)
 */
const DUMMY_HASH = '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBfEuTWuvnxRWq';

/**
 * Admin login controller
 * FIX: Rate limit check and artificial delay moved OUTSIDE transactDB lock
 *      to prevent holding the database lock for up to 5 seconds (self-DoS).
 * FIX: Real bcrypt always runs regardless of adminId validity (timing safety).
 */
async function login(req, res, next) {
    try {
        const { adminId, password } = req.validatedBody;

        if (!process.env.ADMIN_PASSWORD_HASH || !process.env.JWT_SECRET || !process.env.ADMIN_ID) {
            logger.error('Missing required auth environment variables');
            return res.status(500).json({ success: false, error: 'Server configuration error' });
        }

        const now = Date.now();
        const fifteenMinutesAgo = now - (15 * 60 * 1000);
        const oneHourAgo = now - (60 * 60 * 1000);

        // FIX: Read DB outside lock for pre-checks — avoids holding write lock during bcrypt/delay
        const dbSnapshot = await readDB();

        // Check account lockout (no lock needed — read-only)
        const accountLockout = (dbSnapshot.account_lockouts || []).find(
            l => l.adminId === adminId && new Date(l.locked_until) > new Date()
        );
        if (accountLockout) {
            logger.warn('Login attempt on locked account', { adminId, ip: req.ip });
            return res.status(403).json({
                success: false,
                error: 'Account temporarily locked. Please try again later or contact administrator.'
            });
        }

        // Check IP rate limit (read-only, outside lock)
        const recentIPFailures = (dbSnapshot.failed_login_attempts || []).filter(
            a => a.ip === req.ip && a.timestamp > fifteenMinutesAgo
        );

        if (recentIPFailures.length >= 5) {
            const delayMs = Math.min(recentIPFailures.length * 1000, 5000);
            // FIX: Delay OUTSIDE lock — database is not held during sleep
            await new Promise(resolve => setTimeout(resolve, delayMs));
            logger.warn('Rate limit exceeded', { ip: req.ip, count: recentIPFailures.length });
            return res.status(429).json({
                success: false,
                error: 'Too many failed attempts. Please try again in 15 minutes.'
            });
        }

        // FIX: ALWAYS run real bcrypt work regardless of adminId validity.
        // If adminId is wrong, compare against DUMMY_HASH (a valid bcrypt hash)
        // so bcryptjs performs full key derivation in both branches.
        const hashToCompare = (adminId === process.env.ADMIN_ID)
            ? process.env.ADMIN_PASSWORD_HASH
            : DUMMY_HASH;

        const isPasswordValid = await bcrypt.compare(password, hashToCompare);
        const isAdminIdValid = adminId === process.env.ADMIN_ID;

        if (!isAdminIdValid || !isPasswordValid) {
            // Record failure in transaction
            await transactDB(async (db) => {
                if (!db.failed_login_attempts) db.failed_login_attempts = [];
                if (!db.account_lockouts) db.account_lockouts = [];

                db.failed_login_attempts.push({ ip: req.ip, adminId, timestamp: now });

                // Check if admin account should be locked (10+ failures in 1 hour)
                if (isAdminIdValid) {
                    const recentAdminFailures = db.failed_login_attempts.filter(
                        a => a.adminId === adminId && a.timestamp > oneHourAgo
                    );
                    if (recentAdminFailures.length >= 10) {
                        const lockedUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString();
                        db.account_lockouts.push({
                            adminId,
                            locked_until: lockedUntil,
                            reason: 'Too many failed login attempts',
                            locked_at: new Date().toISOString(),
                            locked_by_ip: req.ip
                        });
                        logger.error('Account locked due to excessive failed attempts', { adminId, lockedUntil });
                    }
                }

                return true;
            });

            logger.warn('Failed login attempt', { adminId, ip: req.ip });
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        // Success — create session in transaction
        const sessionId = crypto.randomBytes(32).toString('hex');

        await transactDB(async (db) => {
            if (!db.admin_sessions) db.admin_sessions = [];
            db.admin_sessions.push({
                id: sessionId,
                admin_id: adminId,
                created_at: new Date().toISOString(),
                last_accessed: new Date().toISOString(),
                ip: req.ip,
                user_agent: req.get('user-agent')
            });
            return true;
        });

        const token = jwt.sign(
            { sessionId, adminId, role: 'admin' },
            process.env.JWT_SECRET,
            {
                expiresIn: `${parseInt(process.env.SESSION_EXPIRY_HOURS, 10) || 24}h`,
                issuer: 'solmates-backend',
                audience: 'solmates-admin',
                algorithm: 'HS256'
            }
        );

        logger.info('Successful admin login', { adminId, sessionId, ip: req.ip });

        res.json({
            success: true,
            token,
            expiresIn: (parseInt(process.env.SESSION_EXPIRY_HOURS, 10) || 24) * 3600
        });

    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({ success: false, error: error.message });
        }
        logger.error('Login error', { error: error.message, stack: error.stack });
        next(error);
    }
}

/**
 * Verify token validity
 * FIX: JWT verified offline first before hitting DB, saves a lock cycle on invalid tokens.
 */
async function verifyToken(req, res) {
    try {
        const { token } = req.body;
        if (!token) return res.json({ valid: false });

        // Verify JWT cryptographically first (offline, no DB)
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET, {
                algorithms: ['HS256'],
                issuer: 'solmates-backend',
                audience: 'solmates-admin'
            });
        } catch {
            return res.json({ valid: false });
        }

        // Only hit DB if JWT itself is valid
        const db = await readDB();
        const sessionExists = (db.admin_sessions || []).some(s => s.id === decoded.sessionId);

        if (!sessionExists) return res.json({ valid: false });

        res.json({ valid: true, expiresAt: decoded.exp * 1000, adminId: decoded.adminId });

    } catch (error) {
        logger.error('Verify error', { error: error.message });
        res.json({ valid: false });
    }
}

/**
 * Logout — destroy session
 */
async function logout(req, res) {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET, {
                    algorithms: ['HS256']
                });
                await transactDB(async (db) => {
                    if (!db.admin_sessions) db.admin_sessions = [];
                    const before = db.admin_sessions.length;
                    db.admin_sessions = db.admin_sessions.filter(s => s.id !== decoded.sessionId);
                    if (db.admin_sessions.length < before) {
                        logger.info('Admin logout', { sessionId: decoded.sessionId, ip: req.ip });
                    }
                    return true;
                });
            } catch {
                logger.warn('Logout with invalid token', { ip: req.ip });
            }
        }

        res.json({ success: true });

    } catch (error) {
        logger.error('Logout error', { error: error.message });
        res.json({ success: true }); // Always succeed on logout
    }
}

/**
 * Job Admin login controller
 */
async function jobLogin(req, res, next) {
    try {
        const { adminId, password } = req.body;
        const validId = process.env.JOB_ADMIN_ID || 'jobadmin';
        
        if (process.env.JOB_ADMIN_PASSWORD_HASH) {
            // Secure bcrypt verification against timing attacks
            const hashToCompare = (adminId === validId)
                ? process.env.JOB_ADMIN_PASSWORD_HASH
                : DUMMY_HASH;
            
            const isPasswordValid = await bcrypt.compare(password, hashToCompare);
            if (adminId !== validId || !isPasswordValid) {
                logger.warn('Failed job admin login attempt', { adminId, ip: req.ip });
                return res.status(401).json({ success: false, error: 'Invalid Job Admin credentials' });
            }
        } else {
            // Fallback if .env is not configured
            if (adminId !== 'jobadmin' || password !== 'jobadmin123') {
                logger.warn('Failed job admin login attempt', { adminId, ip: req.ip });
                return res.status(401).json({ success: false, error: 'Invalid Job Admin credentials' });
            }
        }
        
        const now = Date.now();
        const sessionId = crypto.randomBytes(32).toString('hex');

        await transactDB(async (db) => {
            if (!db.admin_sessions) db.admin_sessions = [];
            db.admin_sessions.push({
                id: sessionId,
                admin_id: adminId,
                role: 'jobAdmin',
                created_at: new Date().toISOString(),
                last_accessed: new Date().toISOString(),
                ip: req.ip,
                user_agent: req.get('user-agent')
            });
            return true;
        });

        const token = jwt.sign(
            { sessionId, adminId, role: 'jobAdmin' },
            process.env.JWT_SECRET,
            {
                expiresIn: `${parseInt(process.env.SESSION_EXPIRY_HOURS, 10) || 24}h`,
                issuer: 'solmates-backend',
                audience: 'solmates-admin',
                algorithm: 'HS256'
            }
        );

        logger.info('Successful job admin login', { adminId, sessionId, ip: req.ip });

        res.json({
            success: true,
            token,
            expiresIn: (parseInt(process.env.SESSION_EXPIRY_HOURS, 10) || 24) * 3600
        });

    } catch (error) {
        logger.error('Job Login error', { error: error.message, stack: error.stack });
        next(error);
    }
}

module.exports = { login, verifyToken, logout, jobLogin };
