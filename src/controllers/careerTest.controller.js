/**
 * SOLMATES — Career Test Controller
 * File: src/controllers/careerTest.controller.js
 * 
 * FINAL FIXED VERSION - Direct Fallback, No GROQ
 */

const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

// ─── In-memory session store ───────────────────────────────────────────────
const sessions = new Map();
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.createdAt > SESSION_TTL_MS) sessions.delete(id);
  }
}, 60 * 60 * 1000);

// ─── Generate 15 fallback questions ─────────────────────────────────────
function generateFallbackQuestions(desiredField, expLevel) {
  console.log('🔧 Generating 15 fallback questions for', desiredField);
  
  const questions = [];
  const topics = [
    'fundamental concepts', 'best practices', 'industry standards',
    'tools and technologies', 'problem-solving approaches', 'team collaboration',
    'project management', 'quality assurance', 'client communication',
    'emerging trends', 'ethical considerations', 'career growth',
    'skill development', 'industry challenges', 'future outlook'
  ];

  for (let i = 1; i <= 15; i++) {
    const topic = topics[i - 1];
    questions.push({
      id: i,
      text: `What is a key ${topic} in ${desiredField} for ${expLevel} level?`,
      options: [
        `Following industry best practices for ${desiredField}`,
        `Using outdated methods in ${desiredField}`,
        `Ignoring ${desiredField} standards`,
        `Random approach to ${desiredField}`
      ],
      correctIndex: 0,
      explanation: `This is correct because it follows established ${desiredField} best practices.`
    });
  }
  return questions;
}

// ─── Generate 15 GROQ AI questions ──────────────────────────────────────
const aiProvider = require('../utils/aiProvider');

async function generateGroqQuestions(desiredField, expLevel) {

  console.log(`🤖 Generating 15 dynamic questions via GROQ for: ${desiredField} (${expLevel})`);
  const prompt = `
Generate EXACTLY 15 distinct, high-quality, technically accurate multiple-choice questions for a career assessment test in the field of "${desiredField}" at an "${expLevel}" experience level.
Ensure the questions cover various aspects like core concepts, specific tools, methodologies, real-world problem-solving, and industry best practices.
CRITICAL: Every question must be FACTUALLY CORRECT. Ensure that only one option is clearly correct and the correctIndex points precisely to it.
Make the questions challenging and highly specific to the field.

You must reply with ONLY a JSON object containing a "questions" array. No other text, no markdown blocks. 
Format:
{
  "questions": [
    {
      "id": 1,
      "text": "Specific technical question here?",
      "options": ["Correct Option", "Distractor B", "Distractor C", "Distractor D"],
      "correctIndex": 0,
      "explanation": "Clear, technically sound explanation why the answer is correct."
    }
  ]
}
Each option must be concise but complete. Every question must have EXACTLY 4 options. correctIndex must be an integer (0-3).
`;

  try {
    const systemPrompt = 'Your name is "Mate". You are an expert career assessment AI for SOLMATES. Always respond in pure JSON format without any markdown. NEVER use emojis. For any natural language fields, use clear bullet points for formatting.';
    const parsed = await aiProvider.generateJSON(prompt, systemPrompt, true);

    if (parsed.questions && Array.isArray(parsed.questions) && parsed.questions.length >= 10) {
      // Return up to 15 questions
      return parsed.questions.slice(0, 15);
    }
    console.error('AI returned invalid JSON format:', parsed);
    return generateFallbackQuestions(desiredField, expLevel);
  } catch (err) {
    console.error('Groq AI generation error:', err);
    return generateFallbackQuestions(desiredField, expLevel);
  }
}

// ─── 1. START TEST ─────────────────────────────────────────────────────
exports.startCareerTest = async (req, res) => {
  try {
    const { currentField, desiredField, experienceLevel } = req.body;

    if (!desiredField) {
      return res.status(400).json({ success: false, error: 'desiredField is required' });
    }

    const expLevel = experienceLevel || 'intermediate';

    logger.info('Career test starting', { desiredField, expLevel });

    // ✅ Generate dynamically using GROQ AI
    console.log('📊 Fetching dynamic questions for', desiredField);
    const questions = await generateGroqQuestions(desiredField, expLevel);

    // Save session
    const sessionId = uuidv4();
    sessions.set(sessionId, {
      id: sessionId,
      currentField: currentField || '',
      desiredField,
      experienceLevel: expLevel,
      questions,
      createdAt: Date.now(),
    });

    logger.info('Career test session created', { 
      sessionId, 
      questionsCount: questions.length 
    });

    console.log(`✅ Returning ${questions.length} questions for ${desiredField}`);

    return res.status(200).json({
      success: true,
      id: sessionId,
      questions,
    });

  } catch (error) {
    logger.error('Career test start failed', { error: error.message });
    
    // Even on error, return fallback questions
    const { desiredField, experienceLevel } = req.body;
    const fallbackQuestions = generateFallbackQuestions(
      desiredField || 'Software Engineering', 
      experienceLevel || 'intermediate'
    );
    
    const sessionId = uuidv4();
    
    sessions.set(sessionId, {
      id: sessionId,
      currentField: req.body.currentField || '',
      desiredField: desiredField || 'Software Engineering',
      experienceLevel: experienceLevel || 'intermediate',
      questions: fallbackQuestions,
      createdAt: Date.now(),
    });
    
    return res.status(200).json({
      success: true,
      id: sessionId,
      questions: fallbackQuestions,
    });
  }
};

// ─── 2. SUBMIT TEST ─────────────────────────────────────────────────────
exports.submitCareerTest = async (req, res) => {
  try {
    const { id } = req.params;
    const { answers } = req.body;

    console.log('📝 Submit request:', { id, answers });

    const session = sessions.get(id);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or expired. Please start a new test.',
      });
    }

    if (!Array.isArray(answers)) {
      return res.status(400).json({ success: false, error: 'answers must be an array' });
    }

    const { questions, desiredField } = session;

    // Convert answers to numbers
    const numericAnswers = answers.map(ans => {
      if (ans === null || ans === undefined) return null;
      if (typeof ans === 'number') return ans;
      if (typeof ans === 'string') {
        const trimmed = ans.trim();
        if (trimmed === '') return null;
        const num = parseInt(trimmed, 10);
        if (!isNaN(num) && num >= 0 && num <= 3) return num;
        const upper = trimmed.toUpperCase();
        if (upper === 'A') return 0;
        if (upper === 'B') return 1;
        if (upper === 'C') return 2;
        if (upper === 'D') return 3;
      }
      return null;
    });

    console.log('Converted answers:', numericAnswers);

    // Calculate score
    let score = 0;
    const details = [];
    const wrongTopics = [];

    questions.forEach((q, i) => {
      const userIndex = numericAnswers[i];
      const isCorrect = userIndex === q.correctIndex;
      
      if (isCorrect) {
        score++;
      } else if (userIndex !== null && userIndex !== undefined) {
        wrongTopics.push(q.text.substring(0, 30));
      }

      details.push({
        id: q.id || i + 1,
        text: q.text,
        options: q.options,
        userAnswer: userIndex !== null && userIndex >= 0 ? q.options[userIndex] : 'Not answered',
        correctAnswer: q.options[q.correctIndex],
        correctIndex: q.correctIndex,
        userIndex: userIndex,
        isCorrect: isCorrect,
        explanation: q.explanation || '',
      });
    });

    const percentage = Math.round((score / questions.length) * 100);

    // Generate suggestions
    const suggestions = [
      `Focus on strengthening your ${desiredField} fundamentals.`,
      'Practice with real-world projects to build confidence.',
      `Join ${desiredField} communities on LinkedIn and Discord.`,
      'Review the questions you missed and study those topics.'
    ];

    session.score = score;
    session.percentage = percentage;
    session.completedAt = Date.now();

    return res.status(200).json({
      success: true,
      score: percentage,
      rawScore: score,
      totalQuestions: questions.length,
      suggestions,
      details,
    });

  } catch (error) {
    logger.error('Career test submit failed', { error: error.message });
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to submit test.' 
    });
  }
};

// ─── 3. GET RESULT ─────────────────────────────────────────────────────
exports.getCareerTestResult = async (req, res) => {
  try {
    const { id } = req.params;
    const session = sessions.get(id);

    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found or expired.' });
    }
    if (!session.completedAt) {
      return res.status(400).json({ success: false, error: 'Test not yet submitted.' });
    }

    return res.status(200).json({
      success: true,
      score: session.percentage,
      rawScore: session.score,
      totalQuestions: session.questions.length,
      desiredField: session.desiredField,
      experienceLevel: session.experienceLevel,
    });

  } catch (error) {
    logger.error('Career test result fetch failed', { error: error.message });
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ─── 4. ANALYZE RESUME ─────────────────────────────────────────────────
exports.analyzeResumeCareer = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const fileName = req.file.originalname || '';
    
    // Simple field detection based on filename
    let field = 'Software Engineering';
    if (fileName.toLowerCase().includes('market')) field = 'Digital Marketing';
    else if (fileName.toLowerCase().includes('design')) field = 'UI/UX Design';
    else if (fileName.toLowerCase().includes('data')) field = 'Data Science';
    else if (fileName.toLowerCase().includes('hr')) field = 'Human Resources';
    else if (fileName.toLowerCase().includes('finance')) field = 'Finance';

    return res.status(200).json({
      success: true,
      field,
      experienceLevel: 'intermediate',
      confidence: 'medium',
    });

  } catch (error) {
    logger.error('Resume analysis failed', { error: error.message });
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to analyze resume.' 
    });
  }
};