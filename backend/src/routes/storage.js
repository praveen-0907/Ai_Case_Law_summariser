// backend/src/routes/storage.js
const express = require('express')
const router = express.Router()
const {
  getSingleCase,
  getComparison,
  listCases,
  listComparisons,
  saveAnalysisReport,
} = require('../services/supabaseService')

// GET /api/storage/cases/:id
// Retrieve a single case analysis
router.get('/cases/:id', async (req, res) => {
  try {
    const caseData = await getSingleCase(req.params.id)
    if (!caseData) {
      return res.status(404).json({ error: 'Case not found' })
    }
    res.json(caseData)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/storage/cases
// List all stored cases
router.get('/cases', async (req, res) => {
  const limit = parseInt(req.query.limit) || 20
  const offset = parseInt(req.query.offset) || 0
  const cases = await listCases(limit, offset)
  res.json(cases)
})

// GET /api/storage/comparisons/:id
// Retrieve a comparison analysis
router.get('/comparisons/:id', async (req, res) => {
  try {
    const comparisonData = await getComparison(req.params.id)
    if (!comparisonData) {
      return res.status(404).json({ error: 'Comparison not found' })
    }
    res.json(comparisonData)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/storage/comparisons
// List all stored comparisons
router.get('/comparisons', async (req, res) => {
  const limit = parseInt(req.query.limit) || 20
  const offset = parseInt(req.query.offset) || 0
  const comparisons = await listComparisons(limit, offset)
  res.json(comparisons)
})

// POST /api/storage/reports
// Save a comparison report
router.post('/reports', async (req, res) => {
  try {
    const { comparison_id, report_name, report_data } = req.body
    const reportId = await saveAnalysisReport(comparison_id, report_name, report_data)
    if (!reportId) {
      return res.status(500).json({ error: 'Failed to save report' })
    }
    res.json({ id: reportId, message: 'Report saved successfully' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router