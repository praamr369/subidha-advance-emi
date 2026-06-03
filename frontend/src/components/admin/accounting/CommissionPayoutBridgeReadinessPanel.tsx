"use client";

import { useEffect, useMemo, useState } from "react";

import {
  getAccountingBridgeReadiness,
  type AccountingBridgeReadinessEvent,
} from "@/services/accounting-bridge-readiness";

type Props = {
  title: string;
  description: string;
  eventKeys: string[];
};

function tone(status: string): string {
  const value = status.toUpperCase();
  if (value === "READY") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (value === "INFO") return "border-blue-200 bg-blue-50 text-blue-900";
  if (value === "WARNING") return "border-amber-200 bg-amber-50 text-amber-950";
  return "border-red-200 bg-red-50 text-red-900";
}

export default function CommissionPayoutBridgeReadinessPanel({ title, description, eventKeys }: Props) {
  const [events, setEvents] = useState<AccountingBridgeReadinessEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const payload = await getAccountingBridgeReadiness();
        if (!cancelled) setEvents(payload.events ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load readiness.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleEvents = useMemo(() => {
    return eventKeys
      .map((key) => events.find((event) => event.event_key === key))
      .filter(Boolean) as AccountingBridgeReadinessEvent[];
  }, [eventKeys, events]);

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Accounting bridge readiness</p>
          <h2 className="mt-1 text-base font-semibold text-foreground">{title}</h2>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        <span className="inline-flex w-fit rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-900">
          Read-only
        </span>
      </div>

      {loading ? <div className="mt-4 text-sm text-muted-foreground">Loading readiness...</div> : null}
      {!loading && error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</div> : null}
      {!loading && !error && visibleEvents.length === 0 ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          No matching readiness events are exposed by the backend.
        </div>
      ) : null}

      {!loading && !error && visibleEvents.length > 0 ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {visibleEvents.map((event) => (
            <article key={event.event_key} className="rounded-xl border border-border bg-background p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-foreground">{event.label}</div>
                  <div className="mt-1 font-mono text-xs text-muted-foreground">{event.event_key}</div>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${tone(event.status)}`}>
                  {event.status}
                </span>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                <div><span className="font-semibold text-foreground">Debit:</span> {(event.debit_requirements ?? []).join(", ") || "Not specified"}</div>
                <div><span className="font-semibold text-foreground">Credit:</span> {(event.credit_requirements ?? []).join(", ") || "Not specified"}</div>
                <div><span className="font-semibold text-foreground">Mode:</span> {event.posting_mode}</div>
                <div><span className="font-semibold text-foreground">Posting action:</span> Not available here</div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {event.blocking_reasons[0] || "No blocking reasons reported."}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">{event.operator_action}</p>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
