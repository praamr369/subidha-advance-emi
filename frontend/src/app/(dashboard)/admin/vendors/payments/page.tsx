"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { accountingErrorMessage } from "@/components/accounting/shared";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ProcurementConfirmDialog from "@/components/procurement/ProcurementConfirmDialog";
import { buildAdminVendorPaymentVoucherPrintRoute } from "@/lib/route-builders";
import { ROUTES } from "@/lib/routes";
import { listFinanceAccounts, type FinanceAccount } from "@/services/accounting";
import {
  createVendorPayment,
  listVendorBills,
  listVendorPayments,
  listVendorsLite,
  postVendorPayment,
  type VendorBill,
  type VendorLite,
  type VendorPayment,
} from "@/services/inventory";

// ── helpers ───────────────────────────────────────────────────────────────────

function statusBadge(s: VendorPayment["status"]) {
  const map: Record<VendorPayment["status"], string> = {
    DRAFT: "bg-blue-50 text-blue-700",
    POSTED: "bg-green-50 text-green-700",
    CANCELLED: "bg-gray-100 text-muted-foreground",
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${map[s] ?? ""}`}>
      {s}
    </span>
  );
}

function fmt(d?: string | null) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-IN"); } catch { return d; }
}

function rupees(v?: string | null) {
  if (!v) return "—";
  return `₹${parseFloat(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Create Payment form ───────────────────────────────────────────────────────

interface CreatePaymentFormProps {
  vendors: VendorLite[];
  bills: VendorBill[];
  financeAccounts: FinanceAccount[];
  onSaved: (payment: VendorPayment) => void;
  onCancel: () => void;
}

function CreatePaymentForm({ vendors, bills, financeAccounts, onSaved, onCancel }: CreatePaymentFormProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [vendorId, setVendorId] = useState("");
  const [billId, setBillId] = useState("");
  const [paymentDate, setPaymentDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [financeAccountId, setFinanceAccountId] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Vendor's posted bills only
  const vendorBills = bills.filter(
    (b) => b.status === "POSTED" && (!vendorId || String(b.vendor) === vendorId)
  );

  // Auto-fill amount from bill outstanding
  function handleBillChange(id: string) {
    setBillId(id);
    if (id) {
      const bill = bills.find((b) => String(b.id) === id);
      if (bill?.outstanding_amount) setAmount(bill.outstanding_amount);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!vendorId) errs.vendor = "Vendor is required.";
    if (!paymentDate) errs.payment_date = "Date is required.";
    if (!amount || parseFloat(amount) <= 0) errs.amount = "Amount must be > 0.";
    if (!financeAccountId) errs.finance_account = "Finance account is required.";
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setBusy(true);
    try {
      const payment = await createVendorPayment({
        vendor: Number(vendorId),
        vendor_bill: billId ? Number(billId) : null,
        payment_date: paymentDate,
        amount,
        finance_account: Number(financeAccountId),
        reference_no: referenceNo || undefined,
        notes: notes || undefined,
      });
      onSaved(payment);
    } catch (err: unknown) {
      setErrors({ submit: accountingErrorMessage(err, "Failed to create vendor payment.") });
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "h-9 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {/* Vendor */}
        <div>
          <label htmlFor="f-vendor" className="mb-1 block text-xs font-medium text-muted-foreground">Vendor *</label>
          <select id="f-vendor"
            value={vendorId}
            onChange={(e) => { setVendorId(e.target.value); setBillId(""); setAmount(""); }}
            className={inputCls}
          >
            <option value="">— Select vendor —</option>
            {vendors.filter((v) => v.is_active).map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
          {errors.vendor && <p className="mt-0.5 text-[10px] text-red-600">{errors.vendor}</p>}
        </div>

        {/* Payment date */}
        <div>
          <label htmlFor="f-payment-date" className="mb-1 block text-xs font-medium text-muted-foreground">Payment Date *</label>
          <input id="f-payment-date" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className={inputCls} />
          {errors.payment_date && <p className="mt-0.5 text-[10px] text-red-600">{errors.payment_date}</p>}
        </div>

        {/* Vendor bill (optional — only posted bills) */}
        <div>
          <label htmlFor="f-vendor-bill-optional" className="mb-1 block text-xs font-medium text-muted-foreground">
            Vendor Bill <span className="text-muted-foreground/60">(optional)</span>
          </label>
          <select id="f-vendor-bill-optional" value={billId} onChange={(e) => handleBillChange(e.target.value)} className={inputCls} disabled={!vendorId}>
            <option value="">— None / advance payment —</option>
            {vendorBills.map((b) => (
              <option key={b.id} value={b.id}>
                {b.bill_no} — {rupees(b.outstanding_amount)} outstanding
              </option>
            ))}
          </select>
          {!vendorId && (
            <p className="mt-0.5 text-[10px] text-muted-foreground">Select a vendor first to filter bills.</p>
          )}
        </div>

        {/* Amount */}
        <div>
          <label htmlFor="f-amount" className="mb-1 block text-xs font-medium text-muted-foreground">Amount (₹) *</label>
          <input id="f-amount"
            type="number"
            min="0.01"
            step="0.01"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={inputCls}
          />
          {errors.amount && <p className="mt-0.5 text-[10px] text-red-600">{errors.amount}</p>}
        </div>

        {/* Finance account */}
        <div>
          <label htmlFor="f-pay-from-finance-account" className="mb-1 block text-xs font-medium text-muted-foreground">Pay From (Finance Account) *</label>
          <select id="f-pay-from-finance-account" value={financeAccountId} onChange={(e) => setFinanceAccountId(e.target.value)} className={inputCls}>
            <option value="">— Select account —</option>
            {financeAccounts.filter((a) => a.is_active && a.is_real_settlement_account).map((a) => (
              <option key={a.id} value={a.id}>{a.name} ({a.kind})</option>
            ))}
          </select>
          {errors.finance_account && <p className="mt-0.5 text-[10px] text-red-600">{errors.finance_account}</p>}
        </div>

        {/* Reference no */}
        <div>
          <label htmlFor="f-reference-no-optional" className="mb-1 block text-xs font-medium text-muted-foreground">
            Reference No <span className="text-muted-foreground/60">(optional)</span>
          </label>
          <input id="f-reference-no-optional"
            type="text"
            placeholder="Cheque / UTR / transfer ref"
            value={referenceNo}
            onChange={(e) => setReferenceNo(e.target.value)}
            className={inputCls}
          />
        </div>

        {/* Notes */}
        <div className="col-span-2">
          <label htmlFor="f-notes" className="mb-1 block text-xs font-medium text-muted-foreground">Notes</label>
          <input id="f-notes" type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} placeholder="Optional" />
        </div>
      </div>

      {errors.submit && (
        <p className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">{errors.submit}</p>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="h-9 rounded-xl border border-border bg-background px-4 text-sm font-medium hover:bg-muted">
          Cancel
        </button>
        <button type="submit" disabled={busy} className="h-9 rounded-xl border border-primary bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {busy ? "Saving…" : "Save Payment"}
        </button>
      </div>
    </form>
  );
}

// ── Detail drawer ─────────────────────────────────────────────────────────────

interface DetailDrawerProps {
  payment: VendorPayment;
  onPosted: (payment: VendorPayment) => void;
  onClose: () => void;
}

function PaymentDetailDrawer({ payment, onPosted, onClose }: DetailDrawerProps) {
  const [postConfirm, setPostConfirm] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  async function handlePost() {
    setPostError(null);
    try {
      const result = await postVendorPayment(payment.id);
      onPosted(result.vendor_payment);
      setPostConfirm(false);
    } catch (err: unknown) {
      setPostError(accountingErrorMessage(err, "Post failed."));
    }
  }

  const canPost = payment.status === "DRAFT";

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="relative z-50 flex h-full w-full max-w-lg flex-col bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="text-xs text-muted-foreground">Vendor Payment</p>
            <h2 className="text-lg font-semibold text-foreground">{payment.payment_no}</h2>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-lg border border-border hover:bg-muted">✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-[10px] text-muted-foreground">Status</p>{statusBadge(payment.status)}</div>
            <div><p className="text-[10px] text-muted-foreground">Vendor</p><p className="font-medium">{payment.vendor_name ?? `#${payment.vendor}`}</p></div>
            <div><p className="text-[10px] text-muted-foreground">Payment Date</p><p>{fmt(payment.payment_date)}</p></div>
            <div><p className="text-[10px] text-muted-foreground">Amount</p><p className="text-lg font-bold text-primary">{rupees(payment.amount)}</p></div>
            <div><p className="text-[10px] text-muted-foreground">Finance Account</p><p>{payment.finance_account_name ?? `#${payment.finance_account}`}</p></div>
            {payment.vendor_bill_no && (
              <div><p className="text-[10px] text-muted-foreground">Bill No</p><p>{payment.vendor_bill_no}</p></div>
            )}
            {payment.reference_no && (
              <div><p className="text-[10px] text-muted-foreground">Reference No</p><p className="font-mono text-xs">{payment.reference_no}</p></div>
            )}
            {payment.posted_journal_entry_no && (
              <div className="col-span-2">
                <p className="text-[10px] text-muted-foreground">Journal Entry</p>
                <p>{payment.posted_journal_entry_no}</p>
              </div>
            )}
            {payment.notes && (
              <div className="col-span-2">
                <p className="text-[10px] text-muted-foreground">Notes</p>
                <p className="whitespace-pre-wrap">{payment.notes}</p>
              </div>
            )}
          </div>

          {payment.status === "POSTED" && (
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-xs text-green-800">
              Payment posted to accounting.
              {payment.posted_journal_entry_no && ` Journal entry: ${payment.posted_journal_entry_no}`}
            </div>
          )}

          {postError && (
            <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-xs text-red-700">
              <p className="font-semibold">Post failed — accounting blocker</p>
              <p className="mt-1">{postError}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-5 py-4 flex flex-wrap items-center gap-3">
          <Link
            href={buildAdminVendorPaymentVoucherPrintRoute(payment.id)}
            className="h-9 rounded-xl border border-amber-300 bg-amber-50 px-4 text-sm font-medium text-amber-900 hover:bg-amber-100"
          >
            PDF / Print
          </Link>
          {canPost && (
            <button
              onClick={() => setPostConfirm(true)}
              className="h-9 rounded-xl border border-green-600 bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700"
            >
              Post → Accounting
            </button>
          )}
          {!canPost && payment.status !== "POSTED" && (
            <span className="text-xs text-muted-foreground italic">Cannot post — status: {payment.status}</span>
          )}
          <button onClick={onClose} className="ml-auto h-9 rounded-xl border border-border bg-background px-4 text-sm font-medium hover:bg-muted">
            Close
          </button>
        </div>
      </aside>

      {postConfirm && (
        <ProcurementConfirmDialog
          title="Post Vendor Payment"
          description={`Post ${payment.payment_no} (${rupees(payment.amount)}) to accounting? This creates a journal entry and cannot be undone.`}
          confirmLabel="Post Payment"
          onConfirm={handlePost}
          onCancel={() => setPostConfirm(false)}
        />
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminVendorPaymentsPage() {
  const [rows, setRows] = useState<VendorPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vendors, setVendors] = useState<VendorLite[]>([]);
  const [bills, setBills] = useState<VendorBill[]>([]);
  const [financeAccounts, setFinanceAccounts] = useState<FinanceAccount[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<VendorPayment | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pmtRes, vendorRes, billRes, faRes] = await Promise.allSettled([
        listVendorPayments({ page_size: 200 }),
        listVendorsLite({ page_size: 200, is_active: true }),
        listVendorBills({ status: "POSTED", page_size: 200 }),
        listFinanceAccounts({ is_active: "true", page_size: 100 }),
      ]);
      if (pmtRes.status === "fulfilled") setRows(pmtRes.value.results);
      else setError("Failed to load vendor payments.");
      if (vendorRes.status === "fulfilled") setVendors(vendorRes.value.results);
      if (billRes.status === "fulfilled") setBills(billRes.value.results);
      if (faRes.status === "fulfilled") setFinanceAccounts(faRes.value.results);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function handleSaved(payment: VendorPayment) {
    setRows((prev) => [payment, ...prev]);
    setShowCreate(false);
  }

  function handlePosted(payment: VendorPayment) {
    setRows((prev) => prev.map((r) => (r.id === payment.id ? payment : r)));
    setSelected(payment);
  }

  const totalPosted = rows
    .filter((r) => r.status === "POSTED")
    .reduce((s, r) => s + Number(r.amount), 0);

  return (
    <ERPPageShell
      eyebrow="Purchases & Vendors"
      title="Vendor Payments"
      subtitle="Record and post payments against vendor bills. Posting creates a journal entry via accounting bridge."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Purchases", href: ROUTES.admin.purchases },
        { label: "Vendor Payments" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
      stats={[
        { label: "Payments", value: loading ? "—" : rows.length, tone: "info" },
        {
          label: "Draft (unposted)",
          value: loading ? "—" : rows.filter((r) => r.status === "DRAFT").length,
          tone: (!loading && rows.filter((r) => r.status === "DRAFT").length > 0 ? "warning" : "success") as "warning" | "success",
        },
        { label: "Posted", value: loading ? "—" : rows.filter((r) => r.status === "POSTED").length, tone: "success" },
        {
          label: "Total Posted",
          value: loading ? "—" : `₹${totalPosted.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
          tone: "default",
        },
      ]}
    >
      <ERPSectionShell
        title="Vendor Payments"
        description="Only DRAFT payments can be posted. Posting is irreversible and creates a payable debit journal entry."
        actions={
          <button
            onClick={() => setShowCreate(true)}
            className="h-8 rounded-xl border border-primary bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90"
          >
            + New Payment
          </button>
        }
      >
        {loading && <ERPLoadingState label="Loading vendor payments…" />}
        {!loading && error && <ERPErrorState title="Load error" description={error} onRetry={() => void load()} />}

        {showCreate && (
          <div className="mb-6 rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold text-foreground">New Vendor Payment</h3>
            <CreatePaymentForm
              vendors={vendors}
              bills={bills}
              financeAccounts={financeAccounts}
              onSaved={handleSaved}
              onCancel={() => setShowCreate(false)}
            />
          </div>
        )}

        {!loading && !error && rows.length === 0 && !showCreate && (
          <ERPEmptyState
            title="No vendor payments"
            description="Record payments against posted vendor bills. Payments reduce the outstanding vendor payable."
          />
        )}

        {!loading && !error && rows.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Payment No</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3">Bill No</th>
                  <th className="px-4 py-3">Finance Account</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Documents</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {rows.map((pmt) => (
                  <tr
                    key={pmt.id}
                    onClick={() => setSelected(pmt)}
                    className="cursor-pointer hover:bg-muted/40 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-primary">{pmt.payment_no}</td>
                    <td className="px-4 py-3">{fmt(pmt.payment_date)}</td>
                    <td className="px-4 py-3">{pmt.vendor_name ?? `#${pmt.vendor}`}</td>
                    <td className="px-4 py-3 text-muted-foreground">{pmt.vendor_bill_no ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{pmt.finance_account_name ?? `#${pmt.finance_account}`}</td>
                    <td className="px-4 py-3 font-semibold">{rupees(pmt.amount)}</td>
                    <td className="px-4 py-3">{statusBadge(pmt.status)}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <Link
                        href={buildAdminVendorPaymentVoucherPrintRoute(pmt.id)}
                        className="inline-flex h-7 items-center rounded-lg border border-amber-300 bg-amber-50 px-3 text-[11px] font-semibold text-amber-950 hover:bg-amber-100"
                      >
                        PDF / Print
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ERPSectionShell>

      {selected && (
        <PaymentDetailDrawer
          payment={selected}
          onPosted={handlePosted}
          onClose={() => setSelected(null)}
        />
      )}
    </ERPPageShell>
  );
}
