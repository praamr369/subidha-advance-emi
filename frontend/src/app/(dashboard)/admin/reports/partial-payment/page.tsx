"use client";

import { useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import { apiFetch } from "@/lib/api";

interface EmiRow {
  id: number;
  month_no: number;
  due_date: string;
  amount: string;
  status: string;
}

interface PreviewResult {
  subscription_id: number;
  customer_id: number;
  total_outstanding: string;
  emi_count: number;
  emis: EmiRow[];
}

interface SplitLine {
  emi_id: number;
  month_no: number;
  due_date: string;
  emi_amount: string;
  allocated: string;
  fully_covered: boolean;
}

interface SplitResult {
  subscription_id: number;
  payment_amount_input: string;
  total_allocated: string;
  remaining_unallocated: string;
  emis_covered: number;
  split: SplitLine[];
  note: string;
}

export default function PartialPaymentPage() {
  const [subscriptionId, setSubscriptionId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [split, setSplit] = useState<SplitResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [splitLoading, setSplitLoading] = useState(false);
  const [error, setError] = useState("");

  const handlePreview = async () => {
    if (!subscriptionId) { setError("Enter a subscription ID."); return; }
    setError("");
    setPreview(null);
    setSplit(null);
    setPreviewLoading(true);
    try {
      const data: PreviewResult = await apiFetch(
        `/admin/subscriptions/${subscriptionId}/partial-payment/preview/`
      );
      setPreview(data);
    } catch {
      setError("Failed to load preview. Check the subscription ID.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSplit = async () => {
    if (!subscriptionId || !paymentAmount) { setError("Enter subscription ID and payment amount."); return; }
    setError("");
    setSplit(null);
    setSplitLoading(true);
    try {
      const data: SplitResult = await apiFetch(
        `/admin/subscriptions/${subscriptionId}/partial-payment/split/`,
        { method: "POST", body: JSON.stringify({ payment_amount: paymentAmount }) }
      );
      setSplit(data);
    } catch {
      setError("Failed to calculate split.");
    } finally {
      setSplitLoading(false);
    }
  };

  const partialEmi = split?.split.find(l => !l.fully_covered);

  return (
    <ERPPageShell
      eyebrow="BI & Reports"
      title="Partial Payment Waterfall"
      subtitle="Preview how a payment amount distributes across pending EMIs. Calculator only — record actual EMI payments via the standard payment flow."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Reports", href: ROUTES.admin.reports },
        { label: "Partial Payment Waterfall" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >

      {/* Input */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="font-semibold">Lookup</h2>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Subscription ID</label>
            <input
              type="number"
              value={subscriptionId}
              onChange={e => { setSubscriptionId(e.target.value); setPreview(null); setSplit(null); }}
              placeholder="e.g. 1042"
              className="w-36 h-9 rounded-xl border border-border bg-background px-3 text-sm"
            />
          </div>
          <button
            onClick={() => void handlePreview()}
            disabled={previewLoading}
            className="h-9 px-5 rounded-xl bg-muted text-foreground text-sm font-semibold disabled:opacity-50"
          >
            {previewLoading ? "Loading…" : "Load EMIs"}
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {/* Pending EMI list */}
      {preview && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-semibold">Subscription #{preview.subscription_id}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {preview.emi_count} pending EMIs — Total outstanding: ₹{preview.total_outstanding}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">Month</th>
                  <th className="px-4 py-2 text-left">Due Date</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.emis.map(e => (
                  <tr key={e.id} className="border-t border-border hover:bg-muted/20">
                    <td className="px-4 py-2 text-xs font-medium">#{e.month_no}</td>
                    <td className="px-4 py-2 text-xs">{e.due_date}</td>
                    <td className="px-4 py-2 text-right text-xs">₹{e.amount}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{e.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Calculate split */}
          <div className="border-t border-border pt-4 space-y-3">
            <h3 className="font-semibold text-sm">Calculate Waterfall Split</h3>
            <div className="flex gap-3 items-end">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Payment Amount (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  value={paymentAmount}
                  onChange={e => setPaymentAmount(e.target.value)}
                  placeholder="e.g. 5000.00"
                  className="w-44 h-9 rounded-xl border border-border bg-background px-3 text-sm"
                />
              </div>
              <button
                onClick={() => void handleSplit()}
                disabled={splitLoading || !paymentAmount}
                className="h-9 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
              >
                {splitLoading ? "Calculating…" : "Show Split"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Split result */}
      {split && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h2 className="font-semibold">Waterfall Split — ₹{split.payment_amount_input}</h2>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-green-50 border border-green-200 p-3 text-center">
              <div className="text-2xl font-bold text-green-700">{split.emis_covered}</div>
              <div className="text-xs text-green-600 mt-1">EMIs Addressed</div>
            </div>
            <div className="rounded-xl bg-muted p-3 text-center">
              <div className="text-xl font-bold">₹{split.total_allocated}</div>
              <div className="text-xs text-muted-foreground mt-1">Total Allocated</div>
            </div>
            <div className="rounded-xl bg-muted p-3 text-center">
              <div className="text-xl font-bold">₹{split.remaining_unallocated}</div>
              <div className="text-xs text-muted-foreground mt-1">Unallocated</div>
            </div>
          </div>

          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">Month</th>
                  <th className="px-4 py-2 text-left">Due Date</th>
                  <th className="px-4 py-2 text-right">EMI Amount</th>
                  <th className="px-4 py-2 text-right">Allocated</th>
                  <th className="px-4 py-2 text-right">Shortfall</th>
                  <th className="px-4 py-2 text-center">Covered?</th>
                </tr>
              </thead>
              <tbody>
                {split.split.map(row => {
                  const shortfall = (parseFloat(row.emi_amount) - parseFloat(row.allocated)).toFixed(2);
                  return (
                    <tr key={row.emi_id} className={`border-t border-border ${row.fully_covered ? "bg-green-50/50" : parseFloat(row.allocated) > 0 ? "bg-yellow-50/50" : ""}`}>
                      <td className="px-4 py-2 text-xs font-medium">#{row.month_no}</td>
                      <td className="px-4 py-2 text-xs">{row.due_date}</td>
                      <td className="px-4 py-2 text-right text-xs">₹{row.emi_amount}</td>
                      <td className="px-4 py-2 text-right text-xs font-medium text-green-700">₹{row.allocated}</td>
                      <td className="px-4 py-2 text-right text-xs text-red-600">₹{shortfall}</td>
                      <td className="px-4 py-2 text-center text-xs">
                        {row.fully_covered
                          ? <span className="text-green-700 font-semibold">Yes</span>
                          : <span className="text-muted-foreground">Partial</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {partialEmi && (
            <div className="rounded-xl bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-800">
              Month #{partialEmi.month_no} is only partially covered (₹{partialEmi.allocated} of ₹{partialEmi.emi_amount}). Record it as a payment against that EMI; the remaining ₹{(parseFloat(partialEmi.emi_amount) - parseFloat(partialEmi.allocated)).toFixed(2)} will remain outstanding.
            </div>
          )}

          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
            {split.note}
          </div>
        </div>
      )}
    </ERPPageShell>
  );
}
