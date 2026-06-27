"use client";

import { useCallback, useEffect, useState } from "react";

import {
  fetchCustomerTimeline,
  type CustomerTimelineEvent,
  type CustomerTimelineResponse,
} from "@/services/customer-intelligence";

type Props = {
  customerId: number;
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

function severityClasses(severity: string): string {
  if (severity === "CRITICAL") return "border-red-300 bg-red-50 text-red-800";
  if (severity === "HIGH") return "border-red-200 bg-red-50 text-red-700";
  if (severity === "WARNING") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-border bg-muted/30 text-muted-foreground";
}

function SeverityBadge({ severity }: { severity: string }) {
  const classes = severityClasses(severity);
  return (
    <span className={`inline-flex rounded border px-2 py-0.5 text-[11px] font-semibold ${classes}`}>
      {severity}
    </span>
  );
}

function TimelineEventRow({ event }: { event: CustomerTimelineEvent }) {
  return (
    <div
      className="rounded-xl border border-border bg-background p-4"
      data-testid="timeline-event-row"
      data-event-type={event.event_type}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">{event.title}</span>
            <SeverityBadge severity={event.severity} />
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {event.event_type}
            {event.source_model ? ` · ${event.source_model}` : ""}
            {event.status ? ` · ${event.status}` : ""}
          </div>
          {event.description && (
            <div className="mt-1.5 text-xs text-muted-foreground">{event.description}</div>
          )}
        </div>
        <div className="text-right text-xs text-muted-foreground whitespace-nowrap">
          {formatDateTime(event.event_date)}
        </div>
      </div>
    </div>
  );
}

export function CustomerTimelinePanel({ customerId }: Props) {
  const [data, setData] = useState<CustomerTimelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchCustomerTimeline(customerId, { ordering: "desc", limit: 50 });
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load timeline.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div
        className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
        data-testid="customer-timeline-loading"
      >
        Loading customer timeline...
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        data-testid="customer-timeline-error"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>Timeline unavailable: {error}</span>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center rounded-md border border-amber-300 bg-card px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-50"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const events = Array.isArray(data?.results) ? data.results : [];

  if (!data || events.length === 0) {
    return (
      <div
        className="rounded-xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground"
        data-testid="customer-timeline-empty"
      >
        No timeline events recorded for this customer yet.
      </div>
    );
  }

  return (
    <div data-testid="customer-timeline-panel">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          {data.count} event{data.count !== 1 ? "s" : ""} · newest first
          {data.count > 50 ? " · showing 50 most recent" : ""}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Refresh
        </button>
      </div>
      <div className="space-y-2">
        {events.map((event) => (
          <TimelineEventRow key={event.event_id} event={event} />
        ))}
      </div>
    </div>
  );
}
