
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { getDB, COLLECTIONS } = require('../src/config/database');
const crypto = require('crypto');

/**
 * [v84.7] Migration Script: Align existing item IDs with the new Canonical Fingerprint logic.
 */
async function migrate() {
  const db = await getDB();
  if (!db) {
    console.error("Failed to connect to DB");
    process.exit(1);
  }

  const targets = ['notifications', 'live_classes'];
  
  for (const category of targets) {
    const collectionName = COLLECTIONS[category] || category;
    const collection = db.collection(collectionName);
    console.log(`\n--- Migrating IDs in [${collectionName}] ---`);

    const items = await collection.find({}).toArray();
    for (const item of items) {
      const semesterStr = String(item.semester || "").trim();
      const title = (item.title || "").trim();
      
      // Mirror the logic in sol.controller.js
      const canonicalTitle = title
          .replace(/\[\d{2}-\d{2}-\d{4}\]/g, '')
          .replace(/MBA\s+SEM\s+\d/gi, '')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();

      const link = (item.link || item.pdf || item.url || "").trim();
      const fingerSrc = `${canonicalTitle}|${link.toLowerCase()}`;
      const newStableId = crypto.createHash('md5').update(fingerSrc + semesterStr).digest('hex').substring(0, 24);

      if (item.id !== newStableId) {
        console.log(`  Updating ID: "${title}" | ${item.id} -> ${newStableId}`);
        await collection.updateOne({ _id: item._id }, { $set: { id: newStableId } });
      }
    }
  }

  console.log("\nMigration complete. Scraper should now recognize existing items correctly.");
  process.exit(0);
}

migrate();
