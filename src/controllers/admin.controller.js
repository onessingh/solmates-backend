const crypto = require('crypto');
const logger = require('../utils/logger');
const { readDB, writeDB, transactDB, checkDatabaseSize } = require('../config/database');

const VALID_CONTENT_TYPES = ['notes', 'pyq', 'oneshot', 'elearning', 'professor', 'classes'];
const MAX_CONTENT_ITEMS = 1000; // FIXED ISSUE #8: Maximum items per content type

/**
 * Add new content
 * FIXED MEDIUM #4: Added duplicate URL detection
 * FIXED ISSUE #8: Added maximum content limit
 */
async function addContent(req, res, next) {
    try {
        const { type } = req.params;
        const normalizedType = type === 'pyqs' ? 'pyq' : (type === 'live-classes' ? 'classes' : type);
        const { data, semester, subject } = req.validatedBody;

        if (!VALID_CONTENT_TYPES.includes(normalizedType)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid content type'
            });
        }
        
        // AUDIT FIX: Check database size before adding content
        const dbSize = await checkDatabaseSize();
        if (dbSize > 45) { // 45MB threshold (MAX is 50MB)
            logger.error('Database size limit approaching', { sizeMB: dbSize.toFixed(2) });
            return res.status(507).json({
                success: false,
                error: 'Database storage nearly full. Please contact administrator to clean up old content.',
                currentSize: `${dbSize.toFixed(2)} MB`,
                maxSize: '50 MB'
            });
        }

        // Explicitly construct content object (prevent prototype pollution)
        const newContent = {
            id: crypto.randomBytes(16).toString('hex'),
            title: data.title,
            url: data.url,
            description: data.description || '',
            thumbnail: data.thumbnail || null,
            scheduledAt: data.scheduledAt || null,
            semester: semester || null,
            subject: subject || null,
            folderId: data.folderId || null,
            created_at: new Date().toISOString(),
            created_by: req.admin.adminId
        };

        // FIXED CRITICAL #2: Use transaction for atomic read-modify-write
        await transactDB(async (db) => {
            // ✅ FIX: Ensure content array exists (handles old DB without this field)
            if (!db.content) db.content = {};
            if (!db.content[normalizedType]) db.content[normalizedType] = [];
            // Check content limit
            if (db.content[normalizedType].length >= MAX_CONTENT_ITEMS) {
                logger.warn('Content limit reached', {
                    type: normalizedType,
                    currentCount: db.content[normalizedType].length,
                    limit: MAX_CONTENT_ITEMS
                });
                const error = new Error(`Maximum content limit reached for ${normalizedType} (${MAX_CONTENT_ITEMS} items)`);
                error.statusCode = 400;
                error.currentCount = db.content[normalizedType].length;
                error.limit = MAX_CONTENT_ITEMS;
                throw error;
            }
            
            // Check for duplicate URL in same semester/folder
            const existingContent = db.content[normalizedType].find(
                item => item.url === data.url && item.semester === semester && item.folderId === (data.folderId || null)
            );
            
            if (existingContent) {
                logger.warn('Duplicate content URL detected', {
                    type: normalizedType,
                    url: data.url,
                    semester,
                    folderId: data.folderId,
                    existingId: existingContent.id
                });
                const error = new Error('Content with this URL already exists in this folder/semester');
                error.statusCode = 409;
                error.existingId = existingContent.id;
                error.existingTitle = existingContent.title;
                throw error;
            }
            
            // Add content
            db.content[normalizedType].push(newContent);

            // ✅ MIRROR to System B (folder-based system)
            const solCategory = (normalizedType === 'pyq') ? 'pyqs' : (normalizedType === 'classes' ? 'live-classes' : normalizedType);
            const solKey = `sol_${solCategory.replace(/-/g, '_')}`;
            if (!db[solKey]) db[solKey] = [];
            db[solKey].push(newContent);

            return true; // commit
        });

        logger.info('Content added', {
            type: normalizedType,
            id: newContent.id,
            admin: req.admin.adminId,
            folderId: newContent.folderId
        });

        // ✅ FIX: Emit real-time event so all connected devices update instantly
        const io = req.app.get('io') || global.io;
        if (io) {
            io.emit('content:updated', { type: normalizedType, action: 'add', id: newContent.id, folderId: newContent.folderId, timestamp: Date.now() });
        }

        res.json({
            success: true,
            data: newContent
        });

    } catch (error) {
        logger.error('Add content error', { error: error.message });
        
        // Handle validation errors from transaction
        if (error.statusCode === 400) {
            return res.status(400).json({
                success: false,
                error: error.message,
                currentCount: error.currentCount,
                limit: error.limit
            });
        }
        
        if (error.statusCode === 409) {
            return res.status(409).json({
                success: false,
                error: error.message,
                existingId: error.existingId,
                existingTitle: error.existingTitle
            });
        }
        
        next(error);
    }
}

/**
 * Update existing content (NEW)
 */
async function updateContent(req, res, next) {
    try {
        const { type, id } = req.params;
        const normalizedType = type === 'pyqs' ? 'pyq' : (type === 'live-classes' ? 'classes' : type);
        const { data, semester, subject } = req.validatedBody;

        if (!VALID_CONTENT_TYPES.includes(normalizedType)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid content type'
            });
        }

        // FIXED HIGH #1: Use transaction for update
        const result = await transactDB(async (db) => {
            if (!db.content) db.content = {};
            if (!db.content[normalizedType]) db.content[normalizedType] = [];
            const itemIndex = db.content[normalizedType].findIndex(item => item.id === id);

            if (itemIndex === -1) {
                const error = new Error('Content not found');
                error.statusCode = 404;
                throw error;
            }

            const existingItem = db.content[normalizedType][itemIndex];
            const updatedItem = {
                ...existingItem,
                title: data.title !== undefined ? data.title : existingItem.title,
                url: data.url !== undefined ? data.url : existingItem.url,
                description: data.description !== undefined ? data.description : existingItem.description,
                thumbnail: data.thumbnail !== undefined ? data.thumbnail : existingItem.thumbnail,
                scheduledAt: data.scheduledAt !== undefined ? data.scheduledAt : existingItem.scheduledAt,
                semester: semester !== undefined ? semester : existingItem.semester,
                subject: subject !== undefined ? subject : existingItem.subject,
                folderId: data.folderId !== undefined ? data.folderId : existingItem.folderId,
                updated_at: new Date().toISOString(),
                updated_by: req.admin.adminId
            };
            db.content[normalizedType][itemIndex] = updatedItem;

            // ✅ MIRROR to System B
            const solCategory = (normalizedType === 'pyq') ? 'pyqs' : (normalizedType === 'classes' ? 'live-classes' : normalizedType);
            const solKey = `sol_${solCategory.replace(/-/g, '_')}`;
            if (db[solKey]) {
                const solIdx = db[solKey].findIndex(i => i.id === id);
                if (solIdx !== -1) {
                    db[solKey][solIdx] = { ...db[solKey][solIdx], ...updatedItem };
                }
            }

            return updatedItem; // Return for response
        });

        logger.info('Content updated', {
            type,
            id,
            admin: req.admin.adminId
        });

        // ✅ FIX: Emit real-time event so all connected devices update instantly
        const io = req.app.get('io') || global.io;
        if (io) {
            io.emit('content:updated', { type: normalizedType, action: 'update', id, timestamp: Date.now() });
        }

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        if (error.statusCode === 404) {
            return res.status(404).json({
                success: false,
                error: error.message
            });
        }
        logger.error('Update content error', { error: error.message });
        next(error);
    }
}

/**
 * Delete content
 */
async function deleteContent(req, res, next) {
    try {
        const { type, id } = req.params;

        if (!VALID_CONTENT_TYPES.includes(type)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid content type'
            });
        }

        // FIXED HIGH #1: Use transaction for delete
        await transactDB(async (db) => {
            if (!db.content) db.content = {};
            const normalizedType = type === 'pyqs' ? 'pyq' : (type === 'live-classes' ? 'classes' : type);
            if (!db.content[normalizedType]) db.content[normalizedType] = [];
            const initialLength = db.content[normalizedType].length;
            // ✅ v85.0: SOFT DELETE — Move to Recycle Bin before filtering out
            const targetItem = db.content[normalizedType].find(item => item.id === id);
            if (targetItem) {
                const { getDB } = require('../config/database');
                getDB().then(dbInstance => {
                    if (dbInstance) {
                        dbInstance.collection('recycle_bin').insertOne({
                            id: targetItem.id,
                            category: type,
                            semester: String(targetItem.semester),
                            type: 'item',
                            originalCollection: 'solmates_db', // Flag for monolithic DB restore
                            isMonolithic: true,
                            data: targetItem,
                            deletedAt: new Date().toISOString()
                        });
                    }
                });
            }

            db.content[normalizedType] = db.content[normalizedType].filter(item => item.id !== id);

            return true; // commit
        });

        logger.info('Content deleted', {
            type,
            id,
            admin: req.admin.adminId
        });

        // ✅ FIX: Emit real-time event so all connected devices update instantly
        const io = req.app.get('io') || global.io;
        if (io) {
            const normalizedType = type === 'pyqs' ? 'pyq' : (type === 'live-classes' ? 'classes' : type);
            io.emit('content:updated', { type: normalizedType, action: 'delete', id, timestamp: Date.now() });
        }

        res.json({
            success: true,
            message: 'Content deleted successfully'
        });

    } catch (error) {
        if (error.statusCode === 404) {
            return res.status(404).json({
                success: false,
                error: error.message
            });
        }
        logger.error('Delete content error', { error: error.message });
        next(error);
    }
}

/**
 * Add YouTube video
 * FIXED CRITICAL #1: Now uses transaction for race condition protection
 */
async function addYouTubeVideo(req, res, next) {
    try {
        const videoData = req.validatedBody;
        let newVideo;
        
        // AUDIT FIX: Check database size before adding video
        const dbSize = await checkDatabaseSize();
        if (dbSize > 45) { // 45MB threshold (MAX is 50MB)
            logger.error('Database size limit approaching', { sizeMB: dbSize.toFixed(2) });
            return res.status(507).json({
                success: false,
                error: 'Database storage nearly full. Please contact administrator to clean up old content.',
                currentSize: `${dbSize.toFixed(2)} MB`,
                maxSize: '50 MB'
            });
        }

        await transactDB(async (db) => {
            // ✅ FIX: Ensure youtube_videos exists (safety guard for edge-case DB state)
            if (!db.youtube_videos) db.youtube_videos = [];
            // FIXED HIGH #2: Add duplicate check
            const existingVideo = db.youtube_videos.find(
                video => video.url === videoData.url && 
                        video.semester === videoData.semester
            );
            
            if (existingVideo) {
                logger.warn('Duplicate YouTube video URL detected', {
                    url: videoData.url,
                    semester: videoData.semester,
                    existingId: existingVideo.id
                });
                const error = new Error('Video with this URL already exists for this semester');
                error.statusCode = 409;
                error.existingId = existingVideo.id;
                error.existingTitle = existingVideo.title;
                throw error;
            }
            
            newVideo = {
                id: crypto.randomBytes(16).toString('hex'),
                title: videoData.title,
                url: videoData.url,
                semester: videoData.semester || null,
                subject: videoData.subject || null,
                thumbnail: videoData.thumbnail || '',
                created_at: new Date().toISOString(),
                created_by: req.admin.adminId
            };

            db.youtube_videos.push(newVideo);
            return true; // commit
        });

        logger.info('YouTube video added', {
            id: newVideo.id,
            title: newVideo.title,
            admin: req.admin.adminId
        });

        // ✅ FIX: Emit real-time event so all connected devices update instantly
        const io = req.app.get('io') || global.io;
        if (io) {
            io.emit('content:updated', { type: 'youtube', action: 'add', id: newVideo.id, timestamp: Date.now() });
        }

        res.json({
            success: true,
            data: newVideo
        });

    } catch (error) {
        // Handle duplicate error
        if (error.statusCode === 409) {
            return res.status(409).json({
                success: false,
                error: error.message,
                existingId: error.existingId,
                existingTitle: error.existingTitle
            });
        }
        
        logger.error('Add YouTube video error', { error: error.message });
        next(error);
    }
}

/**
 * Update YouTube video (NEW)
 */
async function updateYouTubeVideo(req, res, next) {
    try {
        const { id } = req.params;
        const videoData = req.validatedBody;

        // FIXED HIGH #1: Use transaction for update
        const result = await transactDB(async (db) => {
            if (!db.youtube_videos) db.youtube_videos = [];
            const videoIndex = db.youtube_videos.findIndex(video => video.id === id);

            if (videoIndex === -1) {
                const error = new Error('Video not found');
                error.statusCode = 404;
                throw error;
            }

            const existingVideo = db.youtube_videos[videoIndex];
            db.youtube_videos[videoIndex] = {
                ...existingVideo,
                title: videoData.title !== undefined ? videoData.title : existingVideo.title,
                url: videoData.url !== undefined ? videoData.url : existingVideo.url,
                semester: videoData.semester !== undefined ? videoData.semester : existingVideo.semester,
                subject: videoData.subject !== undefined ? videoData.subject : existingVideo.subject,
                thumbnail: videoData.thumbnail !== undefined ? videoData.thumbnail : existingVideo.thumbnail,
                updated_at: new Date().toISOString(),
                updated_by: req.admin.adminId
            };

            return db.youtube_videos[videoIndex]; // Return for response
        });

        logger.info('YouTube video updated', {
            id,
            admin: req.admin.adminId
        });

        // ✅ FIX: Emit real-time event so all connected devices update instantly
        const io = req.app.get('io') || global.io;
        if (io) {
            io.emit('content:updated', { type: 'youtube', action: 'update', id, timestamp: Date.now() });
        }

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        if (error.statusCode === 404) {
            return res.status(404).json({
                success: false,
                error: error.message
            });
        }
        logger.error('Update YouTube video error', { error: error.message });
        next(error);
    }
}

/**
 * Delete YouTube video
 */
async function deleteYouTubeVideo(req, res, next) {
    try {
        const { id } = req.params;

        // FIXED HIGH #1: Use transaction for delete
        await transactDB(async (db) => {
            if (!db.youtube_videos) db.youtube_videos = [];
            const initialLength = db.youtube_videos.length;
            // ✅ v85.0: SOFT DELETE — Move YouTube Video to Recycle Bin
            const targetVideo = db.youtube_videos.find(v => v.id === id);
            if (targetVideo) {
                const { getDB } = require('../config/database');
                getDB().then(dbInstance => {
                    if (dbInstance) {
                        dbInstance.collection('recycle_bin').insertOne({
                            id: targetVideo.id,
                            category: 'youtube',
                            semester: String(targetVideo.semester),
                            type: 'item',
                            originalCollection: 'solmates_db',
                            isMonolithicValue: 'youtube_videos',
                            data: targetVideo,
                            deletedAt: new Date().toISOString()
                        });
                    }
                });
            }

            db.youtube_videos = db.youtube_videos.filter(video => video.id !== id);
        });

        logger.info('YouTube video deleted', {
            id,
            admin: req.admin.adminId
        });

        // ✅ FIX: Emit real-time event so all connected devices update instantly
        const io = req.app.get('io') || global.io;
        if (io) {
            io.emit('content:updated', { type: 'youtube', action: 'delete', id, timestamp: Date.now() });
        }

        res.json({
            success: true,
            message: 'Video deleted successfully'
        });

    } catch (error) {
        if (error.statusCode === 404) {
            return res.status(404).json({
                success: false,
                error: error.message
            });
        }
        logger.error('Delete YouTube video error', { error: error.message });
        next(error);
    }
}

/**
 * Update semester links
 * FIXED CRITICAL #1: Now uses transaction for race condition protection
 */
async function updateSemesterLink(req, res, next) {
    try {
        const { semester, link, title } = req.validatedBody;
        const value = (title && String(title).trim()) ? { link, title: String(title).trim() } : link;

        await transactDB(async (db) => {
            if (!db.semester_links) db.semester_links = {};
            db.semester_links[semester] = value;
            return true;
        });

        // Emit WebSocket event with detailed data for real-time updates
        const io = req.app.get('io') || global.io;
        if (io) {
            const eventData = {
                semester: semester,
                link: typeof value === 'object' ? value.link : value,
                title: typeof value === 'object' ? value.title : '',
                timestamp: Date.now()
            };
            io.emit('links:updated', eventData);
            logger.info('WebSocket event emitted: links:updated', { data: eventData });
        } else {
            logger.warn('Socket.io not available - real-time update skipped');
        }
        
        logger.info('Semester link updated', { semester, admin: req.admin.adminId });

        res.json({ 
            success: true, 
            data: { 
                semester, 
                link: typeof value === 'object' ? value.link : value, 
                title: typeof value === 'object' ? value.title : null 
            } 
        });

    } catch (error) {
        logger.error('Update semester link error', { error: error.message });
        next(error);
    }
}

/**
 * Get admin sessions (for monitoring)
 */
async function getSessions(req, res, next) {
    try {
        const db = await readDB();
        
        // Don't expose full session data
        const sessions = (db.admin_sessions || []).map(s => ({
            created_at: s.created_at,
            ip: s.ip.replace(/\.\d+$/, '.***'), // Partially mask IP
            admin_id: s.admin_id
        }));

        res.json({
            success: true,
            count: sessions.length,
            sessions
        });

    } catch (error) {
        logger.error('Get sessions error', { error: error.message });
        next(error);
    }
}

module.exports = {
    addContent,
    updateContent,
    deleteContent,
    addYouTubeVideo,
    updateYouTubeVideo,
    deleteYouTubeVideo,
    updateSemesterLink,
    getSessions
};
