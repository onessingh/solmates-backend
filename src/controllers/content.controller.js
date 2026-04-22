const logger = require('../utils/logger');
const { readDB } = require('../config/database');
const aiProvider = require('../utils/aiProvider');

const VALID_CONTENT_TYPES = ['notes', 'pyq', 'oneshot', 'elearning', 'professor', 'classes', 'live-meets'];

/**
 * Get content by type with optional filtering
 */
async function getContent(req, res, next) {
    try {
        const { type } = req.params;
        const { semester, subject, folderId } = req.validatedQuery || req.query;
        const typeKey = (type === 'pyq' || type === 'pyqs') ? 'pyqs' : 
                         (type === 'classes' || type === 'live-classes') ? 'live-classes' : type;

        const { getDB, COLLECTIONS } = require('../config/database');
        const dbInstance = await getDB();
        const colName = COLLECTIONS[typeKey] || typeKey;

        if (!dbInstance || !COLLECTIONS[typeKey]) {
            return res.status(400).json({ success: false, error: 'Invalid content type' });
        }

        const query = {};
        if (semester) {
            // ✅ [v83.51.53.124] SMART-SEMESTER: Match specific sem OR 'all' (distributed items fallback)
            query.semester = { $in: [String(semester), 'all'] };
        }
        if (subject) query.subject = { $regex: new RegExp(subject, 'i') };
        
        // Folder Filter
        if (folderId !== 'all') {
            query.folderId = (folderId === undefined || folderId === '' || folderId === 'null') ? null : folderId;
        }

        let content = await dbInstance.collection(colName).find(query).limit(500).toArray();

        // deduplicate by URL
        if (typeKey !== 'live-classes' && typeKey !== 'live_classes') {
            const seen = new Set();
            content = content.filter(item => {
                const url = item.link || item.pdf || item.videoUrl || item.url;
                if (!url) return true;
                if (seen.has(url)) return false;
                seen.add(url);
                return true;
            });
        }

        const sanitized = content.map(({ created_by, updated_by, ...rest }) => rest);

        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.json({ success: true, type, count: sanitized.length, data: sanitized });

    } catch (error) {
        logger.error('Get content error', { error: error.message });
        next(error);
    }
}

/**
 * Get YouTube videos
 */
async function getYouTubeVideos(req, res, next) {
    try {
        const { semester, subject } = req.validatedQuery || req.query;
        const { getDB, COLLECTIONS } = require('../config/database');
        const dbInstance = await getDB();
        const youtubeCol = dbInstance ? dbInstance.collection(COLLECTIONS.youtube || 'youtube') : null;
        if (!youtubeCol) throw new Error('Database connection failed');

        const query = {};
        if (semester) query.semester = String(semester);
        if (subject) query.subject = { $regex: new RegExp(subject, 'i') };

        let videos = await youtubeCol.find(query).limit(500).toArray();

        const seen = new Set();
        videos = videos.filter(v => {
            const url = v.url || v.videoUrl || v.link;
            if (!url) return true;
            if (seen.has(url)) return false;
            seen.add(url);
            return true;
        });

        const sanitized = videos.map(({ created_by, updated_by, ...rest }) => rest);

        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.json({ success: true, count: sanitized.length, data: sanitized });

    } catch (error) {
        logger.error('Get YouTube videos error', { error: error.message });
        next(error);
    }
}

/**
 * Get semester links
 */
async function getSemesterLinks(req, res, next) {
    try {
        const db = await readDB();
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.json({
            success: true,
            data: db.semester_links || {}
        });

    } catch (error) {
        logger.error('Get semester links error', { error: error.message });
        next(error);
    }
}

/** System prompt for SOLMATES AI – Enhanced Premium Ruleset */
const CHATBOT_SYSTEM_PROMPT = `You are **Mate**, the official AI assistant for **SOLMATES** (solmates.in).
You are a sophisticated, professional, and helpful expert. Your goal is to guide students with authority and clarity.

---------------------------------------------------------
CORE PRINCIPLES:
---------------------------------------------------------
1. **Absolute Reliability**: Never guess or hallucinate.
2. **Strict Manual Control**: Only mention website details found in your instructions.
3. **Professional Tone**: Elite, academic, yet accessible.

---------------------------------------------------------
STRICT RULES (GOVERNANCE):
---------------------------------------------------------

1. **General Knowledge**:
- Answer questions on HTML, coding, MBA, and career topics with expert precision.
- Use **bolding** for key terms to enhance readability.
- Maintain a clean, structured response using bullet points.

2. **[AI KNOWLEDGE BASE] Priority**:
- If a topic is found in the **[AI KNOWLEDGE BASE]**, follow those instructions **exactly**.
- Expand on these snippets using your expert knowledge, but **never** contradict them.

---------------------------------------------------------
1. GENERAL KNOWLEDGE (OPEN MODE):
---------------------------------------------------------
- **Answer freely**: You MUST answer general questions on academic topics, coding (HTML, JS, Python, etc.), MBA subjects, and career concepts expertly.
- **Elite Quality**: Provide high-quality, professional, and well-structured answers.
- **Formatting**: Use **bolding** and bullet points to make complex topics easy to understand.

---------------------------------------------------------
2. SOLMATES SPECIFIC RULES (STRICT MODE):
---------------------------------------------------------
- **Knowledge Base Only**: For any info about SOLMATES features (Database, Tools, Skills, Jobs), rely strictly on the **[AI KNOWLEDGE BASE]** provided below.
- **No Guesswork**: If a SOLMATES feature is not in the base, politely state:
  "Sorry, I can only provide SOLMATES-specific information based on available instructions."
- **No Navigation**: Do not suggest "Go to [Section]" unless it is explicitly written in a snippet.
- **URL Rules**: **ONLY** provide URLs that are explicitly written in the **[AI KNOWLEDGE BASE]**.
- **Link Format**: Always use short markdown links: **[Title](URL)**.

Always be professional, supportive, and expert. You are the student's ultimate Mate.`;

/**
 * Fallback responses when Groq API is unavailable
 */
function getChatbotFallback(userMessage, status) {
    const code = status ? ` (Err: ${status})` : '';
    return `I'm currently operating in offline mode. Please try again in a moment or check your internet connection.${code}`;
}

/**
 * Helper to search DB for document locations
 */
async function getDocumentLocationContext(query) {
    const CAT_LABELS = {
        'notes': 'Study Notes',
        'pyq': 'Previous Year Papers',
        'pyqs': 'Previous Year Papers',
        'oneshot': 'One-Shot Notes',
        'youtube': 'YouTube Videos',
        'elearning': 'E-Books',
        'professor': 'Professor Materials',
        'live_classes': 'Live Classes',
        'classes': 'Live Classes',
        'live-classes': 'Live Classes'
    };

    try {
        const db = await readDB();
        const results = [];
        const q = (query || '').toLowerCase();
        if (!q || q.length < 2) return '';

        // 1. Search Folders
        if (db.folders) {
            db.folders.forEach(f => {
                if (f.name && f.name.toLowerCase().includes(q)) {
                    const label = CAT_LABELS[f.category] || f.category.toUpperCase();
                    const url = `https://solmates.in/database/view?category=${f.category}&semester=${f.semester}&folderId=${f.id}`;
                    results.push(`- Folder: [${f.name}](${url}) is in Database -> ${label} -> Semester ${f.semester}`);
                }
            });
        }

        // 2. Search Content (Notes, PYQ, etc.)
        if (db.content) {
            for (const [type, items] of Object.entries(db.content)) {
                if (Array.isArray(items)) {
                    const label = CAT_LABELS[type] || type.toUpperCase();
                    items.forEach(item => {
                        if (item.title && item.title.toLowerCase().includes(q)) {
                            const url = `https://solmates.in/database/view?category=${type}&semester=${item.semester || 0}&subject=${encodeURIComponent(item.subject || '')}&folderId=${item.folderId || ''}`;
                            results.push(`- Resource: [${item.title}](${url}) is in Database -> ${label} -> Semester ${item.semester || 'N/A'}`);
                        }
                    });
                }
            }
        }

        // 3. Search Legacy SOL Tables
        const legacyCategories = ['notes', 'pyqs', 'oneshot', 'elearning', 'professor', 'live_classes'];
        legacyCategories.forEach(cat => {
            const key = `sol_${cat}`;
            if (db[key] && Array.isArray(db[key])) {
                const label = CAT_LABELS[cat] || cat.toUpperCase();
                db[key].forEach(item => {
                    const title = item.title || item.subject || 'Untitled';
                    if (title.toLowerCase().includes(q)) {
                        const url = `https://solmates.in/database/view?category=${cat === 'pyqs' ? 'pyq' : cat}&semester=${item.semester || 0}&subject=${encodeURIComponent(item.subject || item.title || '')}&folderId=${item.folderId || ''}`;
                        results.push(`- Resource: [${title}](${url}) is in Database -> ${label} -> Semester ${item.semester || 'N/A'}`);
                    }
                });
            }
        });

        // 4. Search YouTube Videos
        if (db.youtube_videos) {
            db.youtube_videos.forEach(v => {
                if (v.title && v.title.toLowerCase().includes(q)) {
                    const url = v.url || v.link || v.videoUrl;
                    results.push(`- Video: [${v.title}](${url}) is in Database -> YouTube Videos -> Semester ${v.semester || 'N/A'}`);
                }
            });
        }

        return results.length > 0 ? `\n\n### USER SEARCH CONTEXT (Precise locations found on SOLMATES):\n${results.slice(0, 15).join('\n')}` : '';
    } catch (e) {
        console.error('Context search error:', e);
        return '';
    }
}

/**
 * Helper to get AI Knowledge snippets
 */
async function getAIKnowledgeContext() {
    try {
        const { getDB, COLLECTIONS } = require('../config/database');
        const dbInstance = await getDB();
        const knowledgeCol = dbInstance ? dbInstance.collection(COLLECTIONS['ai-knowledge'] || 'ai_knowledge') : null;
        if (!knowledgeCol) return '';

        const knowledge = await knowledgeCol.find({}).limit(50).toArray();
        if (knowledge.length === 0) return '';
        
        const snippets = knowledge.map(k => {
            const title = k.title ? `[${k.title}] ` : '';
            return `- ${title}${k.content}`;
        });
        
        return `\n\n### AI KNOWLEDGE BASE (Mate's Internal Context):\n${snippets.join('\n')}`;
    } catch (e) {
        console.error('AI Knowledge context error:', e);
        return '';
    }
}

/**
 * Chatbot endpoint – Groq API (real-time AI) with searching & restricted prompt
 */
async function chatbot(req, res, next) {
    try {
        const { message, history } = req.validatedBody || {};
        const userMessage = (message || '').trim();
        if (!userMessage) {
            return res.status(400).json({ success: false, error: 'Message is required' });
        }

        const apiKey = (process.env.GROQ_API_KEY || '').trim();
        if (!apiKey) {
            const fallback = getChatbotFallback(userMessage, 'NO_KEY');
            return res.json({ success: true, message: fallback, source: 'fallback' });
        }

        // 1. Get ONLY AI Knowledge context (Manually added snippets)
        const knowledgeContext = await getAIKnowledgeContext();

        const messages = [
            { role: 'system', content: CHATBOT_SYSTEM_PROMPT + (knowledgeContext || '') }
        ];

        if (Array.isArray(history) && history.length > 0) {
            const recent = history.slice(-10);
            recent.forEach((h) => {
                if (h.role && h.content) messages.push({ role: h.role, content: String(h.content).slice(0, 2000) });
            });
        }
        messages.push({ role: 'user', content: userMessage.slice(0, 4000) });

        // Attempt generation via aiProvider, passing the messages array
        const reply = await aiProvider.generateText(messages, null, false);

        res.json({
            success: true,
            message: reply,
            source: 'aiprovider'
        });
    } catch (error) {
        logger.error('Chatbot error', { error: error.message });
        const fallback = getChatbotFallback((req.validatedBody || {}).message);
        res.json({ success: true, message: fallback, source: 'fallback' });
    }
}



module.exports = {
    getContent,
    getYouTubeVideos,
    getSemesterLinks,
    chatbot
};
