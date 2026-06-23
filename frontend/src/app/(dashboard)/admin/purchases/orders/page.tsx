"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ProcurementConfirmDialog from "@/components/procurement/ProcurementConfirmDialog";
import { ROUTES } from "@/lib/routes";
import {
  cancelPurchaseOrder,
  createPurchaseOrder,
  listInventoryItems,
  listPurchaseOrders,
  listVendorsLite,
  type InventoryItem,
  type PurchaseOrder,
  type PurchaseOrderLine,
  type VendorLite,
} from "@/services/inventory";

function statusBadge(s: PurchaseOrder["status"]) {
  const map: Record<PurchaseOrder["status"], string> = {
    DRAFT: "bg-blue-50 text-blue-700",
    SENT: "bg-indigo-50 text-indigo-700",
    PARTIALLY_RECEIVED: "bg-amber-50 text-amber-700",
    RECEIVED: "bg-green-50 text-green-700",
    BILLED: "bg-purple-50 text-purple-700",
    CANCELLED: "bg-gray-100 text-gray-500",
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${map[s] ?? ""}`}>
      {s.replace(/_/g, " ")}
    </span>
  );
}

function fmt(d?: string | null) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-IN"); } catch { return d; }
}

function EmptyLine(): PurchaseOrderLine {
  return { inventory_item: 0, quantity: "1", unit_cost: "0.00", tax_amount: "0.00" };
}

// ── Create PO form ────────────────────────────────────────────────────────────
interface CreatePOFormProps {
  vendors: VendorLite[];
  items: InventoryItem[];
  onSaved: (po: PurchaseOrder) => void;
  onCancel: () => void;
}
function CreatePOForm({ vendors, items, onSaved, onCancel }: CreatePOFormProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [vendorId, setVendorId] = useState("");
  const [poDate, setPoDate] = useState(today);
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<PurchaseOrderLine[]>([EmptyLine()]);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function setLine(i: number, patch: Partial<PurchaseOrderLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() { setLines((prev) => [...prev, EmptyLine()]); }
  function removeLine(i: number) { setLines((prev) => prev.filter((_, idx) => idx !== i)); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!vendorId) errs.vendor = "Vendor is required.";
    if (!poDate) errs.po_date = "Date is required.";
    const validLines = lines.filter((l) => l.inventory_item);
    if (!validLines.length) errs.lines = "At least one line item is required.";
    validLines.forEach((l, i) => {
      if (parseFloat(l.quantity) <= 0) errs[`qty_${i}`] = "Quantity must be > 0.";
      if (parseFloat(l.unit_cost) < 0) errs[`cost_${i}`] = "Unit cost cannot be negative.";
    });
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setBusy(true);
    try {
      const po = await createPurchaseOrder({
        vendor: Number(vendorId),
        po_date: poDate,
        expected_date: expectedDate || null,
        notes,
        lines: validLines.map((l) => ({
          inventory_item: Number(l.inventory_item),
          description: l.description ?? "",
          quantity: l.quantity,
          unit_cost: l.unit_cost,
          tax_amount: l.tax_amount ?? "0.00",
        })),
      });
      onSaved(po);
    } catch (err: unknown) {
      const detail = (err as { body?: { detail?: string; lines?: string } })?.body;
      setErrors({ submit: detail?.detail ?? detail?.lines ?? "Failed to create purchase order." });
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
            <option value="">— Select vendor —</option>
            {vendors.filter((v) => v.is_active).map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
          {errors.vendor ? <p className="mt-0.5 text-[10px] text-red-600">{errors.vendor}</p> : null}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">PO Date *</label>
          <input type="date" value={poDate} onChange={(e) => setPoDate(e.target.value)} className={inputCls} />
          {errors.po_date ? <p className="mt-0.5 text-[10px] text-red-600">{errors.po_date}</p> : null}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Expected Delivery</label>
          <input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Notes</label>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} placeholder="Optional" />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold text-foreground">Line Items</p>
          <button type="button" onClick={addLine} className="h-7 rounded-lg border border-border px-3 text-[11px] font-medium hover:bg-muted">
            + Add Line
          </button>
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
                {items.map((it) => (
                  <option key={it.id} value={it.id}>{it.product_name} ({it.sku ?? "—"})</option>
                ))}
              </select>
              <input
                type="number"
                min="0.001"
                step="0.001"
                placeholder="Qty"
                value={line.quantity}
                onChange={(e) => setLine(i, { quantity: e.target.value })}
                className={inputCls}
              />
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Unit cost"
                value={line.unit_cost}
                onChange={(e) => setLine(i, { unit_cost: e.target.value })}
                className={inputCls}
              />
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Tax"
                value={line.tax_amount ?? ""}
                onChange={(e) => setLine(i, { tax_amount: e.target.value })}
                className={inputCls}
              />
              <button type="button" onClick={() => removeLine(i)} disabled={lines.length === 1} className="h-9 w-8 rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-30">✕</button>
            </div>
          ))}
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">Columns: Item · Qty · Unit Cost · Tax</p>
      </div>

      {errors.submit ? <p className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">{errors.submit}</p> : null}

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="h-9 rounded-xl border border-border bg-background px-4 text-sm font-medium hover:bg-muted">Cancel</button>
        <button type="submit" disabled={busy} className="h-9 rounded-xl border border-primary bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {busy ? "Creating…" : "Create PO"}
        </button>
      </div>
    </form>
  );
}

// ── Detail drawer ─────────────────────────────────────────────────────────────
interface DetailDrawerProps {
  po: PurchaseOrder;
  onCancelled: (po: PurchaseOrder) => void;
  onClose: () => void;
}
function PODetailDrawer({ po, onCancelled, onClose }: DetailDrawerProps) {
  const [cancelConfirm, setCancelConfirm] = useState(false);

  async function handleCancel() {
    const result = await cancelPurchaseOrder(po.id);
    onCancelled(result.purchase_order);
    setCancelConfirm(false);
  }

  const canCancel = po.status === "DRAFT";
  const lineTotal = po.lines.reduce((sum, l) => sum + parseFloat(l.unit_cost) * parseFloat(l.quantity), 0);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="relative z-50 flex h-full w-full max-w-lg flex-col bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="text-xs text-muted-foreground">Purchase Order</p>
            <h2 className="text-lg font-semibold text-foreground">{po.po_no}</h2>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-lg border border-border hover:bg-muted">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-[10px] text-muted-foreground">Status</p>{statusBadge(po.status)}</div>
            <div><p className="text-[10px] text-muted-foreground">Vendor</p><p className="font-medium">{po.vendor_name ?? `#${po.vendor}`}</p></div>
            <div><p className="text-[10px] text-muted-foreground">PO Date</p><p>{fmt(po.po_date)}</p></div>
            <div><p className="text-[10px] text-muted-foreground">Expected</p><p>{fmt(po.expected_date)}</p></div>
            {po.stock_location_name ? <div><p className="text-[10px] text-muted-foreground">Stock Location</p><p>{po.stock_location_name}</p></div> : null}
            {po.notes ? <div className="col-span-2"><p className="text-[10px] text-muted-foreground">Notes</p><p className="whitespace-pre-wrap">{po.notes}</p></div> : null}
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-foreground">Line Items</p>
            {po.lines.length === 0 ? (
              <p className="text-xs text-muted-foreground">No lines recorded.</p>
            ) : (
              <table className="min-w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr><th className="py-1 pr-3">Item</th><th className="py-1 pr-3">Qty</th><th className="py-1 pr-3">Unit Cost</th><th className="py-1">Tax</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {po.lines.map((l, i) => (
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
            <p className="mt-2 text-right text-xs font-semibold text-foreground">Subtotal: ₹{lineTotal.toFixed(2)}</p>
          </div>
        </div>

        <div className="border-t border-border px-5 py-4 flex gap-3">
          {canCancel ? (
            <button
              onClick={() => setCancelConfirm(true)}
              className="h-9 rounded-xl border border-red-300 bg-red-50 px-4 text-sm font-semibold text-red-700 hover:bg-red-100"
            >
              Cancel PO
            </button>
          ) : (
            <span className="text-xs text-muted-foreground italic">Cancel only available in DRAFT state.</span>
          )}
          <button onClick={onClose} className="ml-auto h-9 rounded-xl border border-border bg-background px-4 text-sm font-medium hover:bg-muted">Close</button>
        </div>
      </aside>
      {cancelConfirm ? (
        <ProcurementConfirmDialog
          title="Cancel Purchase Order"
          description={`Cancel PO ${po.po_no}? This action cannot be undone.`}
          confirmLabel="Yes, Cancel PO"
          confirmTone="danger"
          onConfirm={handleCancel}
          onCancel={() => setCancelConfirm(false)}
        />
      ) : null}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function AdminPurchaseOrdersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vendors, setVendors] = useState<VendorLite[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<PurchaseOrder | null>(null);

  // Restore drawer from ?id= query param
  useEffect(() => {
    const id = searchParams.get("id");
    if (id && rows.length > 0) {
      const found = rows.find((r) => String(r.id) === id);
      if (found) setSelected(found);
    }
  }, [searchParams, rows]);

  function openDrawer(po: PurchaseOrder) {
    setSelected(po);
    router.replace(`?id=${po.id}`, { scroll: false });
  }

  function closeDrawer() {
    setSelected(null);
    router.replace("?", { scroll: false });
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [poRes, vendorRes, itemRes] = await Promise.allSettled([
        listPurchaseOrders(),
        listVendorsLite(),
        listInventoryItems({ is_active: true, page_size: 500 }),
      ]);
      if (poRes.status === "fulfilled") setRows(poRes.value.results);
      else setError("Failed to load purchase orders.");
      if (vendorRes.status === "fulfilled") setVendors(vendorRes.value.results);
      if (itemRes.status === "fulfilled") setItems(itemRes.value.results);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function handleSaved(po: PurchaseOrder) {
    setRows((prev) => [po, ...prev]);
    setShowCreate(false);
  }

  function handleCancelled(po: PurchaseOrder) {
    setRows((prev) => prev.map((r) => (r.id === po.id ? po : r)));
    setSelected(po);
  }

  return (
    <ERPPageShell
      title="Purchase Orders"
      subtitle="Create and manage purchase orders. Cancel is only available in Draft state."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Purchases", href: ROUTES.admin.purchases },
        { label: "Purchase Orders" },
      ]}
    >
      <ERPSectionShell
        title="Purchase Orders"
        description="Click a row to view details and actions."
        actions={<button onClick={() => setShowCreate(true)} className="h-8 rounded-xl border border-primary bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90">+ New PO</button>}
      >
        {loading ? <ERPLoadingState label="Loading purchase orders…" /> : null}
        {!loading && error ? <ERPErrorState title="Load error" description={error} onRetry={() => void load()} /> : null}

        {showCreate ? (
          <div className="mb-6 rounded-2xl border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold text-foreground">New Purchase Order</h3>
            <CreatePOForm vendors={vendors} items={items} onSaved={handleSaved} onCancel={() => setShowCreate(false)} />
          </div>
        ) : null}

        {!loading && !error && rows.length === 0 && !showCreate ? (
          <ERPEmptyState title="No purchase orders" description="Create the first purchase order." />
        ) : null}

        {!loading && !error && rows.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--surface-muted)]">
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">PO No</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3">Expected</th>
                  <th className="px-4 py-3">Lines</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {rows.map((po) => (
                  <tr
                    key={po.id}
                    onClick={() => openDrawer(po)}
                    className="cursor-pointer hover:bg-muted/40 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-primary">{po.po_no}</td>
                    <td className="px-4 py-3">{fmt(po.po_date)}</td>
                    <td className="px-4 py-3">{po.vendor_name ?? `#${po.vendor}`}</td>
                    <td className="px-4 py-3 text-muted-foreground">{fmt(po.expected_date)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{po.lines?.length ?? 0}</td>
                    <td className="px-4 py-3">{statusBadge(po.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </ERPSectionShell>

      {selected ? (
        <PODetailDrawer
          po={selected}
          onCancelled={handleCancelled}
          onClose={closeDrawer}
        />
      ) : null}
    </ERPPageShell>
  );
}
