const path = require('path');
const fs = require('fs');

// Load .env manually if needed
const envPath = path.resolve(__dirname, '.env');
if (fs.existsSync(envPath)) {
    const env = fs.readFileSync(envPath, 'utf8');
    env.split('\n').forEach(line => {
        const [key, val] = line.split('=');
        if (key && val) process.env[key.trim()] = val.trim();
    });
}

const { readDB, initDB } = require('./src/config/database');

(async () => {
    try {
        console.log('Connecting to DB...');
        await initDB();
        const db = await readDB();
        console.log('\n--- TOP LEVEL KEYS ---');
        console.log(Object.keys(db).sort().join(', '));
        
        console.log('\n--- FOLDERS CATEGORIES ---');
        if (db.folders && Array.isArray(db.folders)) {
            const cats = [...new Set(db.folders.map(f => f.category))];
            console.log(cats.join(', '));
            console.log(`Total folders: ${db.folders.length}`);
        } else {
            console.log('No folders array found');
        }
        
        console.log('\n--- POTENTIAL YOUTUBE TABLES ---');
        const ytKeys = ['youtube_videos', 'sol_youtube', 'sol_youtube_videos', 'youtube'];
        ytKeys.forEach(k => {
            if (db[k]) {
                console.log(`${k}: ${Array.isArray(db[k]) ? db[k].length : 'Object'} items`);
                if (Array.isArray(db[k]) && db[k].length > 0) {
                    console.log(`  Sample item:`, JSON.stringify(db[k][0]).substring(0, 100));
                }
            } else {
                console.log(`${k}: Not found`);
            }
        });
        
        console.log('\n--- OTHER SOL TABLES ---');
        Object.keys(db).filter(k => k.startsWith('sol_')).forEach(k => {
            if (!ytKeys.includes(k)) {
                console.log(`${k}: ${Array.isArray(db[k]) ? db[k].length : 'Object'} items`);
            }
        });

        process.exit(0);
    } catch (e) {
        console.error('ERROR:', e);
        process.exit(1);
    }
})();
