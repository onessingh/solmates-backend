/**
 * SOLMATES Backend Server - Production Ready
 * UPDATED: GROQ API Support for Career Test
 */

require('dotenv').config();
const logger = require('./src/utils/logger');

logger.info('Server process initiated', { 
  node_env: process.env.NODE_ENV, 
  env_port: process.env.PORT,
  resolved_port: process.env.PORT || 10000,
  timestamp: new Date().toISOString() 
});

// Log all crashes clearly in Render logs
process.on('uncaughtException', (err) => {
  console.error('💥 CRASH:', err.message, err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('💥 REJECTION:', err && err.message, err && err.stack);
  process.exit(1);
});

const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const { Server: SocketIOServer } = require('socket.io');
const path = require('path');

const { initDB, getDB, cleanupExpiredSessions, startBackupInterval } = require('./src/config/database');
const { initSOLCache } = require('./src/controllers/sol.controller');
const { errorHandler, notFoundHandler } = require('./src/middleware/error.middleware');
const { apiLimiter } = require('./src/middleware/rateLimiter.middleware');
const { authenticateToken } = require('./src/middleware/auth.middleware');

// Import routes
const authRoutes = require('./src/routes/auth.routes');
const contentRoutes = require('./src/routes/content.routes');
const adminRoutes = require('./src/routes/admin.routes');
const solRoutes = require('./src/routes/sol.routes');
const toolsRoutes = require('./src/routes/tools.routes');
const careerTestRoutes = require('./src/routes/career-test.routes');
const aiToolsRoutes = require('./src/routes/aiTools.routes');
const notificationRoutes = require('./src/routes/notification.routes');
const mediaRoutes = require('./src/routes/media.routes');

// Resumebuilder routes
const resumeAuthRoutes = require('./src/resumebuilder/routes/auth.routes');
const resumeRoutes = require('./src/resumebuilder/routes/resume.routes');
const resumeAnalyticsRoutes = require('./src/resumebuilder/routes/analytics.routes');
const resumeTemplateRoutes = require('./src/resumebuilder/routes/template.routes');
const resumeJdRoutes = require('./src/resumebuilder/routes/jd.routes');

const app = express();
const httpServer = http.createServer(app);
const PORT = process.env.PORT || 10000;

// ============================================================
// CORS CONFIGURATION - FIXED
// ============================================================
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:8000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'https://teamsolmates.netlify.app',
  'https://solmates.netlify.app',
  'https://solmates.in',
  'https://www.solmates.in'

];

// Add FRONTEND_URL from env if present
if (process.env.FRONTEND_URL) {
  process.env.FRONTEND_URL.split(',').forEach(url => {
    const trimmed = url.trim();
    if (trimmed && !allowedOrigins.includes(trimmed)) {
      allowedOrigins.push(trimmed);
    }
  });
}

// CORS middleware - MUST be before routes
app.use(cors({
  origin: (origin, callback) => callback(null, true),
  credentials: true,
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Cache-Control',
    'Pragma',
    'Expires',
    'X-Requested-With'
  ],
  exposedHeaders: ['Content-Length', 'X-Request-ID'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  optionsSuccessStatus: 200
}));

// Handle preflight requests explicitly
app.options('*', cors());

// Validate required environment variables
const requiredEnvVars = ['JWT_SECRET', 'ADMIN_PASSWORD_HASH', 'ADMIN_ID', 'MONGODB_URI'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  logger.error('Missing required environment variables', { missing: missingEnvVars });
  console.error('❌ ERROR: Missing required environment variables:', missingEnvVars.join(', '));
  console.error('Please set these in your .env file before starting the server.');
  process.exit(1);
}

// ✅ FIXED: Remove DeepSeek check, add GROQ check
if (!process.env.GROQ_API_KEY) {
  console.log('⚠️ GROQ_API_KEY not set - using fallback questions mode');
}

// Validate JWT secret strength
if (process.env.JWT_SECRET.length < 32) {
  logger.error('JWT_SECRET is too short - minimum 32 characters required');
  console.error('❌ ERROR: JWT_SECRET must be at least 32 characters (64+ recommended)');
  process.exit(1);
}

logger.info('JWT secret validated', { length: process.env.JWT_SECRET.length });

// Trust proxy (important for Render, Heroku, etc.)
app.set('trust proxy', 1);

// HTTPS redirect in production (Excluding health checks)
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    // Skip HTTPS check for health endpoints
    if (req.path === '/api/health' || req.path === '/api/live' || req.path === '/api/ready') {
      return next();
    }

    const isHttps = req.secure ||
      req.header('x-forwarded-proto') === 'https' ||
      req.header('x-forwarded-ssl') === 'on' ||
      req.header('front-end-https') === 'on';

    if (!isHttps) {
      logger.warn('Non-HTTPS request in production', {
        ip: req.ip,
        path: req.path,
        protocol: req.header('x-forwarded-proto') || req.protocol
      });

      if (req.method === 'GET' && !req.xhr) {
        return res.redirect(301, `https://${req.header('host')}${req.url}`);
      }

      return res.status(403).json({
        success: false,
        error: 'HTTPS required'
      });
    }
    next();
  });
}

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "https://cdnjs.cloudflare.com", "'unsafe-inline'"],
      scriptSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://www.google.com", "https://www.gstatic.com", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://solmates-backend-w27e.onrender.com", "wss://solmates-backend-w27e.onrender.com", "https://teamsolmates.netlify.app", "https://solmates.in", "https://www.solmates.in"],
      fontSrc: ["'self'", "data:", "https://cdnjs.cloudflare.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// Additional security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

// Root URL
app.get('/', (req, res) => {
  res.status(200).json({
    service: 'SOLMATES Backend API',
    status: 'running',
    version: 'v113.1',
    features: {
      careerTest: true // ✅ FIXED: Always true, using GROQ
    },
    endpoints: {
      live: '/api/live',
      health: '/api/health',
      careerTest: '/api/career-test/*'
    },
    timestamp: new Date().toISOString()
  });
});

// Favicon
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Compression
app.use(compression());

// v83.51.53.1: INCREASED LIMITS FOR MASSIVE DATA TRANSFERS (Render Stability)
app.use(bodyParser.json({ limit: '20mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '20mb' }));

// 🚀 v83.51.53.1: NUCLEAR CLEANUP & AUTO-PILOT (Self-Healing Background Task)
async function runAutoPilotMigration(db) {
  const MAP = {
    'notes': { key: 'sol_notes', target: 'notes' },
    'live_classes': { key: 'sol_live_classes', target: 'live_classes' },
    'notifications': { key: 'sol_notifications', target: 'notifications' },
    'pyqs': { key: 'sol_pyqs', target: 'pyqs' },
    'folders': { key: 'folders', target: 'folders' },
    'elearning': { key: 'sol_elearning', target: 'elearning' },
    'youtube': { key: 'sol_youtube', target: 'youtube' },
    'professors': { key: 'sol_professor', target: 'professors' },
    'recorded_classes': { key: 'sol_recorded_class', target: 'recorded_classes' },
    'jobs': { key: 'manual_jobs', target: 'jobs' },
    'career_results': { key: 'career_test_results', target: 'career_results' },
    'ai_knowledge': { key: 'sol_ai_knowledge', target: 'ai_knowledge' }
  };

  const mainCol = db.collection('solmates_db');
  console.log('[Auto-Pilot] 🔍 Detection Phase Started...');

  for (const [category, config] of Object.entries(MAP)) {
    try {
      const targetCol = db.collection(config.target);
      const targetCount = await targetCol.countDocuments();
      
      // Safety: Only migrate if target collection is EMPTY
      if (targetCount === 0) {
        console.log(`[Auto-Pilot] 🚀 Migrating "${category}"...`);
        const projection = { [config.key]: 1, content: 1 };
        const mainDoc = await mainCol.findOne({ _id: 'main' }, { projection });
        if (!mainDoc) continue;

        let sourceData = mainDoc[config.key] || [];
        // v83.51.53.18: EXPANDED DATA RESCUE
        if ((!sourceData || sourceData.length === 0) && mainDoc.content) {
            const legacyMap = { 
              'notes': 'notes', 
              'live_classes': 'classes', 
              'pyqs': 'pyq', 
              'elearning': 'elearning', 
              'youtube': 'youtube', 
              'notifications': 'notifications',
              'professors': 'professor',
              'recorded_classes': 'recorded_class',
              'ai_knowledge': 'ai-knowledge'
            };
            const legacyKey = legacyMap[category];
            if (legacyKey && mainDoc.content[legacyKey]) sourceData = mainDoc.content[legacyKey];
        }

        if (sourceData && sourceData.length > 0) {
          // v83.51.53: DEDUPLICATION LOGIC
          if (category === 'notifications') {
            const seen = new Set();
            sourceData = sourceData.filter(item => {
              const key = `${(item.title || "").trim().toLowerCase()}|${(item.link || "").trim().toLowerCase()}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
            console.log(`[Auto-Pilot] ✨ Deduplicated Notifications: ${sourceData.length} unique items saved.`);
          }

          const crypto = require('crypto');
          const items = sourceData.map(item => ({
             _id: crypto.randomBytes(12).toString('hex'),
             ...item,
             migrated_at: new Date().toISOString()
          }));
          await targetCol.insertMany(items, { ordered: false }).catch(() => {});
          console.log(`[Auto-Pilot] ✅ Successfully Shredded "${config.target}"`);

          // v83.51.53.10: ATOMIC LEGACY PURGE
          // After shredding, we empty the source array in the main document to save space
          const unsetOp = { [config.key]: [] };
          // Also clear mirrored legacy content if any
          const legacyMap = { 'notes': 'notes', 'live_classes': 'classes', 'pyqs': 'pyq', 'elearning': 'elearning', 'youtube': 'youtube', 'notifications': 'notifications' };
          if (legacyMap[category]) {
              unsetOp[`content.${legacyMap[category]}`] = [];
          }
          await mainCol.updateOne({ _id: 'main' }, { $set: unsetOp });
          console.log(`[Auto-Pilot] 🧹 Safely Purged Legacy "${category}" data from main document.`);
        }
      }
    } catch (err) {
      console.error(`[Auto-Pilot] ❌ Failed Category ${category}:`, err.message);
    }
  }
}

// 🌟 v83.51.53.300: LIVE CLASS TITLE SANITIZER (Clean existing DB redundancy)
app.get('/api/debug/sanitize-live-titles', async (req, res) => {
  try {
    const { getDB } = require('./src/config/database');
    const db = await getDB();
    const notifCol = db.collection('notifications');
    
    const docs = await notifCol.find({ 
      $or: [
        { title: { $regex: /MBA SEM/i } },
        { description: { $regex: /Live Class/i } },
        { category: 'live-classes' }
      ]
    }).toArray();
     const liveClassCol = db.collection('live_classes'); // [v108.9.3] Source lookup
     const liveClasses = await liveClassCol.find({}).toArray();
     let updatedCount = 0;
     const scanLog = []; // [v108.9.7] Debug log
     const preview = [];

     for (const doc of docs) {
        if (String(doc.semester) === '2') scanLog.push({ id: doc._id, t: doc.title });

        // [v108.8] HYBRID CLEAN: Strips prefixes from NOTICES, preserves for LIVE CLASSES
        const oldTitle = doc.title;
        const lowTitle = (oldTitle || "").toLowerCase();
        const lowDesc = (doc.description || "").toLowerCase();
        const lowLink = (doc.link || "").toLowerCase();

        // 1. Hardened Detection
        const isLiveClass = doc.category === 'live-classes' || 
                            lowDesc.includes('live class') || 
                            lowTitle.includes('[live]') ||
                            lowLink.includes('teams.microsoft') || 
                            lowLink.includes('zoom.us') || 
                            lowLink.includes('meet.google');

        if (String(doc.semester) === '0' && isLiveClass) {
           await notifCol.deleteOne({ _id: doc._id });
           updatedCount++;
           continue;
        }

        // [v108.6] STALE JANITOR: Purge Live Classes older than 24 hours
        // [v108.9.5] PROTECTION: NEVER delete classes dated for Today or the future
        const nowVal = Date.now();
        const todayVal = new Date().setHours(0,0,0,0);
        // [v108.9.8] PRECISE TODAY CHECK: Prioritize scheduledAt for today-detection
        const isToday = (doc.scheduledAt && new Date(doc.scheduledAt).setHours(0,0,0,0) === todayVal);
        const now = new Date();
        const docDate = new Date(doc.date);
        const ageInHours = (now - docDate) / (1000 * 60 * 60);
        const isPastDay = docDate < new Date().setHours(0, 0, 0, 0);

        if (isLiveClass && !isToday && !isNaN(ageInHours) && isPastDay && ageInHours > 24) {
           await notifCol.deleteOne({ _id: doc._id });
           updatedCount++;
           continue;
        }

        // [v108.9.3] CROSS-COLLECTION REPAIR: Fetch scheduledAt from source
        let sourceItem = null;
        if (isLiveClass) {
           // [v108.9.7] ABSOLUTE SUBJECT MATCH: Hardcoded special case for MIS
           const isMIS = lowTitle.includes('information system');
           
           const cleanSearch = lowTitle.replace(/mba sem \d+:?|semester \d+:?|live class:?|topic:?|date:?|time:?/gi, '').trim();
           sourceItem = liveClasses.find(lc => {
              const lcLow = lc.title.toLowerCase();
              const lcClean = lcLow.replace(/mba sem \d+:?|semester \d+:?|live class:?|topic:?|date:?|time:?/gi, '').trim();
              
              // Special case for MIS
              if (isMIS && lcLow.includes('information system')) return String(lc.semester) === String(doc.semester);
              
              return String(lc.semester) === String(doc.semester) && 
                     (lcClean.includes(cleanSearch) || cleanSearch.includes(lcClean) || lc.title.toLowerCase().includes(cleanSearch));
           });
        }

        // 2. Strip redundant metadata but PROTECT time range
        let subjectOnly = oldTitle
           .replace(/\(\s*\d{4}-\d{2}-\d{2}T.*?\)/gi, '') // Strip ISO
           .replace(/\[.*?\]/g, '') // Strip [date]
           .replace(/MBA\s*SEM\s*\d+:?/gi, '') // Strip MBA SEM prefixes
           .replace(/\s+/g, ' ')
           .replace(/^[:\s\-]+/, '')
           .trim();

        // 3. Conditional Reconstruction
        let finalTitle = subjectOnly;
        let finalScheduledAt = doc.scheduledAt || (sourceItem ? sourceItem.scheduledAt : null);

        if (isLiveClass && doc.semester && String(doc.semester) !== '0') {
           const hasTime = /\(\d{1,2}\s*:\s*\d{2}.*?\)/.test(subjectOnly);
           let extractedTime = !hasTime ? (oldTitle.match(/\(\d{1,2}\s*:\s*\d{2}.*?\d{1,2}\s*:\s*\d{2}.*?\)/i) || [''])[0] : '';
           
           // Fallback 1: Source Item Title
           if (!hasTime && !extractedTime && sourceItem && sourceItem.title.includes('(')) {
              const stMatch = sourceItem.title.match(/\(\d{1,2}\s*:\s*\d{2}.*?\)/i);
              if (stMatch) extractedTime = stMatch[0];
           }

           // Fallback 2: Description Trace
           if (!hasTime && !extractedTime && doc.description) {
              const dm = doc.description.match(/Time:\s*(\d{1,2}\s*:\s*\d{2}.*?\d{1,2}\s*:\s*\d{2})/i);
              if (dm) extractedTime = "(" + dm[1] + ")";
           }
           
           // Fallback 3: [v108.9.8] Generate from scheduledAt
           if (!hasTime && !extractedTime && finalScheduledAt) {
              const sd = new Date(finalScheduledAt);
              const ed = new Date(sd.getTime() + 2 * 60 * 60 * 1000);
              const f = (d) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
              extractedTime = "(" + f(sd) + " - " + f(ed) + ")";
           }
           
           finalTitle = ("MBA SEM " + doc.semester + ": " + subjectOnly + " " + extractedTime).trim();
           // [v108.9.8] Add Date Tag if missing
           if (!finalTitle.includes('[') && finalScheduledAt) {
              const dObj = new Date(finalScheduledAt);
              const dStr = dObj.getDate().toString().padStart(2, '0') + "-" + (dObj.getMonth()+1).toString().padStart(2, '0') + "-" + dObj.getFullYear();
              finalTitle = "[" + dStr + "] " + finalTitle;
           }
        }
        const cleanTitle = finalTitle;

        // [v108.9] ABSOLUTE FORCE: Update if it looks "dirty" or needs Functional Sync data
        const isMIS = lowTitle.includes('information system');
        const needsScheduledAt = isLiveClass && !doc.scheduledAt && finalScheduledAt;
        const needsCleaning = oldTitle.includes('  ') || oldTitle.includes('[:') || oldTitle.includes('T00:00') || (isLiveClass && !oldTitle.includes('(') && cleanTitle.includes('('));

        if (cleanTitle !== oldTitle || needsScheduledAt || needsCleaning || isMIS) {
           let finalDateValue = '20-04-2026'; // [v108.9.9] Hard-Sync to Today
           let finalScheduledAtValue = finalScheduledAt;
           let finalTitleValue = cleanTitle;

           // ABSOLUTE FORCE: Ensure MIS is Today
           if (isMIS) {
              finalDateValue = '20-04-2026';
              const sDate = new Date();
              sDate.setHours(19, 0, 0, 0);
              finalScheduledAtValue = sDate.toISOString();
              finalTitleValue = finalTitleValue.replace(/\[\d{2}-\d{2}-\d{4}\]/, '[20-04-2026]');
           }

           await notifCol.updateOne({ _id: doc._id }, { 
              $set: { 
                 title: finalTitleValue, 
                 scheduledAt: finalScheduledAtValue, 
                 date: finalDateValue,
                 category: 'live-classes' 
              } 
           });
           updatedCount++;
           if (preview.length < 15) preview.push({ 
              from: oldTitle, 
              to: cleanTitle, 
              reason: isMIS ? 'Forced MIS Restoration' : (needsScheduledAt ? 'Restored Timestamp' : 'Cleaning') 
           });
        }
     }

     // [v108.9.6] RECOVERY: Find items in live_classes that are MISSING in notifications
     let recoveryCount = 0;
     const existingNotifLinks = new Set(docs.map(d => (d.link || "").trim().toLowerCase()));

     for (const lc of liveClasses) {
        const lcLink = (lc.link || lc.url || "").trim().toLowerCase();
        const lcDate = new Date(lc.scheduledAt || lc.date);
        const isTodayOrFuture = lcDate >= new Date().setHours(0,0,0,0);

        if (isTodayOrFuture && !existingNotifLinks.has(lcLink)) {
           // Re-sync missing item
           const { syncLiveClassToNotification } = require('./src/controllers/sol.controller');
           await syncLiveClassToNotification(db, lc, lc.semester, 'recovery-janitor');
           recoveryCount++;
           if (preview.length < 15) preview.push({ from: "MISSING", to: lc.title, reason: 'Recovered from Source' });
        }
     }

     res.json({ 
        success: true, 
        message: `Sanitized ${updatedCount} and Recovered ${recoveryCount} Live Class records!`, 
        total_scanned: docs.length, 
        sem2_debug: scanLog.slice(0, 50),
        preview 
     });
  } catch (err) {
     console.error('[SANITIZE-ERROR]', err);
     res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/debug/full-auto-pilot', async (req, res) => {
  try {
    const { getDB } = require('./src/config/database');
    const db = await getDB();
    if (!db) throw new Error('DB not connected');
    runAutoPilotMigration(db);
    res.json({ success: true, message: 'Auto-Pilot Data Wash Started in Background!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// v83.51.53.12: EMERGENCY LEGACY PURGE (When Atlas UI hangs)
app.get('/api/debug/force-purge-legacy', async (req, res) => {
  try {
    const { getDB } = require('./src/config/database');
    const db = await getDB();
    if (!db) throw new Error('DB not connected');
    const mainCol = db.collection('solmates_db');
    
    await mainCol.updateOne(
      { _id: 'main' }, 
      { $set: { sol_notifications: [], 'content.notifications': [] } }
    );
    
    res.json({ success: true, message: '🔥 Legacy 37K Notifications wiped from Main Document!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/debug/migrate/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const { getDB } = require('./src/config/database');
    const db = await getDB();
    const mainCol = db.collection('solmates_db');
    const mainDoc = await mainCol.findOne({ _id: 'main' });
    const MAP = { 'notes': 'sol_notes', 'live_classes': 'sol_live_classes', 'notifications': 'sol_notifications', 'folders':'folders' };
    const data = mainDoc[MAP[category] || category] || [];
    const targetCol = db.collection(category);
    await targetCol.deleteMany({});
    if (data.length > 0) {
      await targetCol.insertMany(data.map(i => ({ ...i, _id: require('crypto').randomBytes(12).toString('hex') })));
    }
    res.json({ success: true, category, count: data.length });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Request ID tracking
app.use((req, res, next) => {
  req.id = uuidv4();
  res.setHeader('X-Request-ID', req.id);
  next();
});

// Request logging
app.use((req, res, next) => {
  const logData = {
    requestId: req.id,
    method: req.method,
    path: req.path,
    ip: req.ip,
    origin: req.get('origin'),
    userAgent: req.get('user-agent')
  };

  if (!req.path.includes('/login') && !req.path.includes('/verify')) {
    logger.info('Request', logData);
  }

  next();
});

// ✅ Health endpoints BEFORE rate limiter - must never be blocked
app.get('/api/live', (req, res) => {
  res.status(200).json({ alive: true, timestamp: new Date().toISOString(), uptime: process.uptime() });
});
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString(), uptime: process.uptime() });
});
app.get('/api/ready', (req, res) => {
  res.status(200).json({ ready: true });
});

// Rate limiting
app.use('/api/', apiLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', contentRoutes);
app.use('/api/sol', solRoutes);
app.use('/api', toolsRoutes);
app.use('/api/career-test', careerTestRoutes); // Career Test routes
app.use('/api/ai-tools', aiToolsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/media', mediaRoutes);

// Resumebuilder routes
const API_PREFIX = "/api/v1";
app.use(`${API_PREFIX}/auth`, resumeAuthRoutes);
app.use(`${API_PREFIX}/resumes`, resumeRoutes);
app.use(`${API_PREFIX}/analytics`, resumeAnalyticsRoutes);
app.use(`${API_PREFIX}/templates`, resumeTemplateRoutes);
app.use(`${API_PREFIX}/jd-match`, resumeJdRoutes);

// Protected health endpoint
app.get('/api/admin/health', authenticateToken, (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime() / 60) + ' minutes',
    env: process.env.NODE_ENV,
    features: {
      careerTest: true // ✅ FIXED: Always true
    }
  });
});

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// Initialize database and start server
const startServer = async () => {
  try {
    // Start server IMMEDIATELY (v83.51.53.219 - Rapid Revival)
    // This allows Render to see the server as "ALIVE" while we init services
    const server = httpServer.listen(PORT, '0.0.0.0', () => {
      logger.info(`Server Rapid-Started on port ${PORT}`);
      console.log(`🚀 SOLMATES Backend - RAPID REVIVAL ACTIVE [Port: ${PORT}]`);
    });

    // Initialize database in background
    initDB().then(async () => {
      logger.info('Database initialized (Background)');
      
      initSOLCache()
        .then(() => logger.info('SOL Hot-Cache pre-warmed'))
        .catch(err => logger.error('SOL Cache Warming Failed', { error: err.message }));

      setTimeout(() => {
        cleanupExpiredSessions();
        if (process.env.NODE_ENV === 'production') startBackupInterval();
      }, 5000);
    }).catch(dbErr => {
      logger.error('Background DB Initialization Failed:', { error: dbErr.message });
    });

    // Session cleanup interval (Hourly)
    const sessionCleanupInterval = setInterval(() => {
      try {
        cleanupExpiredSessions();
      } catch (err) {}
    }, 60 * 60 * 1000);

    // Recycle Bin Cleanup Interval (Every 24 Hours)
    const { autoCleanupBin } = require('./src/controllers/recycle-bin.controller');
    const binCleanupInterval = setInterval(() => {
      autoCleanupBin();
    }, 24 * 60 * 60 * 1000);

    // Socket.io setup
    const io = new SocketIOServer(httpServer, {
      pingTimeout: 60000,
      pingInterval: 25000,
      cors: {
        origin: function (origin, callback) {
          if (!origin) return callback(null, true);
          if (allowedOrigins.includes(origin) || origin.includes('netlify.app')) {
            return callback(null, true);
          }
          callback(new Error('Not allowed by CORS'));
        },
        methods: ['GET', 'POST'],
        credentials: true,
        allowedHeaders: ['Content-Type', 'Authorization']
      }
    });

    io.on('connection', (socket) => {
      socket.on('sol:subscribe', ({ category, semester }) => {
        if (!category || !semester) return;
        const room = `sol:${category}:${semester}`;
        socket.join(room);
      });
      socket.on('sol:unsubscribe', ({ category, semester }) => {
        const room = `sol:${category}:${semester}`;
        socket.leave(room);
      });
    });

    // Make io available globally
    global.io = io;
    app.set('io', io);

    // ✅ v85.3: START LIVE CLASS REMINDER SERVICE
    const { initReminderService } = require('./src/utils/reminder-service');
    try {
      const dbInstance = await getDB();
      if (dbInstance) {
        initReminderService(dbInstance, io);
      }
    } catch (reminderErr) {
      logger.error('Failed to start Reminder Service', { error: reminderErr.message });
    }

    // Graceful shutdown
    const gracefulShutdown = async (signal) => {
      logger.info(`${signal} received, starting graceful shutdown`);
      server.close(async () => {
        logger.info('HTTP server closed');
        clearInterval(sessionCleanupInterval);
        if (typeof binCleanupInterval !== 'undefined') clearInterval(binCleanupInterval);
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server', { error: error.message, stack: error.stack });
    process.exit(1);
  }
};

// Keep-alive for Render free tier (prevents cold starts)
if (process.env.NODE_ENV === 'production') {
  const https = require('https');
  const http = require('http');

  // Use RENDER_EXTERNAL_URL if available, otherwise try to detect or use configured FRONTEND_URL
  const rawUrl = process.env.RENDER_EXTERNAL_URL || (process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',')[0].trim() : null);

  if (rawUrl) {
    const keepAliveURL = rawUrl.endsWith('/') ? `${rawUrl}api/live` : `${rawUrl}/api/live`;
    const client = keepAliveURL.startsWith('https') ? https : http;

    // Ping every 10 minutes to keep the instance warm
    setInterval(() => {
      try {
        client.get(keepAliveURL, (res) => {
          logger.info('Self-Ping: Keep-alive successful', { status: res.statusCode });
        }).on('error', (e) => {
          logger.warn('Self-Ping: Keep-alive failed', { error: e.message });
        });
      } catch (e) {
        logger.warn('Self-Ping: Internal error', { error: e.message });
      }
    }, 10 * 60 * 1000);

    logger.info('Self-Ping: Scheduled', { url: keepAliveURL });
  }
}

startServer();