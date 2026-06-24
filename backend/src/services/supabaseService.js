// backend/src/services/supabaseService.js
// -------------------------------------------------------
// Supabase client initialization and helper functions
// for storing and retrieving case analysis data.
//
// Usage:
//   const { saveCaseAnalysis, getSingleCase, saveComparison } = require('./supabaseService')
//   const caseId = await saveCaseAnalysis(docId, analysisData)
// -------------------------------------------------------

const { createClient } = require('@supabase/supabase-js')

// Initialize Supabase client with environment variables
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    '⚠️ SUPABASE_URL or SUPABASE_ANON_KEY not set in .env — storage features will be unavailable'
  )
}

// Create Supabase client (safe to call even if keys are missing)
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null

// -------------------------------------------------------
// FUNCTION: saveCaseAnalysis
// Stores a single case analysis result in the database.
// -------------------------------------------------------
async function saveCaseAnalysis(documentId, analysisData) {
  if (!supabase) {
    console.warn('Supabase not configured — skipping case analysis save')
    return null
  }

  try {
    const { data, error } = await supabase
      .from('case_analyses')
      .insert([
        {
          document_id: documentId,
          case_name: analysisData.name,
          summary: analysisData.summary,
          issues: analysisData.issues || [],
          principles: analysisData.principles || [],
          features_status: analysisData.featuresStatus || 'success',
          features_fallback_reason: analysisData.featuresFallbackReason || null,
          model_used: analysisData.modelUsed,
          is_fallback: analysisData.isFallback || false,
        }
      ])
      .select()

    if (error) {
      console.error('Error saving case analysis:', error.message)
      return null
    }

    console.log(`✅ Saved case analysis: ${data[0].id}`)
    return data[0].id
  } catch (err) {
    console.error('Unexpected error in saveCaseAnalysis:', err)
    return null
  }
}

// -------------------------------------------------------
// FUNCTION: saveDocument
// Stores document metadata when a PDF is uploaded.
// -------------------------------------------------------
async function saveDocument(fileName, fileSizeBytes) {
  if (!supabase) {
    console.warn('Supabase not configured — skipping document save')
    return null
  }

  try {
    const { data, error } = await supabase
      .from('documents')
      .insert([
        {
          file_name: fileName,
          file_size_bytes: fileSizeBytes,
        }
      ])
      .select()

    if (error) {
      console.error('Error saving document:', error.message)
      return null
    }

    console.log(`✅ Saved document: ${data[0].id}`)
    return data[0].id
  } catch (err) {
    console.error('Unexpected error in saveDocument:', err)
    return null
  }
}

// -------------------------------------------------------
// FUNCTION: saveComparison
// Stores comparison analysis results.
// -------------------------------------------------------
async function saveComparison(caseAId, caseBId, comparisonData, similarityData) {
  if (!supabase) {
    console.warn('Supabase not configured — skipping comparison save')
    return null
  }

  try {
    const { data, error } = await supabase
      .from('comparison_analyses')
      .insert([
        {
          case_a_id: caseAId,
          case_b_id: caseBId,
          similarity_score: similarityData?.similarity_score,
          similarity_interpretation: similarityData?.interpretation,
          common_issues: comparisonData.common_issues || [],
          common_principles: comparisonData.common_principles || [],
          structural_differences: comparisonData.structural_differences || [],
          adversarial_strategy_case_a:
            comparisonData.adversarial_strategy?.if_you_rely_on_case_a,
          adversarial_strategy_distinguish:
            comparisonData.adversarial_strategy?.how_to_distinguish_them,
          comparison_status: comparisonData.status || 'success',
          is_fallback: comparisonData.is_fallback || false,
          model_used: comparisonData.model_used,
        }
      ])
      .select()

    if (error) {
      console.error('Error saving comparison:', error.message)
      return null
    }

    console.log(`✅ Saved comparison: ${data[0].id}`)
    return data[0].id
  } catch (err) {
    console.error('Unexpected error in saveComparison:', err)
    return null
  }
}

// -------------------------------------------------------
// FUNCTION: getSingleCase
// Retrieves a stored case analysis by ID.
// -------------------------------------------------------
async function getSingleCase(caseId) {
  if (!supabase) {
    console.warn('Supabase not configured — cannot retrieve case')
    return null
  }

  try {
    const { data, error } = await supabase
      .from('case_analyses')
      .select('*')
      .eq('id', caseId)
      .single()

    if (error) {
      console.error('Error retrieving case:', error.message)
      return null
    }

    return data
  } catch (err) {
    console.error('Unexpected error in getSingleCase:', err)
    return null
  }
}

// -------------------------------------------------------
// FUNCTION: getComparison
// Retrieves a stored comparison analysis by ID.
// -------------------------------------------------------
async function getComparison(comparisonId) {
  if (!supabase) {
    console.warn('Supabase not configured — cannot retrieve comparison')
    return null
  }

  try {
    const { data, error } = await supabase
      .from('comparison_analyses')
      .select(`
        *,
        case_a_id:case_a_id (
          id, case_name, summary, issues, principles
        ),
        case_b_id:case_b_id (
          id, case_name, summary, issues, principles
        )
      `)
      .eq('id', comparisonId)
      .single()

    if (error) {
      console.error('Error retrieving comparison:', error.message)
      return null
    }

    return data
  } catch (err) {
    console.error('Unexpected error in getComparison:', err)
    return null
  }
}

// -------------------------------------------------------
// FUNCTION: listCases
// Lists all stored case analyses (paginated).
// -------------------------------------------------------
async function listCases(limit = 20, offset = 0) {
  if (!supabase) {
    console.warn('Supabase not configured — cannot list cases')
    return []
  }

  try {
    const { data, error } = await supabase
      .from('case_analyses')
      .select('id, case_name, created_at, is_fallback')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('Error listing cases:', error.message)
      return []
    }

    return data
  } catch (err) {
    console.error('Unexpected error in listCases:', err)
    return []
  }
}

// -------------------------------------------------------
// FUNCTION: listComparisons
// Lists all stored comparison analyses (paginated).
// -------------------------------------------------------
async function listComparisons(limit = 20, offset = 0) {
  if (!supabase) {
    console.warn('Supabase not configured — cannot list comparisons')
    return []
  }

  try {
    const { data, error } = await supabase
      .from('comparison_analyses')
      .select('id, similarity_score, created_at, is_fallback')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('Error listing comparisons:', error.message)
      return []
    }

    return data
  } catch (err) {
    console.error('Unexpected error in listComparisons:', err)
    return []
  }
}

// -------------------------------------------------------
// FUNCTION: saveAnalysisReport
// Stores an exported PDF report as JSONB.
// -------------------------------------------------------
async function saveAnalysisReport(comparisonId, reportName, reportData) {
  if (!supabase) {
    console.warn('Supabase not configured — skipping report save')
    return null
  }

  try {
    const { data, error } = await supabase
      .from('analysis_reports')
      .insert([
        {
          comparison_id: comparisonId,
          report_name: reportName,
          report_data: reportData,
        }
      ])
      .select()

    if (error) {
      console.error('Error saving report:', error.message)
      return null
    }

    console.log(`✅ Saved analysis report: ${data[0].id}`)
    return data[0].id
  } catch (err) {
    console.error('Unexpected error in saveAnalysisReport:', err)
    return null
  }
}

module.exports = {
  supabase,
  saveDocument,
  saveCaseAnalysis,
  getSingleCase,
  saveComparison,
  getComparison,
  listCases,
  listComparisons,
  saveAnalysisReport,
}
