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
import { buildAdminPurchaseBillPrintRoute } from "@/lib/route-builders";
import { ROUTES } from "@/lib/routes";
import {
  createVendorBill,
  listGoodsReceipts,
  listInventoryItems,
  listVendorBills,
  listVendorsLite,
  postVendorBill,
  type GoodsReceipt,
  type InventoryItem,
  type VendorBill,
  type VendorBillLine,
  type VendorLite,
} from "@/services/inventory";

function statusBadge(s: VendorBill["status"]) {
  const map: Record<VendorBill["status"], string> = {
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

// ── Create Bill form ──────────────────────────────────────────────────────────
interface CreateBillFormProps {
  vendors: VendorLite[];
  receipts: GoodsReceipt[];
  items: InventoryItem[];
  onSaved: (bill: VendorBill) => void;
  onCancel: () => void;
}

function EmptyLine(): VendorBillLine {
  return { inventory_item: 0, quantity: "1", unit_cost: "0" };
}

function CreateBillForm({ vendors, receipts, items, onSaved, onCancel }: CreateBillFormProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [vendorId, setVendorId] = useState("");
  const [billNo, setBillNo] = useState("");
  const [billDate, setBillDate] = useState(today);
  const [grId, setGrId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<VendorBillLine[]>([EmptyLine()]);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const vendorReceipts = receipts.filter(
    (r) => !vendorId || String(r.vendor_name) === vendors.find((v) => String(v.id) === vendorId)?.name
  );

  function setLine(i: number, patch: Partial<VendorBillLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() { setLines((prev) => [...prev, EmptyLine()]); }
  function removeLine(i: number) { setLines((prev) => prev.filter((_, idx) => idx !== i)); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!vendorId) errs.vendor = "Vendor is required.";
    if (!billDate) errs.bill_date = "Date is required.";
    const validLines = lines.filter((l) => l.inventory_item && parseFloat(l.quantity) > 0);
    if (!validLines.length) errs.lines = "At least one line with item and quantity > 0 is required.";
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setBusy(true);
    try {
      const bill = await createVendorBill({
        bill_no: billNo || undefined,
        bill_date: billDate,
        vendor: Number(vendorId),
        goods_receipt: grId ? Number(grId) : null,
        notes,
        lines: validLines.map((l) => ({
          inventory_item: Number(l.inventory_item),
          quantity: l.quantity,
          unit_cost: l.unit_cost,
          tax_amount: l.tax_amount ?? undefined,
        })),
      });
      onSaved(bill);
    } catch (err: unknown) {
      setErrors({ submit: accountingErrorMessage(err, "Failed to create vendor bill.") });
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
          <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className={inputCls}>
            <option value="">— Select Vendor —</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          {errors.vendor ? <p className="mt-0.5 text-[10px] text-red-600">{errors.vendor}</p> : null}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Bill Date *</label>
          <input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} className={inputCls} />
          {errors.bill_date ? <p className="mt-0.5 text-[10px] text-red-600">{errors.bill_date}</p> : null}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Vendor Bill No (optional)</label>
          <input type="text" value={billNo} onChange={(e) => setBillNo(e.target.value)} placeholder="Leave blank to auto-generate" className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Goods Receipt (optional)</label>
          <select value={grId} onChange={(e) => setGrId(e.target.value)} className={inputCls}>
            <option value="">— None —</option>
            {vendorReceipts.filter((r) => r.status === "RECEIVED").map((r) => (
              <option key={r.id} value={r.id}>{r.receipt_no} — {fmt(r.receipt_date)}</option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Notes</label>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} placeholder="Optional" />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold text-foreground">Bill Lines</p>
          <button type="button" onClick={addLine} className="h-7 rounded-lg border border-border px-3 text-[11px] font-medium hover:bg-muted">+ Add</button>
        </div>
        {errors.lines ? <p className="mb-1 text-[10px] text-red-600">{errors.lines}</p> : null}
        <div className="space-y-2">
          {lines.map((line, i) => (
            <div key={i} className="grid grid-cols-[1fr_80px_90px_80px_32px] gap-2 items-center">
              <select
                value={line.inventory_item || ""}
                onChange={(e) => setLine(i, { inventory_item: Number(e.target.value) })}
                className={inputCls}
              >
                <option value="">— Item —</option>
                {items.map((it) => <option key={it.id} value={it.id}>{it.product_name} ({it.sku ?? "—"})</option>)}
              </select>
              <input type="number" min="0.001" step="0.001" placeholder="Qty" value={line.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} className={inputCls} />
              <input type="number" min="0" step="0.01" placeholder="Unit cost" value={line.unit_cost} onChange={(e) => setLine(i, { unit_cost: e.target.value })} className={inputCls} />
              <input type="number" min="0" step="0.01" placeholder="Tax" value={line.tax_amount ?? ""} onChange={(e) => setLine(i, { tax_amount: e.target.value })} className={inputCls} />
              <button type="button" onClick={() => removeLine(i)} disabled={lines.length === 1} className="h-9 w-8 rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-30">✕</button>
            </div>
          ))}
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">Columns: Item · Qty · Unit Cost · Tax Amount</p>
      </div>

      {errors.submit ? <p className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">{errors.submit}</p> : null}

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="h-9 rounded-xl border border-border bg-background px-4 text-sm font-medium hover:bg-muted">Cancel</button>
        <button type="submit" disabled={busy} className="h-9 rounded-xl border border-primary bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {busy ? "Saving…" : "Save Bill"}
        </button>
      </div>
    </form>
  );
}

// ── Detail drawer ─────────────────────────────────────────────────────────────
interface DetailDrawerProps {
  bill: VendorBill;
  onPosted: (bill: VendorBill) => void;
  onClose: () => void;
}
function BillDetailDrawer({ bill, onPosted, onClose }: DetailDrawerProps) {
  const [postConfirm, setPostConfirm] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  async function handlePost() {
    setPostError(null);
    try {
      const result = await postVendorBill(bill.id);
      onPosted(result.vendor_bill);
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
            <p className="text-xs text-muted-foreground">Vendor Bill</p>
            <h2 className="text-lg font-semibold text-foreground">{bill.bill_no}</h2>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-lg border border-border hover:bg-muted">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-[10px] text-muted-foreground">Status</p>{statusBadge(bill.status)}</div>
            <div><p className="text-[10px] text-muted-foreground">Vendor</p><p className="font-medium">{bill.vendor_name ?? "—"}</p></div>
            <div><p className="text-[10px] text-muted-foreground">Bill Date</p><p>{fmt(bill.bill_date)}</p></div>
            <div><p className="text-[10px] text-muted-foreground">Grand Total</p><p className="font-semibold text-primary">{rupees(bill.grand_total)}</p></div>
            <div><p className="text-[10px] text-muted-foreground">Subtotal</p><p>{rupees(bill.subtotal)}</p></div>
            <div><p className="text-[10px] text-muted-foreground">Tax Total</p><p>{rupees(bill.tax_total)}</p></div>
            {bill.goods_receipt_no ? <div><p className="text-[10px] text-muted-foreground">Goods Receipt</p><p>{bill.goods_receipt_no}</p></div> : null}
            {bill.purchase_order_no ? <div><p className="text-[10px] text-muted-foreground">PO No</p><p>{bill.purchase_order_no}</p></div> : null}
            {bill.posted_journal_entry_no ? <div className="col-span-2"><p className="text-[10px] text-muted-foreground">Journal Entry</p><p>{bill.posted_journal_entry_no}</p></div> : null}
            {bill.notes ? <div className="col-span-2"><p className="text-[10px] text-muted-foreground">Notes</p><p className="whitespace-pre-wrap">{bill.notes}</p></div> : null}
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-foreground">Bill Lines</p>
            {!bill.lines?.length ? <p className="text-xs text-muted-foreground">No lines.</p> : (
              <table className="min-w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr><th className="py-1 pr-3">Item</th><th className="py-1 pr-3">Qty</th><th className="py-1 pr-3">Unit Cost</th><th className="py-1">Tax</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {bill.lines.map((l, i) => (
                    <tr key={l.id ?? i}>
                      <td className="py-1.5 pr-3">{l.inventory_item_product_name ?? `Item #${l.inventory_item}`}</td>
                      <td className="py-1.5 pr-3">{l.quantity}</td>
                      <td className="py-1.5 pr-3">₹{parseFloat(l.unit_cost).toFixed(2)}</td>
                      <td className="py-1.5">₹{parseFloat(l.tax_amount ?? "0").toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {bill.status === "POSTED" ? (
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-xs text-green-800">
              Bill posted to accounting. Journal entry: {bill.posted_journal_entry_no ?? `#${bill.posted_journal_entry}`}
            </div>
          ) : null}

          {postError ? (
            <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-xs text-red-700">
              <p className="font-semibold">Post failed — accounting blocker</p>
              <p className="mt-1">{postError}</p>
            </div>
          ) : null}
        </div>

        <div className="border-t border-border px-5 py-4 flex gap-3 items-center flex-wrap">
          <Link
            href={buildAdminPurchaseBillPrintRoute(bill.id)}
            className="h-9 rounded-xl border border-amber-300 bg-amber-50 px-4 text-sm font-medium text-amber-900 hover:bg-amber-100"
          >
            PDF / Print
          </Link>
          {bill.status === "DRAFT" ? (
            <button onClick={() => setPostConfirm(true)} className="h-9 rounded-xl border border-green-600 bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700">
              Post Bill → Accounting
            </button>
          ) : null}
          <button onClick={onClose} className="ml-auto h-9 rounded-xl border border-border bg-background px-4 text-sm font-medium hover:bg-muted">Close</button>
        </div>
      </aside>
      {postConfirm ? (
        <ProcurementConfirmDialog
          title="Post Vendor Bill"
          description={`Post ${bill.bill_no} (${rupees(bill.grand_total)}) to accounting? This creates a payable journal entry and cannot be undone.`}
          confirmLabel="Post Bill"
          onConfirm={handlePost}
          onCancel={() => setPostConfirm(false)}
        />
      ) : null}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function AdminPurchaseBillsPage() {
  const [rows, setRows] = useState<VendorBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vendors, setVendors] = useState<VendorLite[]>([]);
  const [receipts, setReceipts] = useState<GoodsReceipt[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<VendorBill | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [billRes, vendorRes, grRes, itemRes] = await Promise.allSettled([
        listVendorBills(),
        listVendorsLite({ page_size: 200, is_active: true }),
        listGoodsReceipts({ status: "RECEIVED", page_size: 200 }),
        listInventoryItems({ is_active: true, page_size: 500 }),
      ]);
      if (billRes.status === "fulfilled") setRows(billRes.value.results);
      else setError("Failed to load vendor bills.");
      if (vendorRes.status === "fulfilled") setVendors(vendorRes.value.results);
      if (grRes.status === "fulfilled") setReceipts(grRes.value.results);
      if (itemRes.status === "fulfilled") setItems(itemRes.value.results);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function handleSaved(bill: VendorBill) {
    setRows((prev) => [bill, ...prev]);
    setShowCreate(false);
  }

  function handlePosted(bill: VendorBill) {
    setRows((prev) => prev.map((r) => (r.id === bill.id ? bill : r)));
    setSelected(bill);
  }

  return (
    <ERPPageShell
      eyebrow="Purchases & Vendors"
      title="Vendor Bills"
      subtitle="Post vendor bills to accounting. Creates a payable journal entry via account mappings."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Purchases", href: ROUTES.admin.purchases },
        { label: "Vendor Bills" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      <ERPSectionShell
        title="Vendor Bills"
        description="Posting uses system account mappings. Finance blockers returned by the backend are shown in the detail drawer."
        actions={<button onClick={() => setShowCreate(true)} className="h-8 rounded-xl border border-primary bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90">+ New Bill</button>}
      >
        {loading ? <ERPLoadingState label="Loading vendor bills…" /> : null}
        {!loading && error ? <ERPErrorState title="Load error" description={error} onRetry={() => void load()} /> : null}

        {showCreate ? (
          <div className="mb-6 rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold text-foreground">New Vendor Bill</h3>
            <CreateBillForm vendors={vendors} receipts={receipts} items={items} onSaved={handleSaved} onCancel={() => setShowCreate(false)} />
          </div>
        ) : null}

        {!loading && !error && rows.length === 0 && !showCreate ? (
          <ERPEmptyState title="No vendor bills" description="Create a vendor bill against a posted goods receipt." />
        ) : null}

        {!loading && !error && rows.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Bill No</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3">Grand Total</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Documents</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {rows.map((bill) => (
                  <tr key={bill.id} onClick={() => setSelected(bill)} className="cursor-pointer hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-3 font-medium text-primary">{bill.bill_no}</td>
                    <td className="px-4 py-3">{fmt(bill.bill_date)}</td>
                    <td className="px-4 py-3">{bill.vendor_name ?? "—"}</td>
                    <td className="px-4 py-3 font-medium">{rupees(bill.grand_total)}</td>
                    <td className="px-4 py-3">{statusBadge(bill.status)}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <Link
                        href={buildAdminPurchaseBillPrintRoute(bill.id)}
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
        ) : null}
      </ERPSectionShell>

      {selected ? (
        <BillDetailDrawer bill={selected} onPosted={handlePosted} onClose={() => setSelected(null)} />
      ) : null}
    </ERPPageShell>
  );
}
