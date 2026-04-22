"use strict";

const aiProvider = require('../../utils/aiProvider');

const evaluateJdWithAi = async (req, res, next) => {
  try {
    const { jdText, resume } = req.body || {};
    if (!jdText || !resume) {
      return res.status(400).json({ error: "jdText and resume are required" });
    }

    const systemMessage = [
      "You are an ATS resume analyst.",
      "Return ONLY valid JSON with the exact keys:",
      "matchScore (0-100 number),",
      "missingSkills (array of strings),",
      "weakMatches (array of strings),",
      "strongMatches (array of strings),",
      "rewriteSuggestions (object with arrays: summary, experience, skills),",
      "rejectionReasons (array of strings).",
      "Do not include any extra keys or commentary."
    ].join(" ");

    const promptText = JSON.stringify({ jobDescription: jdText, resume });

    // Use Advanced Model for complex Resume Parsing if requested
    const parsed = await aiProvider.generateJSON(promptText, systemMessage, true);

    if (!parsed) {
      return res.status(502).json({ error: "Failed to parse AI response" });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  evaluateJdWithAi
};
