const express = require('express')
const axios = require('axios')
const { saveComparison } = require('../services/supabaseService')

const router = express.Router()

// AI Service URL from .env
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000'

router.post('/', async (req, res) => {
  const { caseA, caseB } = req.body

  if (!caseA || !caseB) {
    return res.status(400).json({
      success: false,
      message: 'Missing caseA or caseB in the request body.',
    })
  }

  try {
    // Call the Python AI service
    const [similarityResponse, comparisonResponse] = await Promise.all([
      axios.post(`${AI_SERVICE_URL}/similarity`, {
        case_a_text: caseA.summary,
        case_b_text: caseB.summary,
      }, { timeout: 600000 }), // 10m timeout
      axios.post(`${AI_SERVICE_URL}/compare-cases`, {
        case_a: { summary: caseA.summary, issues: caseA.issues, principles: caseA.principles },
        case_b: { summary: caseB.summary, issues: caseB.issues, principles: caseB.principles },
      }, { timeout: 600000 }), // 10m timeout
    ])

    const similarityResult = similarityResponse.data
    const comparisonResult = comparisonResponse.data

    // Save to Supabase
    let comparisonId = null
    try {
      // Ensure we have case_ids passed from the frontend
      if (caseA.caseId && caseB.caseId) {
        comparisonId = await saveComparison(
          caseA.caseId,
          caseB.caseId,
          comparisonResult,
          similarityResult
        )
      } else {
        console.warn('⚠️ No caseId provided for Case A or Case B; skipping Supabase save.')
      }
    } catch (dbError) {
      console.warn(`⚠️ Supabase comparison save skipped: ${dbError.message}`)
    }

    return res.status(200).json({
      success: true,
      comparisonId,
      similarity: similarityResult,
      comparison: comparisonResult,
    })
  } catch (error) {
    console.error('❌ Pipeline Error in /api/compare:', error.message)
    const detailMsg = error.response?.data?.detail?.message || error.response?.data?.detail || error.message
    
    return res.status(500).json({
      success: false,
      message: `Failed to compare cases. Error: ${detailMsg}`,
      error: detailMsg,
    })
  }
})

module.exports = router
