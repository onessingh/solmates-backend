const { transactDB } = require('./src/config/database');
const crypto = require('crypto');
require('dotenv').config();

async function createDummyFolder() {
    try {
        await transactDB(async (db) => {
            if (!db.folders) db.folders = [];
            
            const existing = db.folders.find(f => f.name === 'AI_KNOWLEDGE_BASE');
            if (existing) {
                console.log('Dummy folder already exists.');
                return false;
            }

            const newFolder = {
                id: crypto.randomBytes(8).toString('hex'),
                name: 'AI_KNOWLEDGE_BASE',
                category: 'professor',
                semester: '0',
                parentId: null,
                created_at: new Date().toISOString()
            };
            
            db.folders.push(newFolder);
            console.log('Created Dummy Knowledge Folder:', newFolder.id);
            
            // Add a "Welcome" item to it
            if (!db.sol_professor) db.sol_professor = [];
            db.sol_professor.push({
                id: crypto.randomBytes(16).toString('hex'),
                title: 'SOLMATES AI KNOWLEDGE HUB',
                subject: 'AI_KNOWLEDGE_BASE',
                text: 'This folder contains internal documentation for Mate AI. Do not delete.',
                attachments: [],
                semester: '0',
                folderId: newFolder.id,
                created_at: new Date().toISOString()
            });
            
            return true;
        });
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
createDummyFolder();
