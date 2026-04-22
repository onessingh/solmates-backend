"use strict";

const templates = [
  { key: "ats", name: "ATS Optimized", category: "ATS", ats_safe: true, is_active: true },
  { key: "modern", name: "Modern Edge", category: "Modern", ats_safe: true, is_active: true },
  { key: "classic", name: "Classic Pro", category: "Classic", ats_safe: true, is_active: true },
  { key: "minimal", name: "Minimal Grid", category: "Minimal", ats_safe: true, is_active: true },
  { key: "creative", name: "Creative Wave", category: "Creative", ats_safe: false, is_active: true },
  { key: "executive", name: "Executive Slate", category: "Executive", ats_safe: true, is_active: true },
  { key: "tech", name: "Tech Focus", category: "Tech", ats_safe: true, is_active: true },
  { key: "academic", name: "Academic CV", category: "Academic", ats_safe: true, is_active: true },
  { key: "compact", name: "Compact One-Page", category: "Compact", ats_safe: true, is_active: true },
  { key: "impact", name: "Impact Metrics", category: "Impact", ats_safe: true, is_active: true },
  { key: "chronological", name: "Chronological", category: "Chronological", ats_safe: true, is_active: true }
];

const listTemplates = () => templates.slice();

module.exports = {
  listTemplates
};
