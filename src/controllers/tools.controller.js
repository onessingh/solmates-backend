/**
 * SOLMATES Tools Controller
 * Handles Resume, Career Test, Interview Prep, Study Plan, File Tools
 */

const { readDB, transactDB } = require('../config/database');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Lazy-load heavy deps
let sharp, pdfLib, puppeteer, mammoth, pdfParse, docxLib, fetch, heicConvert;

async function getSharp() {
    if (!sharp) sharp = require('sharp');
    return sharp;
}

async function getHeicConvert() {
    if (!heicConvert) heicConvert = require('heic-convert');
    return heicConvert;
}

async function getPdfLib() {
    if (!pdfLib) pdfLib = require('pdf-lib');
    return pdfLib;
}

async function getPuppeteer() {
    if (!puppeteer) puppeteer = require('puppeteer');
    return puppeteer;
}

async function getMammoth() {
    if (!mammoth) mammoth = require('mammoth');
    return mammoth;
}

async function getPdfParse() {
    if (!pdfParse) pdfParse = require('pdf-parse');
    return pdfParse;
}

async function getDocx() {
    if (!docxLib) docxLib = require('docx');
    return docxLib;
}

function getFetch() {
    if (typeof globalThis.fetch === 'function') return globalThis.fetch;
    if (!fetch) fetch = require('node-fetch');
    return fetch;
}

// ========== RESUME API ==========

async function createResume(req, res) {
    try {
        const data = req.validatedBody || req.body;
        const id = uuidv4();
        const draft = {
            id,
            data: sanitizeResumeData(data.data || data),
            template: data.template || 'ats',
            updatedAt: new Date().toISOString(),
            createdAt: new Date().toISOString()
        };

        await transactDB(async (db) => {
            if (!db.resume_drafts) db.resume_drafts = [];
            db.resume_drafts.push(draft);
            return true;
        });

        logger.info('Resume draft created', { id });
        return res.status(201).json({ success: true, id, resume: draft });
    } catch (err) {
        logger.error('Create resume error', { error: err.message });
        return res.status(500).json({ success: false, error: 'Failed to save resume' });
    }
}

async function getResume(req, res) {
    try {
        const { id } = req.params;
        const db = await readDB();
        const drafts = db.resume_drafts || [];
        const draft = drafts.find((d) => d.id === id);
        if (!draft) {
            return res.status(404).json({ success: false, error: 'Resume not found' });
        }
        return res.json({ success: true, resume: draft });
    } catch (err) {
        logger.error('Get resume error', { error: err.message });
        return res.status(500).json({ success: false, error: 'Failed to fetch resume' });
    }
}

async function updateResume(req, res) {
    try {
        const { id } = req.params;
        const data = req.validatedBody || req.body;

        const result = await transactDB(async (db) => {
            const drafts = db.resume_drafts || [];
            const idx = drafts.findIndex((d) => d.id === id);
            if (idx === -1) return false;
            drafts[idx] = {
                ...drafts[idx],
                data: sanitizeResumeData(data.data || data),
                template: data.template !== undefined ? data.template : drafts[idx].template,
                updatedAt: new Date().toISOString()
            };
            return true;
        });

        if (!result) {
            return res.status(404).json({ success: false, error: 'Resume not found' });
        }
        logger.info('Resume draft updated', { id });
        return res.json({ success: true });
    } catch (err) {
        logger.error('Update resume error', { error: err.message });
        return res.status(500).json({ success: false, error: 'Failed to update resume' });
    }
}

async function generateResumePdf(req, res) {
    try {
        const { id } = req.params;
        const db = await readDB();
        const drafts = db.resume_drafts || [];
        const draft = drafts.find((d) => d.id === id);
        if (!draft) {
            return res.status(404).json({ success: false, error: 'Resume not found' });
        }

        const html = buildResumeHtml(draft.data, draft.template);
        const pdf = await renderPdfFromHtml(html);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="resume-${id}.pdf"`);
        return res.send(pdf);
    } catch (err) {
        logger.error('Generate PDF error', { error: err.message });
        return res.status(500).json({ success: false, error: 'Failed to generate PDF' });
    }
}

function sanitizeResumeData(data) {
    if (!data || typeof data !== 'object') return {};
    const allowed = ['personalInfo', 'summary', 'experience', 'education', 'skills', 'projects', 'certifications', 'languages', 'objective', 'highlights'];
    const out = {};
    for (const k of allowed) {
        if (data[k] !== undefined) out[k] = data[k];
    }
    return out;
}

function buildResumeHtml(data, template) {
    const p = data.personalInfo || {};
    const name = p.fullName || 'Your Name';
    const email = p.email || '';
    const phone = p.phone || '';
    const loc = p.location || {};
    const locStr = [loc.city, loc.state, loc.country].filter(Boolean).join(', ');

    let expHtml = '';
    if (Array.isArray(data.experience) && data.experience.length) {
        expHtml = data.experience.map((e) => {
            const title = e.title || e.jobTitle || '';
            const company = e.company || '';
            const dates = e.dates || ((e.startDate || e.endDate) ? [e.startDate, e.endDate].filter(Boolean).join(' - ') : '');
            const desc = e.description || (Array.isArray(e.bullets) ? e.bullets.map(b => `• ${b}`).join('\n') : '');
            return `
          <div style="margin-bottom:12px;">
            <strong>${escapeHtml(title)}</strong> — ${escapeHtml(company)}
            ${dates ? `<br><small>${escapeHtml(dates)}</small>` : ''}
            ${desc ? `<p style="margin:4px 0 0 0;font-size:13px;white-space:pre-line;">${escapeHtml(desc)}</p>` : ''}
          </div>
        `;
        }).join('');
    }

    let eduHtml = '';
    if (Array.isArray(data.education) && data.education.length) {
        eduHtml = data.education.map((e) => {
            const degree = e.degree || '';
            const inst = e.institution || '';
            const dates = e.dates || ((e.startYear || e.endYear) ? [e.startYear, e.endYear].filter(Boolean).join(' - ') : '');
            return `
          <div style="margin-bottom:12px;">
            <strong>${escapeHtml(degree)}</strong> — ${escapeHtml(inst)}
            ${dates ? `<br><small>${escapeHtml(dates)}</small>` : ''}
          </div>
        `;
        }).join('');
    }

    let skills = Array.isArray(data.skills) ? data.skills : [];
    if (data.skills && typeof data.skills === 'object' && !Array.isArray(data.skills)) {
      const s = data.skills;
      skills = [...(s.hard || []), ...(s.tools || []), ...(s.domain || [])];
    }
    if (!skills.length && data.skills && typeof data.skills === 'string') skills = [data.skills];
    const skillsStr = skills.join(', ');

    let projHtml = '';
    if (Array.isArray(data.projects) && data.projects.length) {
        projHtml = data.projects.map((p) => `
          <div style="margin-bottom:10px;">
            <strong>${escapeHtml(p.title || '')}</strong>${p.tools ? ` <small>${escapeHtml(p.tools)}</small>` : ''}
            ${p.description ? `<p style="margin:4px 0 0 0;font-size:12px;">${escapeHtml(p.description)}</p>` : ''}
          </div>
        `).join('');
    }

    let certHtml = '';
    if (Array.isArray(data.certifications) && data.certifications.length) {
        certHtml = data.certifications.map((c) => `
          <div style="margin-bottom:8px;">• <strong>${escapeHtml(c.name || '')}</strong> — ${escapeHtml(c.authority || '')}${c.year ? ` (${escapeHtml(c.year)})` : ''}</div>
        `).join('');
    }

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size:11pt; line-height:1.4; color:#222; padding:24px; max-width:210mm; }
    h1 { font-size:22pt; margin-bottom:4px; color:#0f2b46; }
    .subtitle { font-size:10pt; color:#555; margin-bottom:16px; }
    h2 { font-size:12pt; color:#0f2b46; margin:16px 0 8px; border-bottom:1px solid #c0962d; padding-bottom:4px; }
    .section { margin-bottom:12px; }
    p { margin:4px 0; }
    strong { font-weight:600; }
    small { color:#666; font-size:10pt; }
  </style>
</head>
<body>
  <h1>${escapeHtml(name)}</h1>
  <div class="subtitle">${escapeHtml(email)}${email && phone ? ' | ' : ''}${escapeHtml(phone)}${locStr ? ' | ' + escapeHtml(locStr) : ''}</div>
  ${data.summary ? `<div class="section"><h2>Summary</h2><p>${escapeHtml(data.summary)}</p></div>` : ''}
  ${expHtml ? `<div class="section"><h2>Experience</h2>${expHtml}</div>` : ''}
  ${projHtml ? `<div class="section"><h2>Projects</h2>${projHtml}</div>` : ''}
  ${eduHtml ? `<div class="section"><h2>Education</h2>${eduHtml}</div>` : ''}
  ${certHtml ? `<div class="section"><h2>Certifications</h2>${certHtml}</div>` : ''}
  ${skillsStr ? `<div class="section"><h2>Skills</h2><p>${escapeHtml(skillsStr)}</p></div>` : ''}
</body>
</html>`;
}

function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

async function renderPdfFromHtml(html) {
    const browser = await (await getPuppeteer()).launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        return await page.pdf({ format: 'A4', printBackground: true });
    } finally {
        await browser.close();
    }
}

// ========== RESUME TEXT EXTRACTION ==========

async function extractResumeText(buffer, mimetype) {
    const isPdf = mimetype === 'application/pdf';
    const isDocx = ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'].includes(mimetype);
    if (isPdf) {
        const pdfParse = await getPdfParse();
        const data = await pdfParse(buffer);
        return (data?.text || '').trim();
    }
    if (isDocx) {
        const mammoth = await getMammoth();
        const result = await mammoth.extractRawText({ buffer });
        return (result?.value || '').trim();
    }
    return '';
}

async function analyzeResumeWithAI(text, purpose) {
    const apiUrl = process.env.AI_API_URL;
    const apiKey = process.env.AI_API_KEY;
    if (!apiUrl || !apiKey || !text) return null;
    try {
        const prompt = purpose === 'career'
            ? `Based on this resume text, determine the career field and experience level. Fields: engineering, medical, commerce, government, it, design, marketing. Experience levels: beginner, intermediate, advanced. Return ONLY valid JSON: {"field":"it","experienceLevel":"intermediate"}`
            : `Based on this resume text, determine the career field and appropriate interview difficulty. Fields: engineering, medical, commerce, government, it, design, marketing. Difficulty: easy, medium, hard. Return ONLY valid JSON: {"field":"it","difficulty":"medium"}`;
        const resp = await getFetch()(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: process.env.AI_MODEL || 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: `Resume:\n${text.slice(0, 8000)}\n\n${prompt}` }]
            })
        });
        const data = await resp.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) return null;
        const json = content.replace(/```json?\s*/g, '').replace(/```\s*$/g, '').trim();
        return JSON.parse(json);
    } catch (e) {
        logger.warn('AI resume analysis fallback', { error: e.message });
        return null;
    }
}

// ========== INTERVIEW PREP API ==========

async function startInterview(req, res) {
    try {
        const body = req.validatedBody || req.body;
        const { field, difficulty } = body;
        const id = uuidv4();

        const questions = await generateInterviewQuestions(field || 'it', difficulty || 'medium', 10);

        const session = {
            id,
            field: field || 'it',
            difficulty: difficulty || 'medium',
            questions,
            feedback: [],
            startedAt: new Date().toISOString()
        };

        await transactDB(async (db) => {
            if (!db.interview_sessions) db.interview_sessions = [];
            db.interview_sessions.push(session);
            return true;
        });

        return res.status(201).json({ success: true, id, questions: questions.map((q) => ({ id: q.id, text: q.text })) });
    } catch (err) {
        logger.error('Start interview error', { error: err.message });
        return res.status(500).json({ success: false, error: err.message });
    }
}

async function analyzeResumeInterview(req, res) {
    try {
        const file = req.file;
        if (!file) return res.status(400).json({ success: false, error: 'Resume file (PDF or DOCX) required' });
        const text = await extractResumeText(file.buffer, file.mimetype);
        if (!text) return res.status(400).json({ success: false, error: 'Could not extract text from resume' });
        const result = await analyzeResumeWithAI(text, 'interview');
        const field = result?.field && ['engineering', 'medical', 'commerce', 'government', 'it', 'design', 'marketing'].includes(result.field) ? result.field : 'it';
        const difficulty = ['easy', 'medium', 'hard'].includes(result?.difficulty) ? result.difficulty : 'medium';
        return res.json({ success: true, field, difficulty });
    } catch (err) {
        logger.error('Analyze resume interview error', { error: err.message });
        return res.status(500).json({ success: false, error: err.message });
    }
}

async function getInterviewQuestions(req, res) {
    try {
        const { id } = req.query;
        const db = await readDB();
        const sessions = db.interview_sessions || [];
        const session = sessions.find((s) => s.id === id);
        if (!session) {
            return res.status(404).json({ success: false, error: 'Session not found' });
        }
        return res.json({ success: true, questions: session.questions });
    } catch (err) {
        logger.error('Get interview questions error', { error: err.message });
        return res.status(500).json({ success: false, error: err.message });
    }
}

async function submitInterviewFeedback(req, res) {
    try {
        const body = req.validatedBody || req.body;
        const { sessionId, questionId, answer, rating } = body;

        const db = await readDB();
        const sessions = db.interview_sessions || [];
        const session = sessions.find((s) => s.id === sessionId);
        if (!session) {
            return res.status(404).json({ success: false, error: 'Session not found' });
        }

        const feedback = await generateInterviewFeedback(session.field, body);
        session.feedback = session.feedback || [];
        session.feedback.push({ questionId, answer, rating, feedback });

        await transactDB(async (db) => {
            const idx = db.interview_sessions.findIndex((s) => s.id === sessionId);
            if (idx !== -1) db.interview_sessions[idx] = session;
            return true;
        });

        return res.json({ success: true, feedback });
    } catch (err) {
        logger.error('Interview feedback error', { error: err.message });
        return res.status(500).json({ success: false, error: err.message });
    }
}

async function generateInterviewQuestions(field, difficulty, count) {
    const apiUrl = process.env.AI_API_URL;
    const apiKey = process.env.AI_API_KEY;
    const base = [
        { id: 'iq1', text: `Tell me about your experience in ${field}.` },
        { id: 'iq2', text: `What is your biggest strength relevant to ${field}?` },
        { id: 'iq3', text: `Describe a challenging project in ${field} and how you handled it.` }
    ];
    if (!apiUrl || !apiKey || count <= 3) {
        return base.slice(0, count);
    }
    try {
        const resp = await getFetch()(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: process.env.AI_MODEL || 'gpt-3.5-turbo',
                messages: [{
                    role: 'user',
                    content: `Generate ${count - 3} interview questions for ${field} at ${difficulty} difficulty. Return JSON array of objects with "text" only.`
                }]
            })
        });
        const data = await resp.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) return base.slice(0, count);
        const parsed = JSON.parse(content.replace(/```json?\s*/g, '').replace(/```\s*$/, ''));
        const extra = (Array.isArray(parsed) ? parsed : []).map((q, i) => ({ id: `iq${i + 4}`, text: q.text || q }));
        return [...base, ...extra].slice(0, count);
    } catch (e) {
        return base.slice(0, count);
    }
}

async function generateInterviewFeedback(field, { questionId, answer }) {
    const apiUrl = process.env.AI_API_URL;
    const apiKey = process.env.AI_API_KEY;
    if (!apiUrl || !apiKey) {
        return 'Consider structuring your answer with: situation, action, result. Be specific and quantify achievements where possible.';
    }
    try {
        const resp = await getFetch()(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: process.env.AI_MODEL || 'gpt-3.5-turbo',
                messages: [{
                    role: 'user',
                    content: `For a ${field} interview question, the candidate answered: "${answer}". Provide brief constructive feedback (2-3 sentences) and one improvement suggestion.`
                }]
            })
        });
        const data = await resp.json();
        const content = data.choices?.[0]?.message?.content;
        return content || 'Good attempt. Try to add more specific examples.';
    } catch (e) {
        return 'Practice structuring answers with concrete examples.';
    }
}

// ========== STUDY PLAN API ==========

async function createStudyPlan(req, res) {
    try {
        const body = req.validatedBody || req.body;
        const { goals, availableHoursPerDay, examDate } = body;
        const id = uuidv4();

        const schedule = await generateAISchedule(goals || [], availableHoursPerDay || 4, examDate);

        const plan = {
            id,
            goals: goals || [],
            availableHoursPerDay: availableHoursPerDay || 4,
            examDate: examDate || null,
            schedule,
            progress: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await transactDB(async (db) => {
            if (!db.study_plans) db.study_plans = [];
            db.study_plans.push(plan);
            return true;
        });

        return res.status(201).json({ success: true, id, plan });
    } catch (err) {
        logger.error('Create study plan error', { error: err.message });
        return res.status(500).json({ success: false, error: err.message });
    }
}

async function getStudyPlan(req, res) {
    try {
        const { id } = req.params;
        const db = await readDB();
        const plans = db.study_plans || [];
        const plan = plans.find((p) => p.id === id);
        if (!plan) {
            return res.status(404).json({ success: false, error: 'Study plan not found' });
        }
        return res.json({ success: true, plan });
    } catch (err) {
        logger.error('Get study plan error', { error: err.message });
        return res.status(500).json({ success: false, error: err.message });
    }
}

async function updateStudyPlan(req, res) {
    try {
        const { id } = req.params;
        const body = req.validatedBody || req.body;

        const db = await readDB();
        const plans = db.study_plans || [];
        const idx = plans.findIndex((p) => p.id === id);
        if (idx === -1) {
            return res.status(404).json({ success: false, error: 'Study plan not found' });
        }

        const existing = plans[idx];
        const updated = {
            ...existing,
            ...body,
            updatedAt: new Date().toISOString()
        };
        if (body.goals || body.availableHoursPerDay || body.examDate) {
            updated.schedule = await generateAISchedule(
                updated.goals || existing.goals,
                updated.availableHoursPerDay ?? existing.availableHoursPerDay,
                updated.examDate || existing.examDate
            );
        }

        await transactDB(async (db) => {
            const i = db.study_plans.findIndex((p) => p.id === id);
            if (i !== -1) db.study_plans[i] = updated;
            return true;
        });

        return res.json({ success: true, plan: updated });
    } catch (err) {
        logger.error('Update study plan error', { error: err.message });
        return res.status(500).json({ success: false, error: err.message });
    }
}

async function generateAISchedule(goals, hoursPerDay, examDate) {
    const apiUrl = process.env.AI_API_URL;
    const apiKey = process.env.AI_API_KEY;
    const defaultSchedule = [
        { day: 1, tasks: goals.length ? goals.map((g) => ({ topic: g, duration: Math.ceil(hoursPerDay / goals.length), completed: false })) : [{ topic: 'Study block', duration: hoursPerDay, completed: false }] }
    ];
    if (!apiUrl || !apiKey || !goals.length) return defaultSchedule;
    try {
        const resp = await getFetch()(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: process.env.AI_MODEL || 'gpt-3.5-turbo',
                messages: [{
                    role: 'user',
                    content: `Create a 7-day study schedule. Goals: ${goals.join(', ')}. Hours per day: ${hoursPerDay}. Exam date: ${examDate || 'Not set'}. Return JSON array of {day, tasks: [{topic, duration, completed: false}]}`
                }]
            })
        });
        const data = await resp.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) return defaultSchedule;
        const parsed = JSON.parse(content.replace(/```json?\s*/g, '').replace(/```\s*$/, ''));
        return Array.isArray(parsed) ? parsed : defaultSchedule;
    } catch (e) {
        return defaultSchedule;
    }
}

// ========== FILE TOOLS ==========

function ensureTempDir() {
    const dir = path.join(os.tmpdir(), 'solmates-tools');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

async function removeBackground(req, res) {
    try {
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ success: false, error: 'No image uploaded' });
        }

        const apiKey = process.env.REMOVEBG_API_KEY;
        if (!apiKey) {
            return res.status(503).json({ success: false, error: 'Background removal service not configured. Set REMOVEBG_API_KEY.' });
        }

        const FormData = require('form-data');
        const form = new FormData();
        form.append('image_file', req.file.buffer, { filename: 'image.png' });
        form.append('size', 'auto');

        const resp = await getFetch()('https://api.remove.bg/v1.0/removebg', {
            method: 'POST',
            headers: {
                ...form.getHeaders(),
                'X-Api-Key': apiKey
            },
            body: form
        });

        if (!resp.ok) {
            const errText = await resp.text();
            logger.error('Remove.bg API error', { status: resp.status, body: errText });
            return res.status(resp.status).json({ success: false, error: 'Background removal failed' });
        }

        const buffer = Buffer.from(await resp.arrayBuffer());
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Content-Disposition', 'attachment; filename="removed-bg.png"');
        return res.send(buffer);
    } catch (err) {
        logger.error('Remove background error', { error: err.message });
        return res.status(500).json({ success: false, error: err.message });
    }
}

async function convertFile(req, res) {
    try {
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }
        const { operation } = req.body;
        const tempDir = ensureTempDir();

        if (operation === 'pdf-to-image') {
            const pdfPath = path.join(tempDir, `input-${Date.now()}.pdf`);
            fs.writeFileSync(pdfPath, req.file.buffer);
            const puppeteer = await getPuppeteer();
            const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
            try {
                const page = await browser.newPage();
                await page.setViewport({ width: 794, height: 1123 });
                await page.goto(`file://${path.resolve(pdfPath)}`, { waitUntil: 'networkidle0', timeout: 10000 });
                const screenshot = await page.screenshot({ type: 'png', fullPage: false });
                res.setHeader('Content-Type', 'image/png');
                res.setHeader('Content-Disposition', 'attachment; filename="page-1.png"');
                return res.send(screenshot);
            } finally {
                await browser.close();
                try { fs.unlinkSync(pdfPath); } catch (_) {}
            }
        }

        if (operation === 'image-to-pdf') {
            const ext = (req.file.originalname || '').split('.').pop().toLowerCase();
            let buffer = req.file.buffer;
            if (ext === 'heic') {
                const convert = await getHeicConvert();
                buffer = await convert({ buffer: req.file.buffer, format: 'JPEG', quality: 1 });
            }
            const sharp = await getSharp();
            const { PDFDocument } = await getPdfLib();
            const pdfDoc = await PDFDocument.create();
            const png = await sharp(buffer).png().toBuffer();
            const img = await pdfDoc.embedPng(png);
            const page = pdfDoc.addPage([img.width, img.height]);
            page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
            const pdfBytes = await pdfDoc.save();
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename="converted.pdf"');
            return res.send(pdfBytes);
        }

        if (operation === 'jpg-to-png' || operation === 'png-to-jpg' || operation === 'heic-to-jpg' || operation === 'heic-to-png') {
            const ext = (req.file.originalname || '').split('.').pop().toLowerCase();
            let buffer = req.file.buffer;
            if (ext === 'heic') {
                const convert = await getHeicConvert();
                buffer = await convert({ buffer: req.file.buffer, format: 'JPEG', quality: 1 });
            }

            const sharp = await getSharp();
            let out;
            if (operation === 'jpg-to-png' || operation === 'heic-to-png') {
                out = await sharp(buffer).png().toBuffer();
                res.setHeader('Content-Type', 'image/png');
                res.setHeader('Content-Disposition', 'attachment; filename="converted.png"');
            } else {
                out = await sharp(buffer).jpeg({ quality: 90 }).toBuffer();
                res.setHeader('Content-Type', 'image/jpeg');
                res.setHeader('Content-Disposition', 'attachment; filename="converted.jpg"');
            }
            return res.send(out);
        }

        if (operation === 'pdf-merge') {
            return res.status(400).json({ success: false, error: 'PDF merge requires multiple files. Use multipart with multiple files.' });
        }

        if (operation === 'word-to-pdf') {
            const mammoth = await getMammoth();
            const result = await mammoth.convertToHtml({ buffer: req.file.buffer });
            const html = result.value;
            const browser = await (await getPuppeteer()).launch({ headless: true, args: ['--no-sandbox'] });
            const page = await browser.newPage();
            await page.setContent(`<html><body style="font-family:Arial;padding:40px;">${html}</body></html>`, { waitUntil: 'networkidle0' });
            const pdf = await page.pdf({ format: 'A4' });
            await browser.close();
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename="converted.pdf"');
            return res.send(pdf);
        }

        if (operation === 'pdf-to-word') {
            const pdfParse = await getPdfParse();
            const pdfData = await pdfParse(req.file.buffer);
            const docx = await getDocx();
            const { Document, Packer, Paragraph, TextRun } = docx;
            const text = (pdfData.text || '').trim() || 'No text extracted.';
            const doc = new Document({
                sections: [{ children: [new Paragraph({ children: [new TextRun({ text })] })] }]
            });
            const buffer = await Packer.toBuffer(doc);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
            res.setHeader('Content-Disposition', 'attachment; filename="converted.docx"');
            return res.send(buffer);
        }

        return res.status(400).json({ success: false, error: 'Unsupported conversion operation' });
    } catch (err) {
        logger.error('Convert file error', { error: err.message });
        return res.status(500).json({ success: false, error: err.message });
    }
}

async function compressFile(req, res) {
    try {
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }
        const { level, targetWidth, targetHeight, scalePercent } = req.body;
        const quality = level === 'high' ? 90 : level === 'low' ? 50 : 75;

        const ext = (req.file.originalname || '').split('.').pop().toLowerCase();
        const sharp = await getSharp();

        if (['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(ext)) {
            const originalSize = req.file.buffer.length;
            let buffer = req.file.buffer;

            // Handle HEIC
            if (ext === 'heic') {
                const convert = await getHeicConvert();
                buffer = await convert({
                    buffer: req.file.buffer,
                    format: 'JPEG',
                    quality: 1
                });
            }

            const sharp = await getSharp();
            let image = sharp(buffer);
            const meta = await image.metadata();

            // Optional resize based on requested dimensions / scale
            const scaleNum = scalePercent ? Number(scalePercent) : null;
            const widthNum = targetWidth ? Number(targetWidth) : null;
            const heightNum = targetHeight ? Number(targetHeight) : null;

            if (meta && meta.width && meta.height) {
                if (scaleNum && scaleNum > 0 && scaleNum < 1000) {
                    const newWidth = Math.max(1, Math.round((meta.width * scaleNum) / 100));
                    const newHeight = Math.max(1, Math.round((meta.height * scaleNum) / 100));
                    image = image.resize(newWidth, newHeight);
                } else if (widthNum || heightNum) {
                    const resizeOptions = {};
                    if (widthNum && widthNum > 0) resizeOptions.width = Math.round(widthNum);
                    if (heightNum && heightNum > 0) resizeOptions.height = Math.round(heightNum);
                    if (resizeOptions.width || resizeOptions.height) {
                        image = image.resize(resizeOptions);
                    }
                }
            }

            let out;
            if (ext === 'png') {
                out = await image.png({ compressionLevel: 9, quality: quality / 100 }).toBuffer();
            } else {
                out = await image.jpeg({ quality }).toBuffer();
            }
            const compressedSize = out.length;
            res.setHeader('Content-Type', req.file.mimetype || 'image/jpeg');
            res.setHeader('Content-Disposition', `attachment; filename="compressed.${ext}"`);
            res.setHeader('X-Original-Size', String(originalSize));
            res.setHeader('X-Compressed-Size', String(compressedSize));
            return res.send(out);
        }

        if (ext === 'pdf') {
            const { PDFDocument } = await getPdfLib();
            const pdfDoc = await PDFDocument.load(req.file.buffer);
            const originalSize = req.file.buffer.length;
            const compressed = await pdfDoc.save({ useObjectStreams: true });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename="compressed.pdf"');
            res.setHeader('X-Original-Size', String(originalSize));
            res.setHeader('X-Compressed-Size', String(compressed.length));
            return res.send(compressed);
        }

        return res.status(400).json({ success: false, error: 'Unsupported file type for compression' });
    } catch (err) {
        logger.error('Compress file error', { error: err.message });
        return res.status(500).json({ success: false, error: err.message });
    }
}

module.exports = {
    createResume,
    getResume,
    updateResume,
    generateResumePdf,
    startInterview,
    analyzeResumeInterview,
    getInterviewQuestions,
    submitInterviewFeedback,
    createStudyPlan,
    getStudyPlan,
    updateStudyPlan,
    removeBackground,
    convertFile,
    compressFile
};
