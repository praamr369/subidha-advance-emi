"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";
import { apiFetch } from "@/lib/api";

type RetentionSignal = {
  signal_type: string;
  severity: "CRITICAL" | "HIGH" | "WARNING" | "INFO";
  due_date?: string | null;
  subscription_id?: number | null;
  suggested_action?: string;
  risk_band?: string;
};

type CustomerRetentionProfile = {
  customer_id: number;
  as_of: string;
  signal_count: number;
  signals: RetentionSignal[];
  has_critical: boolean;
  has_high: boolean;
};

type RetentionListResponse = {
  results: CustomerRetentionProfile[];
  total: number;
};

const SIGNAL_LABELS: Record<string, string> = {
  OVERDUE_EMI: "Overdue EMI",
  UPCOMING_EMI: "Upcoming EMI",
  HIGH_RISK: "High Risk Flag",
  REJECTED_REQUIRED_DOCUMENT: "Rejected KYC Document",
  RENEWAL_OPPORTUNITY: "Renewal Opportunity",
  PENDING_GROWTH_REQUEST: "Pending Growth Request",
  RENT_LEASE_DEMAND_OVERDUE: "Rent / Lease Overdue",
};

const SEV_STYLE: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-800 border-red-200",
  HIGH: "bg-orange-100 text-orange-700 border-orange-200",
  WARNING: "bg-amber-100 text-amber-700 border-amber-200",
  INFO: "bg-blue-50 text-blue-700 border-blue-100",
};

const SEV_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, WARNING: 2, INFO: 3 };

function severityBadge(sev: string) {
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${SEV_STYLE[sev] ?? "bg-muted text-muted-foreground border-border"}`}>
      {sev}
    </span>
  );
}

function topSeverity(profile: CustomerRetentionProfile): string {
  return profile.has_critical ? "CRITICAL" : profile.has_high ? "HIGH" : "WARNING";
}

export default function CustomerAnalyticsReportPage() {
  const [profiles, setProfiles] = useState<CustomerRetentionProfile[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sevFilter, setSevFilter] = useState<string>("");

  useEffect(() => {
    apiFetch<RetentionListResponse>("/admin/growth/retention/")
      .then((r) => {
        setProfiles(r.results);
        setTotal(r.total);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load customer analytics."))
      .finally(() => setLoading(false));
  }, []);

  // Severity summary counts
  const sevCounts = { CRITICAL: 0, HIGH: 0, WARNING: 0, INFO: 0 };
  for (const p of profiles) {
    const s = topSeverity(p) as keyof typeof sevCounts;
    if (s in sevCounts) sevCounts[s]++;
  }

  // Signal type breakdown
  const signalTypeCounts: Record<string, number> = {};
  for (const p of profiles) {
    for (const sig of p.signals) {
      signalTypeCounts[sig.signal_type] = (signalTypeCounts[sig.signal_type] ?? 0) + 1;
    }
  }
  const sortedTypes = Object.entries(signalTypeCounts).sort((a, b) => b[1] - a[1]);
  const totalSignals = Object.values(signalTypeCounts).reduce((a, b) => a + b, 0);

  // Filtered customer list
  const filtered = sevFilter
    ? profiles.filter((p) => topSeverity(p) === sevFilter)
    : [...profiles].sort((a, b) => SEV_ORDER[topSeverity(a)] - SEV_ORDER[topSeverity(b)]);

  return (
    <ERPPageShell
      title="Customer Analytics"
      subtitle="Retention signals, risk segments, and lifecycle status across all active customers."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Reports", href: ROUTES.admin.reports },
        { label: "Customer analytics" },
      ]}
      actions={[
        { href: ROUTES.admin.growthRetention, label: "Retention Intelligence", variant: "secondary" },
        { href: ROUTES.admin.reportsRevenue, label: "Revenue Report", variant: "secondary" },
        { href: ROUTES.admin.reportsOverdue, label: "Overdue Report", variant: "secondary" },
      ]}
      headerMode="erp"
    >
      {loading ? <ERPLoadingState label="Analysing customer signals…" /> : null}
      {!loading && error ? <ERPErrorState title="Failed to load" description={error} /> : null}

      {!loading && !error && (
        <div className="space-y-5">
          {/* Severity summary */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(["CRITICAL", "HIGH", "WARNING", "INFO"] as const).map((sev) => (
              <button
                key={sev}
                onClick={() => setSevFilter(sevFilter === sev ? "" : sev)}
                className={`rounded-xl border p-3 text-left transition-all hover:shadow-sm ${sevFilter === sev ? "ring-2 ring-primary" : ""} ${
                  sev === "CRITICAL" ? "border-red-200 bg-red-50" :
                  sev === "HIGH" ? "border-orange-200 bg-orange-50" :
                  sev === "WARNING" ? "border-amber-200 bg-amber-50" :
                  "border-blue-100 bg-blue-50"
                }`}
              >
                <div className={`text-xs font-semibold uppercase tracking-wide ${
                  sev === "CRITICAL" ? "text-red-700" :
                  sev === "HIGH" ? "text-orange-700" :
                  sev === "WARNING" ? "text-amber-700" :
                  "text-blue-700"
                }`}>{sev}</div>
                <div className={`mt-1 text-2xl font-bold tabular-nums ${
                  sev === "CRITICAL" ? "text-red-800" :
                  sev === "HIGH" ? "text-orange-800" :
                  sev === "WARNING" ? "text-amber-800" :
                  "text-blue-800"
                }`}>{sevCounts[sev]}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">customer{sevCounts[sev] !== 1 ? "s" : ""}</div>
              </button>
            ))}
          </div>

          <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
            {/* Customer list */}
            <ERPSectionShell
              title={`At-Risk Customers${sevFilter ? ` — ${sevFilter}` : ""} (${filtered.length} of ${total})`}
              description="Sorted by highest severity first. Click 'Open profile' to drill into the individual customer profile."
            >
              {sevFilter ? (
                <button onClick={() => setSevFilter("")} className="mb-3 text-xs font-semibold text-primary hover:underline">
                  ← Clear filter
                </button>
              ) : null}

              {filtered.length === 0 ? (
                <ERPEmptyState
                  title="No customers in this segment"
                  description="All customers in this severity band are in good standing."
                />
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="min-w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="px-4 py-3">Customer ID</th>
                        <th className="px-4 py-3">Severity</th>
                        <th className="px-4 py-3 text-right">Signals</th>
                        <th className="px-4 py-3">Top Signal Types</th>
                        <th className="px-4 py-3">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.slice(0, 100).map((p) => {
                        const topSignals = [...new Set(p.signals.map((s) => s.signal_type))].slice(0, 3);
                        return (
                          <tr key={p.customer_id} className="border-t border-border/60 hover:bg-muted/30/40">
                            <td className="px-4 py-3 font-mono text-xs font-semibold">
                              #{p.customer_id}
                            </td>
                            <td className="px-4 py-3">
                              {severityBadge(topSeverity(p))}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums font-semibold">
                              {p.signal_count}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1">
                                {topSignals.map((st) => (
                                  <span key={st} className="inline-block rounded bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                    {SIGNAL_LABELS[st] ?? st}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <Link
                                href={`${ROUTES.admin.customers}/${p.customer_id}`}
                                className="text-xs font-semibold text-primary hover:underline"
                              >
                                Open profile →
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filtered.length > 100 && (
                    <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
                      Showing first 100 of {filtered.length}. Use Retention Intelligence for full list.
                    </div>
                  )}
                </div>
              )}
            </ERPSectionShell>

            {/* Signal type breakdown */}
            <ERPSectionShell
              title="Signal Breakdown"
              description={`${totalSignals} total signals across ${total} customer${total !== 1 ? "s" : ""}.`}
            >
              {sortedTypes.length === 0 ? (
                <ERPEmptyState title="No signals" description="No retention signals active." />
              ) : (
                <div className="space-y-2">
                  {sortedTypes.map(([type, count]) => {
                    const pct = totalSignals > 0 ? Math.round((count / totalSignals) * 100) : 0;
                    return (
                      <div key={type}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-medium text-foreground">{SIGNAL_LABELS[type] ?? type}</span>
                          <span className="tabular-nums text-muted-foreground">{count} ({pct}%)</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              type.includes("OVERDUE") || type === "HIGH_RISK" ? "bg-red-400" :
                              type === "REJECTED_REQUIRED_DOCUMENT" ? "bg-amber-400" :
                              type === "RENEWAL_OPPORTUNITY" ? "bg-emerald-400" :
                              "bg-blue-400"
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-4 rounded-xl border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                Signals are advisory only. No payment, EMI, or subscription record is created or mutated from this page. Use
                {" "}<a href={ROUTES.admin.growthRetention} className="font-medium text-primary hover:underline">Retention Intelligence</a> to see the full retention workspace.
              </div>
            </ERPSectionShell>
          </div>
        </div>
      )}
    </ERPPageShell>
  );
}
