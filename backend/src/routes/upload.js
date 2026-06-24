// backend/src/routes/upload.js
// -------------------------------------------------------
// This file defines the API routes related to file uploading.
// Think of routes as the "address book" — they map URLs to handler functions.
//
// Route defined here:
//   POST /api/upload → receives files → saves to /uploads → returns JSON
//
// This file is kept simple on purpose.
// All the real logic lives in uploadController.js
// -------------------------------------------------------

const express = require('express')

// Create a new Router instance
// A Router is like a mini Express app for a specific group of routes
const router = express.Router()

// Import our controller and middleware from the controllers folder
const { uploadMiddleware, handleFileUpload } = require('../controllers/uploadController')

// -------------------------------------------------------
// ROUTE: POST /api/upload
// -------------------------------------------------------
// When a POST request comes in to /api/upload, two things happen IN ORDER:
//
//   1. uploadMiddleware (multer) runs first:
//      - Reads incoming files from the request
//      - Validates MIME type (rejects non-PDFs)
//      - Checks file size (rejects files > 20MB)
//      - Saves valid files to /backend/uploads/ folder
//      - Calls next() to continue to the controller IF all files are valid
//      - If invalid, passes an error to the error handler
//
//   2. handleFileUpload (our controller) runs second:
//      - Reads req.files (populated by multer)
//      - Sends back a JSON response with upload results
//
// The error handler at the BOTTOM of this file catches multer errors
// and converts them to clean JSON responses for the frontend.
// -------------------------------------------------------
router.post(
  '/',               // Path is just '/' because '/api/upload' is set in server.js
  (req, res, next) => {
    // We wrap multer in a function so we can catch its errors cleanly
    uploadMiddleware(req, res, (err) => {
      if (err) {
        // Multer or file filter threw an error — handle it here
        return handleMulterError(err, res)
      }
      // No error — move on to the actual controller
      next()
    })
  },
  handleFileUpload   // After multer succeeds, run this
)

// -------------------------------------------------------
// HELPER FUNCTION: handleMulterError
// Converts multer errors into clean JSON responses the frontend can display
// -------------------------------------------------------
const handleMulterError = (err, res) => {
  console.error('❌ Upload error:', err.message)

  // err.code is set by multer for specific known errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    // File was larger than our 20MB limit
    return res.status(400).json({
      success: false,
      message: 'One or more files exceed the 20MB size limit. Please upload smaller files.',
      errorCode: 'FILE_TOO_LARGE',
    })
  }

  if (err.code === 'LIMIT_FILE_COUNT') {
    // More than 10 files were sent
    return res.status(400).json({
      success: false,
      message: 'Too many files. Maximum 10 files allowed per upload.',
      errorCode: 'TOO_MANY_FILES',
    })
  }

  if (err.code === 'INVALID_FILE_TYPE') {
    // Our custom fileFilter rejected a non-PDF file
    return res.status(400).json({
      success: false,
      message: err.message, // Use our custom message from fileFilter
      errorCode: 'INVALID_FILE_TYPE',
    })
  }

  // Generic fallback for any other unexpected error
  return res.status(500).json({
    success: false,
    message: 'Upload failed due to a server error. Please try again.',
    errorCode: 'SERVER_ERROR',
    detail: err.message,
  })
}

// Export the router so server.js can mount it
module.exports = router
