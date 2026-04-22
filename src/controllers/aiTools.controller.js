/**
 * SOLMATES — Unified AI Tools Controller
 * File: src/controllers/aiTools.controller.js
 */

const { v4: uuidv4 } = require('uuid');
const aiProvider = require('../utils/aiProvider');
const logger = require('../utils/logger');

// Store sessions in memory (for tests/results)
const sessions = new Map();
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.createdAt > SESSION_TTL_MS) sessions.delete(id);
  }
}, 60 * 60 * 1000);

// Helper to generate specific prompts based on tool type
function getPromptForTool(toolType, userData) {
  switch (toolType) {
    case 'personality-test':
      return `
Generate EXACTLY ${userData.count || 10} distinct, introspective multiple-choice questions for a Myers-Briggs (MBTI) style personality test.
Make them scenario-based to determine if the user is introverted/extroverted, sensing/intuition, thinking/feeling, judging/perceiving.

You must reply with ONLY a JSON object containing a "questions" array.
Format:
{
  "questions": [
    {
      "id": 1,
      "text": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "traitMapping": ["E", "I", "S", "N"]
    }
  ]
}
Make sure every question has EXACTLY 4 options and a traitMapping array indicating which MBTI trait that option leans towards.
      `;

    case 'aptitude-test':
      const aptCount = parseInt(userData.count) || 10;
      return `
Generate EXACTLY ${aptCount} distinct, challenging multiple-choice aptitude test questions. 
You MUST provide EXACTLY ${aptCount} questions. No more, no less.
Include a mix of logical reasoning, numerical reasoning, and verbal ability.
Difficulty level: ${userData.difficulty || 'medium'}.

You must reply with ONLY a JSON object containing a "questions" array.
Format:
{
  "questions": [
    {
      "id": 1,
      "text": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0,
      "explanation": "Brief explanation of the correct answer."
    }
  ]
}
Make sure every question has EXACTLY 4 options and correctIndex is an integer from 0 to 3.
      `;

    case 'skill-gap':
      return `
You are an expert career advisor. The user is a professional with the following current skills: "${userData.currentSkills || 'Not specified'}"
They are targeting the role of: "${userData.targetRole || 'Not specified'}".

Analyze the skills gap. Identify precisely what skills they are missing, what they should learn first, and rate their current readiness out of 100.
You must reply with ONLY a JSON object. No markdown, no text outside.

Format:
{
  "readinessScore": 45,
  "missingSkills": ["List", "of", "missing", "skills"],
  "strengths": ["List", "of", "transferable", "skills"],
  "actionPlan": [
    {
      "step": 1,
      "title": "Short title",
      "description": "What exactly to learn or do."
    }
  ],
  "summaryText": "A short encouraging summary paragraph."
}
      `;

    case 'learning-path':
      return `
You are an expert technical mentor. The user wants to learn: "${userData.goal || 'Not specified'}".
Their current proficiency is: "${userData.level || 'Beginner'}".
They have "${userData.time || 'a few hours a week'}" to study.

Generate a highly structured learning path.
You must reply with ONLY a JSON object.

Format:
{
  "title": "Learning Path for [Goal]",
  "estimatedDuration": "X Weeks / Months",
  "modules": [
    {
      "moduleName": "Phase 1: Basics",
      "topics": ["Topic 1", "Topic 2"],
      "resources": ["Recommended Resource 1", "Resource 2"]
    }
  ],
  "advice": "Final words of advice for success."
}
      `;

    case 'certification-guide':
      return `
You are a career certification expert. The user is in the field of: "${userData.field || 'General Tech'}".
Their experience level is: "${userData.level || 'Intermediate'}".

Recommend the top 5 most valuable industry certifications for them.
You must reply with ONLY a JSON object.

Format:
{
  "certifications": [
    {
      "name": "Cert Name (e.g., AWS Solutions Architect)",
      "provider": "Issuer (e.g., Amazon)",
      "difficulty": "Moderate",
      "costEstimate": "$150",
      "whyItMatters": "Reason this cert is valuable."
    }
  ],
  "generalTips": "General tips on preparing for exams."
}
      `;

    case 'salary-insights':
      return `
You are a specialized compensation analyst. Provide detailed, realistic salary insights for the role of: "${userData.role || 'Software Engineer'}" 
in the location: "${userData.location || 'Global/Remote'}".

You must reply with ONLY a JSON object containing numerical estimates (use standard currency formats like $80,000) and market trends.

Format:
{
  "role": "[Role Name]",
  "location": "[Location]",
  "salaryRanges": {
    "entryLevel": "$X - $Y",
    "midLevel": "$X - $Y",
    "seniorLevel": "$X - $Y"
  },
  "topPayingIndustries": ["Industry 1", "Industry 2"],
  "skillsThatBoostPay": ["Skill 1 (+10%)", "Skill 2"],
  "marketTrend": "Brief description of demand and future outlook for this role."
}
      `;

    case 'interest-inventory':
      return `
You are a career psychologist. The user is taking a Holland Code (RIASEC) assessment to match careers with their interests.
Generate EXACTLY 6 distinct, highly engaging multiple-choice scenario questions.
Each question should be designed to test which of the 6 RIASEC types (Realistic, Investigative, Artistic, Social, Enterprising, Conventional) the user leans toward.

You must reply with ONLY a JSON object containing a "questions" array.
Format:
{
  "questions": [
    {
      "id": 1,
      "text": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D", "Option E", "Option F"],
      "traitMapping": ["R", "I", "A", "S", "E", "C"]
    }
  ]
}
Make sure every question has EXACTLY 6 options mapping strictly to the 6 trait symbols in order.
      `;

    case 'project-ideas':
      return `
You are a senior technical lead. The user wants project ideas to build their portfolio.
Target Role or Domain: "${userData.domain || 'Web Development'}".
Skill Level: "${userData.level || 'Intermediate'}".

Generate 3 unique, impressive project ideas that solve real-world problems.
You must reply with ONLY a JSON object.

Format:
{
  "projects": [
    {
      "title": "Project Name",
      "difficulty": "Medium",
      "description": "Short explanation of what the app does.",
      "techStack": ["Tech 1", "Tech 2"],
      "learningOutcomes": ["Outcome 1", "Outcome 2"]
    }
  ],
  "portfolioAdvice": "Short advice on how to present these on a resume."
}
      `;

    case 'job-market':
      return `
You are a top-tier labor market analyst. Provide latest job market trends for the role: "${userData.role || 'Software Engineer'}" in "${userData.location || 'Global/Remote'}".

You must reply with ONLY a JSON object.

Format:
{
  "role": "[Role]",
  "location": "[Location]",
  "demandLevel": "High/Medium/Low",
  "growthRate": "e.g., +15% over next 5 years",
  "topHiringCompanies": ["Company A", "Company B"],
  "inDemandSkills": ["Skill 1", "Skill 2"],
  "marketSummary": "A brief paragraph summarizing the current market landscape."
}
      `;

    case 'company-culture':
      return `
You are a workplace culture expert. The user values: "${userData.values || 'Work-life balance, remote work, fast-paced'}".
They work in industry: "${userData.industry || 'Tech'}".

Match them with 3 real or highly realistic archetype companies that fit these values perfectly.
You must reply with ONLY a JSON object.

Format:
{
  "matches": [
    {
      "companyName": "Real Company or Archetype",
      "cultureVibe": "e.g., highly collaborative, remote-first",
      "pros": ["Pro 1", "Pro 2"],
      "cons": ["Con 1", "Con 2"],
      "whyItMatches": "Short explanation."
    }
  ],
  "interviewQuestionsToAsk": ["Question 1 to ask employer", "Question 2"]
}
      `;

    case 'growth-opportunities':
      return `
You are a futurist career coach. The user's current role is: "${userData.currentRole || 'Data Analyst'}".
Analyze what emerging, future-proof roles they can pivot into within the next 3-5 years.

You must reply with ONLY a JSON object.

Format:
{
  "currentRole": "[Current Role]",
  "futureRoles": [
    {
      "title": "Emerging Role Title (e.g., AI Prompt Engineer)",
      "timeline": "e.g., 2-3 years",
      "whyItIsGrowing": "Reason for growth",
      "skillsNeededToPivot": ["Skill 1", "Skill 2"]
    }
  ],
  "industryDisruption": "Short paragraph on how AI or new tech is disrupting their current field."
}
      `;

    case 'skill-tracker':
      return `
You are a productivity AI. The user wants to track their skill progress over time.
Skill to track: "${userData.skill || 'JavaScript'}".
Current proficiency (0-100): ${userData.proficiency || 50}.

Generate a milestone dashboard plan to reach 100%.
You must reply with ONLY a JSON object.

Format:
{
  "skill": "[Skill Name]",
  "currentLevel": 50,
  "nextMilestone": "What to do to reach 60",
  "longTermGoal": "Mastery definition",
  "habitsToBuild": ["Habit 1", "Habit 2"],
  "motivationalQuote": "Short quote."
}
      `;
    case 'interview-prep':
      const intCount = parseInt(userData.count) || 10;
      return `
You are an expert technical and HR interviewer. The user is preparing for an interview.
Target Role or Domain: "${userData.role || 'Software Engineer'}".
Experience Level: "${userData.level || 'Intermediate'}".

Generate EXACTLY ${intCount} highly relevant interview questions including both technical and behavioral aspects.
You MUST provide EXACTLY ${intCount} questions. No more, no less.
For each question, provide detailed answering tips.
You must reply with ONLY a JSON object.

Format:
{
  "questions": [
    {
      "type": "Technical / Behavioral",
      "question": "The interview question?",
      "tips": "Brief advice on what the interviewer is looking for."
    }
  ],
  "generalAdvice": "One short paragraph of general interview advice for this role."
}
      `;

    case 'study-planner':
      return `
You are an expert academic and professional study coach. The user wants to create a study plan.
Subject or Goal: "${userData.subject || 'MBA Preparation'}".
Timeframe: "${userData.timeframe || '1 month'}".
Hours per week: "${userData.hours || '10'}".

Generate a structured study plan divided into weekly milestones.
You must reply with ONLY a JSON object.

Format:
{
  "title": "Study Plan for [Subject]",
  "totalDuration": "[Timeframe]",
  "weeklyPlan": [
    {
      "week": 1,
      "focusArea": "Core Concepts",
      "tasks": ["Task 1", "Task 2"],
      "estimatedHours": 10
    }
  ],
  "studyTips": ["Tip 1", "Tip 2"]
}
      `;
      
    case 'pdf-summarizer':
      return `
You are an expert AI document analyst. The user has uploaded a PDF and extracted the following text:
---
${userData.text ? userData.text.substring(0, 15000) : "No text provided."}
---

Generate a concise and highly accurate structured summary of the text.
You must reply with ONLY a JSON object.

Format:
{
  "documentTitle": "${userData.title || 'Untitled Document'}",
  "overview": "A brief 2-3 sentence overview of the entire document.",
  "keyFindings": [
    "Most important finding/point 1",
    "Most important finding/point 2",
    "Important statistic or fact 3"
  ],
  "actionItems": [
    "Any apparent action items or next steps (if applicable)"
  ],
  "confidenceNote": "A brief note on the summary reliability based on the provided text length/quality."
}
      `;
      
    default:
      throw new Error("Invalid tool type");
  }
}

// Explain a question in English and Hindi
const explainAnswer = async (req, res) => {
  try {
    const { question, answer, context } = req.body;

    if (!question) {
      return res.status(400).json({ success: false, error: 'Question is required' });
    }

    const prompt = `
Explain why the correct answer to this question is what it is. 
Question: "${question}"
Context: "${context || 'General'}"
Correct Answer: "${answer || 'The provided correct option'}"

Provide a detailed explanation in both **English** and **Hinglish** (Hindi written in Roman/English characters).
Format the response in clear **bullet points**.
Avoid using emojis.
Limit to 150 words total.
    `;

    const systemMessage = 'Your name is "Mate". You are an expert academic mentor for SOLMATES. Provide clear, professional explanations in both English and Hinglish (Hindi written in Roman script). Use bullet points and NO emojis.';
    
    // We expect text, not strict JSON, for explainAnswer
    const explanation = await aiProvider.generateText(prompt, systemMessage, false);

    return res.status(200).json({
      success: true,
      explanation
    });

  } catch (error) {
    logger.error('Explain answer failed', { error: error.message });
    return res.status(500).json({ 
      success: false, 
      error: 'AI Provider Error or Server error generating explanation',
      detail: error.message 
    });
  }
}

// Generate data via GROQ API
const generateToolData = async (req, res) => {
  try {
    const { toolType, ...userData } = req.body;

    if (!toolType) {
      return res.status(400).json({ success: false, error: 'toolType is required' });
    }

    logger.info(`Generating AI data for tool: ${toolType}`);
    
    let prompt;
    try {
      prompt = getPromptForTool(toolType, userData);
    } catch (e) {
      return res.status(400).json({ success: false, error: 'Unsupported tool type' });
    }

    // Pass false for useAdvancedModel
    const systemMessage = `Your name is "Mate". You are the official AI assistant for SOLMATES. 
Always respond in pure JSON format without any markdown wrappers.
NEVER use emojis. 
For any natural language fields (explanation, tips, generalAdvice), always prefer clear bullet points for formatting.`;

    const parsed = await aiProvider.generateJSON(prompt, systemMessage, false);

    // For tests, store a session id
    if (toolType === 'personality-test' || toolType === 'aptitude-test' || toolType === 'interest-inventory') {
      const sessionId = uuidv4();
      sessions.set(sessionId, {
        id: sessionId,
        toolType,
        ...parsed,
        createdAt: Date.now()
      });
      parsed.sessionId = sessionId;
    }

    return res.status(200).json({
      success: true,
      data: parsed
    });

  } catch (error) {
    logger.error('Generate tool data failed', { error: error.message });
    return res.status(500).json({ success: false, error: 'Server error generating AI data' });
  }
};

// Evaluate and get test results (for personality & aptitude)
const submitTestResult = async (req, res) => {
  try {
    const { sessionId, answers } = req.body;

    if (!sessionId || !answers || !Array.isArray(answers)) {
      return res.status(400).json({ success: false, error: 'Invalid payload' });
    }

    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session expired or not found' });
    }

    if (session.toolType === 'aptitude-test') {
      let score = 0;
      session.questions.forEach((q, i) => {
        if (answers[i] === q.correctIndex) score++;
      });
      
      const percentage = Math.round((score / session.questions.length) * 100);
      return res.status(200).json({
        success: true,
        score: percentage,
        rawScore: score,
        totalQuestions: session.questions.length,
        questions: session.questions,
        answers
      });
    }

    if (session.toolType === 'personality-test') {
      // Very basic MBTI evaluation logic based on answers
      const counts = { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 };
      session.questions.forEach((q, i) => {
        const userAnsIndex = answers[i];
        if (userAnsIndex !== null && userAnsIndex !== undefined) {
          const trait = q.traitMapping[userAnsIndex];
          if (counts[trait] !== undefined) counts[trait]++;
        }
      });
      
      const mbti = [
        counts.E > counts.I ? 'E' : 'I',
        counts.S > counts.N ? 'S' : 'N',
        counts.T > counts.F ? 'T' : 'F',
        counts.J > counts.P ? 'J' : 'P'
      ].join('');

      return res.status(200).json({
        success: true,
        mbtiType: mbti,
        counts
      });
    }

    if (session.toolType === 'interest-inventory') {
      const counts = { R: 0, I: 0, A: 0, S: 0, E: 0, C: 0 };
      session.questions.forEach((q, idx) => {
        const userAnsIndex = answers[idx];
        if (userAnsIndex !== null && userAnsIndex !== undefined) {
          const trait = q.traitMapping[userAnsIndex];
          if (counts[trait] !== undefined) counts[trait]++;
        }
      });
      
      // Get top 3 traits
      const topTraits = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(entry => entry[0])
        .join('');

      return res.status(200).json({
        success: true,
        hollandCode: topTraits,
        counts
      });
    }

    return res.status(400).json({ success: false, error: 'Submission logic not supported for this tool type' });

  } catch (error) {
    logger.error('Submit test result failed', { error: error.message });
    return res.status(500).json({ success: false, error: 'Server error parsing test results' });
  }
};

module.exports = {
  generateToolData,
  submitTestResult,
  explainAnswer
};

