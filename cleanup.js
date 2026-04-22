const { transactDB } = require('./src/config/database');
require('dotenv').config();

async function cleanup() {
    try {
        console.log('Starting DB cleanup...');
        await transactDB(async (db) => {
            if (db.content && db.content.undefined) {
                console.log(`Found ${db.content.undefined.length} items in db.content.undefined. Deleting...`);
                delete db.content.undefined;
            } else {
                console.log('No corrupted "undefined" key found in db.content.');
            }
            
            // Clean up any other weird keys if they exist
            if (db.content) {
                Object.keys(db.content).forEach(k => {
                    if (k === 'null' || k === '') {
                        console.log(`Deleting weird key: "${k}"`);
                        delete db.content[k];
                    }
                });
            }
            
            return true; // commit
        });
        console.log('Cleanup complete.');
    } catch (e) {
        console.error('Cleanup failed:', e);
    }
    process.exit(0);
}

cleanup();
