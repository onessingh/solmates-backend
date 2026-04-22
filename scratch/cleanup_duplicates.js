
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { getDB, COLLECTIONS } = require('../src/config/database');

/**
 * [v88.5] Ultra-aggressive Title Cleaner
 */
function cleanTitle(str) {
  if (!str) return "";
  let t = str.replace(/(?:\s*[();:]\s*)|(?:\s+-\s+)/g, ' | ');
  const segments = t.split(' | ').map(s => s.trim()).filter(s => s.length > 2);
  const result = [];
  for (let seg of segments) {
    const low = seg.toLowerCase();
    const isDuplicate = result.some((existing, idx) => {
      const eLow = existing.toLowerCase();
      if (eLow.includes(low) || low.includes(eLow)) {
        if (seg.length > existing.length) result[idx] = seg;
        return true;
      }
      return false;
    });
    if (!isDuplicate) result.push(seg);
  }
  let final = result.join(' ').trim();
  const semMatch = final.match(/MBA\s+SEM\s+\d/gi);
  if (semMatch && semMatch.length > 1) {
    const firstSem = semMatch[0];
    final = final.replace(new RegExp(firstSem, 'gi'), '___SEM___');
    final = final.replace(/___SEM___/i, firstSem);
    final = final.replace(/___SEM___/gi, '');
  }
  return final.replace(/\s{2,}/g, ' ').trim();
}

async function cleanup() {
  const db = await getDB();
  if (!db) {
    console.error("Failed to connect to DB");
    process.exit(1);
  }

  const targets = ['notifications', 'live-classes'];
  
  for (const category of targets) {
    const collectionName = COLLECTIONS[category] || category;
    const collection = db.collection(collectionName);
    console.log(`\n--- Re-Cleaning duplicates in [${collectionName}] ---`);

    const items = await collection.find({}).toArray();
    const seen = new Map();
    const toDelete = [];

    for (const item of items) {
      const cleaned = cleanTitle(item.title);
      // Matching key: normalized title + semester + date + time
      const key = `${cleaned.toLowerCase()}|${item.semester}|${item.date || ''}|${item.scheduledAt || ''}`;
      
      if (seen.has(key)) {
        const existing = seen.get(key);
        toDelete.push(item._id);
        console.log(`Consolidating duplicate: "${item.title}" -> merged into "${existing.title}"`);
      } else {
        seen.set(key, item);
        if (item.title !== cleaned) {
           await collection.updateOne({ _id: item._id }, { $set: { title: cleaned } });
           console.log(`Refining title: "${item.title}" -> "${cleaned}"`);
        }
      }
    }

    if (toDelete.length > 0) {
      const res = await collection.deleteMany({ _id: { $in: toDelete } });
      console.log(`Successfully removed ${res.deletedCount} redundant entries.`);
    } else {
      console.log(`No remaining duplicates found.`);
    }
  }

  process.exit(0);
}

cleanup();
