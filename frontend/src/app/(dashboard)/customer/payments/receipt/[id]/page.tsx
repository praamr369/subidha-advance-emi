'use client'

import { useEffect, useState } from 'react'
import { paymentService, Receipt } from '@/services/payments'
import { useParams } from 'next/navigation'
import Link from 'next/link'

export default function ReceiptPage() {
  const params = useParams()
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchReceipt = async () => {
      try {
        setLoading(true)
        const data = await paymentService.getReceipt(params.id as string)
        setReceipt(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch receipt')
      } finally {
        setLoading(false)
      }
    }

    fetchReceipt()
  }, [params.id])

  const handleDownload = async () => {
    try {
      await paymentService.downloadReceipt(params.id as string)
    } catch (err) {
      console.error('Download failed:', err)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (error || !receipt) {
    return (
      <div className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-lg p-8 text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Error</h1>
          <p className="text-gray-600 mb-6">{error || 'Receipt not found'}</p>
          <Link href="/dashboard/customer/payments/history" className="text-blue-600 hover:underline">
            Back to Payment History
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6 md:p-12">
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-xl p-8 md:p-12">
        {/* Receipt Header */}
        <div className="border-b-2 border-gray-200 pb-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">RECEIPT</h1>
              <p className="text-gray-500 text-sm"># {receipt.id.slice(0, 8).toUpperCase()}</p>
            </div>
            <div className="text-right">
              <p className="text-gray-600">Subidha Furniture</p>
              <p className="text-sm text-gray-500">Subscription Payments</p>
            </div>
          </div>
        </div>

        {/* Receipt Details */}
        <div className="grid md:grid-cols-2 gap-8 mb-8">
          {/* Transaction Details */}
          <div>
            <h3 className="text-sm font-bold text-gray-900 uppercase mb-4">Transaction Details</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Date:</span>
                <span className="font-semibold text-gray-900">
                  {new Date(receipt.date).toLocaleDateString('en-IN', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Payment Method:</span>
                <span className="font-semibold text-gray-900 uppercase">{receipt.method}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Reference ID:</span>
                <span className="font-semibold text-gray-900 font-mono">{receipt.reference_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Status:</span>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800">
                  ✓ Completed
                </span>
              </div>
            </div>
          </div>

          {/* Customer Details */}
          <div>
            <h3 className="text-sm font-bold text-gray-900 uppercase mb-4">Payment From</h3>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-gray-600">Name:</p>
                <p className="font-semibold text-gray-900">{receipt.customer_name}</p>
              </div>
              <div>
                <p className="text-gray-600">Email:</p>
                <p className="font-semibold text-gray-900">{receipt.customer_email}</p>
              </div>
              <div>
                <p className="text-gray-600">Phone:</p>
                <p className="font-semibold text-gray-900">{receipt.customer_phone}</p>
              </div>
              <div>
                <p className="text-gray-600">Subscription:</p>
                <p className="font-semibold text-gray-900 font-mono">{receipt.subscription_id}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Amount Box */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg p-6 mb-8">
          <p className="text-gray-600 text-sm mb-2">Payment Amount</p>
          <p className="text-4xl font-bold text-blue-600">₹{receipt.amount.toLocaleString('en-IN')}</p>
        </div>

        {/* Verification Reference */}
        <div className="border-t-2 border-b-2 border-gray-200 py-6 mb-8">
          <p className="text-sm font-semibold text-gray-900 mb-2">Verification Reference</p>
          <p className="text-xs text-gray-500 mb-3">Use this receipt ID to verify this payment with Subidha Furniture staff or at the branch.</p>
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 font-mono text-sm text-gray-800 break-all select-all">
            {receipt.id}
          </div>
        </div>

        {/* Footer Notes */}
        <div className="bg-gray-50 rounded-lg p-4 mb-8 border border-gray-200">
          <p className="text-xs text-gray-600 leading-relaxed">
            This receipt is a digital record of your payment. For any queries, contact our support team. 
            Please keep this receipt for your records. The amount reflected is final and all taxes (if applicable) are included.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4">
          <button
            onClick={handleDownload}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download PDF
          </button>
          <Link
            href="/dashboard/customer/payments/history"
            className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-900 font-semibold py-3 rounded-lg transition text-center"
          >
            Back to History
          </Link>
        </div>
      </div>
    </div>
  )
}
