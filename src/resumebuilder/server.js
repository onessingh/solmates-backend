"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth.routes");
const resumeRoutes = require("./routes/resume.routes");
const analyticsRoutes = require("./routes/analytics.routes");
const templateRoutes = require("./routes/template.routes");
const jdRoutes = require("./routes/jd.routes");
const { errorHandler, notFoundHandler } = require("./middlewares/error.middleware");
const { rateLimiter } = require("./middlewares/rateLimiter");

const app = express();

const PORT = process.env.PORT || 4000;
const API_PREFIX = "/api/v1";
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const GROQ_KEY = process.env.GROQ_API_KEY;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(rateLimiter({ windowMs: 60 * 1000, max: 300 }));
app.use(express.static("public"));

if (!OPENROUTER_KEY && !GROQ_KEY) {
  console.warn("[SOLMATES] Neither OPENROUTER_API_KEY nor GROQ_API_KEY is set. JD Match AI will fall back to rule-based evaluation.");
}

app.get("/", (req, res) => {
  res.status(200).json({ status: "ok", app: "SOLMATES Resume Builder" });
});

app.use(`${API_PREFIX}/auth`, authRoutes);
app.use(`${API_PREFIX}/resumes`, resumeRoutes);
app.use(`${API_PREFIX}/analytics`, analyticsRoutes);
app.use(`${API_PREFIX}/templates`, templateRoutes);
app.use(`${API_PREFIX}/jd-match`, jdRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT);
