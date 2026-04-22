"use strict";

const crypto = require("crypto");

const resumes = new Map();

const nowIso = () => new Date().toISOString();

const sanitizeArray = (items) => Array.isArray(items) ? items.filter(Boolean) : [];

const createResume = ({ user_id, title, selected_template } = {}) => {
  if (!user_id || !title || !selected_template) {
    throw new Error("user_id, title, and selected_template are required");
  }
  const resume = {
    id: crypto.randomUUID(),
    user_id,
    title,
    selected_template,
    resume_score: 0,
    is_active: true,
    personal_info: {},
    summary: "",
    experience: [],
    education: [],
    skills: [],
    certifications: [],
    languages: [],
    created_at: nowIso(),
    updated_at: nowIso()
  };
  resumes.set(resume.id, resume);
  return resume;
};

const listResumes = ({ user_id } = {}) => {
  return Array.from(resumes.values()).filter((r) => !user_id || r.user_id === user_id);
};

const getResume = (id) => {
  const resume = resumes.get(id);
  if (!resume) throw new Error("resume not found");
  return resume;
};

const updateResume = (id, payload = {}) => {
  const resume = resumes.get(id);
  if (!resume) throw new Error("resume not found");

  resume.title = payload.title || resume.title;
  resume.selected_template = payload.selected_template || resume.selected_template;
  resume.personal_info = payload.personal_info || resume.personal_info;
  resume.summary = payload.summary || resume.summary;
  resume.experience = sanitizeArray(payload.experience) || resume.experience;
  resume.education = sanitizeArray(payload.education) || resume.education;
  resume.skills = sanitizeArray(payload.skills) || resume.skills;
  resume.certifications = sanitizeArray(payload.certifications) || resume.certifications;
  resume.languages = sanitizeArray(payload.languages) || resume.languages;
  resume.updated_at = nowIso();
  resumes.set(resume.id, resume);
  return resume;
};

const deleteResume = (id) => {
  const resume = resumes.get(id);
  if (!resume) throw new Error("resume not found");
  resumes.delete(id);
  return true;
};

const setActiveResume = (id, is_active) => {
  const resume = resumes.get(id);
  if (!resume) throw new Error("resume not found");
  resume.is_active = Boolean(is_active);
  resume.updated_at = nowIso();
  resumes.set(resume.id, resume);
  return resume;
};

const scoreResume = (id) => {
  const resume = resumes.get(id);
  if (!resume) throw new Error("resume not found");
  let score = 0;
  if (resume.personal_info?.full_name) score += 15;
  if (resume.summary && resume.summary.length > 80) score += 15;
  score += Math.min(resume.experience.length * 10, 30);
  score += Math.min(resume.skills.length * 2, 10);
  if (resume.education.length) score += 10;
  score += Math.min(resume.certifications.length * 2 + resume.languages.length * 2, 10);
  resume.resume_score = Math.min(score, 100);
  resume.updated_at = nowIso();
  resumes.set(resume.id, resume);
  return resume.resume_score;
};

module.exports = {
  createResume,
  listResumes,
  getResume,
  updateResume,
  deleteResume,
  setActiveResume,
  scoreResume
};
