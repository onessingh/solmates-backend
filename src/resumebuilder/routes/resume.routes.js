"use strict";

const express = require("express");
const resumeController = require("../controllers/resumeController");
const { requireAuth } = require("../middlewares/auth.middleware");

const router = express.Router();

router.post("/", requireAuth, resumeController.createResume);
router.get("/", requireAuth, resumeController.listResumes);
router.get("/:id", requireAuth, resumeController.getResume);
router.put("/:id", requireAuth, resumeController.updateResume);
router.delete("/:id", requireAuth, resumeController.deleteResume);
router.patch("/:id/active", requireAuth, resumeController.setActiveResume);
router.post("/:id/score", requireAuth, resumeController.scoreResume);

module.exports = router;
