const logger = require('../utils/logger');
const { getDB, COLLECTIONS } = require('../config/database');
const crypto = require('crypto');

/**
 * SOL Recycle Bin Controller (v85.0)
 * Handles soft-deleted items and folders.
 */

/**
 * Get all items in the recycle bin
 */
async function getBinItems(req, res, next) {
    try {
        const db = await getDB();
        if (!db) throw new Error('Database not connected');

        const items = await db.collection('recycle_bin')
            .find({})
            .sort({ deletedAt: -1 })
            .toArray();

        res.json({
            success: true,
            count: items.length,
            data: items
        });
    } catch (error) {
        logger.error('Get bin items error', { error: error.message });
        next(error);
    }
}

/**
 * Restore an item from the recycle bin
 */
async function restoreItem(req, res, next) {
    try {
        const { id } = req.params;
        const db = await getDB();
        if (!db) throw new Error('Database not connected');

        const binItem = await db.collection('recycle_bin').findOne({ id });
        if (!binItem) {
            return res.status(404).json({ success: false, error: 'Item not found in recycle bin' });
        }

        const { originalCollection, data, isMonolithic, isMonolithicValue, category } = binItem;
        
        if (isMonolithic) {
            // Restore to solmates_db monolithic document
            const { transactDB } = require('../config/database');
            await transactDB(async (db) => {
                if (isMonolithicValue === 'youtube_videos') {
                    if (!db.youtube_videos) db.youtube_videos = [];
                    if (!db.youtube_videos.find(v => v.id === data.id)) db.youtube_videos.push(data);
                } else {
                    const type = category === 'pyqs' ? 'pyq' : (category === 'live-classes' ? 'classes' : category);
                    if (!db.content) db.content = {};
                    if (!db.content[type]) db.content[type] = [];
                    if (!db.content[type].find(i => i.id === data.id)) db.content[type].push(data);
                }
                return true;
            });
        } else {
            // Restore to optimized collection
            const targetCol = db.collection(originalCollection);
            const exists = await targetCol.findOne({ id: data.id });
            if (!exists) {
                await targetCol.insertOne(data);
            }
        }

        // Remove from bin
        await db.collection('recycle_bin').deleteOne({ id });

        logger.info('Item restored from recycle bin', { id, category: binItem.category, originalCollection });

        res.json({
            success: true,
            message: 'Item restored successfully to its original location',
            restoredItem: data
        });
    } catch (error) {
        logger.error('Restore item error', { error: error.message });
        next(error);
    }
}

/**
 * Permanently delete an item from the recycle bin
 */
async function permanentDelete(req, res, next) {
    try {
        const { id } = req.params;
        const db = await getDB();
        if (!db) throw new Error('Database not connected');

        const result = await db.collection('recycle_bin').deleteOne({ id });

        if (result.deletedCount === 0) {
            return res.status(404).json({ success: false, error: 'Item not found in recycle bin' });
        }

        logger.info('Item permanently deleted from recycle bin', { id });

        res.json({
            success: true,
            message: 'Item permanently deleted'
        });
    } catch (error) {
        logger.error('Permanent delete error', { error: error.message });
        next(error);
    }
}

/**
 * System Task: Auto-cleanup items older than 7 days
 */
async function autoCleanupBin() {
    try {
        const db = await getDB();
        if (!db) return;

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const result = await db.collection('recycle_bin').deleteMany({
            deletedAt: { $lt: sevenDaysAgo.toISOString() }
        });

        if (result.deletedCount > 0) {
            logger.info('Recycle bin auto-cleanup executed', { deletedCount: result.deletedCount });
        }
    } catch (error) {
        logger.error('Recycle bin auto-cleanup failed', { error: error.message });
    }
}

module.exports = {
    getBinItems,
    restoreItem,
    permanentDelete,
    autoCleanupBin
};
