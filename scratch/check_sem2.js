const { getDB } = require('../src/config/database');

async function checkSem2() {
    try {
        const db = await getDB();
        const notifCol = db.collection('notifications');
        const liveCol = db.collection('live_classes');

        const notifs = await notifCol.find({ semester: '2' }).toArray();
        const lives = await liveCol.find({ semester: '2' }).toArray();

        console.log('--- NOTIFICATIONS (Sem 2) ---');
        notifs.forEach(n => console.log(`[${n.id || n._id}] ${n.title} | Expiry: ${n.scheduledAt}`));

        console.log('\n--- LIVE CLASSES (Sem 2) ---');
        lives.forEach(l => console.log(`[${l.id}] ${l.title} | Scheduled: ${l.scheduledAt}`));

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

checkSem2();
