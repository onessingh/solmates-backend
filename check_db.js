const { readDB } = require('./src/config/database');
require('dotenv').config();

async function check() {
    try {
        const db = await readDB();
        console.log('Folders:', JSON.stringify(db.folders, null, 2));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
