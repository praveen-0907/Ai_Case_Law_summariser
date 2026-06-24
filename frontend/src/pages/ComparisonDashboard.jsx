// frontend/src/pages/ComparisonDashboard.jsx
// -------------------------------------------------------
// This is the main Comparison Dashboard page.
//
// LAYOUT (3 columns on desktop, stacked on mobile):
//   [Case A Card] | [Center Analysis Column] | [Case B Card]
//
// DATA FLOW:
//   Parent (App.jsx) passes `caseAData` and `caseBData` as props.
//   This component calls the AI service APIs and displays results.
//
// STATES:
//   loading  → shows animated skeleton loaders (gray flashing boxes)
//   error    → shows a red alert banner with the error message
//   success  → shows all analysis cards with real data
//   empty    → shows a yellow alert banner prompting the user to provide data
// -------------------------------------------------------

import React, { useState, useEffect } from 'react'
import { getSimilarityScore, compareCases, downloadReport } from '../services/api'
import Chatbot from '../components/Chatbot'

// -------------------------------------------------------
// SUB-COMPONENT: SkeletonBlock
// A single animated "loading" placeholder bar.
// The 'animate-pulse' Tailwind class makes it flash in/out.
// 'w' and 'h' props control width and height.
// -------------------------------------------------------
function SkeletonBlock({ w = 'w-full', h = 'h-4' }) {
  return (
    <div className={`${w} ${h} bg-slate-700/60 rounded-lg animate-pulse`} />
  )
}

// -------------------------------------------------------
// SUB-COMPONENT: SkeletonCard
// A full card worth of skeleton loaders — used for Case A / Case B panels.
// -------------------------------------------------------
function SkeletonCard() {
  return (
    <div className="flex flex-col gap-4 p-6 bg-slate-800/50 border border-slate-700 rounded-2xl">
      {/* Title bar skeleton */}
      <SkeletonBlock w="w-2/3" h="h-6" />
      {/* Summary section */}
      <div className="flex flex-col gap-2 mt-2">
        <SkeletonBlock w="w-full" h="h-3" />
        <SkeletonBlock w="w-11/12" h="h-3" />
        <SkeletonBlock w="w-4/5" h="h-3" />
        <SkeletonBlock w="w-full" h="h-3" />
      </div>
      {/* Issues section */}
      <SkeletonBlock w="w-1/3" h="h-4" />
      <SkeletonBlock w="w-5/6" h="h-3" />
      <SkeletonBlock w="w-4/5" h="h-3" />
      {/* Principles section */}
      <SkeletonBlock w="w-1/3" h="h-4" />
      <SkeletonBlock w="w-5/6" h="h-3" />
      <SkeletonBlock w="w-3/4" h="h-3" />
    </div>
  )
}

// -------------------------------------------------------
// SUB-COMPONENT: SkeletonCenter
// Skeleton for the center analysis column.
// -------------------------------------------------------
function SkeletonCenter() {
  return (
    <div className="flex flex-col gap-5 p-6 bg-slate-800/70 border border-indigo-500/20 rounded-2xl">
      {/* Score circle skeleton */}
      <div className="flex justify-center">
        <div className="w-40 h-40 rounded-full bg-slate-700/60 animate-pulse" />
      </div>
      {/* Matrix sections */}
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex flex-col gap-2">
          <SkeletonBlock w="w-1/2" h="h-5" />
          <SkeletonBlock w="w-full" h="h-3" />
          <SkeletonBlock w="w-5/6" h="h-3" />
        </div>
      ))}
    </div>
  )
}

// -------------------------------------------------------
// SUB-COMPONENT: AlertBanner
// Shows a coloured dismissable alert banner at the top of the page.
//
// Props:
//   type  ('error' | 'warning' | 'info') - controls the color scheme
//   title (string) - bold heading
//   message (string) - body text
//   onDismiss (function) - called when user clicks ✕
// -------------------------------------------------------
function AlertBanner({ type = 'error', title, message, onDismiss }) {
  // Choose colors based on alert type
  const styles = {
    error:   'bg-red-900/30 border-red-500/40 text-red-300',
    warning: 'bg-amber-900/30 border-amber-500/40 text-amber-300',
    info:    'bg-blue-900/30 border-blue-500/40 text-blue-300',
  }
  const icons = { error: '❌', warning: '⚠️', info: 'ℹ️' }

  return (
    <div className={`flex items-start gap-3 p-4 rounded-xl border ${styles[type]} mb-6`}
         role="alert">
      <span className="text-xl mt-0.5 flex-shrink-0">{icons[type]}</span>
      <div className="flex-1">
        <p className="font-semibold text-sm">{title}</p>
        {message && <p className="text-xs mt-1 opacity-80">{message}</p>}
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="flex-shrink-0 opacity-60 hover:opacity-100 text-lg leading-none"
          aria-label="Dismiss alert"
        >
          ✕
        </button>
      )}
    </div>
  )
}

// -------------------------------------------------------
// SUB-COMPONENT: SectionLabel
// A small styled heading for sections within a card.
// -------------------------------------------------------
function SectionLabel({ children }) {
  return (
    <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mt-4 mb-2">
      {children}
    </h4>
  )
}

// -------------------------------------------------------
// SUB-COMPONENT: BulletList
// Renders a list of strings as bullet points.
// Shows a gray "None found" message if the array is empty.
// -------------------------------------------------------
function BulletList({ items, emptyText = 'None found' }) {
  if (!items || items.length === 0) {
    return <p className="text-slate-500 text-xs italic">{emptyText}</p>
  }
  return (
    <ul className="space-y-1.5">
      {items.map((item, idx) => (
        <li key={idx} className="flex items-start gap-2 text-slate-300 text-sm">
          {/* Bullet dot */}
          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

// -------------------------------------------------------
// HELPER: formatTextWithBold
// Parses **text** syntax and renders it in bold style.
// -------------------------------------------------------
function formatTextWithBold(text) {
  if (!text) return null
  
  // Split by bold markdown syntax (**text**)
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const cleanText = part.slice(2, -2)
      return <strong key={index} className="text-white font-semibold">{cleanText}</strong>
    }
    return part
  })
}

// -------------------------------------------------------
// HELPER: renderStructuredSummary
// Splits the raw summary text into visually distinct sections
// (Core Facts, Main Dispute, Final Ruling) and formats list items cleanly.
// -------------------------------------------------------
function renderStructuredSummary(summaryText) {
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
    <div className="space-y-4 mt-2">
      {sections.map((sec, idx) => {
        // Check if content is a list of lines
        const lines = sec.content.split('\n').map(l => l.trim()).filter(Boolean)
        const looksLikeList = lines.length > 1 || lines.some(line => /^\d+\.|^[-•*]/.test(line))

        return (
          <div key={idx} className="p-3 bg-slate-900/40 rounded-xl border border-slate-700/40">
            <h5 className="text-xs font-bold uppercase tracking-wider text-indigo-400 mb-2">
              {sec.title}
            </h5>
            {looksLikeList ? (
              <ul className="space-y-1.5">
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

// -------------------------------------------------------
// SUB-COMPONENT: CaseCard
// Displays one legal case's summary, issues, and principles.
//
// Props:
//   label     (string): "Case A" or "Case B"
//   color     (string): Tailwind accent color class for the border/header
//   caseData  (object): { summary, issues, principles }
// -------------------------------------------------------
function CaseCard({ label, color, caseData }) {
  // color classes for Case A vs Case B visual differentiation
  const headerColor = color === 'blue'
    ? 'text-blue-400 border-blue-500/30 bg-blue-500/10'
    : 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'

  const borderColor = color === 'blue'
    ? 'border-blue-500/20'
    : 'border-emerald-500/20'

  return (
    <div className={`flex flex-col h-full p-5 bg-slate-800/50 border ${borderColor} rounded-2xl`}>

      {/* Card header label */}
      <div className="flex flex-col gap-1 mb-4">
        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-lg border text-xs font-bold uppercase tracking-widest mb-1 self-start ${headerColor}`}>
          <span>⚖️</span>
          <span>{label}</span>
        </div>
        {caseData?.name && (
          <h3 className="text-white font-bold text-sm tracking-tight truncate max-w-full block" title={caseData.name}>
            {caseData.name}
          </h3>
        )}
      </div>

      {/* Summary */}
      <SectionLabel>Summary</SectionLabel>
      {renderStructuredSummary(caseData?.summary)}

      {/* Issues */}
      <SectionLabel>Key Legal Issues</SectionLabel>
      <BulletList
        items={caseData?.issues}
        emptyText="No issues extracted."
      />

      {/* Principles */}
      <SectionLabel>Legal Principles Applied</SectionLabel>
      <BulletList
        items={caseData?.principles}
        emptyText="No principles extracted."
      />
    </div>
  )
}

// -------------------------------------------------------
// SUB-COMPONENT: SimilarityCircle
// Renders the large circular similarity score indicator.
//
// It uses an SVG circle with a stroke-dasharray trick:
//   - The circle has a total circumference
//   - We fill only (score/100 × circumference) of it with color
//   - The rest is transparent — creating a "progress ring"
//
// Props:
//   score (number): 0-100 integer
//   interpretation (string): the plain-English label
// -------------------------------------------------------
function SimilarityCircle({ score, interpretation }) {
  // Circle math
  const radius = 60        // px radius of the SVG circle
  const circumference = 2 * Math.PI * radius   // total length of the circle outline
  const filled = ((score || 0) / 100) * circumference  // how much to fill in

  // Color the ring based on score level
  const ringColor =
    score >= 75 ? '#6366f1' :   // indigo — high similarity
    score >= 50 ? '#f59e0b' :   // amber  — moderate
    '#ef4444'                    // red    — low

  return (
    <div className="flex flex-col items-center gap-3">
      {/* SVG ring */}
      <div className="relative w-40 h-40">
        <svg
          className="w-full h-full -rotate-90"  // rotate so progress starts from top
          viewBox="0 0 160 160"
          aria-label={`Similarity score: ${score}%`}
        >
          {/* Background track circle (gray) */}
          <circle
            cx="80" cy="80" r={radius}
            fill="none"
            stroke="#1e293b"
            strokeWidth="12"
          />
          {/* Foreground progress circle (colored) */}
          <circle
            cx="80" cy="80" r={radius}
            fill="none"
            stroke={ringColor}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference}`}
            style={{ transition: 'stroke-dasharray 0.8s ease' }}
          />
        </svg>

        {/* Score number in the center of the ring */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-4xl font-black"
            style={{ color: ringColor }}
          >
            {score ?? '--'}
          </span>
          <span className="text-slate-400 text-xs font-medium">% Match</span>
        </div>
      </div>

      {/* Interpretation label */}
      <p className="text-center text-slate-400 text-xs max-w-[180px] leading-relaxed">
        {interpretation || 'Calculating...'}
      </p>
    </div>
  )
}

// -------------------------------------------------------
// SUB-COMPONENT: ConflictMatrix
// Renders the "Conflict & Strategy Matrix" in the center column.
// Shows common issues, common principles, structural differences,
// and the adversarial strategy blocks.
// -------------------------------------------------------
function ConflictMatrix({ comparison }) {
  if (!comparison) return null

  return (
    <div className="flex flex-col gap-5 mt-4">

      {/* ── Common Issues ── */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-green-400 text-sm">✅</span>
          <h4 className="text-xs font-bold uppercase tracking-widest text-green-400">
            Common Issues
          </h4>
        </div>
        <BulletList
          items={comparison.common_issues}
          emptyText="No common issues found between the two cases."
        />
      </div>

      {/* ── Common Principles ── */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-blue-400 text-sm">📘</span>
          <h4 className="text-xs font-bold uppercase tracking-widest text-blue-400">
            Common Principles
          </h4>
        </div>
        <BulletList
          items={comparison.common_principles}
          emptyText="No common legal principles found."
        />
      </div>

      {/* ── Structural Differences ── */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-amber-400 text-sm">⚡</span>
          <h4 className="text-xs font-bold uppercase tracking-widest text-amber-400">
            Structural Differences
          </h4>
        </div>
        <BulletList
          items={comparison.structural_differences}
          emptyText="No structural differences identified."
        />
      </div>

      {/* ── Adversarial Strategy ── */}
      {comparison.adversarial_strategy && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-900/10 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-rose-400 text-sm">⚔️</span>
            <h4 className="text-xs font-bold uppercase tracking-widest text-rose-400">
              Adversarial Strategy
            </h4>
          </div>

          {/* If you rely on Case A */}
          <div className="mb-3">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">
              If you rely on Case A — opponent will argue:
            </p>
            <p className="text-slate-300 text-sm leading-relaxed bg-slate-800/60 rounded-lg p-3">
              {comparison.adversarial_strategy.if_you_rely_on_case_a ||
                'No adversarial argument identified.'}
            </p>
          </div>

          {/* How to distinguish */}
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">
              How to distinguish and neutralise:
            </p>
            <p className="text-slate-300 text-sm leading-relaxed bg-slate-800/60 rounded-lg p-3">
              {comparison.adversarial_strategy.how_to_distinguish_them ||
                'No distinction strategy identified.'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// -------------------------------------------------------
// MAIN COMPONENT: ComparisonDashboard
// -------------------------------------------------------
// Props:
//   caseAData (object): { summary: "...", issues: [...], principles: [...] }
//   caseBData (object): { summary: "...", issues: [...], principles: [...] }
//
// If no props are passed, the component shows a demo with hardcoded sample data
// so you can see the layout immediately without needing real PDFs.
// -------------------------------------------------------
function ComparisonDashboard({ caseAData, caseBData, onBack }) {

  // ---- STATE ----
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)       // string | null
  const [dismissed, setDismissed] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Results from the AI service calls
  const [similarity, setSimilarity] = useState(null)   // { similarity_score, interpretation }
  const [comparison, setComparison] = useState(null)   // { common_issues, ... }
  const [comparisonId, setComparisonId] = useState(null)

  // -------------------------------------------------------
  // DEMO DATA — shown when no real data is passed in
  // Lets the page look complete without needing to go through
  // the full upload + analysis flow every time
  // -------------------------------------------------------
  const demoA = {
    summary:
      'The court held the employer liable for wrongful termination after finding no documented misconduct. The employee had served for 12 years and was dismissed without a show-cause notice or inquiry.',
    issues: [
      'Whether the termination was in violation of Section 25F of the Industrial Disputes Act',
      'Whether the employer was required to conduct an inquiry before dismissal',
    ],
    principles: [
      'Doctrine of natural justice — no one shall be condemned unheard',
      'Section 25F — mandatory retrenchment compensation and notice requirement',
    ],
  }

  const demoB = {
    summary:
        "The tribunal dismissed the employee's claim, finding that documented misconduct (misappropriation of funds) constituted valid cause for immediate termination without notice or compensation.",
    issues: [
      'Whether proven misconduct justifies termination without notice or inquiry',
      'Whether the employer bears a lesser duty when misconduct is clear on record',
    ],
    principles: [
      'Exception to natural justice — inquiry dispensed with when misconduct is admitted',
      'Section 25G — discretion of employer in cases of grave misconduct',
    ],
  }

  // Use passed-in data if available, otherwise fall back to demo data
  const resolvedA = caseAData || demoA
  const resolvedB = caseBData || demoB
  const isDemo = !caseAData || !caseBData

  // Triggers the download of the PDF report using backend/src/routes/report.js
  const handleExportPDF = async () => {
    setExporting(true)
    try {
      const reportData = {
        comparison_id: comparisonId,
        case_a: {
          name: resolvedA.name || 'Case A',
          summary: resolvedA.summary,
          issues: resolvedA.issues,
          principles: resolvedA.principles,
        },
        case_b: {
          name: resolvedB.name || 'Case B',
          summary: resolvedB.summary,
          issues: resolvedB.issues,
          principles: resolvedB.principles,
        },
        similarity_score: similarity?.similarity_score ?? 0,
        similarity_interpretation: similarity?.interpretation || '',
        comparison: comparison,
      }
      await downloadReport(reportData)
    } catch (err) {
      console.error('Failed to export PDF:', err)
      alert('Failed to generate and download the PDF report. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  // -------------------------------------------------------
  // EFFECT: Run the AI analysis whenever case data changes
  // -------------------------------------------------------
  // useEffect with a dependency array [resolvedA, resolvedB]:
  //   Runs the function inside when the component first mounts
  //   AND whenever resolvedA or resolvedB changes.
  //   This means: new data = new analysis automatically.
  // -------------------------------------------------------
  // Stable keys derived from case data — avoids infinite re-render from object identity changes
  const caseAKey = resolvedA.summary?.slice(0, 80) ?? 'demo-a'
  const caseBKey = resolvedB.summary?.slice(0, 80) ?? 'demo-b'

  useEffect(() => {
    async function runAnalysis() {
      setLoading(true)
      setError(null)
      setSimilarity(null)
      setComparison(null)
      setComparisonId(null)
      setDismissed(false)

      try {
        const [similarityResult, compareResponse] = await Promise.all([
          getSimilarityScore(resolvedA.summary, resolvedB.summary),
          // Strip 'name' — /compare-cases only accepts summary, issues, principles
          compareCases(
            { caseId: resolvedA.caseId, summary: resolvedA.summary, issues: resolvedA.issues, principles: resolvedA.principles },
            { caseId: resolvedB.caseId, summary: resolvedB.summary, issues: resolvedB.issues, principles: resolvedB.principles },
          ),
        ])

        setSimilarity(similarityResult)
        setComparison(compareResponse.comparison)
        setComparisonId(compareResponse.comparisonId)
      } catch (err) {
        let msg = 'Failed to analyze the cases. '
        if (err?.response?.data?.detail?.message) {
          msg += err.response.data.detail.message
        } else if (err?.response?.data?.detail) {
          msg += typeof err.response.data.detail === 'string' ? err.response.data.detail : JSON.stringify(err.response.data.detail)
        } else if (err?.message) {
          msg += err.message
        } else {
          msg += 'Make sure the AI service (python main.py) is running on port 8000 and that both cases have valid summaries.'
        }
        setError(msg)
      } finally {
        setLoading(false)
      }
    }

    runAnalysis()
  }, [caseAKey, caseBKey]) // Use stable string keys — not object refs — to avoid infinite loops

  // -------------------------------------------------------
  // RENDER
  // -------------------------------------------------------
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 text-white">

      {/* ---- HEADER ---- */}
      <header className="sticky top-0 z-20 border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-md">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {onBack && (
              <button
                onClick={onBack}
                className="flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-850 hover:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700 transition-colors"
                title="Go back to file list"
              >
                <span>⬅️</span>
                <span>Upload List</span>
              </button>
            )}
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚖️</span>
              <div>
                <h1 className="text-white font-bold text-base leading-none">Case Law AI</h1>
                <p className="text-slate-500 text-xs mt-0.5">Summarizer &amp; Comparator</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isDemo && (
              <span className="text-xs text-amber-400 bg-amber-900/30 border border-amber-500/30 px-3 py-1 rounded-full font-medium">
                Demo Mode — no PDFs loaded
              </span>
            )}
            {similarity && comparison && (
              <button
                onClick={handleExportPDF}
                disabled={exporting}
                className={`
                  flex items-center gap-2 text-xs font-bold px-4 py-1.5 rounded-lg border transition-all duration-200
                  ${exporting
                    ? 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed animate-pulse'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500 hover:border-indigo-400 shadow-md shadow-indigo-500/20 active:scale-[0.98]'}
                `}
              >
                <span>📥</span>
                <span>{exporting ? 'Exporting...' : 'Export PDF Report'}</span>
              </button>
            )}
            <span className="text-xs text-indigo-400 bg-indigo-900/30 border border-indigo-500/30 px-3 py-1.5 rounded-full font-medium">
              Comparison Dashboard
            </span>
          </div>
        </div>
      </header>

      {/* ---- BODY ---- */}
      <main className="max-w-screen-2xl mx-auto px-4 sm:px-8 py-8">

        {/* Page title */}
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-black text-white mb-2 tracking-tight">
            Comparative Intelligence Report
          </h2>
          <p className="text-slate-400 text-sm max-w-2xl mx-auto">
            Side-by-side AI analysis of two legal judgments with similarity scoring,
            conflict detection, and adversarial strategy.
          </p>
        </div>

        {/* ---- ERROR / EMPTY BANNERS ---- */}
        {error && !dismissed && (
          <AlertBanner
            type="error"
            title="AI Service Error"
            message={error}
            onDismiss={() => setDismissed(true)}
          />
        )}

        {!loading && !error && !similarity && !comparison && (
          <AlertBanner
            type="warning"
            title="No analysis data"
            message="Upload and extract two case documents first, then open this dashboard."
          />
        )}

        {/* ---- 3-COLUMN LAYOUT ---- */}
        {/*
          Grid breakdown:
            - Mobile (default):   1 column, stacked vertically
            - Large screens (lg): 3 columns: [Case A] [Center] [Case B]
            - Center column is slightly wider (grid-cols-[1fr_1.2fr_1fr])
        */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.3fr_1fr] gap-5 items-start">

          {/* ═══════════════════════════════ LEFT — CASE A ═══════════════════════════ */}
          <div id="case-a-column">
            {loading ? (
              <SkeletonCard />
            ) : (
              <CaseCard label="Case A" color="blue" caseData={resolvedA} />
            )}
          </div>

          {/* ══════════════════════════════ CENTER — ANALYSIS ═══════════════════════ */}
          <div
            id="center-analysis-column"
            className="p-5 bg-slate-800/60 border border-indigo-500/20 rounded-2xl shadow-xl shadow-indigo-950/40"
          >
            {loading ? (
              <SkeletonCenter />
            ) : (
              <>
                {/* ── Similarity Score ── */}
                <div className="mb-6">
                  <h3 className="text-center text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">
                    Semantic Similarity Score
                  </h3>
                  <SimilarityCircle
                    score={similarity?.similarity_score}
                    interpretation={similarity?.interpretation}
                  />
                </div>

                {/* Divider */}
                <div className="border-t border-slate-700/60 my-5" />

                {/* ── Conflict & Strategy Matrix ── */}
                <h3 className="text-center text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">
                  Conflict &amp; Strategy Matrix
                </h3>

                {comparison ? (
                  <ConflictMatrix comparison={comparison} />
                ) : (
                  <div className="text-center text-slate-500 text-sm mt-6">
                    {error
                      ? 'Matrix unavailable due to AI service error.'
                      : 'Running analysis...'}
                  </div>
                )}

                {/* Model info footer */}
                {comparison && (
                  <p className="text-center text-slate-600 text-xs mt-5 border-t border-slate-700/40 pt-3">
                    Model: {comparison.model_used || 'unknown'}
                    {comparison.is_fallback && (
                      <span className="ml-2 text-amber-500">(fallback mode)</span>
                    )}
                  </p>
                )}
              </>
            )}
          </div>

          {/* ═══════════════════════════════ RIGHT — CASE B ══════════════════════════ */}
          <div id="case-b-column">
            {loading ? (
              <SkeletonCard />
            ) : (
              <CaseCard label="Case B" color="green" caseData={resolvedB} />
            )}
          </div>

        </div>{/* end 3-col grid */}
      </main>

      {/* ---- CHATBOT ---- */}
      {!loading && similarity && comparison && (
        <Chatbot
          caseAData={resolvedA}
          caseBData={resolvedB}
          similarity={similarity}
          comparison={comparison}
        />
      )}
    </div>
  )
}

export default ComparisonDashboard
