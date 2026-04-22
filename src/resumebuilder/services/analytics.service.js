"use strict";

const crypto = require("crypto");

const analytics = [];

const nowIso = () => new Date().toISOString();

const logEvent = ({ resume_id, event_type, metadata }) => {
  if (!resume_id || !event_type) {
    throw new Error("resume_id and event_type are required");
  }
  const entry = {
    id: crypto.randomUUID(),
    resume_id,
    event_type,
    metadata: metadata || {},
    created_at: nowIso()
  };
  analytics.push(entry);
  return entry;
};

const listEvents = ({ resume_id } = {}) => {
  return resume_id ? analytics.filter((e) => e.resume_id === resume_id) : analytics;
};

const summary = () => {
  const counts = analytics.reduce((acc, event) => {
    acc[event.event_type] = (acc[event.event_type] || 0) + 1;
    return acc;
  }, {});
  return { counts, total: analytics.length };
};

module.exports = {
  logEvent,
  listEvents,
  summary
};
