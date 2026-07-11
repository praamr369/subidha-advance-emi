"use client";

import { useEffect, useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { apiFetch } from "@/lib/api";

type DaySummary = {
  date: string;
  cash_total: number;
  upi_total: number;
  bank_total: number;
  card_total: number;
  total_collected: number;
  total_transactions: number;
  pending_reversals: number;
  is_closed: boolean;
  closed_by: string | null;
  closed_at: string | null;
};

export default function CashierClosePage() {
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    apiFetch(`/api/v1/payments/day-summary/?date=${today}`)
      .then((d) => setSummary(d as DaySummary))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [success]);

  const handleClose = async () => {
    if (!confirm("Close the cashier for today? This action cannot be undone.")) return;
    setClosing(true);
    setError(null);
    try {
      await apiFetch("/api/v1/payments/cashier-close/", {
        method: "POST",
        body: JSON.stringify({ notes }),
      });
      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Close failed.");
    } finally {
      setClosing(false);
    }
  };

  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return (
    <ERPPageShell
      title="Cashier Day Close"
      subtitle={today}
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Payments", href: "/admin/payments" },
        { label: "Day Close" },
      ]}
    >
      <div className="max-w-2xl mx-auto space-y-6">
        {loading && <div className="py-8 text-center text-gray-500">Loading day summary...</div>}

        {summary?.is_closed && (
          <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-300 rounded-xl">
            <div className="font-bold text-green-800 dark:text-green-200">✅ Day Already Closed</div>
            <div className="text-sm text-green-700 mt-1">
              Closed by {summary.closed_by} at {summary.closed_at ? new Date(summary.closed_at).toLocaleTimeString("en-IN") : "—"}
            </div>
          </div>
        )}

        {summary && (
          <WorkspaceSection title="Today's Collection Summary">
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Cash", value: summary.cash_total, color: "green" },
                { label: "UPI", value: summary.upi_total, color: "purple" },
                { label: "Bank Transfer", value: summary.bank_total, color: "blue" },
                { label: "Card", value: summary.card_total, color: "orange" },
              ].map((item) => (
                <div key={item.label} className="p-3 border rounded-lg">
                  <div className="text-xs text-gray-500">{item.label}</div>
                  <div className="text-xl font-bold mt-1">₹{item.value.toLocaleString("en-IN")}</div>
                </div>
              ))}
            </div>

            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 flex items-center justify-between">
              <div>
                <div className="text-xs text-blue-600">Total Collected</div>
                <div className="text-2xl font-bold text-blue-800 dark:text-blue-200">₹{summary.total_collected.toLocaleString("en-IN")}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-500">Transactions</div>
                <div className="text-xl font-bold">{summary.total_transactions}</div>
              </div>
            </div>

            {summary.pending_reversals > 0 && (
              <div className="mt-3 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 text-sm text-orange-700">
                ⚠️ {summary.pending_reversals} pending reversal(s) — resolve before closing
              </div>
            )}
          </WorkspaceSection>
        )}

        {summary && !summary.is_closed && (
          <WorkspaceSection title="Close Day">
            <div className="space-y-4">
              {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
              {success && <div className="p-3 bg-green-50 text-green-700 rounded-lg text-sm">✅ Day closed successfully.</div>}

              <div>
                <label className="block text-sm font-medium mb-1">Closing Notes (optional)</label>
                <textarea
                  className="w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-600 resize-none"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any discrepancies, notes, or handover instructions..."
                />
              </div>

              <button
                onClick={handleClose}
                disabled={closing || success || (summary.pending_reversals > 0)}
                className="w-full py-2 px-4 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50"
              >
                {closing ? "Closing..." : "Close Cashier for Today"}
              </button>

              {summary.pending_reversals > 0 && (
                <p className="text-xs text-orange-600 text-center">Resolve pending reversals before closing</p>
              )}
            </div>
          </WorkspaceSection>
        )}
      </div>
    </ERPPageShell>
  );
}
