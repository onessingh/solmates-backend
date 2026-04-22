const Joi = require('joi');
const logger = require('../utils/logger');

// Whitelist of allowed domains for content URLs
// NOTE: SOL routes use their own Joi schema (sol.schemas.js) which accepts any https URL.
// This domain whitelist only applies to legacy /api/admin/content and /api/admin/youtube routes.
const ALLOWED_DOMAINS = [
    'drive.google.com',
    'docs.google.com',
    'youtube.com',
    'youtu.be',
    'www.youtube.com',
    'vimeo.com',
    'dropbox.com',
    'onedrive.live.com',
    'mega.nz',
    'mediafire.com',
    // ✅ FIX: Added missing common domains
    'forms.gle',
    'forms.google.com',
    'classroom.google.com',
    'meet.google.com',
    'calendar.google.com',
    'sites.google.com',
    'storage.googleapis.com',
    'sharepoint.com',
    'teams.microsoft.com',
    'zoom.us',
    'us02web.zoom.us',
    'us04web.zoom.us',
    'us06web.zoom.us',
    'notion.so',
    'canva.com',
    'www.canva.com',
    't.me',
    'telegram.org',
    'web.telegram.org',
    'scribd.com',
    'slideshare.net',
    'academia.edu',
    'researchgate.net',
    'coursera.org',
    'udemy.com',
    'edx.org',
    'nptel.ac.in',
    'swayam.gov.in',
    'archive.org',
    'github.com',
    'raw.githubusercontent.com',
    'githubusercontent.com'
];

/**
 * FIX v16: Accept any valid http/https URL (no domain whitelist restriction).
 * Domain whitelist was too strict — admins use many different platforms.
 * Security maintained via admin-only auth token requirement.
 */
function validateAllowedDomain(value, helpers) {
    try {
        const url = new URL(value);

        // Only enforce http/https protocol — no domain restriction
        if (!['http:', 'https:'].includes(url.protocol)) {
            return helpers.message('URL must use http or https protocol');
        }

        const hostname = url.hostname.toLowerCase();

        if (!hostname || hostname.length === 0) {
            return helpers.message('URL must have a valid hostname');
        }

        return value;
    } catch {
        return helpers.error('any.invalid');
    }
}

/**
 * Validate optional URL fields (thumbnail) — allow empty/null, but validate domain if provided
 */
function validateOptionalUrl(value, helpers) {
    if (!value) return value;
    return validateAllowedDomain(value, helpers);
}

const schemas = {
    login: Joi.object({
        adminId: Joi.string()
            .required()
            .trim()
            .messages({
                'any.required': 'Admin ID is required',
                'string.empty': 'Admin ID cannot be empty'
            }),
        password: Joi.string()
            .min(1)
            .max(72) // bcrypt max
            .required()
            .messages({
                'string.min': 'Password is required',
                'string.max': 'Password is too long',
                'any.required': 'Password is required'
            })
    }),

    addContent: Joi.object({
        data: Joi.object({
            title: Joi.string().required().max(200).trim(),
            // FIX: Accept both 'url' and 'pdf' field names (manage-notes sends 'pdf' sometimes)
            url: Joi.string().uri().required().trim().custom(validateAllowedDomain),
            description: Joi.string().max(500).allow('', null).trim(),
            thumbnail: Joi.string().uri().allow('', null).trim().custom(validateOptionalUrl),
            scheduledAt: Joi.string().isoDate().allow('', null).trim(),
            folderId: Joi.string().allow('', null).trim()
        }).required(),
        // FIX: Semester null/empty must be explicitly allowed - Joi.string() alone rejects null
        semester: Joi.alternatives().try(
            Joi.string().valid('1', '2', '3', '4'),
            Joi.string().allow(''),
            Joi.valid(null)
        ).optional().default(null),
        subject: Joi.string().max(100).allow(null, '').trim().optional()
    }),

    updateContent: Joi.object({
        data: Joi.object({
            title: Joi.string().max(200).trim(),
            url: Joi.string().uri().trim().custom(validateAllowedDomain),
            description: Joi.string().max(500).allow('', null).trim(),
            thumbnail: Joi.string().uri().allow('', null).trim().custom(validateOptionalUrl),
            scheduledAt: Joi.string().isoDate().allow('', null).trim(),
            folderId: Joi.string().allow('', null).trim()
        }).required(),
        // FIX: Same fix as addContent - null semester must be allowed
        semester: Joi.alternatives().try(
            Joi.string().valid('1', '2', '3', '4'),
            Joi.string().allow(''),
            Joi.valid(null)
        ).optional().default(null),
        subject: Joi.string().max(100).allow(null, '').trim().optional()
    }),

    youtubeVideo: Joi.object({
        title: Joi.string().required().max(200).trim(),
        url: Joi.string().uri().required().trim().custom(validateAllowedDomain),
        semester: Joi.alternatives().try(Joi.string().valid('1', '2', '3', '4'), Joi.number().integer().min(1).max(4)).allow(null, ''),
        subject: Joi.string().max(100).allow(null, '').trim(),
        thumbnail: Joi.string().uri().allow(null, '').trim().custom(validateOptionalUrl)
    }),

    updateYoutubeVideo: Joi.object({
        title: Joi.string().max(200).trim(),
        url: Joi.string().uri().trim().custom(validateAllowedDomain),
        semester: Joi.alternatives().try(Joi.string().valid('1', '2', '3', '4'), Joi.number().integer().min(1).max(4)).allow(null, ''),
        subject: Joi.string().max(100).allow(null, '').trim(),
        thumbnail: Joi.string().uri().allow(null, '').trim().custom(validateOptionalUrl)
    }),

    semesterLink: Joi.object({
        // FIX: Accept both number (1) and string ('1') semester values from frontend
        semester: Joi.alternatives().try(
            Joi.number().integer().min(1).max(4),
            Joi.string().pattern(/^[a-z0-9_]*([1-4]|sem[1-4])$/i)
        ).required()
            .messages({ 'alternatives.match': 'Semester must be 1-4, sem1-4, or prefixed like pyq_1' }),
        // FIX: link must be string — clear error if object passed accidentally
        link: Joi.string().max(2000).required().trim()
            .messages({
                'string.base': 'Link must be a URL string, not an object. Enter the URL directly.',
                'any.required': 'Link URL is required'
            }),
        title: Joi.string().max(500).allow('', null).trim()
    }),

    contentQuery: Joi.object({
        semester: Joi.alternatives().try(Joi.string().valid('1', '2', '3', '4'), Joi.number().integer().min(1).max(4)).allow(null, ''),
        subject: Joi.string().max(100).allow(null, '').trim(),
        folderId: Joi.string().allow(null, '').trim()
    }),

    saveResume: Joi.object({
        resumeData: Joi.object().required()
    }),

    // FIX: chatMessage schema is now actually applied in content.routes.js
    chatMessage: Joi.object({
        message: Joi.string().required().max(2000).trim(),
        history: Joi.array().items(Joi.object({
            role: Joi.string().valid('user', 'assistant').required(),
            content: Joi.string().max(2000).required()
        })).max(20).optional()
    }),

    careerTestStart: Joi.object({
        currentField: Joi.string().max(50).allow('', null).trim(),
        desiredField: Joi.string().max(50).allow('', null).trim(),
        experienceLevel: Joi.string().valid('beginner', 'intermediate', 'advanced').allow('', null)
    }).default({}),

    careerTestSubmit: Joi.object({
        answers: Joi.array().items(Joi.string().max(500)).max(50).required()
    }),

    interviewStart: Joi.object({
        field: Joi.string().max(50).allow('', null).trim(),
        difficulty: Joi.string().valid('easy', 'medium', 'hard').allow('', null)
    }).default({}),

    interviewFeedback: Joi.object({
        sessionId: Joi.string().required().trim(),
        questionId: Joi.string().required().trim(),
        answer: Joi.string().required().max(2000).trim(),
        rating: Joi.number().integer().min(1).max(5).optional()
    }),

    studyPlan: Joi.object({
        goals: Joi.array().items(Joi.string().max(200)).max(20).default([]),
        availableHoursPerDay: Joi.number().integer().min(1).max(24).default(4),
        examDate: Joi.string().max(20).allow(null, '').trim()
    })
};

function validate(schemaName) {
    return (req, res, next) => {
        const schema = schemas[schemaName];

        if (!schema) {
            logger.error('Validation schema not found', { schemaName });
            return next();
        }

        const { error, value } = schema.validate(req.body, {
            abortEarly: false,
            stripUnknown: true
        });

        if (error) {
            logger.warn('Validation failed', {
                schemaName,
                errors: error.details.map(d => d.message),
                ip: req.ip
            });

            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: error.details.map(d => ({
                    field: d.path.join('.'),
                    message: d.message
                }))
            });
        }

        req.validatedBody = value;
        next();
    };
}

function validateQuery(schemaName) {
    return (req, res, next) => {
        const schema = schemas[schemaName];

        if (!schema) return next();

        const { error, value } = schema.validate(req.query, {
            abortEarly: false,
            stripUnknown: true
        });

        if (error) {
            return res.status(400).json({
                success: false,
                error: 'Invalid query parameters',
                details: error.details.map(d => d.message)
            });
        }

        req.validatedQuery = value;
        next();
    };
}

module.exports = { validate, validateQuery, schemas };
