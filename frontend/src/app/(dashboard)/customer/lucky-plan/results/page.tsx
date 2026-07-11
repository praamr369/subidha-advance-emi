'use client'

import { useEffect, useState } from 'react'
import { luckyPlanService, DrawResult } from '@/services/lucky-plan'
import Link from 'next/link'

export default function DrawResultsPage() {
  const [results, setResults] = useState<DrawResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const limit = 10

  useEffect(() => {
    const fetchResults = async () => {
      try {
        setLoading(true)
        const data = await luckyPlanService.getDrawResults(limit, offset)
        setResults(data.results)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch results')
      } finally {
        setLoading(false)
      }
    }

    fetchResults()
  }, [offset])

  const handlePrevious = () => {
    if (offset > 0) setOffset(offset - limit)
  }

  const handleNext = () => {
    setOffset(offset + limit)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6 md:p-12">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Draw Results</h1>
          <p className="text-gray-600">Past and upcoming draw results</p>
        </div>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-8 rounded">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* Results List */}
        <div className="space-y-4">
          {results.map((result) => (
            <div key={result.id} className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition">
              <div className="grid md:grid-cols-3 gap-4 mb-4">
                <div>
                  <p className="text-sm text-gray-500 mb-1">Draw Batch</p>
                  <p className="text-lg font-semibold text-gray-900">{result.batch_name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Draw Date</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {new Date(result.draw_date).toLocaleDateString('en-IN', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Participants</p>
                  <p className="text-lg font-semibold text-gray-900">{result.total_participants.toLocaleString()}</p>
                </div>
              </div>

              {/* Winner Status */}
              {result.is_customer_winner ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-bold text-green-900">Congratulations! You Won!</h3>
                      <p className="text-sm text-green-700">EMI Waiver: ₹{result.customer_waiver_amount?.toLocaleString('en-IN') || '0'}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
                  <p className="text-gray-600">Better luck next time!</p>
                </div>
              )}

              {/* Winners Info */}
              {result.winner_details && result.winner_details.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <p className="font-semibold text-gray-900 mb-3">Winners ({result.winners_count})</p>
                  <div className="grid md:grid-cols-2 gap-3">
                    {result.winner_details.slice(0, 2).map((winner, idx) => (
                      <div key={idx} className="bg-blue-50 rounded p-3">
                        <p className="text-sm font-semibold text-blue-900">{winner.customer_name}</p>
                        <p className="text-xs text-blue-700">{winner.location}</p>
                        <p className="text-sm font-bold text-blue-900 mt-1">₹{winner.prize_amount.toLocaleString('en-IN')}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Pagination */}
        <div className="flex justify-between items-center mt-8">
          <button
            onClick={handlePrevious}
            disabled={offset === 0}
            className="px-6 py-2 bg-gray-200 hover:bg-gray-300 disabled:opacity-50 text-gray-900 font-semibold rounded-lg transition"
          >
            Previous
          </button>
          <span className="text-gray-600">
            Showing results {offset + 1} - {offset + results.length}
          </span>
          <button
            onClick={handleNext}
            disabled={results.length < limit}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-lg transition"
          >
            Next
          </button>
        </div>

        {/* Navigation */}
        <div className="flex gap-4 mt-8">
          <Link
            href="/dashboard/customer/lucky-plan/eligibility"
            className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-900 font-semibold py-3 rounded-lg transition text-center"
          >
            Check Eligibility
          </Link>
          <Link
            href="/dashboard/customer/lucky-plan/history"
            className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-900 font-semibold py-3 rounded-lg transition text-center"
          >
            View My Waivers
          </Link>
        </div>
      </div>
    </div>
  )
}
