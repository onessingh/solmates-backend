/**
 * SOLMATES Live Class Reminder Service (v85.2)
 * Background worker to notify users before classes start.
 */

const logger = require('./logger');
const { getISTDateString, getISTMinutesNow, parseStartTime } = require('./time-utils');

let reminderInterval = null;

// v116.1: Cross-cycle tracking to prevent spam if DB is slow or IDs mismatch
const SENT_CACHE = new Set();
// Clear cache every 12 hours to prevent memory leaks, while keeping it long enough for daily classes
setInterval(() => SENT_CACHE.clear(), 12 * 60 * 60 * 1000);

/**
 * Initialize the reminder service
 */
async function initReminderService(db, io) {
  if (reminderInterval) return;

  logger.info('[REMINDER-SERVICE] Initialized Background Scanner (v116.1)');

  // Run every 60 seconds
  reminderInterval = setInterval(async () => {
    try {
      await checkAndNotifyUpcomingClasses(db, io);
    } catch (err) {
      logger.error('[REMINDER-SERVICE] Scanner Error:', { error: err.message });
    }
  }, 60 * 1000);

  // Initial run
  checkAndNotifyUpcomingClasses(db, io).catch(e => {});
}

/**
 * cleanPushBody (v89.2)
 */
function cleanPushBody(title) {
    if (!title) return '';
    let clean = title.replace(/:\s*/g, ' ');
    const words = clean.split(/\s+/);
    const seenWords = [];
    const finalWords = [];
    for (const word of words) {
        const lower = word.toLowerCase().trim();
        if (!lower) continue;
        if (seenWords.length > 0 && seenWords[seenWords.length - 1] === lower) continue;
        finalWords.push(word);
        seenWords.push(lower);
    }
    return finalWords.join(' ').replace(/\s+/g, ' ').trim();
}

async function checkAndNotifyUpcomingClasses(db, io) {
  const dates = getISTDateString(); 
  const nowMinutes = getISTMinutesNow();
  
  const classCol = db.collection('live_classes');
  const notifCol = db.collection('notifications');
  
  const dateQuery = {
    $or: [
      { date: { $regex: new RegExp(dates.iso, 'i') } },
      { date: { $regex: new RegExp(dates.indian, 'i') } },
      { title: { $regex: new RegExp(dates.indian, 'i') } }
    ]
  };

  // Fetch from both collections simultaneously
  const [coreClasses, noticeClasses] = await Promise.all([
    classCol.find(dateQuery).toArray(),
    notifCol.find({ $and: [{ category: 'live-classes' }, dateQuery] }).toArray()
  ]);

  const upcomingClasses = [...coreClasses, ...noticeClasses];
  if (upcomingClasses.length === 0) return;

  const notificationController = require('../controllers/notification.controller');

  for (const item of upcomingClasses) {
    const isNotificationItem = (item.category === 'live-classes');
    const targetCol = isNotificationItem ? notifCol : classCol;
    const itemId = item.id || item._id; // Robust ID detection

    let startTimeMinutes = parseStartTime(item.scheduledAt);
    if (!startTimeMinutes) startTimeMinutes = parseStartTime(item.time);
    if (!startTimeMinutes) startTimeMinutes = parseStartTime(item.title);
    
    if (!startTimeMinutes || !itemId) continue;

    const diff = startTimeMinutes - nowMinutes;
    const semester = item.semester || 'all'; 
    const pushUrl = `/database/classes/classes.html?semester=${semester === 'all' ? '1' : semester}`;

    // ── PHASE 2: 10 MINUTE FINAL WARNING ──
    // Window: 0 to 12 minutes before class
    if (diff >= 0 && diff <= 12) {
      const cacheKey = `${itemId}_10m`;
      if (item.reminder10MinSent || SENT_CACHE.has(cacheKey)) continue;

      const pushTitle = diff <= 3 ? `⚠️ Class Starting NOW!` : `🚨 Final Reminder: 10 Mins Left`;
      const pushBody = diff <= 3 
        ? `Your class "${cleanPushBody(item.title)}" is starting. Join now!`
        : `Your class "${cleanPushBody(item.title)}" starts in ${diff} minutes.`;
      
      logger.info(`[REMINDER-SERVICE] Triggering 10M Phase for ${itemId} (${diff}m)`);

      try {
        SENT_CACHE.add(cacheKey);
        await notificationController.sendBroadcast(pushTitle, pushBody, pushUrl, semester, 1800);
        if (io) io.emit('sol:flash_notice', { type: 'reminder', title: pushTitle, message: pushBody, url: pushUrl, semester });

        const result = await targetCol.updateOne(
          { $or: [{ _id: item._id }, { id: item.id }] },
          { $set: { reminder10MinSent: true, reminderSentAt: new Date().toISOString() } }
        );
        logger.debug(`[REMINDER-SERVICE] 10M DB Update for ${itemId}: ${result.modifiedCount} updated`);
      } catch (err) {
        logger.error('[REMINDER-SERVICE] 10M Phase failed', { error: err.message });
      }
    } 
    // ── PHASE 1: 45 MINUTE HEADS-UP ──
    // Window: 13 to 45 minutes before class
    else if (diff > 12 && diff <= 45) {
      const cacheKey = `${itemId}_45m`;
      if (item.reminder30MinSent || SENT_CACHE.has(cacheKey)) continue;

      const pushTitle = `📅 Upcoming Class: 45m Heads-up`;
      const pushBody = `Your class "${cleanPushBody(item.title)}" starts in approx. ${diff} minutes.`;
      
      logger.info(`[REMINDER-SERVICE] Triggering 45M Phase for ${itemId} (${diff}m)`);

      try {
        SENT_CACHE.add(cacheKey);
        await notificationController.sendBroadcast(pushTitle, pushBody, pushUrl, semester, 3600);
        
        const result = await targetCol.updateOne(
          { $or: [{ _id: item._id }, { id: item.id }] },
          { $set: { reminder30MinSent: true, reminder30SentAt: new Date().toISOString() } }
        );
        logger.debug(`[REMINDER-SERVICE] 45M DB Update for ${itemId}: ${result.modifiedCount} updated`);
      } catch (err) {
        logger.error('[REMINDER-SERVICE] 45M Phase failed', { error: err.message });
      }
    }
    // ── PHASE 3: CLASS STARTED (Emergency Fallback) ──
    // Window: -1 to -10 minutes after start
    else if (diff < 0 && diff >= -10) {
      const cacheKey = `${itemId}_started`;
      if (item.reminderStartedSent || SENT_CACHE.has(cacheKey)) continue;

      const pushTitle = `🔥 Class Has Started!`;
      const pushBody = `You missed the start of "${cleanPushBody(item.title)}". Join immediately!`;
      
      logger.info(`[REMINDER-SERVICE] Triggering STARTED Phase for ${itemId} (${Math.abs(diff)}m late)`);

      try {
        SENT_CACHE.add(cacheKey);
        await notificationController.sendBroadcast(pushTitle, pushBody, pushUrl, semester, 600);
        const result = await targetCol.updateOne(
          { $or: [{ _id: item._id }, { id: item.id }] },
          { $set: { reminderStartedSent: true, reminderSentAt: new Date().toISOString() } }
        );
        logger.debug(`[REMINDER-SERVICE] STARTED DB Update for ${itemId}: ${result.modifiedCount} updated`);
      } catch (err) {
        logger.error('[REMINDER-SERVICE] Started phase failed', { error: err.message });
      }
    }
  }
}

module.exports = {
  initReminderService
};
