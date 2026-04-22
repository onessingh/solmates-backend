/**
 * SOL Database Controller
 * Handles GET and PUT per category + semester.
 * Schema validation is per-category (not uniform).
 * Emits Socket.io events after every successful update.
 */

const crypto = require('crypto');
const logger = require('../utils/logger');
const { readDB, transactDB } = require('../config/database');
const { VALID_CATEGORIES, VALID_SEMESTERS, validateContent } = require('../models/sol.schemas');
const notificationController = require('./notification.controller');
const { scrapeYouTubePlaylist } = require('../utils/yt-scraper');

// ── HOT CACHE: Store bulk public content in memory to avoid Atlas latency ─────
let PUBLIC_CONTENT_CACHE = null;
let CACHE_EXPIRY = 0;
let pendingBuildPromise = null;
const CACHE_TTL = 10 * 1000; // 10 seconds

function invalidatePublicCache() {
  PUBLIC_CONTENT_CACHE = null;
  CACHE_EXPIRY = 0;
  pendingBuildPromise = null;
  // logger.debug('SOL Hot Cache invalidated');
}

// ── Helper: Extract Date from Timetable Title (v76.8) ──────────────────────────
// ── Helper: Extract Date from Timetable Title (v83.6 - Multi-Format Parser) ──────────────────
// ── Helper: Extract Date from Timetable Title (v83.23 - Advanced Range Parser) ──────────
function getExpiryDateFromTitle(title) {
  if (!title) return null;
  const t = title.toLowerCase();
  const monthsMap = {
    'january': 1, 'february': 2, 'march': 3, 'april': 4, 'may': 5, 'june': 6, 
    'july': 7, 'august': 8, 'september': 9, 'october': 10, 'november': 11, 'december': 12,
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6, 
    'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12
  };
  
  let latestDate = null;
  const currentYear = new Date().getFullYear();

  // Pattern 1: DD.MM.YYYY or DD-MM-YYYY or DD/MM/YYYY
  const numericRegex = /(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})/g;
  let numMatch;
  while ((numMatch = numericRegex.exec(t)) !== null) {
      let [_, dd, mm, yyyy] = numMatch;
      if (yyyy.length === 2) yyyy = '20' + yyyy;
      const d = new Date(`${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T23:59:59`);
      if (!isNaN(d.getTime())) {
          if (!latestDate || d > latestDate) latestDate = d;
      }
  }

  // Pattern 2: 12 April or April 12th
  // v84.3: Added "to" range support (e.g., 13 to 18 April)
  const monthNames = Object.keys(monthsMap);
  const textRegex1 = new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of|to)?\\s*(\\d{1,2})?(?:st|nd|rd|th)?\\s*(${monthNames.join('|')})`, 'gi');
  const textRegex2 = new RegExp(`(${monthNames.join('|')})\\s*(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*(?:to|and)\\s*(\\d{1,2})(?:st|nd|rd|th)?)?`, 'gi');

  let textMatch;
  while ((textMatch = textRegex1.exec(t)) !== null) {
      // If range like "13 to 18 April", group 2 is "18", group 3 is "April"
      const day = textMatch[2] || textMatch[1]; 
      const month = textMatch[3];
      const d = new Date(`${day} ${month} ${currentYear} 23:59:59`);
      if (!isNaN(d.getTime()) && (!latestDate || d > latestDate)) latestDate = d;
  }
  while ((textMatch = textRegex2.exec(t)) !== null) {
      // If range like "April 13 to 18", group 1 is "April", group 3 is "18"
      const day = textMatch[3] || textMatch[2];
      const month = textMatch[1];
      const d = new Date(`${day} ${month} ${currentYear} 23:59:59`);
      if (!isNaN(d.getTime()) && (!latestDate || d > latestDate)) latestDate = d;
  }

  if (!latestDate) return null;

  // v89.1: IST STANDARDIZATION
  // Force the date to be interpreted as the END of the day in India (IST)
  // 23:59:59 IST is 18:29:59 UTC (5.5 hours earlier)
  const istExpiry = new Date(latestDate.getTime());
  istExpiry.setUTCHours(18, 29, 59, 999);
  return istExpiry;
}

/**
 * Helper: Parse start time from string like "11:00 AM - 1:00 PM"
 * Returns minutes from midnight for the start time.
 */
function parseStartTime(timeStr) {
  if (!timeStr) return 9999;
  try {
    const startPart = timeStr.split('-')[0].trim().toLowerCase();
    const match = startPart.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
    if (!match) return 9999;
    
    let hours = parseInt(match[1]);
    let minutes = parseInt(match[2] || 0);
    const ampm = match[3];

    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;
    
    return hours * 60 + minutes;
  } catch (e) {
    return 9999;
  }
}

/**
 * Helper: Cleanup expired notifications
 * Returns filtered items and deletes expired ones from DB
 */
async function cleanupExpiredNotifications(collection, items, semester) {
  if (!items || items.length === 0) return items;
  
  const now = new Date();
  const expiredIds = [];
  const validItems = [];

  for (const item of items) {
    const expiry = getExpiryDateFromTitle(item.title);
    
    // v89.1: Real-time IST comparison
    // If today is 19th (IST), then 19th 01:23 AM IST is > 18th 23:59:59 IST
    if (expiry && now > expiry) {
      expiredIds.push(item.id);
      logger.info('Auto-deleting expired notification', { id: item.id, title: item.title, expiry: expiry.toISOString() });
    } else {
      validItems.push(item);
    }
  }

  if (expiredIds.length > 0 && collection) {
    try {
      const query = { id: { $in: expiredIds } };
      if (semester) query.semester = String(semester);
      
      await collection.deleteMany(query);
      invalidatePublicCache();
    } catch (err) {
      logger.error('Failed to delete expired notifications', { error: err.message });
    }
  }

  return validItems;
}



/**
 * [v86.4] Clean title by removing internal duplicates (e.g. "Subject SUBJECT")
 */
/**
 * [v88.5] Ultra-aggressive Title Cleaner
 * Removes redundant prefixes, repeated subject names, and duplicate Semester mentions.
 */
function cleanTitle(str) {
  if (!str) return "";
  
  // 1. Initial cleanup: Replace common separators with a standard pipe for splitting
  let t = str.replace(/(?:\s*[();:]\s*)|(?:\s+-\s+)/g, ' | ');
  
  // 2. Split into segments
  const segments = t.split(' | ').map(s => s.trim()).filter(s => s.length > 2);
  
  const result = [];
  for (let seg of segments) {
    const low = seg.toLowerCase();
    
    // Check if this segment is already represented (substring or overlap)
    const isDuplicate = result.some((existing, idx) => {
      const eLow = existing.toLowerCase();
      
      // Exact match or contains
      if (eLow.includes(low) || low.includes(eLow)) {
        // If current segment is more descriptive, swap them
        if (seg.length > existing.length) {
          result[idx] = seg;
        }
        return true;
      }
      return false;
    });

    if (!isDuplicate) {
      result.push(seg);
    }
  }

  // 3. Final String assembly
  let final = result.join(' ').trim();

  // 4. Post-process: Remove specific redundant patterns like "MBA SEM 2 MBA SEM 2"
  // This handles cases where separators were missing
  const semMatch = final.match(/MBA\s+SEM\s+\d/gi);
  if (semMatch && semMatch.length > 1) {
    // Keep only the first occurrence of "MBA SEM X"
    const firstSem = semMatch[0];
    final = final.replace(new RegExp(firstSem, 'gi'), '___SEM___');
    final = final.replace(/___SEM___/i, firstSem); // Restore first
    final = final.replace(/___SEM___/gi, ''); // Remove others
  }

  return final.replace(/\s{2,}/g, ' ').trim();
}


// ── Helper: Resolve Push Notification URL (v88.9 - DEEP LINKING SUPPORT) ───────────────────────────
function resolvePushUrl(category, semester, folderId = null, folderName = null, tab = null) {
  const sem = `semester=${semester}`;
  const cat = `category=${category}`;
  const fid = folderId ? `&folderId=${folderId}` : '';
  const name = folderName ? `&name=${encodeURIComponent(folderName)}` : '';
  const t = tab ? `&tab=${tab}` : '';

  switch (category) {
    case 'live-classes':
      return `/database/classes/classes.html?${sem}`;
    case 'recorded-class':
    case 'notes':
    case 'pyqs':
    case 'oneshot':
    case 'elearning':
    case 'ebooks':
    case 'professor':
      // If we have a folderId, go to folder-content.html (Deep Link)
      if (folderId) {
        return `/database/folder-content.html?${cat}&${sem}${fid}${name}${t}`;
      }
      return `/database/elearning-subjects.html?${sem}&${cat}`;
    case 'youtube':
      if (folderId) {
        return `/database/youtube-content.html?${sem}${fid}${name}`;
      }
      return `/database/youtube-browse.html?${sem}`;
    case 'ai-knowledge':
      return `/database/ai-knowledge.html?${sem}`;
    case 'notifications':
    default:
      return `/notification.html?${sem}`;
  }
}

// ── Helper: DB key for SOL data ───────────────────────────────────────────────
function solKey(category) {
  return `sol_${category.replace(/-/g, '_')}`;
}

// ── GET /api/sol/:category/:semester ─────────────────────────────────────────
async function getSOLContent(req, res, next) {
  try {
    // ✅ [v88.6] NUCLEAR CACHE BUSTING: Force mobile app to fetch fresh data
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const { category, semester } = req.params;
    const { folderId } = req.query;

    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, error: `Invalid category. Valid: ${VALID_CATEGORIES.join(', ')}` });
    }
    if (!VALID_SEMESTERS.includes(semester)) {
      return res.status(400).json({ success: false, error: 'Semester must be 0–4' });
    }

    /* 
       ✅ CACHE BYPASS: Individual folder views now bypass the Hot Cache.
       This ensures that when an admin adds an item, it appears instantly 
       even in Clustered environments, while still allowing readDB() to use 
       its internal 10s short-cache.
    */

    // v83.51.53.31: RESTORED FOLDER FILTER LOGIC
    const targetFolderId = (req.query.folderId === undefined) 
      ? null 
      : ((req.query.folderId === 'all') ? 'all' : ((req.query.folderId === '' || req.query.folderId === 'null') ? null : req.query.folderId));

    // v83.51.53.2: HIGH-PERFORMANCE DISTRIBUTED QUERY (For Render Stability)
    const { getDB, COLLECTIONS } = require('../config/database');
    const dbInstance = await getDB();
    const collectionName = COLLECTIONS[category] || category;
    
    // Pagination params
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 200;
    const skip = (page - 1) * limit;

    let filteredItems = [];
    if (dbInstance && COLLECTIONS[category]) {
      // ✅ [v83.51.53.153] SMART-SEMESTER: Match specific sem OR 'all' (distributed items fallback)
      const query = { 
        semester: { $in: [semester, String(semester), parseInt(semester), 'all'] }
      };
      if (targetFolderId && targetFolderId !== 'all') query.folderId = targetFolderId;
      else if (targetFolderId === null) query.folderId = { $in: [null, undefined, ''] };

      filteredItems = await dbInstance.collection(collectionName).aggregate([
        { $match: query },
        { $addFields: {
            sortOrder: { $ifNull: ["$order", 999999] }
        } },
        { $sort: { sortOrder: 1, created_at: -1, date: -1 } },
        { $skip: skip },
        { $limit: limit }
      ]).toArray();

      // ✅ [v84.1] AUTO-CLEANUP: Notifications that are expired
      if (category === 'notifications') {
        filteredItems = await cleanupExpiredNotifications(dbInstance.collection(collectionName), filteredItems, semester);
      }

      // ✅ [v84.2] SMART-SORT: Live Classes (Today's first, then by time)
      if (category === 'live-classes') {
        const todayStr = new Date().toLocaleDateString('en-GB').replace(/\//g, '-'); // DD-MM-YYYY
        
        filteredItems.sort((a, b) => {
          const isAToday = a.date === todayStr;
          const isBToday = b.date === todayStr;
          
          if (isAToday && !isBToday) return -1;
          if (!isAToday && isBToday) return 1;
          
          if (isAToday && isBToday) {
            // Both today, sort by start time
            const timeA = parseStartTime(a.scheduledAt);
            const timeB = parseStartTime(b.scheduledAt);
            return timeA - timeB;
          }
          
          // Neither today, keep default sort (already handled by MongoDB sort created_at: -1)
          return 0;
        });
      }
    } else {
      // ⚠️ Latency Fallback (Only for small legacy buckets)
      const db = await readDB();
      const key = solKey(category);
      const items = db[key] || [];

      filteredItems = items.filter(item => {
        const semMatch = String(item.semester).trim() === String(semester).trim();
        if (!semMatch) return false;
        if (targetFolderId === 'all') return true;
        return (item.folderId || null) === targetFolderId;
      });
    }

    // Strip internal fields
    const sanitized = filteredItems.map(({ created_by, updated_by, ...rest }) => rest);

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    return res.json({
      success: true,
      category,
      semester,
      page,
      limit,
      count: sanitized.length,
      data: sanitized
    });
  } catch (err) {
    if (err.statusCode === 403) {
      return res.status(403).json({ success: false, error: err.message });
    }
    logger.error('SOL getContent error', { error: err.message });
    next(err);
  }
}

// ── POST /api/sol/:category/:semester (admin: add item) ───────────────────────
async function addSOLItem(req, res, next) {
  try {
    const { category, semester } = req.params;

    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, error: `Invalid category` });
    }
    if (!VALID_SEMESTERS.includes(semester)) {
      return res.status(400).json({ success: false, error: 'Semester must be 0–4' });
    }

    // Per-category validation
    const { error, value } = validateContent(category, req.body);
    if (error) {
      return res.status(422).json({
        success: false,
        error: 'Validation failed',
        details: error.details ? error.details.map(d => d.message) : [error.message]
      });
    }

    const newItem = {
      id: crypto.randomBytes(16).toString('hex'),
      ...value,
      semester,
      created_at: new Date().toISOString(),
      created_by: req.admin.adminId
    };

    const { getDB, COLLECTIONS } = require('../config/database');
    const dbInstance = await getDB();
    const targetColName = COLLECTIONS[category] || category;

    if (!dbInstance || !COLLECTIONS[category]) {
      throw new Error('This category is not yet optimized for decentralized storage');
    }

    await dbInstance.collection(targetColName).insertOne(newItem);
    invalidatePublicCache();

    logger.info('SOL item added', { category, semester, id: newItem.id, admin: req.admin.adminId });

    // Emit real-time event (Socket.io)
    const io = req.app.get('io') || global.io;
    if (io) {
      io.to(`sol:${category}:${semester}`).emit('sol:updated', {
        action: 'add',
        category,
        semester,
        item: newItem
      });
      io.emit('content:updated', { type: (category === 'live-classes' ? 'classes' : (category === 'pyqs' ? 'pyq' : category)), action: 'add', id: newItem.id, timestamp: Date.now() });
    }

    // [v104.6] BI-DIRECTIONAL AUTO-MIRRORING (Live Classes <-> Notifications)
    try {
      if (category === 'live-classes') {
        logger.info('[SYNC] Auto-mirroring Live Class to Notifications...', { id: newItem.id });
        await syncLiveClassToNotification(dbInstance, newItem, semester, req.admin.adminId);
      } else if (category === 'notifications') {
        logger.info('[SYNC] Auto-mirroring Notification to Live Classes...', { id: newItem.id });
        await syncNotificationToLiveClass(dbInstance, newItem, semester, req.admin.adminId);
      }
    } catch (syncErr) {
      logger.error('Auto-mirroring failed', { error: syncErr.message });
      // Don't fail the primary request
    }

    // [v84.5] Privacy & Context Check: Detect Folder status and Name for deep linking
    let isLocked = false;
    let parentFolderName = null;
    try {
      if (newItem.folderId) {
        const folderCol = dbInstance.collection(COLLECTIONS.folders || 'folders');
        const parentFolder = await folderCol.findOne({ id: newItem.folderId });
        
        if (parentFolder) {
          parentFolderName = parentFolder.name;
          const allCategoryFolders = await folderCol.find({ 
            category, 
            semester: { $in: [String(semester), 'all'] } 
          }).toArray();
          isLocked = processFolderLock(newItem.folderId, allCategoryFolders);
        }
      }
    } catch (lockErr) {
      logger.error('Folder context check failed', { error: lockErr.message });
    }

    // [v88.9] TRIGGER WEB PUSH for manually added item (Only if NOT locked and NOT ebooks)
    if (!isLocked && category !== 'ebooks') {
      try {
        const pushTitle = `New ${category.toUpperCase()} Update`;
        const itemTitle = newItem.title || newItem.subject || 'New content added!';
        // Check if item is in "Other Books" tab
        const tab = (itemTitle.includes('[OTHER]') || (newItem.folderId && (await dbInstance.collection(COLLECTIONS.folders || 'folders').findOne({ id: newItem.folderId, name: /\[OTHER\]/i })))) ? 'other' : 'sol';
        
        const pushBody = itemTitle.replace('[OTHER]', '').trim();
        const pushUrl = resolvePushUrl(category, semester, newItem.folderId, parentFolderName, tab);
        
        // Correctly pass the 4th argument (semester) for precise targeting
        notificationController.sendBroadcast(pushTitle, pushBody, pushUrl, semester);
      } catch (pushErr) {
        logger.error('Push trigger failed (Manual Add)', { error: pushErr.message });
      }
    } else {
      logger.info('Notification skipped: Item added to a LOCKED folder hierarchy', { itemId: newItem.id });
    }

    return res.status(201).json(resJson);
  } catch (err) {
    logger.error('SOL addItem error', { error: err.message });
    err.status = err.statusCode || 500;
    next(err);
  }
}

// ── PUT /api/sol/:category/:semester/:id (admin: update item) ─────────────────
async function updateSOLItem(req, res, next) {
  try {
    const { category, semester, id } = req.params;
    const { error, value } = validateContent(category, req.body);
    if (error) {
      return res.status(422).json({ success: false, error: 'Validation failed' });
    }

    const { getDB, COLLECTIONS } = require('../config/database');
    const dbInstance = await getDB();
    const targetColName = COLLECTIONS[category] || category;

    if (!dbInstance || !COLLECTIONS[category]) {
      throw new Error('Category not optimized');
    }

    const result = await dbInstance.collection(targetColName).findOneAndUpdate(
      { id, semester: String(semester) },
      { $set: { ...value, updated_at: new Date().toISOString(), updated_by: req.admin.adminId } },
      { returnDocument: 'after' }
    );

    const updatedItem = result.value || result;
    if (!updatedItem) return res.status(404).json({ success: false, error: 'Item not found' });

    invalidatePublicCache();

    const io = req.app.get('io') || global.io;
    if (io) {
      io.to(`sol:${category}:${semester}`).emit('sol:updated', { action: 'update', category, semester, item: updatedItem });
    }

    return res.json({ success: true, data: updatedItem });
  } catch (err) {
    next(err);
  }
}

// ── DELETE /api/sol/:category/:semester/:id (admin) ───────────────────────────
async function deleteSOLItem(req, res, next) {
  try {
    const { category, semester, id } = req.params;
    const { getDB, COLLECTIONS } = require('../config/database');
    const dbInstance = await getDB();
    const targetColName = COLLECTIONS[category] || category;

    if (!dbInstance || !COLLECTIONS[category]) throw new Error('Category not optimized');

    // 1. Fetch item to handle Blacklist and Recycle Bin before deletion
    const targetItem = await dbInstance.collection(targetColName).findOne({ id, semester: String(semester) });
    if (!targetItem) return res.status(404).json({ success: false, error: 'Item not found in collections' });

    // ✅ v85.0: SOFT DELETE — Move to Recycle Bin
    await dbInstance.collection('recycle_bin').insertOne({
        id: targetItem.id,
        category,
        semester: String(semester),
        type: 'item',
        originalCollection: targetColName,
        data: targetItem,
        deletedAt: new Date().toISOString()
    });

    // 2. Delete from original collection
    await dbInstance.collection(targetColName).deleteOne({ id, semester: String(semester) });

    // 3. Decentralized Blacklist (Permanent Deletion SHIELD)
    if (['notifications', 'live-classes'].includes(category)) {
      const url = targetItem.link || targetItem.pdf || targetItem.url;
      const title = (targetItem.title || "").trim();
      const blacklistCol = dbInstance.collection('blacklists');

      // ID Shield
      if (id) {
          await blacklistCol.updateOne({ id }, { $set: { id, title: title.toLowerCase(), link: url, category, type: 'manual_delete', deleted_at: new Date().toISOString() } }, { upsert: true });
      }
      
      // Title Shield
      if (title) {
          const titleId = 'title_' + Buffer.from(title.toLowerCase()).toString('hex').substring(0, 16);
          await blacklistCol.updateOne({ title: title.toLowerCase() }, { $set: { id: titleId, title: title.toLowerCase(), link: url, category, type: 'title_blacklist', deleted_at: new Date().toISOString() } }, { upsert: true });
      }

      // Universal Link Shield (The most robust defense)
      if (url && url.length > 5) {
          const cleanUrl = url.trim().toLowerCase().split('?')[0]; // Strip tracking params
          const urlId = 'url_' + crypto.createHash('md5').update(cleanUrl).digest('hex').substring(0, 16);
          await blacklistCol.updateOne(
              { link: cleanUrl }, 
              { $set: { id: urlId, link: cleanUrl, title: title.toLowerCase(), category, type: 'universal_link_shield', deleted_at: new Date().toISOString() } }, 
              { upsert: true }
          );
      }
    }

    invalidatePublicCache();

    // Emit real-time event
    const io = req.app.get('io') || global.io;
    if (io) {
      io.to(`sol:${category}:${semester}`).emit('sol:updated', { action: 'delete', category, semester, id });
      io.emit('content:updated', { type: category === 'live-classes' ? 'classes' : category, action: 'delete', id, timestamp: Date.now() });
    }

    return res.json({ success: true, message: 'Item deleted and blacklisted' });
  } catch (err) {
    logger.error('SOL deleteItem error', { error: err.message });
    next(err);
  }
}

// ── PUT /api/sol/:category/:semester/:id/reorder (admin: reorder item) ─────────
async function reorderSOLItem(req, res, next) {
  try {
    const { category, semester, id } = req.params;
    const { direction } = req.body; // 'up' or 'down'

    const { getDB, COLLECTIONS } = require('../config/database');
    const dbInstance = await getDB();
    const targetColName = COLLECTIONS[category] || category;

    if (!dbInstance || !COLLECTIONS[category]) throw new Error('Category not optimized');

    // 1. Get Current Item
    const currentItem = await dbInstance.collection(targetColName).findOne({ id, semester: String(semester) });
    if (!currentItem) return res.status(404).json({ success: false, error: 'Item not found' });

    const folderId = currentItem.folderId || null;

    // 2. Find All Items in the same context to find neighbor
    const contextItems = await dbInstance.collection(targetColName)
      .find({ semester: String(semester), folderId: folderId })
      .sort({ created_at: -1, date: -1 })
      .toArray();

    const inContextIdx = contextItems.findIndex(item => item.id === id);
    let swapTarget = null;

    if (direction === 'up' && inContextIdx > 0) {
      swapTarget = contextItems[inContextIdx - 1];
    } else if (direction === 'down' && inContextIdx < contextItems.length - 1) {
      swapTarget = contextItems[inContextIdx + 1];
    }

    if (swapTarget) {
      // ✅ SWAP TIMESTAMPS: Most robust way to reorder without an explicit 'order' field
      const currentTs = currentItem.created_at;
      const targetTs = swapTarget.created_at;

      await Promise.all([
        dbInstance.collection(targetColName).updateOne({ _id: currentItem._id }, { $set: { created_at: targetTs } }),
        dbInstance.collection(targetColName).updateOne({ _id: swapTarget._id }, { $set: { created_at: currentTs } })
      ]);
    }

    invalidatePublicCache();

    // Emit real-time event
    const io = req.app.get('io') || global.io;
    if (io) {
      io.to(`sol:${category}:${semester}`).emit('sol:updated', { action: 'reorder', category, semester, id });
    }

    return res.json({ success: true, message: `Item moved ${direction}` });
  } catch (err) {
    logger.error('SOL reorderItem error', { error: err.message });
    next(err);
  }
}



async function reorderBulkSOL(req, res, next) {
  try {
    const { items, type, semester } = req.body; 
    
    // Diagnostic logging to help debug "Failed to save order"
    logger.info(`SOL Bulk Reorder Request: type=${type}, items_count=${items ? items.length : 0}, sem=${semester}`, { 
      category: type, 
      admin: req.admin ? (req.admin.adminId || req.admin.id) : 'unknown' 
    });

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ success: false, error: 'Array of item IDs required' });
    }

    const { getDB, COLLECTIONS } = require('../config/database');
    const dbInstance = await getDB();
    if (!dbInstance) throw new Error('Database connection failed');

    // Mapping fallback: if type is NOT in COLLECTIONS, use type itself (safe for most)
    const collectionName = (type === 'folder') ? (COLLECTIONS.folders || 'folders') : (COLLECTIONS[type] || type);
    const adminId = req.admin ? (req.admin.adminId || req.admin.id || 'system') : 'system';

    // [v88.9.x] Persistence Hardening: Support both 'id' and '_id' fallbacks
    const ops = items.map((item, index) => {
      // Handle both flat ID strings and {id, order} objects for mixed-view absolute ordering
      const itemId = typeof item === 'object' ? item.id : item;
      const explicitOrder = typeof item === 'object' ? item.order : index;

      if (!itemId) return null;
      
      const updateData = {
        $set: { 
          order: explicitOrder, 
          updated_at: new Date().toISOString(), 
          updated_by: adminId 
        }
      };

      // [v88.9.x] Persistence Hardening: Support string, number, and ObjectId types
      const idStr = String(itemId);
      const orConditions = [{ id: idStr }];
      
      // If it looks like a number, try matching as a Number too (for legacy data)
      if (/^\d+$/.test(idStr)) {
        orConditions.push({ id: parseInt(idStr) });
      }

      // If it looks like a MongoDB ObjectId (24 hex chars)
      if (/^[0-9a-fA-F]{24}$/.test(idStr)) {
        try {
          const { ObjectId } = require('mongodb');
          orConditions.push({ _id: new ObjectId(idStr) });
        } catch (e) {}
      }

      // Final Filter: match ANY of the identified ID formats
      const filter = { $or: orConditions };

      return {
        updateOne: {
          filter,
          update: updateData
        }
      };
    }).filter(Boolean);

    if (ops.length > 0) {
      await dbInstance.collection(collectionName).bulkWrite(ops, { ordered: false });
    }
    invalidatePublicCache();

    // Notify clients in the specific category/semester room
    const io = req.app.get('io') || global.io;
    if (io && items.length > 0) {
      const room = `sol:${type === 'folder' ? 'folders' : type}:${semester || 'all'}`;
      io.to(room).emit('sol:updated', { 
        action: 'reorder', 
        type, 
        count: items.length,
        category: type,
        semester: semester || 'all'
      });
      
      // Global fallback for bulk reorder if namespacing fails
      io.emit('sol:bulk_reordered', { type, count: items.length });
    }

    return res.json({ success: true, message: `Reordered ${items.length} items successfully` });
  } catch (err) {
    logger.error('SOL reorderBulk error', { 
      error: err.message, 
      type: req.body ? req.body.type : 'unknown',
      itemCount: req.body && req.body.items ? req.body.items.length : 0,
      stack: err.stack 
    });
    return res.status(500).json({ 
      success: false, 
      error: `Save failed: ${err.message}`,
      diagnostic: 'Please report this error to support.'
    });
  }
}

async function reorderSOLFolder(req, res, next) {
  // Legacy Up/Down arrows fix: Updated to work with MongoDB and 'order' field
  try {
    const { id } = req.params;
    const { direction } = req.body;

    const { getDB, COLLECTIONS } = require('../config/database');
    const dbInstance = await getDB();
    const folderCol = dbInstance ? dbInstance.collection(COLLECTIONS.folders || 'folders') : null;
    if (!folderCol) throw new Error('Database connection failed');

    const folder = await folderCol.findOne({ id });
    if (!folder) return res.status(404).json({ success: false, error: 'Folder not found' });

    // Fetch context siblings sorted by order
    const siblings = await folderCol.find({ 
      category: folder.category, 
      semester: folder.semester, 
      parentId: folder.parentId 
    }).sort({ order: 1, created_at: 1 }).toArray();

    const idx = siblings.findIndex(f => f.id === id);
    let swapTarget = null;

    if (direction === 'up' && idx > 0) swapTarget = siblings[idx - 1];
    else if (direction === 'down' && idx < siblings.length - 1) swapTarget = siblings[idx + 1];

    if (swapTarget) {
      // Ensure both have order values
      const currentOrder = folder.order ?? idx;
      const targetOrder = swapTarget.order ?? (direction === 'up' ? idx - 1 : idx + 1);

      await Promise.all([
        folderCol.updateOne({ id: folder.id }, { $set: { order: targetOrder } }),
        folderCol.updateOne({ id: swapTarget.id }, { $set: { order: currentOrder } })
      ]);
    }

    invalidatePublicCache();
    return res.json({ success: true, message: `Folder moved ${direction}` });
  } catch (err) {
    logger.error('SOL reorderFolder error', { error: err.message });
    next(err);
  }
}

// ── FOLDER METHODS ──────────────────────────────────────────────────────────

// Helper: Traverses tree up to check if any parent (or self) is locked
function processFolderLock(folderId, folders) {
  let curr = folderId;
  while (curr) {
    const f = folders.find(fd => fd.id === curr);
    if (!f) break;
    if (f.isLocked) return true;
    curr = f.parentId;
    if (curr === f.id) break; // prevent infinite loops maliciously
  }
  return false;
}

async function getSOLFolders(req, res, next) {
  try {
    const { category, semester } = req.params;
    const parentId = req.query.parentId || null;
    const targetParentId = (parentId === undefined || parentId === '' || parentId === 'null') ? null : parentId;

    const { getDB, COLLECTIONS } = require('../config/database');
    const dbInstance = await getDB();
    const folderCol = dbInstance ? dbInstance.collection(COLLECTIONS.folders || 'folders') : null;

    if (!folderCol) {
      return res.status(500).json({ success: false, error: 'Database connection failed' });
    }

    // 1. Fetch all folders for this category (to process lock hierarchy)
    // ✅ [v83.51.53.159] SMART-SEMESTER: Match specific sem OR 'all'
    // [v88.9] Updated sorting to respect manual 'order'
    const allCategoryFolders = await folderCol.aggregate([
      { $match: { 
        category, 
        semester: { $in: [String(semester), 'all'] } 
      } },
      { $addFields: {
          sortOrder: { $ifNull: ["$order", 999999] }
      } },
      { $sort: { sortOrder: 1, created_at: 1 } }
    ]).toArray();

    // 2. Filter root/child folders
    let folders = allCategoryFolders.filter(f => (f.parentId || null) === targetParentId);

    // 3. Security/Lock Hierarchy Check
    if (targetParentId) {
        const isLockedCheck = processFolderLock(targetParentId, allCategoryFolders);
        if (isLockedCheck && !req.admin) {
            return res.status(403).json({ success: false, error: 'This folder is locked by the Administrator.' });
        }
    }

    return res.json({ 
      success: true, 
      category, 
      semester, 
      data: folders.map(({ created_by, updated_by, ...rest }) => rest)
    });
  } catch (err) {
    logger.error('SOL getFolders error', { error: err.message });
    next(err);
  }
}

async function addSOLFolder(req, res, next) {
  try {
    const { name, category, semester, parentId } = req.body;
    if (!name || !category || (semester === undefined || semester === null || semester === '')) {
      return res.status(400).json({ success: false, error: 'Name, category, and semester are required' });
    }

    const { getDB, COLLECTIONS } = require('../config/database');
    const dbInstance = await getDB();
    const folderCol = dbInstance ? dbInstance.collection(COLLECTIONS.folders || 'folders') : null;
    if (!folderCol) throw new Error('Database connection failed');

    const newFolder = {
      id: crypto.randomBytes(8).toString('hex'),
      name,
      category,
      semester: String(semester).trim(),
      parentId: parentId || null,
      created_at: new Date().toISOString()
    };

    await folderCol.insertOne(newFolder);
    invalidatePublicCache();

    // Emit real-time event
    const io = req.app.get('io') || global.io;
    if (io) {
      io.to(`sol:${category}:${semester}`).emit('sol:updated', {
        action: 'add_folder',
        category,
        semester,
        folder: newFolder
      });
    }

    // [v88.9] REMOVED BROADCAST FROM FOLDER ADDITION
    // Folder creation is now silent. Users are only notified when actual items are added.
    
    return res.status(201).json({ success: true, data: newFolder });
  } catch (err) {
    next(err);
  }
}

async function updateSOLFolder(req, res, next) {
  try {
    const { id } = req.params;
    const { name } = req.body;

    const { getDB, COLLECTIONS } = require('../config/database');
    const dbInstance = await getDB();
    const folderCol = dbInstance ? dbInstance.collection(COLLECTIONS.folders || 'folders') : null;
    if (!folderCol) throw new Error('Database connection failed');

    // Update the name using Full Spectrum ID strategy (matches id OR _id)
    const result = await folderCol.updateOne(
      { $or: [{ id }, { _id: id }] },
      { $set: { name, updated_at: new Date().toISOString() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, error: 'Folder not found' });
    }

    // Fetch the full folder for socket emission (Full Spectrum search)
    const updatedFolder = await folderCol.findOne({ $or: [{ id }, { _id: id }] });
    if (!updatedFolder) {
      return res.status(404).json({ success: false, error: 'Folder not found' });
    }

    invalidatePublicCache();

    // Emit real-time event
    const io = req.app.get('io') || global.io;
    if (io) {
      io.to(`sol:${updatedFolder.category}:${updatedFolder.semester}`).emit('sol:updated', {
        action: 'update_folder',
        category: updatedFolder.category,
        semester: updatedFolder.semester,
        folder: updatedFolder
      });
    }

    return res.json({ success: true, message: 'Folder updated' });
  } catch (err) {
    next(err);
  }
}

async function deleteSOLFolder(req, res, next) {
  try {
    const { id } = req.params;
    const { getDB, COLLECTIONS } = require('../config/database');
    const dbInstance = await getDB();
    const folderCol = dbInstance ? dbInstance.collection(COLLECTIONS.folders || 'folders') : null;
    if (!folderCol) throw new Error('Database connection failed');

    // 1. Fetch folder metadata before deletion (Full Spectrum ID search)
    const folder = await folderCol.findOne({ $or: [{ id: id }, { _id: id }] });
    if (!folder) return res.status(404).json({ success: false, error: 'Folder not found' });

    // ✅ v85.0: SOFT DELETE — Move Folder to Recycle Bin
    await dbInstance.collection('recycle_bin').insertOne({
        id: folder.id,
        category: folder.category,
        semester: String(folder.semester),
        type: 'folder',
        originalCollection: COLLECTIONS.folders || 'folders',
        data: folder,
        deletedAt: new Date().toISOString()
    });

    // 2. Delete Folder Document (Full Spectrum ID search)
    await folderCol.deleteOne({ $or: [{ id: id }, { _id: id }] });

    // 3. Distributed Item Deletion: DISABLED FOR RECYCLE BIN v85.0
    // We leave items in their collections so they reappear upon restoration.
    // Permanent deletion of items happens via Recycle Bin cleanup.
    
    // await Promise.all(deletePromises);
    invalidatePublicCache();

    // Emit real-time event
    const io = req.app.get('io') || global.io;
    if (io) {
      io.to(`sol:${folder.category}:${folder.semester}`).emit('sol:updated', {
        action: 'delete_folder',
        category: folder.category,
        semester: folder.semester,
        id
      });
    }

    return res.json({ success: true, message: 'Folder moved to Recycle Bin (7 days)' });
  } catch (err) {
    logger.error('SOL deleteFolder error', { error: err.message });
    next(err);
  }
}

async function toggleFolderLock(req, res, next) {
  try {
    const { id } = req.params;
    const { getDB, COLLECTIONS } = require('../config/database');
    const dbInstance = await getDB();
    const folderCol = dbInstance ? dbInstance.collection(COLLECTIONS.folders || 'folders') : null;
    if (!folderCol) throw new Error('Database connection failed');

    const folder = await folderCol.findOne({ id: id });
    if (!folder) return res.status(404).json({ success: false, error: 'Folder not found' });

    const newLockState = !folder.isLocked;
    await folderCol.updateOne(
        { id: id }, 
        { $set: { isLocked: newLockState, updated_at: new Date().toISOString() } }
    );

    invalidatePublicCache();

    // Emit real-time event
    const io = req.app.get('io') || global.io;
    if (io) {
      io.to(`sol:${folder.category}:${folder.semester}`).emit('sol:updated', {
        action: 'toggle_folder_lock',
        category: folder.category,
        semester: folder.semester,
        id,
        isLocked: newLockState
      });
    }

    return res.json({ success: true, message: newLockState ? 'Folder locked' : 'Folder unlocked', isLocked: newLockState });
  } catch (err) {
    logger.error('SOL toggleFolderLock error', { error: err.message });
    next(err);
  }
}

// NEW: High-speed prefetch endpoint with Server-Side Hot Cache
async function getAllPublicContent(req, res) {
  try {
    const now = Date.now();
    
    // 1. Instant Cache Hit
    if (PUBLIC_CONTENT_CACHE && now < CACHE_EXPIRY) {
      res.setHeader('X-Cache', 'HIT');
      return res.json({ success: true, fromCache: true, ...PUBLIC_CONTENT_CACHE });
    }

    // 2. Prevent Multiple Simultaneous Heavy Builds (Throttling)
    if (pendingBuildPromise) {
      const result = await pendingBuildPromise;
      res.setHeader('X-Cache', 'WAIT-HIT');
      return res.json({ success: true, fromCache: true, ...result });
    }

    // 3. Build Cache
    pendingBuildPromise = buildAllPublicContent().then(data => {
      PUBLIC_CONTENT_CACHE = { 
        ...data,
        timestamp: new Date().toISOString()
      };
      CACHE_EXPIRY = Date.now() + CACHE_TTL;
      pendingBuildPromise = null;
      return PUBLIC_CONTENT_CACHE;
    }).catch(err => {
      pendingBuildPromise = null;
      throw err;
    });

    const result = await pendingBuildPromise;
    res.setHeader('X-Cache', 'MISS');
    return res.json({
      success: true,
      fromCache: false,
      ...result
    });
  } catch (err) {
    logger.error('SOL getAllPublicContent error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch bulk content or timeout' });
  }
}

/**
 * Common Logic to build content for cache (v83.51.53.6 - Multi-Collection Optimized)
 */
async function buildAllPublicContent() {
  const { getDB, COLLECTIONS } = require('../config/database');
  const dbInstance = await getDB();
  const db = await readDB(); // Still needed for legacy/unshredded small buckets

  const cats = ['notifications', 'notes', 'pyqs', 'youtube', 'elearning', 'oneshot', 'live-classes'];
  const categories = {};

  for (const cat of cats) {
    let items = [];
    if (dbInstance && COLLECTIONS[cat]) {
      // ✅ Fetch LATEST 200 items from optimized collection (Memory Safe)
      const collectionName = COLLECTIONS[cat];
      items = await dbInstance.collection(collectionName)
        .find({})
        .sort({ created_at: -1, date: -1 })
        .limit(200)
        .toArray();
      
    } else {
      // ✅ [v83.51.53.207] SAFETY-GUARD: NEVER load massive legacy buckets into RAM
      const heavyCats = ['notifications', 'live-classes', 'pyqs'];
      if (!dbInstance && heavyCats.includes(cat)) {
          logger.warn(`[RECOVERY] Database not ready, skipping potentially heavy category: ${cat}`);
          items = [];
      } else {
          // Fallback for non-shredded small lists
          const key = solKey(cat);
          items = db[key] || [];
      }
    }

    // ✅ [v84.1] AUTO-CLEANUP: Expired Notifications (Apply to all semesters in bulk)
    if (cat === 'notifications') {
      const col = dbInstance ? dbInstance.collection(COLLECTIONS[cat] || cat) : null;
      items = await cleanupExpiredNotifications(col, items);
    }

    // ✅ [v84.2] SMART-SORT: Live Classes (Today first, then time)
    if (cat === 'live-classes') {
      const todayStr = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
      items.sort((a, b) => {
        const isAToday = a.date === todayStr;
        const isBToday = b.date === todayStr;
        if (isAToday && !isBToday) return -1;
        if (!isAToday && isBToday) return 1;
        if (isAToday && isBToday) {
          return parseStartTime(a.scheduledAt) - parseStartTime(b.scheduledAt);
        }
        return 0; // Keep descending order by created_at/date
      });
    }

    categories[cat] = items.map(({ created_by, updated_by, ...rest }) => rest);
  }


  // Filter folders
  const folders = (db.folders || []).filter(f => cats.includes(f.category));

  return { categories, folders };
}

/**
 * Pre-warm the cache on server startup
 */
async function initSOLCache() {
  try {
    const { categories, folders } = await buildAllPublicContent();
    PUBLIC_CONTENT_CACHE = { 
      categories, 
      folders,
      timestamp: new Date().toISOString()
    };
    CACHE_EXPIRY = Date.now() + CACHE_TTL;
    logger.info('SOL Hot Cache initialized successfully');
    return true;
  } catch (err) {
    logger.error('SOL Cache Initialization Failed:', err.message);
    return false;
  }
}


// ── DIAGNOSTIC/DEBUG ─────────────────────────────────────────────────────────

async function debugSOL(req, res, next) {
  try {
    const db = await readDB();
    const stats = {};
    const allKeys = Object.keys(db);
    
    allKeys.forEach(k => {
      const data = db[k];
      if (Array.isArray(data)) {
        stats[k] = {
          count: data.length,
          items: data.slice(0, 5).map(i => ({ 
            id: i.id || 'no-id', 
            title: i.title || i.subject || i.name || 'no-title',
            semester: i.semester || 'no-sem',
            folderId: i.folderId || null
          }))
        };
      } else if (typeof data === 'object' && data !== null) {
        stats[k] = { type: 'object', keys: Object.keys(data) };
      } else {
        stats[k] = { type: typeof data };
      }
    });
    
    return res.json({
      success: true,
      version: "2.1.3-AUDIT",
      time: new Date().toISOString(),
      allKeys: allKeys,
      buckets: stats
    });
  } catch (err) {
    next(err);
  }
}

// ── Helper: Sync Notification to Live Class (MBA ONLY) — v104.6: MongoDB Support ──────────────────────────
async function syncNotificationToLiveClass(dbInstance, notification, semester, adminId) {
  try {
    const { title, description, link, date } = notification;
    const { COLLECTIONS } = require('../config/database');
    const classCol = dbInstance.collection(COLLECTIONS['live-classes'] || 'live_classes');
    
    // 1. Detection: Is this an MBA Live Class?
    const isLiveClass = (description && description.includes('MBA Live Class')) || 
                        (title && title.includes('MBA Sem') && (title.includes('Meet') || title.includes('Zoom') || title.includes('Teams')));
    
    if (!isLiveClass) return false;

    // 2. Link Validation: Only sync if link is a real URL
    const isValidUrl = link && link.startsWith('http') && !link.includes('#pending');
    if (!isValidUrl) return false;

    // 3. Parsing: Extract Subject and Time
    let subject = '';
    let time = '';
    
    const titleMatch = (title || "").match(/:\s*(.*?)\s*\((.*?)\)/);
    if (titleMatch) {
      subject = titleMatch[1].trim();
      time = titleMatch[2].trim();
    } else {
      const descMatch = (description || "").match(/MBA Live Class:\s*(.*?)\.\s*Time:\s*(.*)/i);
      if (descMatch) {
        subject = descMatch[1].trim();
        time = descMatch[2].split('.')[0].trim();
      } else {
        const parts = String(title).split(':');
        subject = parts[parts.length - 1].split('(')[0].trim();
        const tMatch = String(title).match(/\((.*?)\)/);
        if (tMatch) time = tMatch[1].trim();
      }
    }

    if (!subject) return false;

    // 4. Atomic Sync
    const stableId = notification.id || crypto.randomBytes(16).toString('hex');
    const liveClassData = {
      title: subject,
      date: date,
      link: link,
      scheduledAt: time,
      description: `Auto-synced from Notification: ${title}`,
      updated_at: new Date().toISOString(),
      updated_by: adminId || 'system-sync',
      semester: String(semester),
      category: 'live-classes'
    };

    await classCol.updateOne(
      { $or: [{ id: stableId }, { title: subject, date: date, semester: String(semester) }] },
      { 
        $set: liveClassData,
        $setOnInsert: { id: stableId, created_at: new Date().toISOString(), created_by: adminId || 'system-sync' }
      },
      { upsert: true }
    );

    return true;
  } catch (err) {
    logger.error('syncNotificationToLiveClass failed', { error: err.message });
    return false;
  }
}

// ── Helper: Sync Live Class to Notification (Reverse Mirror) — v104.6 [NEW] ──────────────────────────
async function syncLiveClassToNotification(dbInstance, liveClass, semester, adminId) {
  try {
    const { title: subject, scheduledAt: time, link, date, description: manualDesc } = liveClass;
    const { COLLECTIONS } = require('../config/database');
    const notifCol = dbInstance.collection(COLLECTIONS['notifications'] || 'notifications');
    
    if (!subject || !date) return false;

    // [v108.2] SURGICAL STRIP: Remove ALL metadata and reconstruct
    const subjectOnly = subject
       .replace(/\[.*?\]/g, '')
       .replace(/MBA\s*SEM\s*\d+:?/gi, '')
       .replace(/\s+/g, ' ')
       .replace(/^[:\s\-]+/, '')
       .trim();

    // [v108.7] TIME RESTORATION: Keep time in title for system logic
    const timeRange = (time && time.includes(':')) ? `(${time})` : '';
    const cleanedTitle = (category === 'live-classes' || semester !== '0') ? `MBA SEM ${semester}: ${subjectOnly} ${timeRange}`.trim() : subjectOnly;

    const formattedTitle = cleanedTitle;
    const formattedDesc = manualDesc || `MBA Live Class: ${cleanedTitle}. Time: ${time || 'TBA'}. Date: ${date}`;

    const stableId = liveClass.id || crypto.randomBytes(16).toString('hex');
    const notifData = {
      title: formattedTitle,
      link: link || '#pending',
      date: date,
      scheduledAt: liveClass.scheduledAt || null, // [v108.9.3] Functional Sync
      description: formattedDesc,
      updated_at: new Date().toISOString(),
      updated_by: adminId || 'system-mirror',
      semester: String(semester),
      category: 'notifications'
    };

    // Mirror to specific semester
    await notifCol.updateOne(
      { $or: [{ id: stableId }, { title: formattedTitle, semester: String(semester) }] },
      { 
        $set: notifData,
        $setOnInsert: { id: stableId, created_at: new Date().toISOString(), created_by: adminId || 'system-mirror' }
      },
      { upsert: true }
    );

    // [v108.4] DE-CLUTTER: Stopped mirroring Live Classes to Semester 0
    /*
    if (String(semester) !== '0') {
      await notifCol.updateOne(
        { $or: [{ id: stableId + '_common' }, { title: formattedTitle, semester: '0' }] },
        { 
          $set: { ...notifData, semester: '0' },
          $setOnInsert: { id: stableId + '_common', created_at: new Date().toISOString(), created_by: adminId || 'system-mirror' }
        },
        { upsert: true }
      );
    }
    */

    return true;
  } catch (err) {
    logger.error('syncLiveClassToNotification failed', { error: err.message });
    return false;
  }
}



// ── HARD RESET: Clear entire SOL data (admin only) ───────────────────────────
async function hardResetSOLDatabase(req, res, next) {
    try {
        await transactDB(async (db) => {
            VALID_CATEGORIES.forEach(cat => {
                const key = solKey(cat);
                db[key] = [];
            });
            if (db.content) {
                db.content.classes = [];
                db.content.notes = [];
                db.content.pyq = [];
                db.content.oneshot = [];
                db.content.elearning = [];
                db.content.professor = [];
            }
            logger.warn('SOL Database: HARD RESET performed');
            return true;
        });

        // Clear Hot Cache
        initSOLCache();

        return res.json({ success: true, message: 'SOL Database hard reset successful' });
    } catch (err) {
        logger.error('SOL hardReset error', { error: err.message });
        next(err);
    }
}

// ── Clear Specific Category ──────────────────────────────────────────────────
async function clearSOLCategory(req, res, next) {
    try {
        const { category } = req.params;
        if (!VALID_CATEGORIES.includes(category)) {
            return res.status(400).json({ success: false, error: 'Invalid category' });
        }

        await transactDB(async (db) => {
            const key = solKey(category);
            db[key] = [];
            
            // Legacy mirror cleanup
            if (db.content) {
                const map = { 'live-classes':'classes', 'notes':'notes', 'pyqs':'pyq', 'oneshot':'oneshot', 'elearning':'elearning', 'professor':'professor' };
                const legKey = map[category];
                if (legKey && db.content[legKey]) db.content[legKey] = [];
            }
            return true;
        });

        return res.json({ success: true, message: `Category ${category} cleared` });
    } catch (err) {
        next(err);
    }
}

// ── Clear Blacklist (Lazy) ───────────────────────────────────────────────────
async function clearSOLBlacklist(req, res, next) {
    try {
        await transactDB(async (db) => {
            db.sol_blacklist = [];
            return true;
        });
        logger.info('SOL Blacklist cleared');
        return res.json({ success: true, message: 'Blacklist cleared' });
    } catch (err) {
        next(err);
    }
}

/**
 * 🚀 SYNC BULK NOTIFICATIONS (Mark & Sweep)
 * Accepts a full list of current notices from the scraper.
 * - Updates links if title/date match.
 * - Adds new notices.
 * - Deletes scraper-added notices NOT in the scrapers list.
 * - Preserves ALL admin-added items (those with folderId).
 */
async function syncBulkNotifications(req, res, next) {
  try {
    const { category, semester } = req.params;
    const { items: scrapedItems } = req.body; // Array of {title, link, date, description}

    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, error: 'Invalid category' });
    }

    if (!scrapedItems || !Array.isArray(scrapedItems)) {
      return res.status(400).json({ success: false, error: 'Items array required' });
    }

    const key = solKey(category);
    let stats = { updated: 0, added: 0, deleted: 0, preserved: 0 };
    const newlyAddedItems = [];
    let mirroredLiveClass = false;

    await transactDB(async (db) => {
      const semesterStr = String(semester).trim();
      const { getDB, COLLECTIONS } = require('../config/database');
      const dbInstance = await getDB();
      const targetColName = COLLECTIONS[category] || category;
      const targetCollection = dbInstance ? dbInstance.collection(targetColName) : null;
      const blacklistCol = dbInstance ? dbInstance.collection('blacklists') : null;

      logger.info(`[SYNC] Start Semester ${semesterStr} for ${category} (v83.51.53.77)`);

      // 1. Fetch Current Blacklist (Optimized Fetch)
      const blacklist = blacklistCol ? await blacklistCol.find({}).toArray() : [];
      const blacklistedIds = new Set(blacklist.map(b => b.id));
      const blacklistedTitles = new Set(blacklist.map(b => (b.title || "").trim().toLowerCase()));
      const blacklistedLinks = new Set(blacklist.map(b => (b.link || "").trim().toLowerCase().split('?')[0]).filter(Boolean));

      for (const scraped of scrapedItems) {
        let title = (scraped.title || "").trim();
        const link = (scraped.link || scraped.pdf || scraped.url || "").trim();
        const cleanScrapedLink = link.toLowerCase().split('?')[0];
        
        // [v84.7] CANONICAL FINGERPRINT: Normalize title by removing common scraping artifacts
        // This prevents "MBA SEM 2: Topic" and "Topic" from having different IDs.
        const canonicalTitle = title
          .replace(/\[\d{2}-\d{2}-\d{4}\]/g, '') // Remove [16-04-2026]
          .replace(/MBA\s+SEM\s+\d/gi, '')       // Remove MBA SEM 2
          .replace(/\(New\)/gi, '')              // Remove (New) tags
          .replace(/\s+/g, ' ')                  // Collapse spaces
          .trim()
          .toLowerCase();

        // [v88.6] Clean the visual title for the DB
        title = cleanTitle(title);

        if (!title && !link) continue;

        const isPlaceholder = (l) => !l || l === '#' || l.toLowerCase().includes('soon') || l.toLowerCase().includes('pending');
        const isRealLink = (l) => l && !isPlaceholder(l);

        // [v104.5] DETECTION: Identify Live Classes BEFORE blacklist check
        const t = title.toLowerCase();
        const hasSchedule = !!(scraped.schedule || scraped.date || scraped.time || scraped.description?.toLowerCase().includes('live class'));
        const isExplicitLiveClass = t.includes('live class') || (t.includes('mba sem') && hasSchedule);
        
        let shouldBypassBlacklist = (category === 'live-classes');

        const fingerSrc = `${canonicalTitle}|${link.toLowerCase()}`;
        const stableId = crypto.createHash('md5').update(fingerSrc + semesterStr).digest('hex').substring(0, 24);

        // ✅ TRIPLE-GUARD BLACKLIST CHECK: Skip items that user has deleted (RESPECTED for standard notices)
        const isBlacklisted = blacklistedIds.has(stableId) || 
                              blacklistedTitles.has(title.toLowerCase()) || 
                              (cleanScrapedLink && blacklistedLinks.has(cleanScrapedLink));

        if (isBlacklisted && !shouldBypassBlacklist) {
          stats.preserved++;
          logger.info(`[SYNC] Skipped Blacklisted Item: ${title} (Shield Triggered)`);
          continue;
        }

        if (isBlacklisted && shouldBypassBlacklist) {
          logger.info(`[SYNC] Bypassing Blacklist for Live Class: ${title}`);
        }

        if (targetCollection) {
          // ✅ [v84.7] ID-BASED DEDUPLICATION & BROADCAST GUARD
          const existingItem = await targetCollection.findOne({ 
            $or: [
              { id: stableId },
              { title: title, semester: semesterStr }
            ]
          });

          const isPlaceholder = (l) => !l || l === '#' || l.toLowerCase().includes('soon') || l.toLowerCase().includes('pending');
          const isRealLink = (l) => l && !isPlaceholder(l);

          const newlyRealLink = !isRealLink(existingItem?.link) && isRealLink(link);
          const isNewTitle = !existingItem;

          // 1. Prepare New Item Object
          const { created_at: _oldStatic, _id: _oldId, ...scrapedClean } = scraped;
          const newItem = {
            id: stableId,
            ...scrapedClean,
            semester: semesterStr,
            category,
            updated_at: new Date().toISOString()
          };

          // 2. Perform Atomic Upsert
          const upsertResult = await targetCollection.updateOne(
            { id: stableId }, 
            { 
              $set: newItem, 
              $setOnInsert: { created_at: new Date().toISOString(), created_by: 'scraper_bulk' } 
            },
            { upsert: true }
          );

          // 3. BROADCAST DECISION:
          if (isNewTitle || newlyRealLink) {
            stats.added++;
            newlyAddedItems.push(title);
          } else if (upsertResult.modifiedCount > 0) {
            stats.updated++;
          }

          // ✅ [v83.51.53.118] SMART-CONTEXT MIRROR
          const t = title.toLowerCase();
          const hasSchedule = !!(scraped.schedule || scraped.date || scraped.time || scraped.description?.toLowerCase().includes('live class'));
          const isExplicitLiveClass = t.includes('live class') || (t.includes('mba sem') && hasSchedule);
          const isGenericTimetable = (t.includes('timetable') || t.includes('time table') || t.includes('datesheet') || t.includes('date sheet'));
          
          if (category === 'notifications' && isExplicitLiveClass && !isGenericTimetable) {
              const classCol = dbInstance.collection(COLLECTIONS['live-classes'] || 'live_classes');
              await classCol.updateOne(
                  { id: stableId },
                  { 
                      $set: { ...newItem, category: 'live-classes' }, 
                      $setOnInsert: { created_at: new Date().toISOString(), created_by: 'scraper_mirror_smart' } 
                  },
                  { upsert: true }
              );
              logger.info(`[SYNC] Smart-Context LIVE Class detected: ${title}`);
              mirroredLiveClass = true; // Flag for socket event
          }

          // ✅ [v104.7] REVERSE MIRROR: Live Classes -> Notifications
          if (category === 'live-classes') {
              await syncLiveClassToNotification(dbInstance, newItem, semester, 'scraper_mirror_reverse');
          }
        }
      }
      
      invalidatePublicCache();
      return true;
    });

    logger.info('SOL Bulk Sync completed', { semester, ...stats });
    
    // Notify via Socket.io
    const io = req.app.get('io') || global.io;
    if (io) {
      // 1. Notify main category (e.g. notifications)
      io.to(`sol:${category}:${semester}`).emit('sol:updated', {
        action: 'bulk_sync',
        category,
        semester,
        stats
      });

      // 2. Notify mirrored category (live-classes) if needed
      if (mirroredLiveClass) {
        io.to(`sol:live-classes:${semester}`).emit('sol:updated', {
          action: 'bulk_sync_mirror',
          category: 'live-classes',
          semester,
          stats
        });
      }
    }

    // [v83.34] ENRICHED WEB PUSH for new items
    if (newlyAddedItems.length > 0) {
      const pushTitle = `[SOLMATES] New ${category.toUpperCase()}`;
      let pushBody = newlyAddedItems[0];
      if (newlyAddedItems.length > 1) {
        pushBody = `+${newlyAddedItems.length} New Updates: ${newlyAddedItems[0]}...`;
      }
      const pushUrl = resolvePushUrl(category, semester);
      notificationController.sendBroadcast(pushTitle, pushBody, pushUrl, semester);
      logger.info(`[PUSH] Triggered enriched broadcast for Sem ${semester}: ${newlyAddedItems.length} items. URL: ${pushUrl}`);
    }

    return res.json({ success: true, stats });
  } catch (err) {
    logger.error('SOL Bulk Sync error', { error: err.message });
    next(err);
  }
}

// 🚀 NUCLEAR RESURRECTION: Wipes blacklists and restores Semester 2/4 visibility. v81.9
async function repairSOLSync(req, res, next) {
  try {
    let stats = { blacklist_migrated: 0 };
    const { getDB } = require('../config/database');
    const dbInstance = await getDB();
    if (!dbInstance) throw new Error('Database connection failed');

    const mainCol = dbInstance.collection('solmates_db');
    const blCol = dbInstance.collection('blacklists');
    const mainDoc = await mainCol.findOne({ _id: 'main' });

    if (mainDoc) {
      const links = mainDoc.sol_deleted_notifications || [];
      const titles = mainDoc.sol_deleted_notifications_titles || [];
      const crypto = require('crypto');

      for (const link of links) {
        if (!link || typeof link !== 'string') continue;
        const id = crypto.createHash('md5').update(link.trim().toLowerCase()).digest('hex').substring(0, 24);
        await blCol.updateOne({ id }, { $set: { id, link: link.trim(), type: 'link', created_at: new Date().toISOString() } }, { upsert: true });
        stats.blacklist_migrated++;
      }

      for (const title of titles) {
        if (!title || typeof title !== 'string') continue;
        const id = 'title_' + Buffer.from(title.trim().toLowerCase()).toString('hex').substring(0, 16);
        await blCol.updateOne({ title: title.trim().toLowerCase() }, { $set: { id, title: title.trim(), type: 'title', created_at: new Date().toISOString() } }, { upsert: true });
        stats.blacklist_migrated++;
      }
    }

    invalidatePublicCache();
    return res.json({ success: true, message: 'SOL Sync Repaired and Blacklist Migrated!', stats });
  } catch (err) {
    logger.error('SOL Repair Sync error', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
}

// ── POST /api/sol/youtube/import-playlist (admin: bulk import) ──────────────
async function importYouTubePlaylist(req, res, next) {
  try {
    let { url, category, semester, folderId, createFolder, customFolderName, deleteOriginalId } = req.body;
    
    if (!url || !url.includes('list=')) {
      return res.status(400).json({ success: false, error: 'Valid YouTube Playlist URL required' });
    }
    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, error: 'Invalid category' });
    }

    const { getDB, COLLECTIONS } = require('../config/database');
    const dbInstance = await getDB();
    if (!dbInstance) throw new Error('DB connection failed');

    logger.info('YouTube Playlist Import/Expansion request', { url, category, semester, admin: req.admin.adminId });

    // 6. Socket Helper
    const io = req.app.get('io') || global.io;
    const sendProgress = (message) => {
      if (io) {
        io.to(`sol:${category}:${semester}`).emit('sol:import_progress', { 
          message, 
          url,
          adminId: req.admin.adminId 
        });
      }
    };

    // 1. Optional: Create Folder first
    if (createFolder) {
      sendProgress('Creating new folder for playlist...');
      const folderName = customFolderName || 'New Playlist Folder';
      const newFolder = {
        id: crypto.randomBytes(16).toString('hex'),
        name: folderName,
        category,
        semester: String(semester),
        parentId: folderId || null,
        created_at: new Date().toISOString(),
        created_by: req.admin.adminId,
        order: 0
      };
      
      const folderCol = dbInstance.collection(COLLECTIONS.folders || 'folders');
      await folderCol.insertOne(newFolder);
      folderId = newFolder.id; // Use this new folder for items
      logger.info('Auto-created folder for playlist import', { folderId, name: folderName });
    }

    // 2. Scrape the playlist
    sendProgress('Connecting to YouTube (Headless Browser)...');
    const scrapedVideos = await scrapeYouTubePlaylist(url, 150); 
    
    if (!scrapedVideos || scrapedVideos.length === 0) {
      sendProgress('Error: No videos found or playlist is private.');
      return res.status(404).json({ success: false, error: 'No videos found in playlist' });
    }

    sendProgress(`Successfully extracted ${scrapedVideos.length} video links!`);

    // 3. Map to SOL Schema
    const now = new Date().toISOString();
    const newItems = scrapedVideos.map(v => ({
      _id: crypto.randomBytes(12).toString('hex'), 
      id: crypto.randomBytes(16).toString('hex'),
      title: v.title,
      videoUrl: v.url,
      link: v.url,
      thumbnail: v.thumbnail,
      category,
      semester: String(semester),
      folderId: folderId || null,
      created_at: now,
      created_by: req.admin.adminId,
      migrated_at: now
    }));

    // 4. Database Bulk Insert
    sendProgress(`Saving ${newItems.length} small items to database...`);
    const collectionName = COLLECTIONS[category] || category;
    await dbInstance.collection(collectionName).insertMany(newItems);

    // 5. Optional: Delete Original Item (Expansion mode)
    if (deleteOriginalId) {
      sendProgress('Cleaning up original playlist card...');
      await dbInstance.collection(collectionName).deleteOne({ id: deleteOriginalId });
      logger.info('Deleted original playlist card after expansion', { deleteOriginalId });
    }

    invalidatePublicCache();

    // 6. Emit Events
    if (io) {
      io.to(`sol:${category}:${semester}`).emit('sol:updated', { 
        action: 'bulk_add', 
        category, 
        semester, 
        count: newItems.length 
      });
    }

    return res.status(201).json({ 
      success: true, 
      message: `${newItems.length} videos imported successfully${createFolder ? ' into new folder' : ''}`,
      count: newItems.length,
      newFolderId: createFolder ? folderId : null
    });

  } catch (err) {
    logger.error('YouTube Playlist Import error', { error: err.message });
    res.status(500).json({ success: false, error: `Import failed: ${err.message}` });
  }
}


module.exports = {
  getSOLContent, 
  getAllPublicContent,
  addSOLItem, 
  updateSOLItem, 
  deleteSOLItem,
  syncBulkNotifications,
  reorderBulkSOL,
  reorderSOLItem,
  getSOLFolders,
  addSOLFolder,
  updateSOLFolder,
  toggleFolderLock,
  deleteSOLFolder,
  reorderSOLFolder,
  debugSOL,
  initSOLCache,
  syncNotificationToLiveClass,
  hardResetSOLDatabase,
  clearSOLCategory,
  clearSOLBlacklist,
  repairSOLSync,
  importYouTubePlaylist
};
