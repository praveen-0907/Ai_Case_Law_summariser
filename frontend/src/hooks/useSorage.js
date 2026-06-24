import { useState, useEffect } from 'react'
import axios from 'axios'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'

export function useStoredCases() {
  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function fetchCases() {
      try {
        const { data } = await axios.get(`${BACKEND_URL}/api/storage/cases`)
        setCases(data)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchCases()
  }, [])

  return { cases, loading, error }
}

export function useStoredCase(caseId) {
  const [caseData, setCaseData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!caseId) return

    async function fetchCase() {
      try {
        const { data } = await axios.get(`${BACKEND_URL}/api/storage/cases/${caseId}`)
        setCaseData(data)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchCase()
  }, [caseId])

  return { caseData, loading, error }
}

export function useStoredComparisons() {
  const [comparisons, setComparisons] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function fetchComparisons() {
      try {
        const { data } = await axios.get(`${BACKEND_URL}/api/storage/comparisons`)
        setComparisons(data)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchComparisons()
  }, [])

  return { comparisons, loading, error }
}