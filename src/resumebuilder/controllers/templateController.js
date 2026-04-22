"use strict";

const { listTemplates } = require("../services/template.service");

const send = (res, status, data) => res.status(status).json(data);

const list = (req, res) => {
  const templates = listTemplates();
  return send(res, 200, { templates });
};

module.exports = {
  list
};
