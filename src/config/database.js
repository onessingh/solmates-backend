const { MongoClient } = require('mongodb');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

const LOCAL_DB_PATH = path.join(__dirname, '../../solmates-db.json');

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'solmates';
const COLLECTION = 'solmates_db';

const DEFAULT_DATA = {
    _id: 'main',
    content: { notes: [], pyq: [], oneshot: [], elearning: [], professor: [], classes: [] },
    sol_live_classes: [], sol_notes: [], sol_pyqs: [], sol_oneshot: [],
    sol_youtube: [], sol_elearning: [], sol_professor: [],
    sol_ai_knowledge: [],
    youtube_videos: [], live_classes: [], tools: [], skills: [], resumes: [],
    admin_sessions: [], failed_login_attempts: [], account_lockouts: [],
    semester_links: {}, youtube_folder_links: {},
    folders: [],
    resume_drafts: [],
    career_test_results: [],
    interview_sessions: [],
    study_plans: [],
    manual_jobs: []
};

let client = null;
let dbConn = null;
let memoryDB = { ...DEFAULT_DATA };
let INTERNAL_CACHE = null;
let INTERNAL_CACHE_TS = 0;
const INTERNAL_CACHE_TTL = 10 * 1000; // 10 seconds

const invalidateInternalCache = () => {
    INTERNAL_CACHE = null;
    INTERNAL_CACHE_TS = 0;
    // logger.debug('Database Internal Cache invalidated');
};

async function getDB() {
    if (client && dbConn) {
        try {
            await dbConn.command({ ping: 1 });
            return dbConn;
        } catch (e) {
            logger.warn('MongoDB connection lost, reconnecting...', { error: e.message });
            client = null;
            dbConn = null;
        }
    }
    if (!MONGODB_URI) {
        logger.warn('MONGODB_URI not set, using in-memory mode');
        return null;
    }
    try {
        client = new MongoClient(MONGODB_URI, {
            serverSelectionTimeoutMS: 5000, // ✅ v83.51.53.108: Give more time for Atlas bursts
            connectTimeoutMS: 5000,
            socketTimeoutMS: 30000,
            maxPoolSize: 25, // ✅ v83.51.53.108: Optimized for high-concurrency "Fast Clicks"
        });
        await client.connect();
        dbConn = client.db(DB_NAME);
        logger.info('Connected to MongoDB Atlas');
        return dbConn;
    } catch (err) {
        logger.warn('Failed to connect to MongoDB, using in-memory mode:', err.message);
        client = null;
        dbConn = null;
        return null;
    }
}

// v83.51.53.2: INTERNAL COLLECTION MAPPING (For Distributed Architecture)
const COLLECTIONS = {
  'notes': 'notes',
  'live-classes': 'live_classes',
  'notifications': 'notifications',
  'pyqs': 'pyqs',
  'folders': 'folders',
  'elearning': 'elearning',
  'youtube': 'youtube',
  'professor': 'professors',
  'recorded-class': 'recorded_classes',
  'jobs': 'jobs',
  'career_results': 'career_results',
  'oneshot': 'oneshot',
  'ai-knowledge': 'ai_knowledge'
};

// In-memory fallback
// Removed from here to move to top

// Moved to top

async function readDB() {
    // ✅ NEW: Return from Internal Cache if within TTL
    const now = Date.now();
    if (INTERNAL_CACHE && (now - INTERNAL_CACHE_TS < INTERNAL_CACHE_TTL)) {
        return JSON.parse(JSON.stringify(INTERNAL_CACHE));
    }

    const database = await getDB();
    let result;

    if (!database) {
        // ✅ NEW: Try to read from local file first
        try {
            if (fs.existsSync(LOCAL_DB_PATH)) {
                const fileData = fs.readFileSync(LOCAL_DB_PATH, 'utf8');
                result = JSON.parse(fileData);
            }
        } catch (e) {
            logger.error('Failed to read Local DB', { error: e.message });
        }
        if (!result) result = JSON.parse(JSON.stringify(memoryDB));
    } else {
        const col = database.collection(COLLECTION);
        let doc = await col.findOne({ _id: 'main' });
        if (!doc) { await col.insertOne(DEFAULT_DATA); doc = { ...DEFAULT_DATA }; }
        result = JSON.parse(JSON.stringify(doc));
    }

    // ✅ NEW: Update Internal Cache and Timestamp
    INTERNAL_CACHE = JSON.parse(JSON.stringify(result));
    INTERNAL_CACHE_TS = Date.now();
    return result;
}

async function writeDB(data) {
    const database = await getDB();
    
    // Update memory and cache immediately for fast feedback
    memoryDB = data;
    INTERNAL_CACHE = data; 
    INTERNAL_CACHE_TS = Date.now();

    if (!database) {
        // Only write to local file if NO MongoDB is present (Development mode)
        try {
            fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(data, null, 2));
            logger.debug('Database written to Local File (Sync)');
        } catch (e) {
            logger.error('Local File Write Error', { error: e.message });
        }
        return;
    }
    
    const col = database.collection(COLLECTION);
    const { _id, ...rest } = data;
    await col.updateOne({ _id: 'main' }, { $set: rest }, { upsert: true });
    logger.debug('Database written to MongoDB');
}

async function transactDB(callback) {
    const database = await getDB();
    
    if (!database) {
        const db = await readDB(); 
        const shouldCommit = await callback(db);
        if (shouldCommit !== false) {
            memoryDB = db;
            INTERNAL_CACHE = db;
            fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(db, null, 2));
        }
        return db;
    }
    
    const col = database.collection(COLLECTION);
    let doc = await col.findOne({ _id: 'main' });
    if (!doc) { await col.insertOne(DEFAULT_DATA); doc = { ...DEFAULT_DATA }; }
    
    // Use the document directly to avoid expensive JSON cycle if possible
    // But for safety of nested refs, we'll do it once
    const db = JSON.parse(JSON.stringify(doc));
    
    let shouldCommit;
    try {
        shouldCommit = await callback(db);
    } catch (callbackError) {
        throw callbackError;
    }

    if (shouldCommit !== false) {
        const { _id, ...rest } = db;
        
        // ✅ CRITICAL OPTIMIZATION: Update INTERNAL_CACHE immediately
        INTERNAL_CACHE = JSON.parse(JSON.stringify(db));
        INTERNAL_CACHE_TS = Date.now();
        
        // ✅ BACKGROUND SYNC: Don't wait for MongoDB Atlas (slow) to respond.
        // This makes the Admin UI feel instant.
        col.updateOne({ _id: 'main' }, { $set: rest }, { upsert: true })
            .then(() => logger.debug('Transaction committed to MongoDB (Background)'))
            .catch(err => logger.error('Background DB Write Failed', { error: err.message }));
    }
    return db;
}

async function initDB() {
    try {
        const database = await getDB();
        if (!database) {
            logger.info('Database initialized in Memory mode');
            return;
        }
        const col = database.collection(COLLECTION);
        let doc = await col.findOne({ _id: 'main' });
        if (!doc) {
            await col.insertOne(DEFAULT_DATA);
            logger.info('MongoDB database initialized with default structure');
        } else {
            const updates = {};
            for (const [key, val] of Object.entries(DEFAULT_DATA)) {
                if (key === '_id') continue;
                if (doc[key] === undefined) {
                    updates[key] = val;
                } else if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
                    // ✅ FIX: Also migrate NESTED object fields (e.g. content.classes)
                    for (const [subKey, subVal] of Object.entries(val)) {
                        if (doc[key][subKey] === undefined) {
                            updates[`${key}.${subKey}`] = subVal;
                        }
                    }
                }
            }
            if (Object.keys(updates).length > 0) {
                await col.updateOne({ _id: 'main' }, { $set: updates });
                logger.info('MongoDB migrated with new fields', { added: Object.keys(updates) });
            } else {
                logger.info('MongoDB database validated successfully');
            }
        }
    } catch (error) {
        logger.error('Failed to initialize MongoDB', { error: error.message });
        throw error;
    }
}

async function cleanupExpiredSessions() {
    try {
        const db = await readDB();
        const now = Date.now();
        const sessionExpiryMs = (parseInt(process.env.SESSION_EXPIRY_HOURS, 10) || 24) * 60 * 60 * 1000;
        const fifteenMinutesAgo = now - (15 * 60 * 1000);
        
        if (!db.admin_sessions) db.admin_sessions = [];
        if (!db.failed_login_attempts) db.failed_login_attempts = [];
        if (!db.account_lockouts) db.account_lockouts = [];
        
        const initialCount = db.admin_sessions.length;
        db.admin_sessions = db.admin_sessions.filter(s => (now - new Date(s.created_at).getTime()) < sessionExpiryMs);
        db.failed_login_attempts = db.failed_login_attempts.filter(a => a.timestamp > fifteenMinutesAgo);
        db.account_lockouts = db.account_lockouts.filter(l => new Date(l.locked_until) > new Date());
        
        if (initialCount !== db.admin_sessions.length) await writeDB(db);


        // Database Heartbeat to prevent Atlas from pausing
        const database = await getDB();
        if (database) {
            await database.collection('heartbeat').updateOne(
                { _id: 'last_ping' },
                { $set: { timestamp: new Date() } },
                { upsert: true }
            );
            logger.debug('Database Heartbeat sent to Atlas');
        }
    } catch (error) {
        logger.error('Session cleanup failed', { error: error.message });
    }
}


async function createBackup() {
    try {
        const db = await readDB();
        const timestamp = Date.now();
        const backupPath = `${LOCAL_DB_PATH}.backup.${timestamp}`;
        
        // Ensure data directory exists (if it were in a subdir, but here it's root)
        fs.writeFileSync(backupPath, JSON.stringify(db));
        logger.info('Database Backup created', { path: backupPath });
        
        // Optional: Keep only last 10 backups to save space
        const dir = path.dirname(LOCAL_DB_PATH);
        const files = fs.readdirSync(dir)
            .filter(f => f.startsWith('solmates-db.json.backup.'))
            .map(f => ({ name: f, time: parseInt(f.split('.').pop(), 10) }))
            .sort((a, b) => b.time - a.time);
            
        if (files.length > 10) {
            files.slice(10).forEach(f => {
                try { fs.unlinkSync(path.join(dir, f.name)); } catch(e) {}
            });
            logger.info('Old backups pruned', { kept: 10 });
        }
    } catch (error) {
        logger.error('Backup creation failed', { error: error.message });
    }
}

function startBackupInterval() {
    // Initial backup on startup
    createBackup();
    
    // Every 6 hours
    setInterval(() => {
        createBackup();
    }, 6 * 60 * 60 * 1000);
    
    logger.info('Automated file-level backup system started (6h interval)');
}

// ✅ FIX: Actually estimate document size so 45MB guard in admin.controller works
async function checkDatabaseSize() {
    try {
        const db = await readDB();
        const bytes = Buffer.byteLength(JSON.stringify(db), 'utf8');
        return bytes / (1024 * 1024);
    } catch (error) {
        logger.error('checkDatabaseSize failed', { error: error.message });
        return 0; // Fail-open: if we can't check, don't block writes
    }
}

module.exports = { 
    getDB,
    readDB, 
    writeDB, 
    initDB, 
    cleanupExpiredSessions, 
    createBackup, 
    startBackupInterval, 
    transactDB, 
    checkDatabaseSize,
    invalidateInternalCache,
    COLLECTIONS
};
