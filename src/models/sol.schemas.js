/**
 * SOL Database - Per-Category Schemas
 * Each category has its own field structure.
 * Validated via Joi per category type.
 */

const Joi = require('joi');

const VALID_CATEGORIES = [
  'live-classes',
  'recorded-class', // v81.3: Ensured available for precision restoration
  'notes',
  'pyqs',
  'oneshot',
  'youtube',
  'elearning',
  'ebooks',
  'professor',
  'notifications',
  'ai-knowledge'
];

const VALID_SEMESTERS = ['0', '1', '2', '3', '4'];

// 3. Search Legacy SOL Tables
const LEGACY_SEARCH_CATEGORIES = ['notes', 'pyqs', 'oneshot', 'elearning', 'professor', 'live-classes', 'recorded-class', 'youtube'];

// ── Category-specific field schemas ──────────────────────────────────────────

const schemas = {
  'live-classes': Joi.object({
    title:       Joi.string().required().max(200).trim(),
    date:        Joi.string().required().trim(),
    link:        Joi.string().uri({ scheme: ['http', 'https'] }).required().trim(),
    instructor:  Joi.string().max(100).allow('', null).trim(),
    description: Joi.string().max(500).allow('', null).trim(),
    folderId:    Joi.string().allow('', null).trim(),
    scheduledAt: Joi.string().allow('', null).trim(),
    reminder30MinSent: Joi.boolean().allow(null),
    reminder10MinSent: Joi.boolean().allow(null)
  }),

  'recorded-class': Joi.object({
    title:       Joi.string().required().max(200).trim(),
    date:        Joi.string().required().trim(),
    link:        Joi.string().uri({ scheme: ['http', 'https'] }).required().trim(),
    instructor:  Joi.string().max(100).allow('', null).trim(),
    description: Joi.string().max(500).allow('', null).trim(),
    folderId:    Joi.string().allow('', null).trim(),
    scheduledAt: Joi.string().allow('', null).trim()
  }),

  'notes': Joi.object({
    subject:     Joi.string().required().max(200).trim(),
    pdf:         Joi.string().uri({ scheme: ['http', 'https'] }).required().trim(),
    description: Joi.string().max(500).allow('', null).trim(),
    title:       Joi.string().max(200).allow('', null).trim(),
    author:      Joi.string().max(100).allow('', null).trim(),
    folderId:    Joi.string().allow('', null).trim()
  }),

  'pyqs': Joi.object({
    subject:     Joi.string().required().max(200).trim(),
    year:        Joi.string().required().max(10).trim(),
    pdf:         Joi.string().uri({ scheme: ['http', 'https'] }).required().trim(),
    description: Joi.string().max(500).allow('', null).trim(),
    folderId:    Joi.string().allow('', null).trim()
  }),

  'oneshot': Joi.object({
    title:       Joi.string().required().max(200).trim(),
    pdf:         Joi.string().uri({ scheme: ['http', 'https'] }).required().trim(),
    subject:     Joi.string().max(200).allow('', null).trim(),
    description: Joi.string().max(500).allow('', null).trim(),
    folderId:    Joi.string().allow('', null).trim()
  }),

  'youtube': Joi.object({
    title:       Joi.string().required().max(200).trim(),
    videoUrl:    Joi.string().uri({ scheme: ['http', 'https'] }).required().trim(),
    thumbnail:   Joi.string().uri({ scheme: ['http', 'https'] }).allow('', null).trim(),
    subject:     Joi.string().max(200).allow('', null).trim(),
    description: Joi.string().max(500).allow('', null).trim(),
    folderId:    Joi.string().allow('', null).trim()
  }),

  'elearning': Joi.object({
    title:       Joi.string().required().max(200).trim(),
    link:        Joi.string().uri({ scheme: ['http', 'https'] }).required().trim(),
    platform:    Joi.string().max(100).allow('', null).trim(),
    description: Joi.string().max(500).allow('', null).trim(),
    thumbnail:   Joi.string().uri({ scheme: ['http', 'https'] }).allow('', null).trim(),
    folderId:    Joi.string().allow('', null).trim(),
    bookType:    Joi.string().max(50).allow('', null).trim(),
    subject:     Joi.string().max(200).allow('', null).trim(),
    pdf:         Joi.string().uri({ scheme: ['http', 'https'] }).allow('', null).trim()
  }),

  'professor': Joi.object({
    title:       Joi.string().required().max(200).trim(),
    text:        Joi.string().max(5000).allow('', null).trim(),
    attachments: Joi.array().items(
      Joi.object({
        name: Joi.string().required().max(200).trim(),
        url:  Joi.string().uri({ scheme: ['http', 'https'] }).required().trim()
      })
    ).max(10).default([]),
    subject:     Joi.string().max(200).allow('', null).trim(),
    folderId:    Joi.string().max(200).allow('', null).trim(),
    // Compatibility fields for link-based management
    url:         Joi.string().uri({ scheme: ['http', 'https'] }).allow('', null).trim(),
    pdf:         Joi.string().uri({ scheme: ['http', 'https'] }).allow('', null).trim(),
    link:        Joi.string().uri({ scheme: ['http', 'https'] }).allow('', null).trim(),
    description: Joi.string().max(1000).allow('', null).trim()
  }),

  'notifications': Joi.object({
    title:       Joi.string().required().max(200).trim(),
    link:        Joi.string().required().trim(),
    date:        Joi.string().required().trim(),
    description: Joi.string().max(1000).allow('', null).trim(),
    folderId:    Joi.string().allow('', null).trim()
  }),
  
  'ai-knowledge': Joi.object({
    content:     Joi.string().required().max(5000).trim(),
    title:       Joi.string().max(200).allow('', null).trim(),
    folderId:    Joi.string().allow('', null).trim()
  })
};

/**
 * Validate content body for a given category
 * @returns {{ error, value }}
 */
function validateContent(category, body) {
  const schema = schemas[category];
  if (!schema) {
    return { error: new Error(`Unknown category: ${category}`) };
  }
  return schema.validate(body, { abortEarly: false, stripUnknown: true });
}

module.exports = { VALID_CATEGORIES, VALID_SEMESTERS, validateContent, schemas };
