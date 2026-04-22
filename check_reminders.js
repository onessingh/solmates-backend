require('dotenv').config();
const { initDB, getDB } = require('./src/config/database');
const { getISTDateString, getISTMinutesNow } = require('./src/utils/time-utils');

async function check() {
    try {
        await initDB();
        const db = await getDB();
        const dates = getISTDateString();
        const nowMin = getISTMinutesNow();
        console.log('--- Current Context ---');
        console.log('IST Date Strings:', dates);
        console.log('IST Minutes Now:', nowMin);
        
        const classCol = db.collection('live_classes');
        // Check for any class today
        const classes = await classCol.find({
            $or: [
                { date: { $regex: dates.iso, $options: 'i' } },
                { date: { $regex: dates.longDate, $options: 'i' } },
                { date: { $regex: dates.indian, $options: 'i' } }
            ]
        }).toArray();

        console.log('\n--- Today\'s Classes ---');
        if (classes.length === 0) {
            console.log('No classes found for today in DB.');
            
            // Debug: show last 5 classes
            const lastClasses = await classCol.find({}).sort({created_at: -1}).limit(5).toArray();
            console.log('\n--- Last 5 Classes in DB ---');
            lastClasses.forEach(c => console.log(`- ${c.date}: ${c.title} (${c.scheduledAt || c.time})`));
        } else {
            classes.forEach(c => {
                console.log(`- Title: ${c.title}`);
                console.log(`  Time: ${c.scheduledAt || c.time}`);
                console.log(`  Flag 10m: ${c.reminder10MinSent}`);
                console.log(`  Sent At: ${c.reminderSentAt}`);
            });
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
