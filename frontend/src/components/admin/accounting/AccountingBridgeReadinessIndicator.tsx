"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ROUTES } from "@/lib/routes";
import {
  getAccountingBridgeReadiness,
  type AccountingBridgeReadinessEvent,
} from "@/services/accounting-bridge-readiness";

type AccountingBridgeReadinessIndicatorProps = {
  title: string;
  eventKeys: string[];
};

function readinessTone(events: AccountingBridgeReadinessEvent[]): string {
  const statuses = new Set(events.map((event) => event.status));
  if (statuses.has("ERROR") || statuses.has("NOT_CONFIGURED")) return "border-red-200 bg-red-50 text-red-900";
  if (statuses.has("WARNING")) return "border-amber-200 bg-amber-50 text-amber-950";
  return "border-emerald-200 bg-emerald-50 text-emerald-900";
}

export default function AccountingBridgeReadinessIndicator({
  title,
  eventKeys,
}: AccountingBridgeReadinessIndicatorProps) {
  const [events, setEvents] = useState<AccountingBridgeReadinessEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const eventKey = eventKeys.join("|");

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const payload = await getAccountingBridgeReadiness();
        if (!mounted) return;
        const wanted = new Set(eventKey.split("|").filter(Boolean));
        setEvents(payload.events.filter((event) => wanted.has(event.event_key)));
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Bridge readiness unavailable.");
      }
    }

    void load();
    return () => {
      mounted = false;
    };
  }, [eventKey]);

  const statusLabel = useMemo(() => {
    if (error) return "Unavailable";
    if (!events.length) return "Checking";
    if (events.some((event) => event.status === "ERROR" || event.status === "NOT_CONFIGURED")) return "Blocked";
    if (events.some((event) => event.status === "WARNING")) return "Needs review";
    return "Ready";
  }, [error, events]);

  const blockers = events.flatMap((event) => event.blocking_reasons.map((reason) => `${event.label}: ${reason}`));

  return (
    <section className="rounded-lg border border-border bg-card p-4 text-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Accounting bridge readiness</div>
          <div className="mt-1 font-semibold text-foreground">{title}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Readiness only. No journal posting or receipt generation is available from this indicator.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${error || !events.length ? "border-slate-200 bg-slate-50 text-slate-900" : readinessTone(events)}`}>
            {statusLabel}
          </span>
          <Link href={ROUTES.admin.accountingBridges} className="text-xs font-semibold text-primary hover:underline">
            View bridge page
          </Link>
        </div>
      </div>
      {error ? <p className="mt-3 text-xs text-red-800">{error}</p> : null}
      {!error && blockers.length ? (
        <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
          {blockers.slice(0, 3).map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
