require('dotenv').config({ path: '../.env' });
const { getDB } = require('../src/config/database');

async function blockNotification() {
    const titleToBlock = "MBA Update Al in Libraries Should We care?- 28th March 2026";
    const db = await getDB();
    if (!db) {
        console.error("Failed to connect to DB. Make sure MONGODB_URI is set.");
        process.exit(1);
    }

    const blCol = db.collection('blacklists');
    const cleanTitle = titleToBlock.trim().toLowerCase();
    const id = 'title_' + Buffer.from(cleanTitle).toString('hex').substring(0, 16);

    const result = await blCol.updateOne(
        { title: cleanTitle },
        { 
            $set: { 
                id, 
                title: titleToBlock.trim(), 
                type: 'title', 
                created_at: new Date().toISOString() 
            } 
        },
        { upsert: true }
    );

    if (result.upsertedCount > 0) {
        console.log(`Successfully added to blacklist: "${titleToBlock}"`);
    } else {
        console.log(`Blacklist entry already exists for: "${titleToBlock}"`);
    }
    
    process.exit(0);
}

blockNotification().catch(err => {
    console.error(err);
    process.exit(1);
});
