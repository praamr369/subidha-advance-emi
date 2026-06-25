"use client";

import { useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import { apiFetch } from "@/lib/api";

interface VarianceRow {
  id: number;
  close_no: string;
  business_date: string;
  cashier_id: number;
  system_cash_total: string;
  counted_cash: string;
  variance: string;
  abs_variance: string;
  status: string;
}

interface VarianceListResult {
  threshold: string;
  total_breaches: number;
  results: VarianceRow[];
}

interface EscalateResult {
  escalated: boolean;
  close_id: number;
  close_no: string;
  variance: string;
  notify_email: string;
  message: string;
}

export default function CashierVariancePage() {
  const [threshold, setThreshold] = useState("500");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [data, setData] = useState<VarianceListResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [notifyEmail, setNotifyEmail] = useState("");
  const [escalateNotes, setEscalateNotes] = useState("");
  const [escalating, setEscalating] = useState<number | null>(null);
  const [escalateResults, setEscalateResults] = useState<Record<number, EscalateResult>>({});
  const [escalateErrors, setEscalateErrors] = useState<Record<number, string>>({});

  const handleLoad = async () => {
    setError("");
    setData(null);
    setEscalateResults({});
    setEscalateErrors({});
    setLoading(true);
    try {
      const q = new URLSearchParams({ threshold });
      if (dateFrom) q.set("date_from", dateFrom);
      if (dateTo) q.set("date_to", dateTo);
      const result: VarianceListResult = await apiFetch(`/admin/cashier/variance/?${q}`);
      setData(result);
    } catch {
      setError("Failed to load variance data.");
    } finally {
      setLoading(false);
    }
  };

  const handleEscalate = async (closeId: number) => {
    setEscalating(closeId);
    setEscalateErrors(prev => ({ ...prev, [closeId]: "" }));
    try {
      const result: EscalateResult = await apiFetch(
        `/admin/cashier/day-closes/${closeId}/escalate/`,
        {
          method: "POST",
          body: JSON.stringify({
            notify_email: notifyEmail || undefined,
            notes: escalateNotes || undefined,
          }),
        }
      );
      setEscalateResults(prev => ({ ...prev, [closeId]: result }));
    } catch {
      setEscalateErrors(prev => ({ ...prev, [closeId]: "Escalation failed." }));
    } finally {
      setEscalating(null);
    }
  };

  const varianceColor = (v: string) => {
    const n = parseFloat(v);
    if (n < -200) return "text-red-600";
    if (n < 0) return "text-orange-500";
    if (n > 200) return "text-red-600";
    if (n > 0) return "text-yellow-500";
    return "text-green-600";
  };

  const absVarianceBadgeColor = (abs: string) => {
    const n = parseFloat(abs);
    if (n >= 1000) return "bg-red-100 text-red-700 border-red-300";
    if (n >= 500) return "bg-orange-100 text-orange-700 border-orange-300";
    return "bg-yellow-100 text-yellow-700 border-yellow-300";
  };

  return (
    <ERPPageShell
      eyebrow="Finance · Settlements"
      title="Cashier Variance Monitor"
      subtitle="List day-close records where cash variance exceeds the threshold. Send escalation emails to management."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Settlements", href: ROUTES.admin.settlements },
        { label: "Cashier Variance" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
      stats={[
        { label: "Threshold", value: data ? `₹${Number(data.threshold).toLocaleString("en-IN")}` : `₹${Number(threshold).toLocaleString("en-IN")}`, tone: "default" },
        { label: "Breaches", value: data ? data.total_breaches : "—", tone: data && data.total_breaches > 0 ? "danger" : "success" },
        { label: "Records Shown", value: data ? data.results.length : "—", tone: "info" },
      ]}
    >

      {/* Filters */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="font-semibold">Filter</h2>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Variance Threshold (₹)</label>
            <input
              type="number"
              value={threshold}
              onChange={e => setThreshold(e.target.value)}
              className="w-32 h-9 rounded-xl border border-border bg-background px-3 text-sm"
              placeholder="500"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Date From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="h-9 rounded-xl border border-border bg-background px-3 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Date To</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="h-9 rounded-xl border border-border bg-background px-3 text-sm"
            />
          </div>
          <button
            onClick={() => void handleLoad()}
            disabled={loading}
            className="h-9 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
          >
            {loading ? "Loading…" : "Load Breaches"}
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {/* Escalation config (shown once data is loaded) */}
      {data && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <h2 className="font-semibold">Escalation Settings</h2>
          <p className="text-xs text-muted-foreground">These apply to all escalation emails sent from this page.</p>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-52">
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Notify Email (optional — uses ADMIN_EMAIL if blank)</label>
              <input
                type="email"
                value={notifyEmail}
                onChange={e => setNotifyEmail(e.target.value)}
                placeholder="manager@company.com"
                className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm"
              />
            </div>
            <div className="flex-1 min-w-52">
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Notes (optional — included in email)</label>
              <input
                type="text"
                value={escalateNotes}
                onChange={e => setEscalateNotes(e.target.value)}
                placeholder="Please investigate this variance…"
                className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm"
              />
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {data && (
        <div className="rounded-xl border border-border bg-card">
          {/* Summary header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div>
              <h2 className="font-semibold">Variance Breaches</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {data.total_breaches} record{data.total_breaches !== 1 ? "s" : ""} with |variance| ≥ ₹{data.threshold}
              </p>
            </div>
            <div className={`text-2xl font-bold ${data.total_breaches > 0 ? "text-red-600" : "text-green-600"}`}>
              {data.total_breaches}
            </div>
          </div>

          {data.total_breaches === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-muted-foreground">
              No variance breaches found for the selected filters. All day-closes are within threshold.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {data.results.map(row => {
                const escalated = escalateResults[row.id];
                const escalateErr = escalateErrors[row.id];
                const isBusy = escalating === row.id;

                return (
                  <div key={row.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-4">
                      {/* Left: close info */}
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{row.close_no}</span>
                          <span className="text-xs text-muted-foreground">{row.business_date}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${absVarianceBadgeColor(row.abs_variance)}`}>
                            |Variance| ₹{row.abs_variance}
                          </span>
                          <span className="text-xs text-muted-foreground bg-muted/40 px-2 py-0.5 rounded-full">{row.status}</span>
                        </div>

                        {/* Cash breakdown */}
                        <div className="grid grid-cols-3 gap-3">
                          <div className="bg-muted/20 rounded-xl p-3 text-center">
                            <div className="text-xs text-muted-foreground mb-1">System Total</div>
                            <div className="font-semibold text-sm">₹{parseFloat(row.system_cash_total).toLocaleString("en-IN")}</div>
                          </div>
                          <div className="bg-muted/20 rounded-xl p-3 text-center">
                            <div className="text-xs text-muted-foreground mb-1">Counted Cash</div>
                            <div className="font-semibold text-sm">₹{parseFloat(row.counted_cash).toLocaleString("en-IN")}</div>
                          </div>
                          <div className="bg-muted/20 rounded-xl p-3 text-center">
                            <div className="text-xs text-muted-foreground mb-1">Variance</div>
                            <div className={`font-bold text-sm ${varianceColor(row.variance)}`}>
                              {parseFloat(row.variance) > 0 ? "+" : ""}₹{parseFloat(row.variance).toLocaleString("en-IN")}
                            </div>
                          </div>
                        </div>

                        {/* Escalation result */}
                        {escalated && (
                          <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                            ✓ {escalated.message} (Ref: {escalated.close_no})
                          </div>
                        )}
                        {escalateErr && (
                          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                            {escalateErr}
                          </div>
                        )}
                      </div>

                      {/* Right: escalate button */}
                      <div className="shrink-0">
                        <button
                          onClick={() => void handleEscalate(row.id)}
                          disabled={isBusy || !!escalated}
                          className={`h-9 px-4 rounded-xl text-sm font-semibold transition-colors ${
                            escalated
                              ? "bg-green-100 text-green-700 cursor-default"
                              : "bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                          }`}
                        >
                          {isBusy ? "Sending…" : escalated ? "Escalated ✓" : "Escalate"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </ERPPageShell>
  );
}
