// backend/src/controllers/analyseController.js
// -------------------------------------------------------
// This file orchestrates the analysis pipeline for legal PDFs.
// It acts as a bridge between our Node.js backend and the Python AI service.
//
// Pipeline steps:
//   1. Read the uploaded PDF file from disk (/backend/uploads)
//   2. Stream it to the Python AI service: POST /extract-text
//   3. Pass the extracted text to: POST /generate-summary
//   4. Pass the extracted text to: POST /extract-features
//   5. Combine the summary, issues, and principles and return to the client
// -------------------------------------------------------

const fs = require('fs')
const path = require('path')
const axios = require('axios')
const FormData = require('form-data')
const { saveCaseAnalysis, saveDocument } = require('../services/supabaseService')

// Read the Python AI service URL from environment variables, default to port 8000
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000'

/**
 * handleAnalyse
 * Reads an uploaded case PDF from disk and runs the extraction + summarization pipeline
 */
const handleAnalyse = async (req, res) => {
  const { savedName, originalName } = req.body

  // -------------------------------------------------------
  // STEP 1: Input Validation
  // -------------------------------------------------------
  if (!savedName || !originalName) {
    return res.status(400).json({
      success: false,
      message: 'Missing required parameters. Both savedName and originalName are required.',
    })
  }

  // Build the absolute path to the file on disk
  const filePath = path.join(__dirname, '..', '..', 'uploads', savedName)
  console.log(`🔍 Orchestrating analysis for file: ${originalName} (saved as ${savedName})`)

  // Check if the file actually exists on the server
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      success: false,
      message: `File not found on server: ${originalName}. Please upload the file again.`,
    })
  }

  try {
    // -------------------------------------------------------
    // STEP 2: PDF Text Extraction (Python AI Service)
    // -------------------------------------------------------
    console.log(`  [1/3] Extracting text via FastAPI /extract-text...`)
    
    // Create a new multipart/form-data request body to stream the PDF file
    const form = new FormData()
    form.append('file', fs.createReadStream(filePath), {
      filename: originalName,
      contentType: 'application/pdf',
    })

    // Call the Python AI extraction service
    const extractResponse = await axios.post(`${AI_SERVICE_URL}/extract-text`, form, {
      headers: {
        ...form.getHeaders(),
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 600000, // 600s timeout for large PDF processing
    })

    const { full_text: fullText, total_pages: totalPages } = extractResponse.data

    if (!fullText || fullText.trim().length === 0) {
      throw new Error('No text content was extracted from the PDF.')
    }

    console.log(`  [1/3] Success! Extracted ${fullText.length} characters across ${totalPages} pages.`)

    // -------------------------------------------------------
    // STEP 3: Parallel AI Summary & Feature Extraction Calls
    // -------------------------------------------------------
    console.log(`  [2/3] Generating summary & extracting features in parallel...`)

    // We make these two calls in parallel to save time (concurrency)
    const [summaryResponse, featuresResponse] = await Promise.all([
      axios.post(`${AI_SERVICE_URL}/generate-summary`, { text: fullText }, { timeout: 600000 }),
      axios.post(`${AI_SERVICE_URL}/extract-features`, { text: fullText }, { timeout: 600000 }),
    ])

    // Extract values from response payloads
    // Note: Python /generate-summary returns { summary: { text, ... } }
    const summaryText = summaryResponse.data.summary.text
    // Python /extract-features returns { issues: [...], principles: [...] }
    const { issues, principles } = featuresResponse.data

    console.log(`  [3/3] Analysis complete for case: ${originalName}`)

    // -------------------------------------------------------
    // STEP 4: Persist analysis to Supabase if configured
    // -------------------------------------------------------
    let caseId = null;
    try {
      const documentId = await saveDocument(originalName, fs.statSync(filePath).size)

      if (documentId) {
        caseId = await saveCaseAnalysis(documentId, {
          name: originalName,
          summary: summaryText,
          issues: issues || [],
          principles: principles || [],
          featuresStatus: featuresResponse.data.status || 'success',
          featuresFallbackReason: featuresResponse.data.fallback_reason || null,
          modelUsed: summaryResponse.data.model_used || 'ollama',
          isFallback: summaryResponse.data.is_fallback || featuresResponse.data.is_fallback || false,
        })
      }
    } catch (supabaseError) {
      console.warn(`⚠️ Supabase save skipped for ${originalName}: ${supabaseError.message}`)
    }

    // -------------------------------------------------------
    // STEP 5: Return Combined Analysis JSON
    // -------------------------------------------------------
    return res.status(200).json({
      success: true,
      caseId: caseId,
      name: originalName,
      summary: summaryText,
      issues: issues || [],
      principles: principles || [],
      featuresStatus: featuresResponse.data.status || 'success',
      featuresFallbackReason: featuresResponse.data.fallback_reason || null,
      modelUsed: summaryResponse.data.model_used || 'ollama',
      isFallback: summaryResponse.data.is_fallback || featuresResponse.data.is_fallback || false,
    })

  } catch (error) {
    console.error(`❌ Orchestrator Pipeline Error for ${originalName}:`, error.message)

    // Always return 500 to the client — the upstream status code (e.g. 404 from AI service)
    // is internal and should not be forwarded directly to the frontend
    const detailMsg = error.response?.data?.detail?.message || error.response?.data?.detail || error.message

    return res.status(500).json({
      success: false,
      message: `Failed to analyze case judgment: ${originalName}. Error: ${detailMsg}`,
      error: detailMsg,
    })
  }
}

module.exports = {
  handleAnalyse,
}