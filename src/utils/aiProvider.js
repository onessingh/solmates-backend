/**
 * SOLMATES — Universal Multi-Provider AI Wrapper (v11.0)
 * File: src/utils/aiProvider.js
 * Automatically falls back between Groq, Gemini, and OpenRouter
 * to ensure 100% uptime for AI generation.
 */

const fetch = require('node-fetch');
const logger = require('./logger');

// Provider configurations
const providers = [
  {
    name: 'Groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    getKey: () => process.env.GROQ_API_KEY,
    models: { default: 'llama-3.1-8b-instant', advanced: 'llama-3.3-70b-versatile' }
  },
  {
    name: 'Gemini',
    // Google Gemini natively supports OpenAI chat completion format
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    getKey: () => process.env.GEMINI_API_KEY,
    models: { default: 'gemini-1.5-flash', advanced: 'gemini-1.5-pro' }
  },
  {
    name: 'OpenRouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    getKey: () => process.env.OPENROUTER_API_KEY,
    models: { default: 'google/gemma-2-9b-it:free', advanced: 'meta-llama/llama-3.1-70b-instruct:free' }
  }
];

/**
 * Universal Generate Function
 * @param {string} prompt - User instruction
 * @param {string} systemMessage - System behavior prompt
 * @param {boolean} requireJson - Whether the output must be strictly JSON
 * @param {boolean} useAdvancedModel - Prefer a highly capable (slower/expensive) model instead of fast one
 */
async function generate(prompt, systemMessage = "You are a helpful assistant.", requireJson = true, useAdvancedModel = false) {
  const activeProviders = providers.filter(p => p.getKey());

  if (activeProviders.length === 0) {
    throw new Error('No AI Provider keys configured. Please add GROQ_API_KEY, GEMINI_API_KEY, or OPENROUTER_API_KEY to .env');
  }

  let finalError = null;

  for (const provider of activeProviders) {
    try {
      console.log(`[aiProvider] 🤖 Attempting generation via ${provider.name}`);
      
      const apiKey = provider.getKey();
      const model = useAdvancedModel ? provider.models.advanced : provider.models.default;
      
      const body = {
        model: model,
        temperature: 0.7
      };

      if (Array.isArray(prompt)) {
        // If prompt is an array, assume it's the full messages history
        body.messages = prompt;
      } else {
        body.messages = [
          { role: 'system', content: systemMessage },
          { role: 'user', content: prompt }
        ];
      }

      if (requireJson) {
        // Some providers support standard JSON mode via response_format
        if (provider.name !== 'OpenRouter') {
          body.response_format = { type: 'json_object' };
        }
        // Force instruction in system message
        body.messages[0].content += '\n\nIMPORTANT: You must output ONLY pure JSON without any markdown code blocks or wrapper text.';
      }

      const headers = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      };

      // OpenRouter specifics
      if (provider.name === 'OpenRouter') {
        headers['HTTP-Referer'] = 'https://solmates.in';
        headers['X-Title'] = 'SOLMATES LMS';
      }

      const response = await fetch(provider.url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`${provider.name} API HTTP ${response.status}: ${errText.substring(0, 100)}`);
      }

      const data = await response.json();
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error(`Invalid response schema from ${provider.name}`);
      }

      let content = data.choices[0].message.content.trim();

      // Clean markdown if accidentally returned
      if (requireJson) {
        content = content.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
      }

      console.log(`[aiProvider] ✅ Success using ${provider.name}`);
      return content;

    } catch (error) {
      console.warn(`[aiProvider] ❌ ${provider.name} failed. Falling back. Error: ${error.message}`);
      finalError = error;
      // Loop continues to the next active provider fallback
    }
  }

  throw new Error(`All configured AI providers failed. Last error: ${finalError ? finalError.message : 'Unknown'}`);
}

module.exports = {
  generateJSON: async (prompt, systemMessage, useAdvancedModel = false) => {
    const text = await generate(prompt, systemMessage, true, useAdvancedModel);
    try {
      return JSON.parse(text);
    } catch (e) {
      console.error('[aiProvider] Failed to parse JSON:', text.substring(0, 100));
      throw new Error(`Failed to parse AI output as JSON: ${e.message}`);
    }
  },
  generateText: (prompt, systemMessage, useAdvancedModel = false) => {
    return generate(prompt, systemMessage, false, useAdvancedModel);
  }
};
