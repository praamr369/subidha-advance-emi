'use client'

import { useEffect, useState } from 'react'
import { luckyPlanService, EligibilityResponse } from '@/services/lucky-plan'
import Link from 'next/link'

export default function EligibilityCheckPage() {
  const [data, setData] = useState<EligibilityResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchEligibility = async () => {
      try {
        setLoading(true)
        const result = await luckyPlanService.checkEligibility()
        setData(result)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to check eligibility')
      } finally {
        setLoading(false)
      }
    }

    fetchEligibility()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-red-100 p-6 md:p-12">
        <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-lg p-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-red-600 mb-4">Error</h1>
            <p className="text-gray-600 mb-6">{error}</p>
            <Link href="/dashboard/customer" className="text-primary hover:underline">
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (!data) {
    return null
  }

  const isEligible = data.is_eligible
  const statusColor = isEligible ? 'green' : 'red'
  const statusBg = isEligible ? 'bg-green-50' : 'bg-red-50'
  const statusBorder = isEligible ? 'border-green-200' : 'border-red-200'
  const statusText = isEligible ? 'text-green-700' : 'text-red-700'

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6 md:p-12">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Lucky Plan Draw</h1>
          <p className="text-gray-600">Check your eligibility for the current draw</p>
        </div>

        {/* Main Eligibility Card */}
        <div className={`bg-white rounded-lg shadow-lg p-8 mb-8 border-2 ${statusBorder}`}>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
            {/* Status Icon */}
            <div className={`w-24 h-24 rounded-full ${statusBg} flex items-center justify-center flex-shrink-0`}>
              {isEligible ? (
                <svg className="w-12 h-12 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="w-12 h-12 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              )}
            </div>

            {/* Status Text */}
            <div className="flex-1">
              <h2 className={`text-3xl font-bold ${statusText} mb-2`}>
                {isEligible ? 'You are Eligible!' : 'Not Eligible'}
              </h2>
              {data.reason && (
                <p className="text-gray-600 mb-4">{data.reason}</p>
              )}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-gray-500">Subscription Status</p>
                  <p className="text-lg font-semibold text-gray-900 capitalize">{data.subscription_status}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Total Paid</p>
                  <p className="text-lg font-semibold text-gray-900">₹{data.paid_amount.toLocaleString('en-IN')}</p>
                </div>
                {data.overdue_amount > 0 && (
                  <div>
                    <p className="text-sm text-gray-500">Overdue Amount</p>
                    <p className="text-lg font-semibold text-red-600">₹{data.overdue_amount.toLocaleString('en-IN')}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Current Draw Info */}
        {data.current_batch_id && (
          <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
            <h3 className="text-2xl font-bold text-gray-900 mb-6">Current Draw Information</h3>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="border-l-4 border-blue-500 pl-4">
                <p className="text-sm text-gray-500 mb-1">Batch ID</p>
                <p className="text-xl font-semibold text-gray-900">{data.current_batch_id}</p>
              </div>
              <div className="border-l-4 border-purple-500 pl-4">
                <p className="text-sm text-gray-500 mb-1">Your Lucky ID</p>
                <p className="text-xl font-semibold text-gray-900 font-mono">{data.lucky_id || 'N/A'}</p>
              </div>
            </div>
          </div>
        )}

        {/* Eligibility Rules */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
          <h3 className="text-2xl font-bold text-gray-900 mb-6">Eligibility Requirements</h3>
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-1">
                <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-gray-900">Active Subscription</p>
                <p className="text-sm text-gray-600">Subscription must be in PAID status</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-1">
                <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-gray-900">No Overdue Amount</p>
                <p className="text-sm text-gray-600">All EMI payments must be up to date</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-1">
                <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-gray-900">Current Draw</p>
                <p className="text-sm text-gray-600">Draw must be currently active</p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4">
          <Link
            href="/dashboard/customer/lucky-plan/results"
            className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold py-3 rounded-lg transition text-center"
          >
            View Draw Results
          </Link>
          <Link
            href="/dashboard/customer/lucky-plan/history"
            className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-900 font-semibold py-3 rounded-lg transition text-center"
          >
            View Waiver History
          </Link>
        </div>
      </div>
    </div>
  )
}
