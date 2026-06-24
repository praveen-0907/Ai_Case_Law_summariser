// backend/src/controllers/uploadController.js
// -------------------------------------------------------
// This file contains the logic for handling PDF file uploads.
// It uses 'multer' — a Node.js middleware — to handle multipart/form-data
// (which is the format used when sending files via HTTP).
//
// Flow:
//   1. User sends files from the React frontend
//   2. Multer intercepts the request and validates/saves the files
//   3. This controller sends back a JSON response with the results
// -------------------------------------------------------

const multer = require('multer')
const path = require('path')
const fs = require('fs')    // Node.js built-in: File System module

// -------------------------------------------------------
// STEP 1: Define where to save uploaded files
// -------------------------------------------------------

// Build the absolute path to our uploads folder
// __dirname is the directory where THIS file lives (backend/src/controllers/)
// We go up two levels (..) to reach the backend/ root, then into uploads/
const UPLOADS_FOLDER = path.join(__dirname, '..', '..', 'uploads')

// Create the uploads folder if it doesn't already exist
// { recursive: true } means it won't throw an error if the folder exists
if (!fs.existsSync(UPLOADS_FOLDER)) {
  fs.mkdirSync(UPLOADS_FOLDER, { recursive: true })
  console.log(`📁 Created uploads folder at: ${UPLOADS_FOLDER}`)
}

// -------------------------------------------------------
// STEP 2: Configure Multer Storage
// diskStorage tells multer exactly where and how to save files
// -------------------------------------------------------
const storageConfig = multer.diskStorage({
  // destination: decides which FOLDER to save files in
  destination: (req, file, callback) => {
    // callback(error, destinationPath)
    // null means no error
    callback(null, UPLOADS_FOLDER)
  },

  // filename: decides what NAME to give the saved file
  filename: (req, file, callback) => {
    // We add a timestamp to avoid name conflicts
    // Example: "1718167200000-my-judgment.pdf"
    const timestamp = Date.now()
    const originalName = file.originalname

    // Replace spaces with underscores to avoid path issues
    const safeFileName = `${timestamp}-${originalName.replace(/\s+/g, '_')}`

    callback(null, safeFileName)
  },
})

// -------------------------------------------------------
// STEP 3: Configure Multer File Filter
// This runs BEFORE saving the file — reject non-PDFs here
// -------------------------------------------------------
const fileFilter = (req, file, callback) => {
  // Check the MIME type of the uploaded file
  if (file.mimetype === 'application/pdf') {
    // Accept the file — callback(null, true) means "yes, save this"
    callback(null, true)
  } else {
    // Reject the file — callback(error, false) means "no, don't save this"
    // We create a custom Error object to send a clear message
    const rejectionError = new Error(
      `Invalid file type: "${file.originalname}" is not a PDF. Only PDF files are accepted.`
    )
    // Attach a custom code so we can identify this specific error type later
    rejectionError.code = 'INVALID_FILE_TYPE'
    callback(rejectionError, false)
  }
}

// -------------------------------------------------------
// STEP 4: Create the Multer Upload Instance
// Combine our storage config + file filter + size limit
// -------------------------------------------------------
const upload = multer({
  storage: storageConfig,
  fileFilter: fileFilter,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB in bytes (20 * 1024 * 1024)
    files: 10,                   // Maximum 10 files per request
  },
})

// Export the multer upload middleware so routes can use it
// 'documents' is the field name — must match what the frontend sends
const uploadMiddleware = upload.array('documents', 10)

// -------------------------------------------------------
// STEP 5: Controller Function — handles the request after multer runs
// -------------------------------------------------------

/**
 * handleFileUpload
 * Express route controller that processes uploaded PDF files
 * This runs AFTER multer has saved the files
 */
const handleFileUpload = (req, res) => {
  // req.files is populated by multer with info about saved files
  // If no files were uploaded, req.files will be undefined or empty
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'No files were uploaded. Please select at least one PDF file.',
    })
  }

  // Build a clean summary of each uploaded file to send back to the frontend
  const uploadedFileSummaries = req.files.map((file) => ({
    originalName: file.originalname,          // Name the user gave the file
    savedName: file.filename,                 // Name we saved it as (with timestamp)
    savedPath: file.path,                     // Full path on server disk
    sizeBytes: file.size,                     // File size in bytes
    sizeMB: (file.size / (1024 * 1024)).toFixed(2), // Human-readable size in MB
    mimeType: file.mimetype,
  }))

  // Log to the server console for debugging
  console.log(`✅ Successfully uploaded ${req.files.length} file(s):`)
  uploadedFileSummaries.forEach((f) => console.log(`   - ${f.originalName} (${f.sizeMB} MB)`))

  // Send a successful JSON response back to the frontend
  return res.status(200).json({
    success: true,
    message: `Successfully uploaded ${req.files.length} file(s). Ready for AI analysis.`,
    filesUploaded: req.files.length,
    files: uploadedFileSummaries,
  })
}

// -------------------------------------------------------
// EXPORT
// We export both the middleware and the controller function
// The route file will use both of them together
// -------------------------------------------------------
module.exports = {
  uploadMiddleware,
  handleFileUpload,
}
