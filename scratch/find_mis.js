const { getDB } = require('../src/config/database');
require('dotenv').config({path: '../.env'});

async function findMIS() {
    try {
        const db = await getDB();
        if (!db) { console.error('No DB connection'); return; }
        
        console.log('Searching for "Management of Information System"...');
        const notifs = await db.collection('notifications').find({ 
            title: /Management of Information System/i 
        }).toArray();
        
        const lives = await db.collection('live_classes').find({ 
            title: /Management of Information System/i 
        }).toArray();

        console.log('\n--- NOTIFICATIONS ---');
        console.log(JSON.stringify(notifs, null, 2));

        console.log('\n--- LIVE CLASSES ---');
        console.log(JSON.stringify(lives, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

findMIS();
