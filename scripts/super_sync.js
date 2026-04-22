const { transactDB } = require('../src/config/database');

async function sync() {
  console.log('--- STARTING SUPER SYNC ---');
  
  await transactDB(async (db) => {
    if (!db.content) db.content = {};
    const categories = ['notes', 'pyq', 'oneshot', 'elearning', 'professor', 'classes'];
    
    categories.forEach(cat => {
      const solCat = (cat === 'pyq') ? 'pyqs' : (cat === 'classes' ? 'live-classes' : cat);
      const solKey = `sol_${solCat.replace(/-/g, '_')}`;
      
      const systemA = db.content[cat] || [];
      const systemB = db[solKey] || [];
      
      console.log(`Processing category: ${cat} / ${solCat}`);
      
      // 1. Sync from System B to System A (Ensuring all folder-based items exist in legacy)
      systemB.forEach(itemB => {
          const idxA = systemA.findIndex(itemA => itemA.id === itemB.id);
          if (idxA === -1) {
              console.log(`  - Mirroring Item B -> A: ${itemB.id} (${itemB.title || itemB.subject})`);
              systemA.push(itemB);
          } else {
              // Update metadata
              systemA[idxA] = { ...systemA[idxA], ...itemB };
          }
      });

      // 2. Sync from System A to System B (Ensuring all legacy items exist in folders/buckets)
      systemA.forEach(itemA => {
          const idxB = systemB.findIndex(itemB => itemB.id === itemA.id);
          if (idxB === -1) {
              console.log(`  - Mirroring Item A -> B: ${itemA.id} (${itemA.title || itemA.subject})`);
              systemB.push(itemA);
          } else {
              // Update metadata (system B might be more recent or have folderId)
              systemB[idxB] = { ...systemB[idxB], ...itemA };
          }
      });
      
      db.content[cat] = systemA;
      db[solKey] = systemB;
    });

    // Cleanup 'undefined' bucket if it exists
    if (db.undefined) {
        console.log(`\nCleanup: Found 'undefined' bucket with ${db.undefined.length} items. Deleting...`);
        delete db.undefined;
    }

    return true; // Commit
  });
  
  console.log('\n--- SUPER SYNC COMPLETE ---');
}

sync().catch(console.error);
