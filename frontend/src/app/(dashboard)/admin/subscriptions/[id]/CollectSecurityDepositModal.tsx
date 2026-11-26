"use client";

import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/ui/modal";
import { listFinanceAccounts, type FinanceAccount } from "@/services/accounting";
import { processUnifiedCollection } from "@/services/collections";
import { ApiError } from "@/lib/api";
import { AlertCircle, CheckCircle2, CreditCard, ShieldCheck } from "lucide-react";

const inputClass =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function rupee(value: string | number | undefined | null): string {
  const n = Number(value ?? 0);
  return `₹${(Number.isFinite(n) ? n : 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function errorText(err: unknown): string {
  if (err instanceof ApiError && Object.keys(err.fieldErrors).length > 0) {
    return Object.values(err.fieldErrors).flat().join(" ");
  }
  return err instanceof Error ? err.message : "Deposit collection failed.";
}

export function CollectSecurityDepositModal({
  subscriptionId,
  contractNumber,
  customerName,
  securityDepositDue,
  securityDepositReceived,
  open,
  onOpenChange,
  onCollected,
}: {
  subscriptionId: number;
  contractNumber: string;
  customerName: string;
  securityDepositDue: number;
  securityDepositReceived: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCollected: () => void;
}) {
  const remainingDeposit = Math.max(0, securityDepositDue - securityDepositReceived);

  const [amount, setAmount] = useState<string>(String(remainingDeposit));
  const [financeAccountId, setFinanceAccountId] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<
    "CASH" | "UPI" | "TRANSFER" | "CHEQUE" | "CARD"
  >("CASH");
  const [paymentDate, setPaymentDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [referenceNo, setReferenceNo] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Sync remaining balance when opening
  useEffect(() => {
    if (!open) return;
    setAmount(String(remainingDeposit));
    setReferenceNo("");
    setNotes(`Security deposit collection for ${contractNumber}`);
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setError(null);
    setSuccessMessage(null);

    setLoading(true);
    listFinanceAccounts({ is_active: 1, page_size: 100, for_payment_collection: "true" })
      .then((res) => {
        const raw = Array.isArray(res) ? res : res.results || [];
        setAccounts(raw);
        if (raw.length > 0) {
          const cashAcc = raw.find((a) => a.kind === "CASH" && a.collection_ready !== false) || raw[0];
          if (cashAcc) setFinanceAccountId(String(cashAcc.id));
        }
      })
      .catch((err) => {
        setError("Failed to load receiving finance accounts.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [open, remainingDeposit, contractNumber]);

  const numAmount = Number(amount || 0);
  const isInvalidAmount =
    numAmount <= 0 || numAmount > remainingDeposit + 0.005 || isNaN(numAmount);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isInvalidAmount) {
      setError("Please enter a valid amount within the outstanding deposit balance.");
      return;
    }
    if (!financeAccountId) {
      setError("Please select the receiving finance account.");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);

      const res = await processUnifiedCollection({
        source_type: "SECURITY_DEPOSIT",
        source_id: subscriptionId,
        amount: String(numAmount),
        payment_method: paymentMethod,
        finance_account_id: Number(financeAccountId),
        reference_no: referenceNo.trim() || undefined,
        payment_date: paymentDate,
        receipt_date: paymentDate,
        note: notes.trim() || undefined,
        notes: notes.trim() || undefined,
        idempotency_key: `SEC-DEP-${subscriptionId}-${Date.now()}`,
      });

      setSuccessMessage(
        res.message || `Security deposit of ${rupee(numAmount)} collected successfully.`
      );
      setTimeout(() => {
        onCollected();
        onOpenChange(false);
      }, 1200);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => onOpenChange(false)}
      title="Collect Security Deposit"
      size="lg"
    >
      <div className="text-xs text-muted-foreground -mt-2 mb-3">
        Contract {contractNumber} · Customer: {customerName}
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Deposit KPI Summary */}
        <div className="grid grid-cols-3 gap-2 rounded-lg border border-border bg-muted/40 p-3">
          <div>
            <div className="text-[10px] uppercase font-bold text-muted-foreground">
              Total Deposit
            </div>
            <div className="mt-0.5 text-xs font-semibold text-foreground">
              {rupee(securityDepositDue)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-muted-foreground">
              Already Held
            </div>
            <div className="mt-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              {rupee(securityDepositReceived)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-muted-foreground">
              Remaining Balance
            </div>
            <div className="mt-0.5 text-xs font-bold text-amber-600 dark:text-amber-400">
              {rupee(remainingDeposit)}
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        {successMessage && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <div>{successMessage}</div>
          </div>
        )}

        {/* Amount */}
        <div>
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-foreground">
              Amount to Collect (₹) <span className="text-rose-500">*</span>
            </label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setAmount(String(remainingDeposit))}
                className="text-[11px] font-medium text-primary hover:underline"
              >
                Full ({rupee(remainingDeposit)})
              </button>
              {remainingDeposit > 100 && (
                <button
                  type="button"
                  onClick={() => setAmount(String(Math.round(remainingDeposit / 2)))}
                  className="text-[11px] font-medium text-muted-foreground hover:underline"
                >
                  50% ({rupee(Math.round(remainingDeposit / 2))})
                </button>
              )}
            </div>
          </div>
          <input
            type="number"
            min="1"
            max={remainingDeposit}
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={saving}
            className={`${inputClass} mt-1`}
            placeholder="e.g. 3000"
            required
          />
        </div>

        {/* Finance Account & Payment Method */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-foreground">
              Receiving Account <span className="text-rose-500">*</span>
            </label>
            <select
              value={financeAccountId}
              onChange={(e) => setFinanceAccountId(e.target.value)}
              disabled={loading || saving}
              className={`${inputClass} mt-1`}
              required
            >
              {accounts.length === 0 ? (
                <option value="">{loading ? "Loading..." : "No active accounts"}</option>
              ) : (
                accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.kind}{acc.branch_name ? ` · ${acc.branch_name}` : ""})
                  </option>
                ))
              )}
            </select>
            <div className="mt-0.5 text-[10px] text-muted-foreground">
              Cash drawer or bank A/C
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-foreground">
              Payment Method <span className="text-rose-500">*</span>
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => {
                const newMethod = e.target.value as typeof paymentMethod;
                setPaymentMethod(newMethod);
                if (newMethod === "CASH") {
                  const cashAcc = accounts.find((a) => a.kind === "CASH");
                  if (cashAcc) setFinanceAccountId(String(cashAcc.id));
                } else if (newMethod === "UPI") {
                  const upiOrBank = accounts.find((a) => a.kind === "UPI" || a.kind === "BANK");
                  if (upiOrBank) setFinanceAccountId(String(upiOrBank.id));
                } else if (newMethod === "TRANSFER" || newMethod === "CARD" || newMethod === "CHEQUE") {
                  const bankAcc = accounts.find((a) => a.kind === "BANK");
                  if (bankAcc) setFinanceAccountId(String(bankAcc.id));
                }
              }}
              disabled={saving}
              className={`${inputClass} mt-1`}
              required
            >
              <option value="CASH">Cash Desk</option>
              <option value="UPI">UPI / QR</option>
              <option value="TRANSFER">Bank Transfer (NEFT/RTGS)</option>
              <option value="CARD">Debit / Credit Card</option>
              <option value="CHEQUE">Cheque</option>
            </select>
            <div className="mt-0.5 text-[10px] text-muted-foreground">
              Tender channel
            </div>
          </div>
        </div>

        {/* Payment Date & Reference No */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-foreground">
              Payment Date <span className="text-rose-500">*</span>
            </label>
            <input
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              disabled={saving}
              className={`${inputClass} mt-1`}
              required
            />
          </div>

          <div>
            <label className="text-xs font-medium text-foreground">
              Reference / UTR #
            </label>
            <input
              type="text"
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
              disabled={saving}
              placeholder="e.g. UTR / Cheque / Receipt #"
              className={`${inputClass} mt-1`}
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="text-xs font-medium text-foreground">
            Internal Note
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={saving}
            placeholder="Operational note..."
            className={`${inputClass} mt-1`}
          />
        </div>

        {/* Double Entry Notice */}
        <div className="flex items-center gap-2 rounded-md bg-muted/60 px-3 py-2 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
          <span>
            Double-entry verified: debits receiving account and credits Security Deposit liability.
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || isInvalidAmount || !financeAccountId}
            className="inline-flex items-center gap-1.5 rounded-md bg-sky-700 px-4 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-sky-800 disabled:opacity-50"
          >
            <CreditCard className="h-3.5 w-3.5" />
            {saving ? "Posting Collection..." : `Collect ${rupee(numAmount)}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
