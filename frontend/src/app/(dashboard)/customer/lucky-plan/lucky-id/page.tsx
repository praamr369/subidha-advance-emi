'use client'

import { useEffect, useState } from 'react'
import { luckyPlanService, type LuckyIDTracker } from '@/services/lucky-plan'
import Link from 'next/link'
import CustomerPageShell, { CPageCard, CPageSection } from '@/components/layout/CustomerPageShell'
import ERPLoadingState from '@/components/erp/ERPLoadingState'
import ERPErrorState from '@/components/erp/ERPErrorState'
import { Star, Clock, Gift, ShieldCheck, Sparkles, ArrowRight } from 'lucide-react'

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
        setError(err instanceof Error ? err.message : 'Failed to fetch SFEMI ID info')
      } finally {
        setLoading(false)
      }
    }

    fetchTracker()
  }, [])

  const calculateDaysUntilDraw = () => {
    if (!tracker?.next_draw_date) return 0
    const drawDate = new Date(tracker.next_draw_date)
    const today = new Date()
    const days = Math.ceil((drawDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    return Math.max(0, days)
  }

  const daysUntil = calculateDaysUntilDraw()

  return (
    <CustomerPageShell
      title="My SFEMI ID"
      subtitle="Track your promotional benefit identity and draw cycle"
      backHref="/customer"
      backLabel="Dashboard"
    >
      {loading ? <ERPLoadingState label="Loading SFEMI ID details..." /> : null}

      {!loading && error ? (
        <ERPErrorState
          title="Could not load SFEMI ID"
          description={error}
          onRetry={() => {
            setError(null)
            setLoading(true)
            luckyPlanService.getLuckyIDTracker().then(setTracker).catch((e) => setError(e.message)).finally(() => setLoading(false))
          }}
        />
      ) : null}

      {!loading && !error && tracker ? (
        <div className="space-y-4">
          {/* Current SFEMI ID Hero Card */}
          <div className="overflow-hidden rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/10 via-purple-50/50 to-card dark:from-primary/20 dark:via-purple-950/30 dark:to-card p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/20 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-primary">
                <Star className="size-3.5 fill-primary" /> Active SFEMI ID
              </span>
              <span className="text-xs font-semibold text-muted-foreground">
                Batch: {tracker.batch_name}
              </span>
            </div>

            <div className="mt-3 text-center py-2">
              <p className="text-4xl font-black font-mono tracking-tight text-foreground">
                {tracker.current_lucky_id}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Allocated on {new Date(tracker.allocated_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </p>
            </div>

            {/* Countdown Banner */}
            <div className="mt-3 flex items-center justify-between rounded-xl bg-card border border-border/80 px-4 py-3 shadow-xs">
              <div className="flex items-center gap-2">
                <Clock className="size-4 text-primary" />
                <span className="text-xs font-bold text-foreground">Next Benefit Cycle</span>
              </div>
              <div className="text-right">
                <span className="text-lg font-black text-primary">{daysUntil}</span>
                <span className="text-xs text-muted-foreground ml-1">days left</span>
              </div>
            </div>
          </div>

          {/* Benefit Odds */}
          {tracker.win_probability !== undefined && (
            <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-foreground">Benefit Odds</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    1 recipient per batch · fixed by active eligible participants
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-xl font-black text-primary">
                    {(tracker.win_probability * 100).toFixed(2)}%
                  </div>
                  <div className="text-[10px] text-muted-foreground">odds</div>
                </div>
              </div>
            </div>
          )}

          {/* SFEMI ID History */}
          {tracker.previous_lucky_ids && tracker.previous_lucky_ids.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-foreground">SFEMI ID History</h3>
              <div className="space-y-2">
                {tracker.previous_lucky_ids.map((id, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3.5 shadow-xs"
                  >
                    <div>
                      <div className="font-mono font-bold text-base text-foreground">{id.lucky_id}</div>
                      <div className="text-xs text-muted-foreground">
                        {id.batch_name} · {new Date(id.allocated_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </div>
                    </div>
                    <div>
                      {id.draw_result === 'WON' ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                          Benefit Recipient
                        </span>
                      ) : id.draw_result === 'DRAWN' ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                          Selected
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                          Not Selected
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* How It Works */}
          <div className="rounded-2xl border border-border bg-card p-4 shadow-xs space-y-3">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
              <Sparkles className="size-4 text-primary" /> How SFEMI Benefit Works
            </h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl border border-border/70 p-2.5 bg-muted/20">
                <div className="font-bold text-primary mb-1">1. Keep Paid</div>
                <div className="text-muted-foreground">Pay monthly EMIs on time to keep your SFEMI ID active.</div>
              </div>
              <div className="rounded-xl border border-border/70 p-2.5 bg-muted/20">
                <div className="font-bold text-primary mb-1">2. Monthly Cycle</div>
                <div className="text-muted-foreground">Eligible IDs enter the monthly promotional benefit cycle.</div>
              </div>
              <div className="rounded-xl border border-border/70 p-2.5 bg-muted/20">
                <div className="font-bold text-primary mb-1">3. Benefit Awarded</div>
                <div className="text-muted-foreground">Selected recipient gets remaining future EMIs fully waived.</div>
              </div>
              <div className="rounded-xl border border-border/70 p-2.5 bg-muted/20">
                <div className="font-bold text-primary mb-1">4. Delivery</div>
                <div className="text-muted-foreground">Product delivery proceeds as per your contract schedule.</div>
              </div>
            </div>
          </div>

          {/* Action Links */}
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <Link
              href="/customer/lucky-plan/eligibility"
              className="flex min-h-12 items-center justify-center rounded-xl bg-card border border-border px-3 text-xs font-bold text-foreground shadow-xs transition hover:bg-muted active:scale-[0.98]"
            >
              Check Eligibility
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
