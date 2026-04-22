const { webpush } = require('../config/push.config');
const { getDB } = require('../config/database');
const logger = require('../utils/logger');

const DB_COLLECTION = 'push_subscriptions';

// ── PUSH NOTIFICATION BLACKLIST ───────────────────────────────────────────────
// Add any notification body/title substring here to permanently silence it.
// Matching is case-insensitive. Add more entries as needed.
const PUSH_BODY_BLACKLIST = [
  'AI in Libraries',
  'Should we care',
];


/**
 * Save user push subscription
 */
async function subscribe(req, res, next) {
    try {
        const { subscription, deviceId, semesters, metadata } = req.body;
        
        logger.info('[DEBUG] Push Subscribe Hit', { 
            origin: req.get('origin'),
            userAgent: req.get('user-agent'),
            deviceId: deviceId || 'legacy',
            semesters: semesters || 'not-provided'
        });

        if (!subscription || !subscription.endpoint) {
            return res.status(400).json({ success: false, error: 'Invalid subscription object' });
        }

        const db = await getDB();
        if (!db) return res.status(500).json({ success: false, error: 'Database not available' });

        const col = db.collection(DB_COLLECTION);
        
        // v83.32: Hardened de-duplication strategy
        const filter = deviceId ? { deviceId } : { endpoint: subscription.endpoint };
        
        // Ensure semesters is an array and default to ['all']
        const semestersArray = (Array.isArray(semesters) && semesters.length > 0) 
            ? semesters.map(s => String(s)) 
            : ['all'];

        // v104.5: Capture App Bridge Metadata
        const updateData = { 
            ...subscription, 
            deviceId: deviceId || null,
            semesters: semestersArray,
            updatedAt: new Date() 
        };

        if (metadata) {
            updateData.metadata = metadata;
        }

        await col.updateOne(
            filter,
            { 
                $set: updateData,
                $setOnInsert: { createdAt: new Date() }
            },
            { upsert: true }
        );

        logger.info('Push subscription processed', { deviceId: deviceId || 'legacy', endpoint: subscription.endpoint });
        res.status(201).json({ success: true, message: 'Subscription processed' });
    } catch (err) {
        logger.error('Push subscribe error', { error: err.message });
        res.status(500).json({ success: false, error: err.message });
    }
}

/**
 * Remove user push subscription
 */
async function unsubscribe(req, res, next) {
    try {
        const db = await getDB();
        if (!db) return res.status(500).json({ success: false, error: 'Database not available' });

        const { endpoint } = req.body;
        if (!endpoint) return res.status(400).json({ success: false, error: 'Endpoint required' });

        const col = db.collection(DB_COLLECTION);
        await col.deleteOne({ endpoint });

        logger.info('Push subscription removed', { endpoint });
        res.json({ success: true, message: 'Unsubscribed' });
    } catch (err) {
        logger.error('Push unsubscribe error', { error: err.message });
        res.status(500).json({ success: false, error: err.message });
    }
}

/**
 * Broadcast notification to all subscribers
 */
async function sendBroadcast(title, body, url = '/notification.html', semester = null, ttl = null) {
    // ── Blacklist Check ─────────────────────────────────────────────────────
    const combined = `${title} ${body}`.toLowerCase();
    const blocked = PUSH_BODY_BLACKLIST.some(phrase => combined.includes(phrase.toLowerCase()));
    if (blocked) {
        logger.warn(`[PUSH-BLACKLIST] Blocked notification: "${title}" | "${body}"`);
        return 0;
    }
    // ────────────────────────────────────────────────────────────────────────
    try {
        const db = await getDB();
        if (!db) return 0;

        const col = db.collection(DB_COLLECTION);

        // ✅ [v88.9] STRICT SEMESTER FILTERING
        // Find users who subscribed to this specific semester, OR 'all'
        let query = {};
        if (semester && semester !== 'all') {
            const semStr = String(semester);
            query = {
                $or: [
                    { semesters: semStr },
                    { semesters: 'all' }
                ]
            };
        } else {
            // v89.1: If semester is 'all' or not provided, target EVERYONE
            logger.info(`[PUSH] Global broadcast detected (Target: ${semester}). Removing semester filters.`);
            query = {};
        }

        const subscriptions = await col.find(query).toArray();

        // v83.31.16: Deduplicate by endpoint to be 100% safe
        const uniqueSubs = Array.from(new Map(subscriptions.map(s => [s.endpoint, s])).values());

        // v105.1: Dynamic TTL for faster delivery of time-sensitive reminders
        // Defaults to 24h if null. 
        const activeTTL = ttl || (60 * 60 * 24); 

        logger.info(`Broadcasting push to ${uniqueSubs.length} targets: ${title} (TTL: ${activeTTL}s)`);

        const options = {
            TTL: activeTTL,
            urgency: 'high'    // v89.2: Force instant delivery on supported browsers
        };

        const payload = JSON.stringify({
            title,
            body,
            icon: '/android-chrome-192x192.png',
            badge: '/favicon-32x32.png',
            url
        });

        const promises = uniqueSubs.map(sub => 
            webpush.sendNotification(sub, payload, options).catch(err => {
                if (err.statusCode === 410 || err.statusCode === 404) {
                    col.deleteOne({ endpoint: sub.endpoint });
                    return null;
                }
                logger.error('Webpush send error', { endpoint: sub.endpoint, error: err.message });
                return null;
            })
        );

        await Promise.all(promises);
        return uniqueSubs.length;
    } catch (err) {
        logger.error('Broadcast push error', { error: err.message });
        return 0;
    }
}

async function testPush(req, res) {
    try {
        const { publicVapidKey } = require('../config/push.config');
        const title = req.query.title || `[SOLMATES] v83.29 Push Test`;
        const body = req.query.body || `Siddharth bhai, kaafi mehnat ke baad Push Notification working hai! 🚀✨`;
        const url = req.query.url || '/notification.html';
        const semester = req.query.semester || null;

        const count = await sendBroadcast(title, body, url, semester);
        res.json({ 
            success: true, 
            message: `Push sent to ${count} users.`, 
            title, 
            body,
            activePublicKey: publicVapidKey
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}

async function getSubCount(req, res) {
    try {
        const db = await getDB();
        const count = await db.collection('push_subscriptions').countDocuments();
        res.json({ success: true, count });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}

async function resetSubscriptions(req, res) {
    try {
        const db = await getDB();
        if (!db) return res.status(500).json({ success: false, error: 'Database not available' });
        const col = db.collection(DB_COLLECTION);
        await col.deleteMany({});
        logger.info('DATABASE RESET: All push subscriptions cleared.');
        res.json({ success: true, message: 'All subscriptions cleared. System ready for v83.32 Unique IDs.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}

async function getLogs(req, res) {
    try {
        const fs = require('fs');
        const path = require('path');
        const logPath = path.join(__dirname, '../../logs/combined.log');
        if (fs.existsSync(logPath)) {
            const content = fs.readFileSync(logPath, 'utf8');
            const lines = content.split('\n').filter(l => l.trim()).slice(-50);
            res.json({ success: true, logs: lines });
        } else {
            res.json({ success: true, message: 'Log file not found yet' });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}

/**
 * [v104.2] Broadcast a manual greeting/info message (Push Only)
 */
async function broadcastGreeting(req, res, next) {
    try {
        const { title, message, semester } = req.body;
        if (!message) return res.status(400).json({ success: false, error: 'Message required' });
        
        const pushTitle = title || '[SOLMATES] Special Greeting';
        const count = await sendBroadcast(pushTitle, message, '/notification.html', semester);
        
        logger.info(`[BROADCAST] Sent manual greeting to ${count} users. Target: ${semester || 'all'}`);
        res.json({ success: true, message: `Broadcast sent to ${count} users.`, count });
    } catch (err) {
        logger.error('Manual broadcast error', { error: err.message });
        res.status(500).json({ success: false, error: err.message });
    }
}

module.exports = {
    subscribe,
    unsubscribe,
    sendBroadcast,
    testPush,
    getSubCount,
    getLogs,
    resetSubscriptions,
    broadcastGreeting
};
