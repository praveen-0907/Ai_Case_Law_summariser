// frontend/src/components/FileUploader.jsx
// -------------------------------------------------------
// This component handles drag-and-drop PDF uploads.
// It validates files (type, size, count) BEFORE sending to server,
// shows a file list with remove buttons, and a progress bar during upload.
// -------------------------------------------------------

import React, { useState, useRef, useCallback } from 'react'
import { uploadPDFFiles } from '../services/api'

// -------------------------------------------------------
// CONSTANTS — validation rules in one place so they're easy to change
// -------------------------------------------------------
const MAX_FILES = 10           // Maximum number of files allowed at once
const MAX_FILE_SIZE_MB = 20    // Maximum size per file in megabytes
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024  // Convert MB to bytes
const ALLOWED_MIME_TYPE = 'application/pdf'

// -------------------------------------------------------
// HELPER FUNCTION: formatFileSize
// Converts raw bytes into a human-readable string like "1.5 MB" or "340 KB"
// -------------------------------------------------------
const formatFileSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// -------------------------------------------------------
// MAIN COMPONENT: FileUploader
// Props:
//   onUploadSuccess - callback function called when upload completes
//                     receives the server response data as argument
// -------------------------------------------------------
function FileUploader({ onUploadSuccess }) {
  // selectedFiles: Array of File objects the user has chosen
  const [selectedFiles, setSelectedFiles] = useState([])

  // isDragging: Boolean — true when user is dragging files over the drop zone
  const [isDragging, setIsDragging] = useState(false)

  // uploadProgress: Number 0-100 representing upload completion percentage
  const [uploadProgress, setUploadProgress] = useState(0)

  // isUploading: Boolean — true while the upload is in progress
  const [isUploading, setIsUploading] = useState(false)

  // uploadStatus: 'idle' | 'success' | 'error' — tracks what to show after upload
  const [uploadStatus, setUploadStatus] = useState('idle')

  // statusMessage: Text to show after upload (success or error message)
  const [statusMessage, setStatusMessage] = useState('')

  // validationErrors: Array of error strings from local validation
  const [validationErrors, setValidationErrors] = useState([])

  // fileInputRef: A reference to the hidden <input type="file"> element
  // We use this to trigger the file picker dialog when user clicks the drop zone
  const fileInputRef = useRef(null)

  // -------------------------------------------------------
  // FUNCTION: validateAndAddFiles
  // Validates new files and adds valid ones to the selectedFiles list
  // This runs BEFORE uploading — it's client-side validation
  // -------------------------------------------------------
  const validateAndAddFiles = useCallback((newFiles) => {
    const errors = []
    const validFiles = []

    // Convert FileList (browser object) to a regular JavaScript array
    const filesArray = Array.from(newFiles)

    // Check if adding these files would exceed the max limit
    const totalAfterAdd = selectedFiles.length + filesArray.length
    if (totalAfterAdd > MAX_FILES) {
      errors.push(`You can upload a maximum of ${MAX_FILES} files. You already have ${selectedFiles.length}.`)
      setValidationErrors(errors)
      return
    }

    // Validate each file individually
    filesArray.forEach((file) => {
      // Check file type — only PDFs allowed
      if (file.type !== ALLOWED_MIME_TYPE) {
        errors.push(`"${file.name}" is not a PDF file. Only PDF files are accepted.`)
        return // Skip this file (continue to next)
      }

      // Check file size — reject if over the limit
      if (file.size > MAX_FILE_SIZE_BYTES) {
        errors.push(`"${file.name}" is too large (${formatFileSize(file.size)}). Max allowed size is ${MAX_FILE_SIZE_MB}MB.`)
        return // Skip this file
      }

      // Check for duplicate files (same name and size)
      const isDuplicate = selectedFiles.some(
        (existingFile) => existingFile.name === file.name && existingFile.size === file.size
      )
      if (isDuplicate) {
        errors.push(`"${file.name}" is already in the list.`)
        return // Skip duplicates
      }

      // If all checks passed, this file is valid
      validFiles.push(file)
    })

    // Update the error messages state
    setValidationErrors(errors)

    // Add valid files to the existing list
    if (validFiles.length > 0) {
      setSelectedFiles((prevFiles) => [...prevFiles, ...validFiles])
      // Reset any previous upload status when new files are added
      setUploadStatus('idle')
      setStatusMessage('')
      setUploadProgress(0)
    }
  }, [selectedFiles])

  // -------------------------------------------------------
  // FUNCTION: removeFile
  // Removes one file from the list by its index position
  // -------------------------------------------------------
  const removeFile = (indexToRemove) => {
    setSelectedFiles((prevFiles) =>
      prevFiles.filter((_, index) => index !== indexToRemove)
    )
    // Clear errors when user modifies the file list
    setValidationErrors([])
  }

  // -------------------------------------------------------
  // DRAG-AND-DROP EVENT HANDLERS
  // These functions handle the drag events from the browser
  // -------------------------------------------------------

  // Called when user drags files OVER the drop zone
  const handleDragOver = (event) => {
    event.preventDefault() // Must prevent default to allow dropping
    setIsDragging(true)
  }

  // Called when user's cursor leaves the drop zone
  const handleDragLeave = (event) => {
    event.preventDefault()
    setIsDragging(false)
  }

  // Called when user DROPS files onto the drop zone
  const handleDrop = (event) => {
    event.preventDefault() // Prevent browser from opening the file
    setIsDragging(false)
    // event.dataTransfer.files contains the dropped files
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      validateAndAddFiles(event.dataTransfer.files)
    }
  }

  // Called when user selects files using the normal file picker dialog
  const handleFileInputChange = (event) => {
    if (event.target.files && event.target.files.length > 0) {
      validateAndAddFiles(event.target.files)
      // Reset the input so the same file can be re-added if removed
      event.target.value = ''
    }
  }

  const handleUpload = async () => {
    // Don't upload if no files selected
    if (selectedFiles.length === 0) return

    // Set uploading state — this shows the progress bar and disables buttons
    setIsUploading(true)
    setUploadProgress(0)
    setUploadStatus('idle')
    setStatusMessage('')

    try {
      // Call the API function from api.js
      // Pass selectedFiles and a callback to update the progress bar
      const result = await uploadPDFFiles(selectedFiles, (progress) => {
        setUploadProgress(progress)
      })

      // Upload succeeded!
      setUploadStatus('success')
      setStatusMessage(`Successfully uploaded ${selectedFiles.length} file(s)!`)

      // Notify the parent component (App.jsx) about the successful upload
      if (onUploadSuccess) {
        onUploadSuccess(result)
      }

    } catch (error) {
      // Upload failed — show the error message from the server
      setUploadStatus('error')

      // error.response.data contains the JSON error from our backend
      const serverMessage = error.response?.data?.message || 'Upload failed. Please try again.'
      setStatusMessage(serverMessage)

    } finally {
      // This runs whether upload succeeded or failed
      setIsUploading(false)
    }
  }

  // -------------------------------------------------------
  // FUNCTION: clearAll
  // Resets everything back to the initial state
  // -------------------------------------------------------
  const clearAll = () => {
    setSelectedFiles([])
    setValidationErrors([])
    setUploadProgress(0)
    setUploadStatus('idle')
    setStatusMessage('')
  }

  // -------------------------------------------------------
  // RENDER — The actual UI/HTML
  // -------------------------------------------------------
  return (
    <div className="w-full max-w-3xl mx-auto">

      {/* ---- DRAG AND DROP ZONE ---- */}
      <div
        // Dynamic classes: change border color when dragging
        className={`
          relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer
          transition-all duration-300 ease-in-out
          ${isDragging
            ? 'border-blue-400 bg-blue-500/10 scale-[1.02]'     // Highlighted when dragging
            : 'border-slate-600 bg-slate-800/50 hover:border-slate-400 hover:bg-slate-800'  // Normal state
          }
        `}
        // Attach drag-and-drop event handlers
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        // Clicking anywhere on the zone opens the file picker
        onClick={() => fileInputRef.current?.click()}
      >
        {/* Hidden file input — triggered by clicking the drop zone */}
        <input
          ref={fileInputRef}
          type="file"
          multiple           // Allow selecting multiple files
          accept=".pdf,application/pdf"  // Only show PDF files in the picker
          className="hidden" // Visually hidden but still functional
          onChange={handleFileInputChange}
        />

        {/* Upload icon */}
        <div className="text-5xl mb-4">
          {isDragging ? '📂' : '📄'}
        </div>

        {/* Instructions text */}
        <p className="text-slate-200 text-lg font-semibold mb-1">
          {isDragging ? 'Release to add files' : 'Drag & Drop PDF files here'}
        </p>
        <p className="text-slate-400 text-sm mb-2">
          or click to browse your computer
        </p>

        {/* Validation rules shown to the user */}
        <div className="flex justify-center gap-4 flex-wrap mt-3">
          <span className="text-xs text-slate-500 bg-slate-700/50 px-3 py-1 rounded-full">
            📋 PDFs only
          </span>
          <span className="text-xs text-slate-500 bg-slate-700/50 px-3 py-1 rounded-full">
            📦 Max {MAX_FILE_SIZE_MB}MB per file
          </span>
          <span className="text-xs text-slate-500 bg-slate-700/50 px-3 py-1 rounded-full">
            🔢 Up to {MAX_FILES} files
          </span>
        </div>
      </div>

      {/* ---- VALIDATION ERROR MESSAGES ---- */}
      {validationErrors.length > 0 && (
        <div className="mt-4 p-4 bg-red-900/30 border border-red-500/50 rounded-xl">
          <p className="text-red-400 font-semibold text-sm mb-2">⚠️ Please fix these issues:</p>
          <ul className="space-y-1">
            {validationErrors.map((error, index) => (
              <li key={index} className="text-red-300 text-sm flex items-start gap-2">
                <span>•</span> <span>{error}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ---- SELECTED FILES LIST ---- */}
      {selectedFiles.length > 0 && (
        <div className="mt-5">
          {/* Header row */}
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-slate-300 font-semibold text-sm uppercase tracking-wider">
              Selected Files ({selectedFiles.length}/{MAX_FILES})
            </h3>
            {/* "Clear All" button */}
            <button
              onClick={clearAll}
              disabled={isUploading}
              className="text-slate-500 hover:text-red-400 text-xs transition-colors disabled:opacity-50"
            >
              Clear All
            </button>
          </div>

          {/* File list — one row per file */}
          <div className="space-y-2">
            {selectedFiles.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center justify-between p-3 bg-slate-800 rounded-xl border border-slate-700 group hover:border-slate-500 transition-colors"
              >
                {/* File icon + name + size */}
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-2xl flex-shrink-0">📑</span>
                  <div className="min-w-0">
                    {/* truncate prevents long filenames from breaking the layout */}
                    <p className="text-slate-200 text-sm font-medium truncate max-w-xs">
                      {file.name}
                    </p>
                    <p className="text-slate-500 text-xs">{formatFileSize(file.size)}</p>
                  </div>
                </div>

                {/* Remove (X) button */}
                <button
                  onClick={() => removeFile(index)}
                  disabled={isUploading}
                  className="ml-3 w-7 h-7 flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-red-900/30 rounded-full transition-all flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                  title={`Remove ${file.name}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          {/* ---- PROGRESS BAR (only visible during upload) ---- */}
          {isUploading && (
            <div className="mt-5">
              <div className="flex justify-between items-center mb-2">
                <span className="text-slate-400 text-sm">Uploading...</span>
                <span className="text-blue-400 text-sm font-bold">{uploadProgress}%</span>
              </div>
              {/* Outer bar (background track) */}
              <div className="w-full bg-slate-700 rounded-full h-3 overflow-hidden">
                {/* Inner bar (fills based on progress) */}
                <div
                  className="bg-gradient-to-r from-blue-500 to-cyan-400 h-3 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${uploadProgress}%` }} // Dynamic width!
                />
              </div>
            </div>
          )}

          {/* ---- UPLOAD BUTTON ---- */}
          {!isUploading && uploadStatus !== 'success' && (
            <button
              onClick={handleUpload}
              disabled={selectedFiles.length === 0}
              className="
                mt-5 w-full py-3 px-6 rounded-xl font-semibold text-white
                bg-gradient-to-r from-blue-600 to-blue-500
                hover:from-blue-500 hover:to-cyan-500
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-all duration-200 shadow-lg hover:shadow-blue-500/25 hover:scale-[1.01]
                active:scale-[0.99]
              "
            >
              ⬆️ Upload {selectedFiles.length} File{selectedFiles.length !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      )}

      {/* ---- STATUS MESSAGE (shown after upload attempt) ---- */}
      {uploadStatus !== 'idle' && !isUploading && (
        <div className={`mt-5 p-4 rounded-xl border ${
          uploadStatus === 'success'
            ? 'bg-green-900/30 border-green-500/50'
            : 'bg-red-900/30 border-red-500/50'
        }`}>
          <p className={`font-semibold text-sm ${
            uploadStatus === 'success' ? 'text-green-400' : 'text-red-400'
          }`}>
            {uploadStatus === 'success' ? '✅ ' : '❌ '}{statusMessage}
          </p>

          {/* After success, show option to upload more */}
          {uploadStatus === 'success' && (
            <button
              onClick={clearAll}
              className="mt-3 text-sm text-slate-400 hover:text-slate-200 underline transition-colors"
            >
              Upload more files
            </button>
          )}
        </div>
      )}
    </div>
  )
}
import { useStoredCases } from '../hooks/useStorage'

function PreviousAnalyses() {
  const { cases, loading, error } = useStoredCases()

  if (loading) return <p>Loading...</p>
  if (error) return <p>Error: {error}</p>

  return (
    <div>
      <h2>Previous Analyses</h2>
      {cases.map(c => (
        <div key={c.id}>
          <h3>{c.case_name}</h3>
          <p>Analyzed: {new Date(c.created_at).toLocaleDateString()}</p>
        </div>
      ))}
    </div>
  )
}

export default FileUploader
