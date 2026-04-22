/**
 * SOLMATES Live Class Reminder Service (v85.2)
 * Background worker to notify users before classes start.
 */

const logger = require('./logger');
const { getISTDateString, getISTMinutesNow, parseStartTime } = require('./time-utils');

let reminderInterval = null;

/**
 * Initialize the reminder service
 * @param {Object} db - MongoDB database instance
 * @param {Object} io - Socket.io instance
 */
async function initReminderService(db, io) {
  if (reminderInterval) return;

  logger.info('[REMINDER-SERVICE] Initialized Background Scanner');

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
 * Removes redundant subject repetitions and time brackets for a professional look.
 */
function cleanPushBody(title) {
    if (!title) return '';
    
    let clean = title;
    
    // 1. Remove redundant Colons
    clean = clean.replace(/:\s*/g, ' ');

    // 2. Remove Redundant Subject Repetitions
    const words = clean.split(/\s+/);
    const seenWords = [];
    const finalWords = [];
    
    for (const word of words) {
        const lower = word.toLowerCase().trim();
        if (!lower) continue;
        
        if (seenWords.length > 0 && seenWords[seenWords.length - 1] === lower) {
            continue;
        }
        
        finalWords.push(word);
        seenWords.push(lower);
    }

    return finalWords.join(' ').replace(/\s+/g, ' ').trim();
}

async function checkAndNotifyUpcomingClasses(db, io) {
  const dates = getISTDateString(); // returns {iso, longDate, indian}
  const nowMinutes = getISTMinutesNow();
  
  // v115.1: Scan BOTH collections (live_classes and notifications)
  // notifications collection often holds the items shown in "Stay Updated"
  const classCol = db.collection('live_classes');
  const notifCol = db.collection('notifications');
  
  const dateQuery = {
    $or: [
      { date: { $regex: new RegExp(dates.iso, 'i') } },
      { date: { $regex: new RegExp(dates.longDate, 'i') } },
      { date: { $regex: new RegExp(dates.indian, 'i') } },
      { title: { $regex: new RegExp(dates.indian, 'i') } }
    ]
  };

  const reminderQuery = {
    $or: [
      { reminder10MinSent: { $ne: true } },
      { reminder30MinSent: { $ne: true } }
    ]
  };

  // Fetch from both collections simultaneously
  const [coreClasses, noticeClasses] = await Promise.all([
    classCol.find({ $and: [dateQuery, reminderQuery] }).toArray(),
    notifCol.find({ $and: [{ category: 'live-classes' }, dateQuery, reminderQuery] }).toArray()
  ]);

  const upcomingClasses = [...coreClasses, ...noticeClasses];

  if (upcomingClasses.length === 0) return;

  const notificationController = require('../controllers/notification.controller');
  const sentInThisRun = new Set();

  for (const item of upcomingClasses) {
    // Determine source collection for updates
    // Core classes have 'link', notifications have 'link' but use different source fields sometimes.
    // v115.1: Verify if it belongs to Notifications or Core Classes
    const isNotificationItem = (item.category === 'live-classes');
    const targetCol = isNotificationItem ? notifCol : classCol;

    let startTimeMinutes = parseStartTime(item.scheduledAt);
    if (!startTimeMinutes) startTimeMinutes = parseStartTime(item.time);
    if (!startTimeMinutes) startTimeMinutes = parseStartTime(item.title);
    
    if (!startTimeMinutes) continue;

    const diff = startTimeMinutes - nowMinutes;
    const semester = item.semester || 'all'; 
    const pushUrl = `/database/classes/classes.html?semester=${semester === 'all' ? '1' : semester}`;

    // ── PHASE 2: 10 MINUTE FINAL WARNING (Priority) ──
    if (diff >= 0 && diff <= 15 && !item.reminder10MinSent) {
      const pushTitle = diff <= 5 ? `⚠️ Class Starting NOW!` : `🚨 Final Reminder: 10 Mins Left`;
      const pushBody = diff <= 5 
        ? `Your class "${cleanPushBody(item.title)}" is starting. Join now!`
        : `Your class "${cleanPushBody(item.title)}" starts in ${diff} minutes.`;
      
      logger.info(`[REMINDER-SERVICE] PHASE-10M Triggered (${diff}m) for Sem ${semester}: ${item.title}`);

      try {
        await notificationController.sendBroadcast(pushTitle, pushBody, pushUrl, semester, 1800);
        if (io) io.emit('sol:flash_notice', { type: 'reminder', title: pushTitle, message: pushBody, url: pushUrl, semester });

        await targetCol.updateOne(
          { _id: item._id },
          { $set: { reminder10MinSent: true, reminderSentAt: new Date().toISOString() } }
        );
      } catch (err) {
        logger.error('[REMINDER-SERVICE] 10M Broadast failed', { error: err.message });
      }
    } 
    // ── PHASE 1: 30 MINUTE HEADS-UP ──
    else if (diff > 15 && diff <= 45 && !item.reminder30MinSent) {
      const pushTitle = `📅 Upcoming Class: 30m Heads-up`;
      const pushBody = `Your class "${cleanPushBody(item.title)}" starts in approx. ${diff} minutes.`;
      
      logger.info(`[REMINDER-SERVICE] PHASE-30M Triggered (${diff}m) for Sem ${semester}: ${item.title}`);

      try {
        await notificationController.sendBroadcast(pushTitle, pushBody, pushUrl, semester, 3600);
        
        await targetCol.updateOne(
          { _id: item._id },
          { $set: { reminder30MinSent: true, reminder30SentAt: new Date().toISOString() } }
        );
      } catch (err) {
        logger.error('[REMINDER-SERVICE] 30M Broadast failed', { error: err.message });
      }
    }
    // ── EMERGENCY FALLBACK: CLASS STARTED ──
    else if (diff < 0 && diff >= -10 && !item.reminder10MinSent) {
      const pushTitle = `🔥 Class Has Started!`;
      const pushBody = `You missed the start of "${cleanPushBody(item.title)}". Join immediately!`;
      
      logger.warn(`[REMINDER-SERVICE] EMERGENCY Triggered (${Math.abs(diff)}m late) for Sem ${semester}: ${item.title}`);

      try {
        await notificationController.sendBroadcast(pushTitle, pushBody, pushUrl, semester, 600);
        await targetCol.updateOne(
          { _id: item._id },
          { $set: { reminder10MinSent: true, reminderSentAt: new Date().toISOString(), emergencySent: true } }
        );
      } catch (err) {
        logger.error('[REMINDER-SERVICE] Emergency trigger failed', { error: err.message });
      }
    }
  }
}

module.exports = {
  initReminderService
};
