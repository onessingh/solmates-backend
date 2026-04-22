const { readDB } = require('./src/config/database');
const { VALID_CATEGORIES } = require('./src/models/sol.schemas');
require('dotenv').config();

async function diag() {
    try {
        const db = await readDB();
        console.log('--- DATABASE DIAGNOSTIC OUTPUT ---');
        console.log('Database Keys Found:', Object.keys(db).filter(k => !['_id', 'admin_sessions', 'failed_login_attempts', 'account_lockouts'].includes(k)));
        
        console.log('\n--- FOLDERS ---');
        const folders = db.folders || [];
        console.log('Total folder count:', folders.length);
        const folderCategories = [...new Set(folders.map(f => f.category))];
        console.log('Folder Categories present:', folderCategories);
        
        // Find folders with same name and semester across categories
        const foldersBySemName = {};
        folders.forEach(f => {
            const key = `${f.semester}_${f.name.toUpperCase()}`;
            if (!foldersBySemName[key]) foldersBySemName[key] = [];
            foldersBySemName[key].push(f);
        });
        
        console.log('\n--- POTENTIAL CONFLICTS ---');
        Object.entries(foldersBySemName).forEach(([key, list]) => {
            if (list.length > 1) {
                console.log(`Semester_Name ${key} has ${list.length} folders across categories:`, list.map(f => f.category).join(', '));
            }
        });

        console.log('\n--- BUCKET CONTENTS ---');
        VALID_CATEGORIES.forEach(cat => {
            const key = `sol_${cat.replace(/-/g, '_')}`;
            const items = db[key] || [];
            console.log(`${key}: ${items.length} items`);
            
            // Check for correct folderId mapping
            items.forEach(item => {
                if (item.folderId) {
                    const f = folders.find(folder => folder.id === item.folderId);
                    if (f && f.category !== cat) {
                        console.error(`!!! LEAK DETECTED: Item ${item.id} in bucket ${key} says it is in folder ${item.folderId}, which belongs to category ${f.category}`);
                    }
                }
            });
        });

        if (db.content) {
            console.log('\n--- SYSTEM A (LEGACY) CONTENT ---');
            Object.entries(db.content).forEach(([cat, items]) => {
                console.log(`db.content.${cat}: ${items.length} items`);
            });
        }

    } catch (e) {
        console.error('DIAGNOSTIC ERROR:', e);
    }
    process.exit(0);
}

diag();
