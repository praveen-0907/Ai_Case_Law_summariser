// frontend/src/services/api.js
// -------------------------------------------------------
// This file contains all functions that talk to our backend API.
// We use axios (a popular HTTP library) to make API requests.
// Having all API calls in one file makes it easy to manage and change URLs.
// -------------------------------------------------------

import axios from 'axios'

// Base URL of our Node.js backend server
// We read it from the .env file (VITE_ prefix is required for Vite to expose it)
// Falls back to localhost:5000 if the env variable is not set
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'

// Create a reusable axios instance with our backend URL pre-configured
// This way we don't have to repeat the base URL in every function
const apiClient = axios.create({
  baseURL: BACKEND_URL,
})

// -------------------------------------------------------
// FUNCTION: uploadPDFFiles
// Purpose: Upload multiple PDF files to the backend server
//
// Parameters:
//   - files: An array of File objects (the PDFs the user selected)
//   - onUploadProgress: A callback function that receives progress % (0-100)
//                       We use this to update the progress bar in the UI
//
// Returns: The response data from the backend (JSON with file info)
// -------------------------------------------------------
export const uploadPDFFiles = async (files, onUploadProgress) => {
  // FormData is a special browser object used to send files in HTTP requests
  // It's like filling out an HTML form programmatically
  const formData = new FormData()

  // Append each file to the FormData object
  // 'documents' is the field name — must match what multer expects on the backend
  files.forEach((file) => {
    formData.append('documents', file)
  })

  // Make the POST request to our backend upload endpoint
  const response = await apiClient.post('/api/upload', formData, {
    headers: {
      // Tell the server we're sending form data with files
      'Content-Type': 'multipart/form-data',
    },
    // onUploadProgress is called by axios as the upload progresses
    // The 'progressEvent' object has 'loaded' (bytes sent) and 'total' (total bytes)
    onUploadProgress: (progressEvent) => {
      // Calculate percentage: (bytes sent / total bytes) * 100
      const percentCompleted = Math.round(
        (progressEvent.loaded * 100) / progressEvent.total
      )
      // Call the callback function with the current progress percentage
      if (onUploadProgress) {
        onUploadProgress(percentCompleted)
      }
    },
  })

  // Return the data from the server response
  return response.data
}

// -------------------------------------------------------
// FUNCTION: checkBackendHealth
// Purpose: Ping the backend to confirm it is running
// Used to show connection status in the UI
// -------------------------------------------------------
export const checkBackendHealth = async () => {
  const response = await apiClient.get('/api/health')
  return response.data
}

// -------------------------------------------------------
// FUNCTION: analyseFile
// Purpose: Trigger text extraction, summarization, and key feature extraction on backend
//
// Parameters:
//   - savedName: File name on backend disk (with timestamp prefix)
//   - originalName: Original uploaded file name
//
// Returns: The analysis result object containing summary, issues, principles
// -------------------------------------------------------
export const analyseFile = async (savedName, originalName) => {
  const response = await apiClient.post('/api/analyse', { savedName, originalName })
  return response.data
}

// -------------------------------------------------------
// AI SERVICE DIRECT CALLS (Python FastAPI on port 8000)
// -------------------------------------------------------
// These functions call the Python AI service directly from the browser.
// In a full production setup these would be proxied through the Node backend,
// but for our development build they call port 8000 directly.
//
// Base URL read from .env as VITE_AI_SERVICE_URL, default: http://localhost:8000
// -------------------------------------------------------

const AI_URL = import.meta.env.VITE_AI_SERVICE_URL || 'http://localhost:8000'

// Separate axios instance just for the Python AI service
const aiClient = axios.create({ baseURL: AI_URL })

// -------------------------------------------------------
// FUNCTION: generateSummary
// Calls POST /generate-summary on the Python AI service.
//
// Parameters:
//   text (string): Raw extracted text of the legal judgment
//
// Returns:
//   { status, model_used, summary: { text, word_count, sections_found }, is_fallback }
// -------------------------------------------------------
export const generateSummary = async (text) => {
  const response = await aiClient.post('/generate-summary', { text })
  return response.data
}

// -------------------------------------------------------
// FUNCTION: extractFeatures
// Calls POST /extract-features on the Python AI service.
//
// Parameters:
//   text (string): Raw extracted text of the legal judgment
//
// Returns:
//   { status, issues: ["..."], principles: ["..."], is_fallback }
// -------------------------------------------------------
export const extractFeatures = async (text) => {
  const response = await aiClient.post('/extract-features', { text })
  return response.data
}

// -------------------------------------------------------
// FUNCTION: getSimilarityScore
// Calls POST /similarity on the Python AI service.
//
// Parameters:
//   caseAText (string): Text of the first case
//   caseBText (string): Text of the second case
//
// Returns:
//   { similarity_score: 78, interpretation: "High similarity...", model_used }
// -------------------------------------------------------
export const getSimilarityScore = async (caseAText, caseBText) => {
  const response = await aiClient.post('/similarity', {
    case_a_text: caseAText,
    case_b_text: caseBText,
  })
  return response.data
}

// -------------------------------------------------------
// FUNCTION: compareCases
// Calls POST /compare-cases on the Python AI service.
//
// Parameters:
//   caseA (object): { summary: "...", issues: [], principles: [] }
//   caseB (object): { summary: "...", issues: [], principles: [] }
//
// Returns:
//   {
//     common_issues: [],
//     common_principles: [],
//     structural_differences: [],
//     adversarial_strategy: {
//       if_you_rely_on_case_a: "...",
//       how_to_distinguish_them: "..."
//     }
//   }
// -------------------------------------------------------
export const compareCases = async (caseA, caseB) => {
  // Sanitize case data: ensure issues and principles are always arrays
  const sanitizedCaseA = {
    caseId: caseA?.caseId,
    summary: caseA?.summary || '',
    issues: Array.isArray(caseA?.issues) ? caseA.issues : [],
    principles: Array.isArray(caseA?.principles) ? caseA.principles : [],
  }
  const sanitizedCaseB = {
    caseId: caseB?.caseId,
    summary: caseB?.summary || '',
    issues: Array.isArray(caseB?.issues) ? caseB.issues : [],
    principles: Array.isArray(caseB?.principles) ? caseB.principles : [],
  }
  const response = await apiClient.post('/api/compare', {
    caseA: sanitizedCaseA,
    caseB: sanitizedCaseB,
  })
  return response.data
}

// -------------------------------------------------------
// FUNCTION: downloadReport
// Calls POST /api/download-report on the Node.js backend.
// The backend generates a PDF and streams it back as a binary blob.
// We use the browser's built-in mechanism to trigger a file download.
//
// Parameters:
//   reportData (object): The full comparison data object containing:
//     {
//       case_a: { name, summary, issues, principles },
//       case_b: { name, summary, issues, principles },
//       similarity_score: 78,
//       similarity_interpretation: "High similarity...",
//       comparison: { common_issues, common_principles, structural_differences, adversarial_strategy }
//     }
//
// Returns: void — triggers browser file download directly
//
// HOW THE DOWNLOAD TRICK WORKS:
//   1. Axios receives the PDF bytes as a 'blob' (Binary Large OBject).
//   2. We create a temporary hidden <a> element in the DOM.
//   3. We attach the blob as a fake URL to the <a> element.
//   4. We programmatically click the <a> element — browser sees it as a click on a download link.
//   5. The browser saves the file. We remove the temporary element.
// -------------------------------------------------------
export const downloadReport = async (reportData) => {
  const response = await apiClient.post('/api/download-report', reportData, {
    responseType: 'blob',
    headers: { 'Content-Type': 'application/json' },
  })

  const blobUrl = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }))

  const link = document.createElement('a')
  link.href = blobUrl
  link.setAttribute('download', 'Legal_Comparison_Report.pdf')
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(blobUrl)
}

// -------------------------------------------------------
// FUNCTION: sendChatMessage
// Calls POST /chat on the Python AI service.
//
// Parameters:
//   question (string): User's question about the comparison
//   context (object): Full comparison context including both cases and analysis
//
// Returns:
//   { answer: "...", model_used: "..." }
// -------------------------------------------------------
export const sendChatMessage = async (question, context) => {
  const response = await aiClient.post('/chat', {
    question,
    context,
  })
  return response.data
}
