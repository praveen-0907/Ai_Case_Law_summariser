const express = require('express')
const router  = express.Router()
const PDFDocument = require('pdfkit')
const { saveAnalysisReport } = require('../services/supabaseService')

function drawHorizontalRule(doc, y) {
  const lineY = y !== undefined ? y : doc.y        // use provided Y or current cursor
  const leftMargin  = doc.page.margins.left        // e.g. 72 (1 inch)
  const rightMargin = doc.page.width - doc.page.margins.right

  doc
    .moveTo(leftMargin, lineY)                     // start point of the line
    .lineTo(rightMargin, lineY)                    // end point (full width)
    .strokeColor('#cccccc')                        // light gray color
    .lineWidth(0.5)                                // thin — professional look
    .stroke()                                      // actually draw it

  doc.moveDown(0.5)                                // add a little space after the line
}

function sectionTitle(doc, title, color = '#1a1a2e') {
  doc
    .moveDown(0.8)                 // space above the heading
    .fontSize(13)
    .fillColor(color)
    .font('Helvetica-Bold')        // bold weight
    .text(title.toUpperCase(), {  // uppercase for clean corporate look
      characterSpacing: 0.5,      // slight letter spacing looks professional
    })

  // Draw a rule right below the title
  drawHorizontalRule(doc, doc.y + 4)
  doc.moveDown(0.3)
}

function bulletItem(doc, text) {
  const content = (text || '').toString().trim()

  doc
    .fontSize(10)
    .fillColor('#333333')
    .font('Helvetica')
    .text(`•  ${content || 'No information provided.'}`, {
      indent: 16,          // indent the bullet text from the left margin
      lineGap: 2,          // slight extra spacing between lines within this item
      continued: false,    // each bullet is its own text block
    })

  doc.moveDown(0.2)        // small gap after each bullet
}
function bodyText(doc, text) {
  const content = (text || '').toString().trim()

  doc
    .fontSize(10)
    .fillColor('#333333')
    .font('Helvetica')
    .text(content || 'No information provided.', {
      lineGap: 3,
      align: 'justify',   // justify text for a cleaner, professional look
    })

  doc.moveDown(0.4)
}
function labelValuePair(doc, label, value) {
  doc
    .fontSize(10)
    .fillColor('#555555')
    .font('Helvetica-Bold')
    .text(label, { lineGap: 2 })

  bodyText(doc, value)
  doc.moveDown(0.2)
}
// -------------------------------------------------------
function buildList(doc, items, emptyMsg = 'None identified.') {
  if (!items || items.length === 0) {
    doc
      .fontSize(10)
      .fillColor('#999999')
      .font('Helvetica-Oblique')  // italic for "none found" state
      .text(`  ${emptyMsg}`)
    doc.moveDown(0.3)
    return
  }

  items.forEach((item) => bulletItem(doc, item))
}
function parseSummaryText(summaryText) {
  if (!summaryText) return [];

  const headings = ['Core Facts', 'Main Dispute', 'Final Ruling', 'Summary'];
  const regex = /(\*\*(?:Core Facts|Main Dispute|Final Ruling|Summary):?\*\*|^\s*(?:Core Facts|Main Dispute|Final Ruling|Summary):)/gmi;

  const parts = (summaryText || '').split(regex);
  const sections = [];
  let currentTitle = 'Summary';
  let currentContent = '';

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    if (!part) continue;

    const matchedHeading = headings.find(h => {
      const normalizedPart = part.replace(/\*/g, '').replace(/:/g, '').trim().toLowerCase();
      return normalizedPart === h.toLowerCase();
    });

    if (matchedHeading) {
      if (currentContent.trim()) {
        sections.push({ title: currentTitle, content: currentContent.trim() });
      }
      // Clean title
      let cleanTitle = part.replace(/\*/g, '').replace(/:/g, '').trim()
      headings.forEach(h => {
        if (cleanTitle.toLowerCase() === h.toLowerCase()) {
          cleanTitle = h
        }
      })
      currentTitle = cleanTitle;
      currentContent = '';
    } else {
      currentContent += (currentContent ? '\n' : '') + part;
    }
  }

  if (currentContent.trim()) {
    sections.push({ title: currentTitle, content: currentContent.trim() });
  }

  // Filter out empty sections or sections containing only bullet characters
  const cleanSections = sections.filter(sec => {
    const cleanedText = sec.content.replace(/^\d+\.\s*|^[-•*]\s*/, '').trim()
    return cleanedText.length > 0
  })

  return cleanSections;
}

function buildCaseSection(doc, label, caseData, color) {
  sectionTitle(doc, label, color)

  // — Summary —
  const summarySections = parseSummaryText(caseData?.summary)

  if (summarySections.length === 0) {
    doc
      .fontSize(10)
      .fillColor('#444444')
      .font('Helvetica-Bold')
      .text('Summary', { lineGap: 2 })

    bodyText(doc, caseData?.summary)
  } else {
    summarySections.forEach((sec) => {
      doc
        .fontSize(10)
        .fillColor(color)
        .font('Helvetica-Bold')
        .text(sec.title, { lineGap: 2 })

      // Remove double asterisks from text content for clean PDF display
      const cleanContent = sec.content.replace(/\*\*/g, '').trim()

      const lines = cleanContent.split('\n')
        .map(l => l.trim())
        .map(l => ({
          original: l,
          cleaned: l.replace(/^\d+\.\s*|^[-•*]\s*/, '').trim()
        }))
        .filter(item => item.cleaned.length > 0)

      const isList = lines.length > 1 || cleanContent.includes('\n') || lines.some(item => /^\d+\.|^[-•*]/.test(item.original))

      if (isList) {
        lines.forEach((item) => {
          bulletItem(doc, item.cleaned)
        })
      } else {
        bodyText(doc, cleanContent)
      }
      doc.moveDown(0.2)
    })
  }
  doc.moveDown(0.2)

  // — Legal Issues —
  doc
    .fontSize(10)
    .fillColor('#444444')
    .font('Helvetica-Bold')
    .text('Key Legal Issues', { lineGap: 2 })

  buildList(doc, caseData?.issues, 'No issues extracted.')
  doc.moveDown(0.2)

  // — Legal Principles —
  doc
    .fontSize(10)
    .fillColor('#444444')
    .font('Helvetica-Bold')
    .text('Legal Principles Applied', { lineGap: 2 })

  buildList(doc, caseData?.principles, 'No principles extracted.')
}

// -------------------------------------------------------
// ROUTE: POST /api/download-report
// (Also accepts GET — see note at top of file)
//
// Expected request body (JSON):
// {
//   "case_a": {
//     "name": "Judgment Title A",
//     "summary": "Plain-English summary...",
//     "issues": ["Issue 1", "Issue 2"],
//     "principles": ["Principle 1", "Principle 2"]
//   },
//   "case_b": {
//     "name": "Judgment Title B",
//     "summary": "...",
//     "issues": [...],
//     "principles": [...]
//   },
//   "similarity_score": 78,
//   "similarity_interpretation": "High similarity — cases likely share legal issues.",
//   "comparison": {
//     "common_issues": ["..."],
//     "common_principles": ["..."],
//     "structural_differences": ["..."],
//     "adversarial_strategy": {
//       "if_you_rely_on_case_a": "...",
//       "how_to_distinguish_them": "..."
//     }
//   }
// }
// -------------------------------------------------------
router.post('/', (req, res) => {

  // ---- EXTRACT DATA FROM REQUEST BODY ----
  // Use destructuring with defaults so we never crash on missing fields
  const {
    comparison_id = null,
    case_a = {},
    case_b = {},
    similarity_score = null,
    similarity_interpretation = '',
    comparison = {},
  } = req.body

  // Log to server console for debugging
  console.log(`📄 Generating PDF report — Similarity: ${similarity_score}%`)

  if (comparison_id) {
    // Save the report data to Supabase (run asynchronously)
    saveAnalysisReport(comparison_id, "Comparison Report PDF", req.body)
      .catch(err => console.warn('Failed to save analysis report:', err.message))
  }

  try {
    // ---- CREATE THE PDF DOCUMENT ----
    // PDFDocument creates a new in-memory PDF stream.
    // 'compress: true' enables PDF compression for smaller file size.
    const doc = new PDFDocument({
      compress: true,
      size: 'A4',                          // standard A4 page (595 × 842 points)
      margins: { top: 60, bottom: 60, left: 72, right: 72 },  // 1 inch sides
      info: {
        // PDF metadata — visible in File > Properties in PDF readers
        Title:    'Legal Case Comparison Report',
        Author:   'AI Case Law Summarizer',
        Subject:  'Comparative Legal Analysis',
        Keywords: 'legal, case law, AI, comparison, analysis',
        Creator:  'AI Case Law Summarizer & Comparator',
      }
    })

    // ---- SET RESPONSE HEADERS ----
    // These headers tell the browser how to handle the incoming byte stream.

    // 'Content-Type: application/pdf' — tells the browser this is a PDF file
    res.setHeader('Content-Type', 'application/pdf')

    // 'Content-Disposition: attachment' — forces a DOWNLOAD dialog instead of
    // trying to open the PDF inline in the browser tab.
    // The 'filename' parameter sets the default save-as name.
    res.setHeader('Content-Disposition', 'attachment; filename="Legal_Comparison_Report.pdf"')

    // Pipe the PDF stream directly to the HTTP response
    // This means: every byte PDFKit writes goes straight to the browser
    // No temporary file is ever saved on the server.
    doc.pipe(res)

    // ============================================================
    // ==================  BUILD THE PDF CONTENT  =================
    // ============================================================

    // ---- COVER HEADER ----
    doc
      .rect(0, 0, doc.page.width, 130)    // full-width dark banner at top
      .fill('#0f172a')                     // dark navy background

    doc
      .fontSize(22)
      .fillColor('#ffffff')               // white text on dark background
      .font('Helvetica-Bold')
      .text('LEGAL CASE COMPARISON REPORT', 72, 38, {
        align: 'center',
        characterSpacing: 1.5,
      })

    doc
      .fontSize(10)
      .fillColor('#94a3b8')               // muted slate color
      .font('Helvetica')
      .text('Generated by AI Case Law Summarizer & Comparator', {
        align: 'center',
      })

    // Date and time in the header
    const reportDate = new Date().toLocaleString('en-IN', {
      day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
    doc
      .fontSize(9)
      .fillColor('#64748b')
      .text(`Report generated: ${reportDate}`, { align: 'center' })

    doc.moveDown(1.5)

    // ---- SIMILARITY SCORE BLOCK ----
    // A highlighted box showing the similarity score prominently
    sectionTitle(doc, 'Semantic Similarity Score', '#1e3a5f')

    const scoreColor =
      (similarity_score || 0) >= 75 ? '#4f46e5' :   // indigo — high
      (similarity_score || 0) >= 50 ? '#d97706' :   // amber  — moderate
      '#dc2626'                                       // red    — low

    doc
      .fontSize(32)
      .fillColor(scoreColor)
      .font('Helvetica-Bold')
      .text(
        similarity_score !== null ? `${similarity_score}%` : 'N/A',
        { align: 'center' }
      )

    doc
      .fontSize(11)
      .fillColor('#555555')
      .font('Helvetica')
      .text(similarity_interpretation || 'No interpretation available.', {
        align: 'center',
        lineGap: 2,
      })

    doc.moveDown(0.5)

    // ---- CASE A ----
    buildCaseSection(doc, `Case A — ${case_a.name || 'Unnamed'}`, case_a, '#1e40af')

    // ---- CASE B (on a new page for clean separation) ----
    doc.addPage()
    buildCaseSection(doc, `Case B — ${case_b.name || 'Unnamed'}`, case_b, '#065f46')

    // ---- CONFLICT & STRATEGY MATRIX ----
    doc.addPage()
    sectionTitle(doc, 'Conflict & Strategy Matrix', '#7c3aed')

    // — Common Issues —
    doc
      .fontSize(10)
      .fillColor('#166534')
      .font('Helvetica-Bold')
      .text('Common Legal Issues (Shared by Both Cases)', { lineGap: 2 })

    buildList(doc, comparison.common_issues, 'No common issues identified.')
    doc.moveDown(0.5)

    // — Common Principles —
    doc
      .fontSize(10)
      .fillColor('#1e40af')
      .font('Helvetica-Bold')
      .text('Common Legal Principles (Shared by Both Cases)', { lineGap: 2 })

    buildList(doc, comparison.common_principles, 'No common principles identified.')
    doc.moveDown(0.5)

    // — Structural Differences —
    doc
      .fontSize(10)
      .fillColor('#92400e')
      .font('Helvetica-Bold')
      .text('Structural Differences & Conflicts', { lineGap: 2 })

    buildList(doc, comparison.structural_differences, 'No structural differences identified.')
    doc.moveDown(0.5)

    // ---- ADVERSARIAL STRATEGY ----
    sectionTitle(doc, 'Adversarial Strategy Analysis', '#991b1b')

    doc
      .fontSize(10)
      .fillColor('#555555')
      .font('Helvetica')
      .text(
        'This section identifies how a lawyer would use Case B against you if you cite Case A, ' +
        'and provides the argument to neutralise that attack.',
        { lineGap: 3, align: 'justify' }
      )

    doc.moveDown(0.5)

    const strategy = comparison.adversarial_strategy || {}

    labelValuePair(
      doc,
      'If you rely on Case A — your opponent will argue:',
      strategy.if_you_rely_on_case_a
    )

    labelValuePair(
      doc,
      'How to distinguish the cases and neutralise their argument:',
      strategy.how_to_distinguish_them
    )

    // ---- FOOTER ON LAST PAGE ----
    doc.moveDown(2)
    drawHorizontalRule(doc)

    doc
      .fontSize(8)
      .fillColor('#aaaaaa')
      .font('Helvetica')
      .text(
        'This report was generated automatically by an AI system. It is intended as a research ' +
        'aid only and does not constitute legal advice. Always consult a qualified legal professional.',
        { align: 'center', lineGap: 2 }
      )

    // ---- FINALISE THE DOCUMENT ----
    // doc.end() signals that all content has been written.
    // This triggers the piped response to flush and close, completing the download.
    doc.end()

  } catch (error) {
    // If anything goes wrong BEFORE the PDF starts streaming, send an error JSON.
    // (Once streaming has started, we cannot change headers, so errors mid-stream
    //  would just cause a broken PDF download — this handles pre-stream failures.)
    console.error('❌ PDF generation error:', error.message)

    // Only send an error response if headers haven't been sent yet
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Failed to generate PDF report.',
        error: error.message,
      })
    }
  }
})

// Also support GET for simple browser testing
// (GET cannot have a body in most browsers, so this returns a guide message)
router.get('/', (req, res) => {
  res.status(200).json({
    message: 'PDF report endpoint is active. Send a POST request with case data to download your report.',
    method: 'POST',
    endpoint: '/api/download-report',
    example_body: {
      case_a: { name: 'Case Title A', summary: '...', issues: [], principles: [] },
      case_b: { name: 'Case Title B', summary: '...', issues: [], principles: [] },
      similarity_score: 78,
      similarity_interpretation: 'High similarity — cases likely share legal issues.',
      comparison: {
        common_issues: [],
        common_principles: [],
        structural_differences: [],
        adversarial_strategy: {
          if_you_rely_on_case_a: '...',
          how_to_distinguish_them: '...',
        }
      }
    }
  })
})

module.exports = router