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

function statusBadge(s: VendorPayment["status"]) {
  const map: Record<VendorPayment["status"], string> = {
    DRAFT: "bg-blue-50 text-blue-700",
    POSTED: "bg-green-50 text-green-700",
    CANCELLED: "bg-gray-100 text-muted-foreground",
  };
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${map[s] ?? ""}`}>{s}</span>;
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
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(today);
  const [referenceNo, setReferenceNo] = useState("");
  const [financeAccountId, setFinanceAccountId] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const selectedBill = bills.find((b) => String(b.id) === billId);
  const vendorBills = bills.filter(
    (b) => !vendorId || String(b.vendor) === vendorId
  ).filter((b) => b.status === "POSTED" && Number(b.outstanding_amount ?? b.grand_total ?? 0) > 0);

  // The backend supplies the bill-level outstanding amount.
  useEffect(() => {
    if (selectedBill) setAmount(selectedBill.outstanding_amount ?? selectedBill.grand_total ?? "");
  }, [billId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!vendorId) errs.vendor = "Vendor is required.";
    if (!financeAccountId) errs.finance_account = "Finance account is required.";
    if (!amount || parseFloat(amount) <= 0) errs.amount = "Amount must be greater than 0.";
    if (!paymentDate) errs.payment_date = "Date is required.";
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setBusy(true);
    try {
      const payment = await createVendorPayment({
        payment_date: paymentDate,
        vendor: Number(vendorId),
        vendor_bill: billId ? Number(billId) : null,
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

  const inputCls = "h-9 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Vendor *</label>
          <select value={vendorId} onChange={(e) => { setVendorId(e.target.value); setBillId(""); setAmount(""); }} className={inputCls}>
            <option value="">— Select Vendor —</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          {errors.vendor ? <p className="mt-0.5 text-[10px] text-red-600">{errors.vendor}</p> : null}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Vendor Bill (optional)</label>
          <select value={billId} onChange={(e) => setBillId(e.target.value)} className={inputCls}>
            <option value="">— None —</option>
            {vendorBills.map((b) => (
              <option key={b.id} value={b.id}>{b.bill_no} — Outstanding {rupees(b.outstanding_amount ?? b.grand_total)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Amount *</label>
          <input type="number" min="0.01" step="0.01" placeholder="₹" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} />
          {errors.amount ? <p className="mt-0.5 text-[10px] text-red-600">{errors.amount}</p> : null}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Payment Date *</label>
          <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className={inputCls} />
          {errors.payment_date ? <p className="mt-0.5 text-[10px] text-red-600">{errors.payment_date}</p> : null}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Finance Account *</label>
          <select value={financeAccountId} onChange={(e) => setFinanceAccountId(e.target.value)} className={inputCls}>
            <option value="">— Select Cash / Bank / UPI —</option>
            {financeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} ({account.kind})</option>)}
          </select>
          {errors.finance_account ? <p className="mt-0.5 text-[10px] text-red-600">{errors.finance_account}</p> : null}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Reference No</label>
          <input type="text" value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} placeholder="UTR / Cheque no." className={inputCls} />
        </div>
        <div className="col-span-2">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Notes</label>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} placeholder="Optional" />
        </div>
      </div>

      {errors.submit ? <p className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">{errors.submit}</p> : null}

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="h-9 rounded-xl border border-border bg-background px-4 text-sm font-medium hover:bg-muted">Cancel</button>
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
      throw err;
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="relative z-50 flex h-full w-full max-w-lg flex-col bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="text-xs text-muted-foreground">Vendor Payment</p>
            <h2 className="text-lg font-semibold text-foreground">{payment.payment_no}</h2>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-lg border border-border hover:bg-muted">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-[10px] text-muted-foreground">Status</p>{statusBadge(payment.status)}</div>
            <div><p className="text-[10px] text-muted-foreground">Vendor</p><p className="font-medium">{payment.vendor_name ?? "—"}</p></div>
            <div><p className="text-[10px] text-muted-foreground">Amount</p><p className="font-semibold text-primary">{rupees(payment.amount)}</p></div>
            <div><p className="text-[10px] text-muted-foreground">Date</p><p>{fmt(payment.payment_date)}</p></div>
            {payment.vendor_bill_no ? <div><p className="text-[10px] text-muted-foreground">Bill No</p><p>{payment.vendor_bill_no}</p></div> : null}
            {payment.reference_no ? <div><p className="text-[10px] text-muted-foreground">Reference</p><p>{payment.reference_no}</p></div> : null}
            {payment.posted_journal_entry_no ? <div className="col-span-2"><p className="text-[10px] text-muted-foreground">Journal Entry</p><p>{payment.posted_journal_entry_no}</p></div> : null}
            {payment.notes ? <div className="col-span-2"><p className="text-[10px] text-muted-foreground">Notes</p><p className="whitespace-pre-wrap">{payment.notes}</p></div> : null}
          </div>

          {payment.status === "POSTED" ? (
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-xs text-green-800">
              Payment posted to accounting. Journal entry: {payment.posted_journal_entry_no ?? `#${payment.posted_journal_entry}`}
            </div>
          ) : null}

          {postError ? (
            <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-xs text-red-700">
              <p className="font-semibold">Post failed — accounting blocker</p>
              <p className="mt-1">{postError}</p>
            </div>
          ) : null}

          {payment.status === "DRAFT" ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              Posting this payment reduces the vendor payable balance and creates an accounting journal entry. This action cannot be undone.
            </div>
          ) : null}
        </div>

        <div className="border-t border-border px-5 py-4 flex gap-3 items-center flex-wrap">
          <Link
            href={buildAdminVendorPaymentVoucherPrintRoute(payment.id)}
            className="h-9 rounded-xl border border-amber-300 bg-amber-50 px-4 text-sm font-medium text-amber-900 hover:bg-amber-100"
          >
            PDF / Print
          </Link>
          {payment.status === "DRAFT" ? (
            <button onClick={() => setPostConfirm(true)} className="h-9 rounded-xl border border-green-600 bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700">
              Post Payment → Accounting
            </button>
          ) : null}
          <button onClick={onClose} className="ml-auto h-9 rounded-xl border border-border bg-background px-4 text-sm font-medium hover:bg-muted">Close</button>
        </div>
      </aside>
      {postConfirm ? (
        <ProcurementConfirmDialog
          title="Post Vendor Payment"
          description={`Post payment ${payment.payment_no} of ${rupees(payment.amount)} to accounting? This reduces vendor payable and cannot be undone.`}
          confirmLabel="Post Payment"
          onConfirm={handlePost}
          onCancel={() => setPostConfirm(false)}
        />
      ) : null}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
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
      const [payRes, vendorRes, billRes, financeRes] = await Promise.allSettled([
        listVendorPayments({ page_size: 200 }),
        listVendorsLite({ page_size: 200, is_active: true }),
        listVendorBills({ status: "POSTED", page_size: 200 }),
        listFinanceAccounts({ page_size: 500, is_active: 1, for_payment_collection: 1 }),
      ]);
      if (payRes.status === "fulfilled") setRows(payRes.value.results);
      else setError("Failed to load vendor payments.");
      if (vendorRes.status === "fulfilled") setVendors(vendorRes.value.results);
      else setError("Failed to load vendors for vendor payments.");
      if (billRes.status === "fulfilled") setBills(billRes.value.results);
      else setError("Failed to load posted vendor bills.");
      if (financeRes.status === "fulfilled") {
        setFinanceAccounts(financeRes.value.results.filter((account) => account.is_real_settlement_account !== false));
      } else setError("Failed to load finance accounts for vendor payments.");
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
    void load();
  }

  return (
    <ERPPageShell
      eyebrow="Purchases & Vendors"
      title="Vendor Payments"
      subtitle="Record and post vendor payments. Posting creates an accounting journal entry reducing vendor payable."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Purchases", href: ROUTES.admin.purchases },
        { label: "Vendor Payments" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
      stats={[
        { label: "Payments", value: loading ? "—" : rows.length, tone: "info" },
        { label: "Draft (unposted)", value: loading ? "—" : rows.filter(r => r.status === "DRAFT").length, tone: !loading && rows.filter(r => r.status === "DRAFT").length > 0 ? "warning" : "success" },
        { label: "Posted", value: loading ? "—" : rows.filter(r => r.status === "POSTED").length, tone: "success" },
        { label: "Posted Value", value: loading ? "—" : `₹${rows.filter(r => r.status === "POSTED").reduce((s, r) => s + Number(r.amount || 0), 0).toLocaleString("en-IN")}`, tone: "default" },
      ]}
    >
      <ERPSectionShell
        title="Vendor Payments"
        description="Payments reduce vendor payable source records. Accounting bridge status is confirmed in Accounting & Reconciliation."
        actions={<button onClick={() => setShowCreate(true)} className="h-8 rounded-xl border border-primary bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90">+ New Payment</button>}
      >
        {loading ? <ERPLoadingState label="Loading vendor payments…" /> : null}
        {!loading && error ? <ERPErrorState title="Load error" description={error} onRetry={() => void load()} /> : null}

        {showCreate ? (
          <div className="mb-6 rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold text-foreground">New Vendor Payment</h3>
            <CreatePaymentForm vendors={vendors} bills={bills} financeAccounts={financeAccounts} onSaved={handleSaved} onCancel={() => setShowCreate(false)} />
          </div>
        ) : null}

        {!loading && !error && rows.length === 0 && !showCreate ? (
          <ERPEmptyState title="No vendor payments" description="Create a vendor payment against a posted vendor bill." />
        ) : null}

        {!loading && !error && rows.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Payment No</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3">Bill</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Documents</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {rows.map((payment) => (
                  <tr key={payment.id} onClick={() => setSelected(payment)} className="cursor-pointer hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-3 font-medium text-primary">{payment.payment_no}</td>
                    <td className="px-4 py-3">{fmt(payment.payment_date)}</td>
                    <td className="px-4 py-3">{payment.vendor_name ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{payment.vendor_bill_no ?? "—"}</td>
                    <td className="px-4 py-3 font-medium">{rupees(payment.amount)}</td>
                    <td className="px-4 py-3">{statusBadge(payment.status)}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <Link
                        href={buildAdminVendorPaymentVoucherPrintRoute(payment.id)}
                        className="inline-flex h-7 items-center rounded-lg border border-amber-300 bg-amber-50 px-3 text-[11px] font-semibold text-amber-950 hover:bg-amber-100"
                      >
                        Voucher
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </ERPSectionShell>

      {selected ? (
        <PaymentDetailDrawer payment={selected} onPosted={handlePosted} onClose={() => setSelected(null)} />
      ) : null}
    </ERPPageShell>
  );
}
