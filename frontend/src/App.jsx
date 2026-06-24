// src/App.jsx
// -------------------------------------------------------
// Main App component — root of the entire UI.
// Manages which "page" (view) is currently shown via a simple
// string state variable (no external router library needed yet).
//
// Pages:
//   'upload'    → FileUploader + result preview
//   'dashboard' → ComparisonDashboard (3-column analysis view)
// -------------------------------------------------------

import React, { useState } from 'react'
import FileUploader from './components/FileUploader'
import ComparisonDashboard from './pages/ComparisonDashboard'
import SingleCaseSummary from './pages/SingleCaseSummary'
import { analyseFile } from './services/api'

function App() {
  // ---- STATE ----

  // uploadResult: JSON from the backend after a successful file upload
  const [uploadResult, setUploadResult] = useState(null)

  // currentPage: which view is currently shown ('upload', 'dashboard', or 'single')
  const [currentPage, setCurrentPage] = useState('upload')

  // selectedFilesToCompare: the files (exactly 2) selected for comparison
  const [selectedFilesToCompare, setSelectedFilesToCompare] = useState([])

  // State to hold the final processed case summaries and features
  const [caseAData, setCaseAData] = useState(null)
  const [caseBData, setCaseBData] = useState(null)

  // Loading and error states for running the parallel AI pipeline
  const [loadingAnalysis, setLoadingAnalysis] = useState(false)
  const [analysisError, setAnalysisError] = useState(null)

  // Called by FileUploader when upload succeeds
  const handleUploadSuccess = (result) => {
    console.log('Upload successful:', result)
    setUploadResult(result)
    // Clear previous selections and data when a new upload happens
    setSelectedFilesToCompare([])
    setCaseAData(null)
    setCaseBData(null)
    setAnalysisError(null)
  }

  // Toggles the selection of a file (caps at 2 files)
  const handleToggleSelectFile = (file) => {
    setSelectedFilesToCompare((prev) => {
      const exists = prev.some((f) => f.savedName === file.savedName)
      if (exists) {
        return prev.filter((f) => f.savedName !== file.savedName)
      } else {
        if (prev.length >= 2) {
          // Shift and add to keep max 2 selected files
          return [prev[1], file]
        }
        return [...prev, file]
      }
    })
  }

  // Orchestrates the text extraction + summary + features pipeline for both files
  const handleRunComparison = async () => {
    if (selectedFilesToCompare.length !== 2) return

    setLoadingAnalysis(true)
    setAnalysisError(null)

    try {
      const fileA = selectedFilesToCompare[0]
      const fileB = selectedFilesToCompare[1]

      console.log(`🚀 Triggering parallel pipeline for ${fileA.originalName} and ${fileB.originalName}`)

      // Fire both analysis requests in parallel
      const [resA, resB] = await Promise.all([
        analyseFile(fileA.savedName, fileA.originalName),
        analyseFile(fileB.savedName, fileB.originalName),
      ])

      if (!resA.success || !resB.success) {
        throw new Error('Analysis request failed.')
      }

      // Populate our states
      setCaseAData({
        caseId: resA.caseId,
        name: resA.name,
        summary: resA.summary,
        issues: resA.issues,
        principles: resA.principles,
      })

      setCaseBData({
        caseId: resB.caseId,
        name: resB.name,
        summary: resB.summary,
        issues: resB.issues,
        principles: resB.principles,
      })

      // Go to the dashboard
      setCurrentPage('dashboard')
    } catch (err) {
      console.error('Pipeline Error:', err)
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'An error occurred while calling the AI orchestrator.'
      setAnalysisError(msg)
    } finally {
      setLoadingAnalysis(false)
    }
  }

  // -------------------------------------------------------
  // NAV TABS
  // Simple tab navigation — sets currentPage state.
  // No React Router needed for two pages at this stage.
  // -------------------------------------------------------
  const NavTab = ({ page, label, icon }) => {
    const isActive = currentPage === page
    return (
      <button
        onClick={() => setCurrentPage(page)}
        className={`
          flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
          transition-all duration-200
          ${isActive
            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
            : 'text-slate-400 hover:text-white hover:bg-slate-700/60'}
        `}
      >
        <span>{icon}</span>
        <span>{label}</span>
      </button>
    )
  }

  // -------------------------------------------------------
  // RENDER
  // -------------------------------------------------------
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">

      {/* ---- TOP HEADER BAR ---- */}
      {/* Only shown on the upload page — dashboard and single have their own headers */}
      {currentPage === 'upload' && (
        <header className="border-b border-slate-700/50 bg-slate-900/60 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">

            {/* Logo + App Name */}
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚖️</span>
              <div>
                <h1 className="text-white font-bold text-lg leading-none">Case Law AI</h1>
                <p className="text-slate-500 text-xs">Summarizer &amp; Comparator</p>
              </div>
            </div>

            {/* Navigation tabs */}
            <nav className="flex items-center gap-2">
              <NavTab page="upload"    label="Upload"     icon="📤" />
              <NavTab page="single"    label="Single Case" icon="📄" />
              <NavTab page="dashboard" label="Compare"    icon="⚖️" />
            </nav>
          </div>
        </header>
      )}

      {/* ---- PAGE CONTENT ---- */}

      {/* UPLOAD PAGE */}
      {currentPage === 'upload' && (
        <main className="max-w-5xl mx-auto px-6 py-12">

          {/* Page title */}
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-white mb-3">
              Upload Legal Judgments
            </h2>
            <p className="text-slate-400 text-base max-w-xl mx-auto">
              Upload multiple PDF case law documents to receive AI-generated summaries,
              key issue extraction, and side-by-side comparisons.
            </p>
          </div>

          {/* File Uploader */}
          <FileUploader onUploadSuccess={handleUploadSuccess} />

          {/* Upload result preview */}
          {uploadResult && (
            <div className="mt-10 p-6 bg-slate-800/60 border border-slate-700 rounded-2xl">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                <h3 className="text-slate-300 font-semibold text-sm uppercase tracking-wider">
                  📋 Uploaded Files — Select exactly 2 to compare
                </h3>
                <span className="text-xs text-indigo-400 bg-indigo-950/40 border border-indigo-500/20 px-3 py-1 rounded-full font-medium">
                  {selectedFilesToCompare.length} / 2 Selected
                </span>
              </div>

              {analysisError && (
                <div className="mb-4 p-4 bg-red-900/30 border border-red-500/40 text-red-300 rounded-xl text-xs">
                  <p className="font-semibold mb-1">⚠️ Analysis Error:</p>
                  <p>{analysisError}</p>
                </div>
              )}

              <div className="space-y-2">
                {uploadResult.files.map((file, index) => {
                  const isSelected = selectedFilesToCompare.some(
                    (f) => f.savedName === file.savedName
                  )
                  return (
                    <div
                      key={index}
                      onClick={() => handleToggleSelectFile(file)}
                      className={`
                        flex items-center justify-between p-4 rounded-xl border cursor-pointer
                        transition-all duration-200 select-none
                        ${isSelected
                          ? 'bg-indigo-600/10 border-indigo-500 shadow-lg shadow-indigo-500/5'
                          : 'bg-slate-900/40 border-slate-700 hover:border-slate-600 hover:bg-slate-900/60'}
                      `}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}} // event handled by parent container click
                          className="w-4 h-4 rounded text-indigo-600 bg-slate-800 border-slate-700 focus:ring-indigo-500 focus:ring-offset-slate-900"
                        />
                        <span className="text-xl flex-shrink-0">📑</span>
                        <span className="text-slate-300 text-sm font-medium truncate">
                          {file.originalName}
                        </span>
                      </div>
                      <span className="text-slate-500 text-xs flex-shrink-0 ml-4">
                        {file.sizeMB} MB
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Action comparison button */}
              <button
                onClick={handleRunComparison}
                disabled={selectedFilesToCompare.length !== 2 || loadingAnalysis}
                className={`
                  mt-6 w-full py-4 px-6 font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 shadow-lg
                  ${selectedFilesToCompare.length === 2 && !loadingAnalysis
                    ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white shadow-indigo-500/25 scale-[1.01] active:scale-[0.99]'
                    : 'bg-slate-700 text-slate-400 cursor-not-allowed opacity-50'}
                `}
              >
                <span>⚖️</span>
                <span>
                  {loadingAnalysis
                    ? 'Running AI Analysis...'
                    : `Compare Selected Cases (${selectedFilesToCompare.length}/2)`}
                </span>
              </button>
            </div>
          )}

          {/* Premium Loading Overlay for running the background pipeline */}
          {loadingAnalysis && (
            <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-md">
              <div className="flex flex-col items-center gap-6 max-w-md text-center p-8 bg-slate-900/80 border border-indigo-500/30 rounded-3xl shadow-2xl animate-fade-in">
                {/* Visual loading ring */}
                <div className="relative w-20 h-20">
                  <div className="absolute inset-0 rounded-full border-4 border-slate-800" />
                  <div className="absolute inset-0 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin" />
                  <span className="absolute inset-0 flex items-center justify-center text-3xl">⚖️</span>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-2">Analyzing Cases</h3>
                  <p className="text-slate-400 text-sm mb-4 leading-relaxed">
                    Connecting to the local AI engine to extract judgment text, outline facts, identify key legal issues, and extract principles.
                  </p>
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-950/60 border border-indigo-500/20 text-xs text-indigo-400 font-semibold tracking-wider uppercase animate-pulse">
                    ⚡ LOCAL OLLAMA PIPELINE ACTIVE
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Quick link to dashboard (even without uploading — demo mode) */}
          {!uploadResult && (
            <div className="mt-8 text-center">
              <button
                onClick={() => {
                  setCaseAData(null)
                  setCaseBData(null)
                  setCurrentPage('dashboard')
                }}
                className="text-indigo-400 hover:text-indigo-300 text-sm underline underline-offset-4 transition-colors"
              >
                Skip upload — open dashboard in demo mode →
              </button>
            </div>
          )}
        </main>
      )}

      {/* COMPARISON DASHBOARD PAGE */}
      {currentPage === 'dashboard' && (
        <ComparisonDashboard
          caseAData={caseAData}
          caseBData={caseBData}
          onBack={() => {
            setCurrentPage('upload')
            setAnalysisError(null)
          }}
        />
      )}

      {/* SINGLE CASE SUMMARY PAGE */}
      {currentPage === 'single' && (
        <SingleCaseSummary
          onBack={() => setCurrentPage('upload')}
        />
      )}
    </div>
  )
}

export default App
