/**
 * SOLMATES Tools Routes
 * Resume, Career Test, Interview, Study Plan, File Tools
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const toolsController = require('../controllers/tools.controller');
const { toolsLimiter } = require('../middleware/rateLimiter.middleware');
const { validate } = require('../middleware/validation.middleware');

// Multer: memory storage for file uploads (10MB limit)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedImage = /^image\/(jpeg|jpg|png|webp|gif)$/;
        const allowedPdf = file.mimetype === 'application/pdf';
        const allowedDoc = ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'].includes(file.mimetype);
        if (allowedImage.test(file.mimetype) || allowedPdf || allowedDoc) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Allowed: images, PDF, Word.'));
        }
    }
});

// Apply tools rate limiter to file operations
const toolsRateLimit = (req, res, next) => {
    if (req.path.includes('remove-background') || req.path.includes('convert') || req.path.includes('compress')) {
        return toolsLimiter(req, res, next);
    }
    next();
};
router.use(toolsRateLimit);

// ========== RESUME ==========
router.post('/resume', (req, res, next) => {
    req.validatedBody = req.body;
    next();
}, toolsController.createResume);

router.get('/resume/:id', toolsController.getResume);
router.put('/resume/:id', (req, res, next) => {
    req.validatedBody = req.body;
    next();
}, toolsController.updateResume);
router.get('/resume/:id/pdf', toolsController.generateResumePdf);

// ========== INTERVIEW PREP ==========
router.post('/interview/start', validate('interviewStart'), toolsController.startInterview);
router.post('/interview/analyze-resume', upload.single('resume'), toolsController.analyzeResumeInterview);

router.get('/interview/questions', toolsController.getInterviewQuestions);

router.post('/interview/feedback', validate('interviewFeedback'), toolsController.submitInterviewFeedback);

// ========== STUDY PLAN ==========
router.post('/study-plan', validate('studyPlan'), toolsController.createStudyPlan);

router.get('/study-plan/:id', toolsController.getStudyPlan);
router.put('/study-plan/:id', (req, res, next) => {
    req.validatedBody = req.body;
    next();
}, toolsController.updateStudyPlan);

// ========== FILE TOOLS (rate limited, multer) ==========
router.post('/tools/remove-background', upload.single('image'), toolsController.removeBackground);
router.post('/tools/convert', upload.single('file'), toolsController.convertFile);
router.post('/tools/compress', upload.single('file'), toolsController.compressFile);

module.exports = router;
