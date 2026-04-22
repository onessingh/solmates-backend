
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { getDB, COLLECTIONS } = require('../src/config/database');

async function search() {
  const db = await getDB();
  if (!db) {
    console.error("Failed to connect to DB");
    process.exit(1);
  }

  const collections = await db.listCollections().toArray();
  const searchTerms = ["Management Accounting", "MBA SEM 2", "16-04-2026"];
  
  console.log("--- SEARCHING ALL COLLECTIONS ---");
  
  for (const c of collections) {
    const colName = c.name;
    const items = await db.collection(colName).find({}).toArray();
    
    const matches = items.filter(i => {
      const title = (i.title || "").toLowerCase();
      const desc = (i.description || "").toLowerCase();
      return searchTerms.some(term => title.includes(term.toLowerCase()) || desc.includes(term.toLowerCase()));
    });

    if (matches.length > 0) {
      console.log(`\nCollection [${colName}] found ${matches.length} matches:`);
      matches.forEach(m => {
        console.log(` - ID: ${m.id || m._id} | Title: "${m.title}" | Sem: ${m.semester} | Date: ${m.date || m.scheduledAt}`);
      });
    }
  }

  process.exit(0);
}

search();
