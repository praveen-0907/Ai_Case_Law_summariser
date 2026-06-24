// backend/src/routes/analyse.js
// -------------------------------------------------------
// This file defines the API routes related to the AI orchestration pipeline.
// Maps incoming HTTP requests to their corresponding controllers.
//
// Route:
//   POST /api/analyse → Orchestrates the text extraction, summarization,
//                       and legal feature extraction process for a single file.
// -------------------------------------------------------

const express = require('express')
const router = express.Router()

// Import our controller
const { handleAnalyse } = require('../controllers/analyseController')

// Route definition mapping to the controller function
router.post('/', handleAnalyse)

module.exports = router
