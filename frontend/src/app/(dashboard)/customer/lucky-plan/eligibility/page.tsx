'use client'

import { useEffect, useState } from 'react'
import { luckyPlanService, type EligibilityResponse } from '@/services/lucky-plan'
import Link from 'next/link'
import CustomerPageShell from '@/components/layout/CustomerPageShell'
import ERPLoadingState from '@/components/erp/ERPLoadingState'
import ERPErrorState from '@/components/erp/ERPErrorState'
import { CheckCircle2, XCircle, AlertCircle, ShieldCheck, Star } from 'lucide-react'

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

  const isEligible = data?.is_eligible ?? false

  return (
    <CustomerPageShell
      title="Benefit Eligibility"
      subtitle="Verify your eligibility for upcoming SFEMI promotional benefit selection"
      backHref="/customer"
      backLabel="Dashboard"
    >
      {loading ? <ERPLoadingState label="Checking your eligibility..." /> : null}

      {!loading && error ? (
        <ERPErrorState
          title="Could not check eligibility"
          description={error}
          onRetry={() => {
            setError(null)
            setLoading(true)
            luckyPlanService.checkEligibility().then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false))
          }}
        />
      ) : null}

      {!loading && !error && data ? (
        <div className="space-y-4">
          {/* Main Eligibility Card */}
          <div
            className={`rounded-2xl border-2 p-4 shadow-sm ${
              isEligible
                ? 'border-emerald-300 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-950/30'
                : 'border-red-300 bg-red-50/70 dark:border-red-800 dark:bg-red-950/30'
            }`}
          >
            <div className="flex items-start gap-3.5">
              <div
                className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${
                  isEligible
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                    : 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
                }`}
              >
                {isEligible ? <CheckCircle2 className="size-6" /> : <XCircle className="size-6" />}
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className={`text-lg font-black tracking-tight ${
                    isEligible
                      ? 'text-emerald-900 dark:text-emerald-200'
                      : 'text-red-900 dark:text-red-200'
                  }`}
                >
                  {isEligible ? 'You Are Eligible!' : 'Not Eligible for Benefit'}
                </div>
                {data.reason ? (
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    {data.reason}
                  </p>
                ) : null}

                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/60 pt-3 text-xs">
                  <div>
                    <span className="text-muted-foreground">Status</span>
                    <div className="font-bold text-foreground capitalize mt-0.5">{data.subscription_status}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total Paid</span>
                    <div className="font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">
                      ₹{data.paid_amount.toLocaleString('en-IN')}
                    </div>
                  </div>
                  {data.overdue_amount > 0 ? (
                    <div>
                      <span className="text-muted-foreground">Overdue</span>
                      <div className="font-bold text-red-600 mt-0.5">
                        ₹{data.overdue_amount.toLocaleString('en-IN')}
                      </div>
                    </div>
                  ) : null}
                  {data.lucky_id ? (
                    <div>
                      <span className="text-muted-foreground">SFEMI ID</span>
                      <div className="font-mono font-bold text-foreground mt-0.5">{data.lucky_id}</div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          {/* Current Batch Information */}
          {data.current_batch_id ? (
            <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
              <h3 className="text-sm font-bold text-foreground mb-2 flex items-center gap-1.5">
                <Star className="size-4 text-primary" /> Current Batch Information
              </h3>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl border border-border/70 p-3 bg-muted/20">
                  <span className="text-muted-foreground">Batch ID</span>
                  <div className="text-base font-bold text-foreground mt-0.5">{data.current_batch_id}</div>
                </div>
                <div className="rounded-xl border border-border/70 p-3 bg-muted/20">
                  <span className="text-muted-foreground">Active SFEMI ID</span>
                  <div className="text-base font-bold font-mono text-primary mt-0.5">{data.lucky_id || '—'}</div>
                </div>
              </div>
            </div>
          ) : null}

          {/* Requirements Checklist */}
          <div className="rounded-2xl border border-border bg-card p-4 shadow-xs space-y-3">
            <h3 className="text-sm font-bold text-foreground">Eligibility Requirements</h3>
            <div className="space-y-2.5 text-xs">
              <div className="flex items-start gap-2.5">
                <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 mt-0.5">
                  <CheckCircle2 className="size-3.5" />
                </div>
                <div>
                  <div className="font-bold text-foreground">Active SFEMI Contract</div>
                  <div className="text-muted-foreground">Subscription must be in active running status.</div>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 mt-0.5">
                  <CheckCircle2 className="size-3.5" />
                </div>
                <div>
                  <div className="font-bold text-foreground">Zero Overdue EMIs</div>
                  <div className="text-muted-foreground">All monthly payments must be cleared on or before the due date.</div>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 mt-0.5">
                  <CheckCircle2 className="size-3.5" />
                </div>
                <div>
                  <div className="font-bold text-foreground">Active Batch Cycle</div>
                  <div className="text-muted-foreground">The batch must have an active promotional benefit event scheduled.</div>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Buttons */}
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <Link
              href="/customer/lucky-plan/lucky-id"
              className="flex min-h-12 items-center justify-center rounded-xl bg-card border border-border px-3 text-xs font-bold text-foreground shadow-xs transition hover:bg-muted active:scale-[0.98]"
            >
              My SFEMI ID
            </Link>
            <Link
              href="/customer/lucky-draws"
              className="flex min-h-12 items-center justify-center rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground shadow-xs transition hover:bg-primary/90 active:scale-[0.98]"
            >
              Benefit Results
            </Link>
          </div>
        </div>
      ) : null}
    </CustomerPageShell>
  )
}
