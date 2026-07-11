'use client'

import { useEffect, useState } from 'react'
import { luckyPlanService, LuckyIDTracker } from '@/services/lucky-plan'
import Link from 'next/link'

export default function LuckyIDTrackerPage() {
  const [tracker, setTracker] = useState<LuckyIDTracker | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchTracker = async () => {
      try {
        setLoading(true)
        const data = await luckyPlanService.getLuckyIDTracker()
        setTracker(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch lucky ID info')
      } finally {
        setLoading(false)
      }
    }

    fetchTracker()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (error || !tracker) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-red-100 p-6 md:p-12">
        <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-lg p-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-red-600 mb-4">Error</h1>
            <p className="text-gray-600 mb-6">{error || 'Failed to load lucky ID information'}</p>
            <Link href="/dashboard/customer" className="text-primary hover:underline">
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const calculateDaysUntilDraw = () => {
    const drawDate = new Date(tracker.next_draw_date)
    const today = new Date()
    const days = Math.ceil((drawDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    return Math.max(0, days)
  }

  const daysUntil = calculateDaysUntilDraw()

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-100 p-6 md:p-12">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Your Lucky ID</h1>
          <p className="text-gray-600">Track your Lucky IDs across all draws</p>
        </div>

        {/* Current Lucky ID - Large Card */}
        <div className="bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg shadow-2xl p-8 md:p-12 mb-8 text-white">
          <p className="text-purple-100 text-sm mb-2 uppercase tracking-wide">Current Lucky ID</p>
          <div className="flex items-center justify-between mb-8">
            <div>
              <p className="text-6xl font-bold font-mono mb-2">{tracker.current_lucky_id}</p>
              <p className="text-purple-100">Batch: {tracker.batch_name}</p>
            </div>
            <div className="text-right">
              <svg className="w-20 h-20 text-purple-200 mb-2" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <p className="text-sm font-semibold">Allocated on {new Date(tracker.allocated_at).toLocaleDateString('en-IN')}</p>
            </div>
          </div>

          {/* Countdown */}
          <div className="bg-white bg-opacity-20 rounded-lg p-4">
            <p className="text-sm text-purple-100 mb-1">Next Draw Countdown</p>
            <div className="flex items-baseline gap-2">
              <p className="text-4xl font-bold">{daysUntil}</p>
              <p className="text-lg text-purple-100">days remaining</p>
            </div>
          </div>
        </div>

        {/* Draw odds — static info, not a running probability */}
        {tracker.win_probability !== undefined && (
          <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
            <h3 className="text-2xl font-bold text-gray-900 mb-2">Draw Odds</h3>
            <p className="text-sm text-gray-500 mb-6">
              One Lucky ID is drawn per batch. Odds are fixed by the number of eligible participants at the time of draw — they do not change as the draw date approaches.
            </p>
            <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-6 py-4">
              <div>
                <p className="text-sm text-gray-600">Your share of eligible entries</p>
                <p className="text-xs text-gray-400 mt-1">1 winner per batch · based on eligible paid IDs only</p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-purple-600">{(tracker.win_probability * 100).toFixed(2)}%</p>
                <p className="text-xs text-gray-500 mt-1">as of last eligibility check</p>
              </div>
            </div>
          </div>
        )}

        {/* Previous Lucky IDs */}
        {tracker.previous_lucky_ids && tracker.previous_lucky_ids.length > 0 && (
          <div className="bg-white rounded-lg shadow-lg p-8">
            <h3 className="text-2xl font-bold text-gray-900 mb-6">Lucky ID History</h3>
            <div className="space-y-4">
              {tracker.previous_lucky_ids.map((id, idx) => (
                <div key={idx} className="border-l-4 border-purple-500 pl-4 py-2 hover:bg-gray-50 rounded transition">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono font-bold text-gray-900 text-lg">{id.lucky_id}</p>
                      <p className="text-sm text-gray-600">{id.batch_name}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(id.allocated_at).toLocaleDateString('en-IN')}
                      </p>
                    </div>
                    <div className="text-right">
                      {id.draw_result === 'WON' ? (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-green-100 text-green-800">
                          🎉 Won
                        </span>
                      ) : id.draw_result === 'DRAWN' ? (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-yellow-100 text-yellow-800">
                          ✓ Drawn
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-gray-100 text-gray-800">
                          - Not Selected
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* How It Works */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-8 mt-8">
          <h3 className="text-xl font-bold text-gray-900 mb-4">How Lucky ID Works</h3>
          <div className="grid md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center mx-auto mb-2 font-bold text-lg">1</div>
              <p className="text-sm font-semibold text-gray-900 mb-1">Make Payment</p>
              <p className="text-xs text-gray-600">Each EMI payment gets you a Lucky ID</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center mx-auto mb-2 font-bold text-lg">2</div>
              <p className="text-sm font-semibold text-gray-900 mb-1">Enter Draw</p>
              <p className="text-xs text-gray-600">Your ID enters the monthly draw</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center mx-auto mb-2 font-bold text-lg">3</div>
              <p className="text-sm font-semibold text-gray-900 mb-1">Win Prize</p>
              <p className="text-xs text-gray-600">Winners get EMI amount waived</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center mx-auto mb-2 font-bold text-lg">4</div>
              <p className="text-sm font-semibold text-gray-900 mb-1">Get Settled</p>
              <p className="text-xs text-gray-600">Waiver credited within 7 days</p>
            </div>
          </div>
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
            href="/dashboard/customer/lucky-plan/results"
            className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 rounded-lg transition text-center"
          >
            View Draw Results
          </Link>
          <Link
            href="/dashboard/customer/lucky-plan/history"
            className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 rounded-lg transition text-center"
          >
            View Waivers
          </Link>
        </div>
      </div>
    </div>
  )
}
