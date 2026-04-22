/**
 * SOLMATES — Career Test Routes
 * File: src/routes/career-test.routes.js
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');

const {
  startCareerTest,
  submitCareerTest,
  getCareerTestResult,
  analyzeResumeCareer,
} = require('../controllers/careerTest.controller');

// Multer config
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and DOCX files are allowed'));
    }
  },
});

// Routes
router.post('/start', startCareerTest);
router.post('/submit/:id', submitCareerTest);
router.get('/result/:id', getCareerTestResult);
router.post('/analyze-resume', upload.single('resume'), analyzeResumeCareer);

module.exports = router;