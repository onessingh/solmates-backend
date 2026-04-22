const { readDB } = require('./src/config/database');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function run() {
    try {
        const db = await readDB();
        console.log('--- FOLDERS (elearning) ---');
        const elearningFolders = (db.folders || []).filter(f => f.category === 'elearning');
        console.log(JSON.stringify(elearningFolders, null, 2));
        
        console.log('\n--- CONTENT (sol_elearning) ---');
        console.log(JSON.stringify(db.sol_elearning || [], null, 2));

        console.log('\n--- LEGACY CONTENT (content.elearning) ---');
        if (db.content && db.content.elearning) {
            console.log(JSON.stringify(db.content.elearning, null, 2));
        } else {
            console.log('No legacy content found');
        }
    } catch (e) {
        console.error(e);
    }
}

run();
