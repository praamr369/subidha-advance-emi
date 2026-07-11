'use client'

import { useEffect, useState } from 'react'
import { luckyPlanService, WaiverHistory } from '@/services/lucky-plan'
import Link from 'next/link'

export default function WaiverHistoryPage() {
  const [waivers, setWaivers] = useState<WaiverHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const [totalSaved, setTotalSaved] = useState(0)
  const limit = 20

  useEffect(() => {
    const fetchWaivers = async () => {
      try {
        setLoading(true)
        const data = await luckyPlanService.getWaiverHistory(limit, offset)
        setWaivers(data.results)
        const total = data.results.reduce((sum, w) => sum + w.waiver_amount, 0)
        setTotalSaved(total)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch waivers')
      } finally {
        setLoading(false)
      }
    }

    fetchWaivers()
  }, [offset])

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
          <h1 className="text-4xl font-bold text-gray-900 mb-2">EMI Waiver History</h1>
          <p className="text-gray-600">Track all EMI waivers you've received through Lucky Plan</p>
        </div>

        {/* Summary Card */}
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg shadow-lg p-8 mb-8 text-white">
          <div className="grid md:grid-cols-3 gap-6">
            <div>
              <p className="text-green-100 text-sm mb-2">Total Waivers Received</p>
              <p className="text-4xl font-bold">{waivers.length}</p>
            </div>
            <div>
              <p className="text-green-100 text-sm mb-2">Total Amount Saved</p>
              <p className="text-4xl font-bold">₹{totalSaved.toLocaleString('en-IN')}</p>
            </div>
            <div>
              <p className="text-green-100 text-sm mb-2">Average Waiver</p>
              <p className="text-4xl font-bold">
                ₹{(totalSaved / (waivers.length || 1)).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-8 rounded">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* Waivers Table */}
        {waivers.length > 0 ? (
          <div className="bg-white rounded-lg shadow-lg overflow-hidden mb-8">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Draw Date</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">EMI Amount</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Waiver Amount</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Savings %</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {waivers.map((waiver) => {
                    const savingsPercent = ((waiver.waiver_amount / waiver.emi_amount) * 100).toFixed(0)
                    const isSettled = waiver.settlement_status === 'SETTLED'

                    return (
                      <tr key={waiver.id} className="hover:bg-gray-50 transition">
                        <td className="px-6 py-4 text-gray-900">
                          {new Date(waiver.draw_date).toLocaleDateString('en-IN', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </td>
                        <td className="px-6 py-4 text-gray-900 font-semibold">
                          ₹{waiver.emi_amount.toLocaleString('en-IN')}
                        </td>
                        <td className="px-6 py-4 text-green-600 font-bold">
                          ₹{waiver.waiver_amount.toLocaleString('en-IN')}
                        </td>
                        <td className="px-6 py-4 text-gray-900">
                          {savingsPercent}%
                        </td>
                        <td className="px-6 py-4">
                          {isSettled ? (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-green-100 text-green-800">
                              ✓ Settled
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-yellow-100 text-yellow-800">
                              ⏳ Processing
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-lg p-12 text-center mb-8">
            <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Waivers Yet</h3>
            <p className="text-gray-600 mb-6">You haven't won any EMI waivers yet. Keep trying!</p>
            <Link
              href="/dashboard/customer/lucky-plan/eligibility"
              className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg transition"
            >
              Check Your Eligibility
            </Link>
          </div>
        )}

        {/* Pagination */}
        {waivers.length > 0 && (
          <div className="flex justify-between items-center mb-8">
            <button
              onClick={() => setOffset(Math.max(0, offset - limit))}
              disabled={offset === 0}
              className="px-6 py-2 bg-gray-200 hover:bg-gray-300 disabled:opacity-50 text-gray-900 font-semibold rounded-lg transition"
            >
              Previous
            </button>
            <span className="text-gray-600">
              Showing {offset + 1} - {offset + waivers.length}
            </span>
            <button
              onClick={() => setOffset(offset + limit)}
              disabled={waivers.length < limit}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-lg transition"
            >
              Next
            </button>
          </div>
        )}

        {/* Benefits Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-8 mb-8">
          <h3 className="text-xl font-bold text-gray-900 mb-4">How EMI Waivers Work</h3>
          <ul className="space-y-3 text-gray-700">
            <li className="flex gap-3">
              <span className="text-blue-600 font-bold">1.</span>
              <span>You automatically get a Lucky ID every time you make a payment</span>
            </li>
            <li className="flex gap-3">
              <span className="text-blue-600 font-bold">2.</span>
              <span>Each Lucky ID is entered into our monthly Lucky Plan Draw</span>
            </li>
            <li className="flex gap-3">
              <span className="text-blue-600 font-bold">3.</span>
              <span>Winners get their next EMI amount waived automatically</span>
            </li>
            <li className="flex gap-3">
              <span className="text-blue-600 font-bold">4.</span>
              <span>The waiver is settled within 7 days of the draw</span>
            </li>
          </ul>
        </div>

        {/* Navigation */}
        <div className="flex gap-4">
          <Link
            href="/dashboard/customer/lucky-plan/eligibility"
            className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-900 font-semibold py-3 rounded-lg transition text-center"
          >
            Check Eligibility
          </Link>
          <Link
            href="/dashboard/customer/lucky-plan/results"
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition text-center"
          >
            View Draw Results
          </Link>
        </div>
      </div>
    </div>
  )
}
