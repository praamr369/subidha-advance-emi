"use client";

import { useState, useEffect, useRef } from "react";
import { use } from "react";
import { calculatePrepayment, unlockAdvancedDelivery, PrepaymentCalculation } from "@/services/prepayment";
import { formatCurrency } from "@/lib/format";

export default function PrepaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const subscriptionId = Number(id);

  const [calc, setCalc] = useState<PrepaymentCalculation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [prepayAmount, setPrepayAmount] = useState("");
  const [requestDelivery, setRequestDelivery] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await calculatePrepayment(subscriptionId);
        setCalc(data);
        setPrepayAmount(data.prepayment_required);
      } catch {
        setError("Failed to load prepayment details.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [subscriptionId]);

  const handleSubmit = async () => {
    if (!prepayAmount || Number(prepayAmount) <= 0) {
      setError("Enter a valid prepayment amount.");
      return;
    }

    setBusy(true);
    setError(null);
    setResult(null);

    try {
      const res = await unlockAdvancedDelivery(subscriptionId, {
        amount: prepayAmount,
        request_delivery: requestDelivery,
      });
      setResult({
        success: res.success,
        message: res.message || "Prepayment successful! Advance delivery unlocked.",
      });
      setPrepayAmount("");
    } catch {
      setError("Prepayment failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="text-sm text-muted-foreground text-center py-12">Loading…</div>
      </div>
    );
  }

  if (error && !calc) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="text-sm text-red-600 py-4">{error}</div>
      </div>
    );
  }

  if (!calc) return null;

  const minRequired = Number(calc.prepayment_required);
  const enteredAmount = Number(prepayAmount || 0);
  const isValid = enteredAmount >= minRequired && enteredAmount > 0;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Unlock Advance Delivery</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Pay 60-70% of remaining EMIs upfront to skip the lucky draw and get your product delivered immediately.
        </p>
      </div>

      {/* Contract Summary */}
      <div className="rounded-2xl border border-border bg-card p-4 mb-5">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Contract Reference</div>
            <div className="font-semibold mt-1">{calc.contract_ref}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Customer</div>
            <div className="font-semibold mt-1">{calc.customer_name}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Total EMIs</div>
            <div className="font-semibold mt-1">{calc.total_emis}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Paid EMIs</div>
            <div className="font-semibold mt-1">{calc.paid_emis}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Remaining EMIs</div>
            <div className="font-semibold mt-1 text-orange-600">{calc.remaining_emis}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Monthly Amount</div>
            <div className="font-semibold mt-1">₹{calc.monthly_amount}</div>
          </div>
        </div>
      </div>

      {/* Threshold Calculator */}
      <div className="rounded-2xl border border-border bg-card p-4 mb-5">
        <div className="text-sm font-semibold mb-3">Prepayment Calculation</div>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Remaining EMIs:</span>
            <span className="font-medium">{calc.remaining_emis}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Threshold ({calc.threshold_percentage}%):</span>
            <span className="font-medium">{calc.threshold_emis_needed} EMIs</span>
          </div>
          <div className="flex justify-between border-t border-border pt-2 mt-2">
            <span className="text-muted-foreground font-semibold">Minimum Required:</span>
            <span className="font-bold text-lg text-green-700">₹{calc.prepayment_required}</span>
          </div>
        </div>
      </div>

      {/* Prepayment Form */}
      {!result?.success && (
        <div className="rounded-2xl border border-border bg-card p-4 mb-5 space-y-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Prepayment Amount (₹)</label>
            <input
              type="number"
              value={prepayAmount}
              onChange={(e) => setPrepayAmount(e.target.value)}
              min="0"
              step="100"
              className="w-full h-10 rounded-xl border border-border bg-background px-3 text-sm mt-1 font-mono"
            />
            {prepayAmount && !isValid && (
              <div className="text-xs text-red-600 mt-1">
                Must be at least ₹{calc.prepayment_required}
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={requestDelivery}
              onChange={(e) => setRequestDelivery(e.target.checked)}
              className="rounded"
            />
            <span>Schedule delivery immediately after prepayment</span>
          </label>

          {error && <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}

          <button
            onClick={() => void handleSubmit()}
            disabled={busy || !isValid}
            className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Processing…" : `Unlock Advance Delivery — ₹${prepayAmount || calc.prepayment_required}`}
          </button>
        </div>
      )}

      {/* Success Message */}
      {result?.success && (
        <div className="rounded-2xl border border-green-300 bg-green-50 p-4 mb-5 text-center">
          <div className="text-sm font-semibold text-green-800 mb-2">✓ Prepayment Successful</div>
          <div className="text-xs text-green-700">{result.message}</div>
          <div className="text-xs text-green-700 mt-2">Delivery team will contact you shortly to schedule pickup.</div>
        </div>
      )}

      {/* Info Box */}
      <div className="rounded-2xl border border-border/50 bg-muted/30 p-4">
        <div className="text-xs text-muted-foreground space-y-1">
          <div>• <strong>No interest or hidden charges</strong> — pure EMI contract</div>
          <div>• <strong>Remaining EMIs</strong> will be adjusted based on prepayment</div>
          <div>• <strong>Product delivery</strong> can start immediately after prepayment confirmation</div>
          <div>• <strong>Questions?</strong> Contact support for details</div>
        </div>
      </div>
    </div>
  );
}
