"use strict";

const resumeService = require("../services/resume.service");

const send = (res, status, data) => res.status(status).json(data);

const createResume = (req, res) => {
  try {
    const resume = resumeService.createResume(req.body || {});
    return send(res, 201, { resume });
  } catch (error) {
    return send(res, 400, { error: error.message });
  }
};

const listResumes = (req, res) => {
  try {
    const list = resumeService.listResumes(req.query || {});
    return send(res, 200, { resumes: list });
  } catch (error) {
    return send(res, 400, { error: error.message });
  }
};

const getResume = (req, res) => {
  try {
    const resume = resumeService.getResume(req.params.id);
    return send(res, 200, { resume });
  } catch (error) {
    return send(res, 404, { error: error.message });
  }
};

const updateResume = (req, res) => {
  try {
    const resume = resumeService.updateResume(req.params.id, req.body || {});
    return send(res, 200, { resume });
  } catch (error) {
    return send(res, 400, { error: error.message });
  }
};

const deleteResume = (req, res) => {
  try {
    resumeService.deleteResume(req.params.id);
    return send(res, 200, { success: true });
  } catch (error) {
    return send(res, 404, { error: error.message });
  }
};

const setActiveResume = (req, res) => {
  try {
    const resume = resumeService.setActiveResume(req.params.id, req.body?.is_active);
    return send(res, 200, { resume });
  } catch (error) {
    return send(res, 400, { error: error.message });
  }
};

const scoreResume = (req, res) => {
  try {
    const resume_score = resumeService.scoreResume(req.params.id);
    return send(res, 200, { resume_score });
  } catch (error) {
    return send(res, 404, { error: error.message });
  }
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
