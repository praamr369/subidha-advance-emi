"use client";

import Link from "next/link";
import { Search, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";

import ERPSectionShell from "@/components/erp/ERPSectionShell";
import {
  serviceControlResolve,
  serviceControlSearch,
  type ControlSearchResponse,
  type ControlSearchRow,
  type IssueTimeline,
} from "@/services/service-desk";

const ANCHOR_KINDS = new Set(["customer", "direct_sale", "contract"]);

function Amount({ value }: { value: string | null }) {
  if (!value) return null;
  return <span className="tabular-nums">₹{value}</span>;
}

function ResultRow({
  row,
  onResolve,
}: {
  row: ControlSearchRow;
  onResolve: (row: ControlSearchRow) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm">
      <div className="min-w-0">
        <Link href={row.href} className="font-medium text-primary hover:underline">
          {row.label}
        </Link>
        {row.sublabel ? (
          <p className="truncate text-xs text-muted-foreground">{row.sublabel}</p>
        ) : null}
        {(row.customer_name || row.customer_phone) && (
          <p className="truncate text-xs text-muted-foreground">
            {row.customer_name} {row.customer_phone ? `· ${row.customer_phone}` : ""}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
        {row.status ? (
          <span className="rounded-full border border-border px-2 py-0.5">{row.status}</span>
        ) : null}
        <Amount value={row.amount} />
        {ANCHOR_KINDS.has(row.kind) ? (
          <button
            type="button"
            onClick={() => onResolve(row)}
            className="rounded-md border border-primary px-2 py-1 text-primary transition hover:bg-primary hover:text-primary-foreground"
          >
            Issue history
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ActionLauncher({ anchor }: { anchor: ControlSearchRow }) {
  const actions: { label: string; href: string }[] = [];
  if (anchor.kind === "customer") {
    actions.push(
      { label: "New service case", href: "/admin/service-desk/cases" },
      { label: "Warranty claim", href: "/admin/warranty/claims" },
      { label: "Returns / exchange", href: "/admin/service-desk/returns" },
      { label: "Open customer", href: `/admin/customers/${anchor.id}` },
    );
  } else if (anchor.kind === "direct_sale") {
    actions.push(
      { label: "Return / exchange / void", href: "/admin/billing/direct-sale" },
      { label: "New service case", href: "/admin/service-desk/cases" },
    );
  } else if (anchor.kind === "contract") {
    actions.push(
      { label: "New service case", href: "/admin/service-desk/cases" },
      { label: "Open contract", href: `/admin/subscriptions/${anchor.id}` },
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a) => (
        <Link
          key={a.label}
          href={a.href}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-sm transition hover:border-primary hover:text-primary"
        >
          {a.label}
        </Link>
      ))}
    </div>
  );
}

function TimelineList({ title, rows }: { title: string; rows: ControlSearchRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {rows.map((row) => (
        <div key={`${row.kind}-${row.id}`} className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm">
          <Link href={row.href} className="text-primary hover:underline">
            {row.label}
          </Link>
          <span className="text-xs text-muted-foreground">{row.status ?? row.sublabel}</span>
        </div>
      ))}
    </div>
  );
}

export default function ServiceControlCenter() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ControlSearchResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<ControlSearchRow | null>(null);
  const [timeline, setTimeline] = useState<IssueTimeline | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) {
      setResults(null);
      return;
    }
    setSearching(true);
    setError(null);
    try {
      setResults(await serviceControlSearch(q));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  }, [query]);

  const resolveAnchor = useCallback(async (row: ControlSearchRow) => {
    setAnchor(row);
    setTimeline(null);
    setTimelineLoading(true);
    try {
      const params =
        row.kind === "customer"
          ? { customer: row.id }
          : row.kind === "direct_sale"
            ? { direct_sale: row.id }
            : { subscription: row.id };
      setTimeline(await serviceControlResolve(params));
    } catch {
      setTimeline(null);
    } finally {
      setTimelineLoading(false);
    }
  }, []);

  return (
    <ERPSectionShell
      title="Unified Control Center"
      description="Find any customer product issue — service, warranty, return, exchange, void, cancel — by customer name/phone, sales ID, service ID, return ID, or contract ID."
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void runSearch();
        }}
        className="flex items-center gap-2"
      >
        <div className="flex flex-1 items-center gap-2 rounded-md border border-border bg-card px-3">
          <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Customer name / phone, SALE/FY…, case no, contract no, return no…"
            className="h-10 flex-1 bg-transparent text-sm outline-none"
            aria-label="Unified control center search"
          />
        </div>
        <button
          type="submit"
          disabled={searching}
          className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {searching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Search
        </button>
      </form>

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      {results ? (
        <div className="mt-4 space-y-4">
          {results.total === 0 ? (
            <p className="text-sm text-muted-foreground">
              No records matched “{results.query}”.
            </p>
          ) : (
            results.groups.map((group) => (
              <div key={group.kind} className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.label} ({group.results.length})
                </p>
                <div className="space-y-2">
                  {group.results.map((row) => (
                    <ResultRow key={`${row.kind}-${row.id}`} row={row} onResolve={resolveAnchor} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      ) : null}

      {anchor ? (
        <div className="mt-6 space-y-4 rounded-lg border border-border bg-muted/30 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">{anchor.label}</p>
              <p className="text-xs text-muted-foreground">
                {anchor.customer_name} {anchor.customer_phone ? `· ${anchor.customer_phone}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setAnchor(null);
                setTimeline(null);
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </div>
          <ActionLauncher anchor={anchor} />
          {timelineLoading ? (
            <p className="text-sm text-muted-foreground">Loading issue history…</p>
          ) : timeline ? (
            <div className="space-y-4">
              <TimelineList title="Service cases" rows={timeline.service_cases} />
              <TimelineList title="Warranty claims" rows={timeline.warranty_claims} />
              <TimelineList title="Returns / notes" rows={timeline.returns} />
              {timeline.service_cases.length === 0 &&
              timeline.warranty_claims.length === 0 &&
              timeline.returns.length === 0 ? (
                <p className="text-sm text-muted-foreground">No product issues recorded yet.</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </ERPSectionShell>
  );
}
