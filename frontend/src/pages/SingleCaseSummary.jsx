// frontend/src/pages/SingleCaseSummary.jsx
// -------------------------------------------------------
// Single Case Summary Page
// Allows users to upload and analyze a single legal case document
// Shows summary, issues, principles with a chatbot for Q&A
// -------------------------------------------------------

import React, { useState, useRef } from 'react'
import { analyseFile } from '../services/api'
import Chatbot from '../components/Chatbot'

function SingleCaseSummary({ onBack }) {
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [caseData, setCaseData] = useState(null)
  const [error, setError] = useState(null)
  const fileInputRef = useRef(null)

  // Handle file selection
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.type !== 'application/pdf') {
        setError('Please select a PDF file')
        return
      }
      if (file.size > 20 * 1024 * 1024) {
        setError('File size must be less than 20MB')
        return
      }
      setSelectedFile(file)
      setError(null)
      setCaseData(null)
    }
  }

  // Handle file upload and analysis
  const handleAnalyze = async () => {
    if (!selectedFile) return

    setUploading(true)
    setAnalyzing(true)
    setError(null)

    try {
      // Upload file to backend
      const formData = new FormData()
      formData.append('documents', selectedFile)

      const uploadResponse = await fetch('http://localhost:5000/api/upload', {
        method: 'POST',
        body: formData,
      })

      if (!uploadResponse.ok) {
        throw new Error('Upload failed')
      }

      const uploadResult = await uploadResponse.json()
      const uploadedFile = uploadResult.files[0]

      setUploading(false)

      // Analyze the uploaded file
      const analysisResult = await analyseFile(
        uploadedFile.savedName,
        uploadedFile.originalName
      )

      if (!analysisResult.success) {
        throw new Error('Analysis failed')
      }

      setCaseData({
        name: analysisResult.name,
        summary: analysisResult.summary,
        issues: analysisResult.issues,
        principles: analysisResult.principles,
        featuresStatus: analysisResult.featuresStatus,
        featuresFallbackReason: analysisResult.featuresFallbackReason,
      })
    } catch (err) {
      console.error('Error:', err)
      setError(
        err?.response?.data?.message ||
        err?.message ||
        'Failed to analyze the case. Please try again.'
      )
    } finally {
      setUploading(false)
      setAnalyzing(false)
    }
  }

  // Render helper for formatted text with bold
  const formatTextWithBold = (text) => {
    if (!text) return null
    const parts = text.split(/(\*\*[^*]+\*\*)/g)
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index} className="text-white font-semibold">{part.slice(2, -2)}</strong>
      }
      return part
    })
  }

  // Render structured summary
  const renderStructuredSummary = (summaryText) => {
    if (!summaryText) {
      return <p className="text-slate-500 italic text-sm">No summary available.</p>
    }

    const headings = ['Core Facts', 'Main Dispute', 'Final Ruling', 'Summary']
    const regex = /(\*\*Core Facts\*\*|Core Facts:|Core Facts|\*\*Main Dispute\*\*|Main Dispute:|Main Dispute|\*\*Final Ruling\*\*|Final Ruling:|Final Ruling|\*\*Summary\*\*|Summary:|Summary)/gi

    const parts = summaryText.split(regex)
    const sections = []
    let currentTitle = 'Summary'
    let currentContent = ''

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim()
      if (!part) continue

      const matchedHeading = headings.find(h => {
        const normalizedPart = part.replace(/\*/g, '').replace(/:/g, '').trim().toLowerCase()
        return normalizedPart === h.toLowerCase()
      })

      if (matchedHeading) {
        if (currentContent.trim()) {
          sections.push({ title: currentTitle, content: currentContent.trim() })
        }
        currentTitle = matchedHeading
        currentContent = ''
      } else {
        currentContent += (currentContent ? '\n' : '') + part
      }
    }

    if (currentContent.trim()) {
      sections.push({ title: currentTitle, content: currentContent.trim() })
    }

    return (
      <div className="space-y-4">
        {sections.map((sec, idx) => {
          const lines = sec.content.split('\n').map(l => l.trim()).filter(Boolean)
          const looksLikeList = lines.length > 1 || lines.some(line => /^\d+\.|^[-•*]/.test(line))

          return (
            <div key={idx} className="p-4 bg-slate-900/40 rounded-xl border border-slate-700/40">
              <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-400 mb-3">
                {sec.title}
              </h4>
              {looksLikeList ? (
                <ul className="space-y-2">
                  {lines.map((line, lIdx) => {
                    const cleanLine = line.replace(/^\d+\.\s*|^[-•*]\s*/, '').trim()
                    return (
                      <li key={lIdx} className="flex items-start gap-2 text-slate-300 text-sm leading-relaxed">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500/80 flex-shrink-0" />
                        <span>{formatTextWithBold(cleanLine)}</span>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
                  {formatTextWithBold(sec.content)}
                </p>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 text-white">
      
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {onBack && (
              <button
                onClick={onBack}
                className="flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-850 hover:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700 transition-colors"
              >
                <span>⬅️</span>
                <span>Back</span>
              </button>
            )}
            <div className="flex items-center gap-3">
              <span className="text-2xl">📄</span>
              <div>
                <h1 className="text-white font-bold text-base leading-none">Single Case Analysis</h1>
                <p className="text-slate-500 text-xs mt-0.5">AI-Powered Case Summarization</p>
              </div>
            </div>
          </div>
          <span className="text-xs text-indigo-400 bg-indigo-900/30 border border-indigo-500/30 px-3 py-1.5 rounded-full font-medium">
            Individual Analysis
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-8">
        
        {!caseData ? (
          // Upload Section
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-black text-white mb-2 tracking-tight">
                Analyze a Legal Case
              </h2>
              <p className="text-slate-400 text-sm">
                Upload a single PDF case document to receive an AI-generated summary,
                key issues, and legal principles.
              </p>
            </div>

            {/* Error Banner */}
            {error && (
              <div className="mb-6 p-4 bg-red-900/30 border border-red-500/40 text-red-300 rounded-xl">
                <p className="font-semibold text-sm mb-1">❌ Error</p>
                <p className="text-xs">{error}</p>
              </div>
            )}

            {/* File Upload Card */}
            <div className="p-8 bg-slate-800/60 border border-slate-700 rounded-2xl">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-600 hover:border-indigo-500 rounded-xl p-12 text-center cursor-pointer transition-all duration-200 hover:bg-slate-800/40"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <div className="flex flex-col items-center gap-4">
                  <span className="text-6xl">📄</span>
                  <div>
                    <p className="text-white font-semibold mb-1">
                      {selectedFile ? selectedFile.name : 'Click to select a PDF file'}
                    </p>
                    <p className="text-slate-400 text-xs">
                      Maximum file size: 20MB
                    </p>
                  </div>
                  {selectedFile && (
                    <span className="text-xs text-green-400 bg-green-900/30 border border-green-500/30 px-3 py-1 rounded-full">
                      ✓ File selected
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={handleAnalyze}
                disabled={!selectedFile || uploading || analyzing}
                className={`
                  mt-6 w-full py-4 px-6 font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 shadow-lg
                  ${selectedFile && !uploading && !analyzing
                    ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white shadow-indigo-500/25 active:scale-[0.98]'
                    : 'bg-slate-700 text-slate-400 cursor-not-allowed opacity-50'}
                `}
              >
                <span>🔍</span>
                <span>
                  {uploading ? 'Uploading...' : analyzing ? 'Analyzing...' : 'Analyze Case'}
                </span>
              </button>
            </div>
          </div>
        ) : (
          // Results Section
          <div>
            <div className="text-center mb-8">
              <h2 className="text-3xl font-black text-white mb-2 tracking-tight">
                Case Analysis Results
              </h2>
              <p className="text-slate-400 text-sm max-w-2xl mx-auto">
                {caseData.name}
              </p>
            </div>

            <div className="max-w-4xl mx-auto space-y-6">

              {caseData.featuresStatus === 'fallback' && (
                <div className="p-4 bg-amber-900/30 border border-amber-500/40 rounded-2xl text-amber-100">
                  <p className="font-semibold text-sm mb-1">Feature extraction fallback</p>
                  <p className="text-xs text-amber-50/80">
                    {caseData.featuresFallbackReason || 'The AI service could not confidently extract issues or principles from this judgment.'}
                  </p>
                </div>
              )}
              
              {/* Summary Card */}
              <div className="p-6 bg-slate-800/50 border border-indigo-500/20 rounded-2xl">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-2xl">📋</span>
                  <h3 className="text-lg font-bold text-white">Case Summary</h3>
                </div>
                {renderStructuredSummary(caseData.summary)}
              </div>

              {/* Issues & Principles Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Issues Card */}
                <div className="p-6 bg-slate-800/50 border border-blue-500/20 rounded-2xl">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-xl">⚠️</span>
                    <h3 className="text-sm font-bold text-blue-400 uppercase tracking-wider">
                      Key Legal Issues
                    </h3>
                  </div>
                  {caseData.issues && caseData.issues.length > 0 ? (
                    <ul className="space-y-2">
                      {caseData.issues.map((issue, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-slate-300 text-sm">
                          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                          <span>{issue}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-slate-500 text-xs italic">
                      {caseData.featuresStatus === 'fallback'
                        ? 'No issues could be extracted for this document.'
                        : 'No issues extracted.'}
                    </p>
                  )}
                </div>

                {/* Principles Card */}
                <div className="p-6 bg-slate-800/50 border border-emerald-500/20 rounded-2xl">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-xl">📘</span>
                    <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider">
                      Legal Principles
                    </h3>
                  </div>
                  {caseData.principles && caseData.principles.length > 0 ? (
                    <ul className="space-y-2">
                      {caseData.principles.map((principle, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-slate-300 text-sm">
                          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                          <span>{principle}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-slate-500 text-xs italic">
                      {caseData.featuresStatus === 'fallback'
                        ? 'No principles could be extracted for this document.'
                        : 'No principles extracted.'}
                    </p>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4 justify-center">
                <button
                  onClick={() => {
                    setSelectedFile(null)
                    setCaseData(null)
                    setError(null)
                  }}
                  className="flex items-center gap-2 px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition-colors"
                >
                  <span>🔄</span>
                  <span>Analyze Another Case</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Loading Overlay */}
        {(uploading || analyzing) && (
          <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-md">
            <div className="flex flex-col items-center gap-6 max-w-md text-center p-8 bg-slate-900/80 border border-indigo-500/30 rounded-3xl shadow-2xl">
              <div className="relative w-20 h-20">
                <div className="absolute inset-0 rounded-full border-4 border-slate-800" />
                <div className="absolute inset-0 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin" />
                <span className="absolute inset-0 flex items-center justify-center text-3xl">📄</span>
              </div>
              <div>
                <h3 className="text-xl font-bold text-white mb-2">
                  {uploading ? 'Uploading Case...' : 'Analyzing Case...'}
                </h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  {uploading
                    ? 'Uploading your PDF to the server...'
                    : 'Extracting text, generating summary, and identifying legal issues and principles...'}
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Chatbot - only show when analysis is complete */}
      {caseData && (
        <Chatbot
          caseAData={caseData}
          caseBData={null}
          similarity={null}
          comparison={null}
        />
      )}
    </div>
  )
}

export default SingleCaseSummary
