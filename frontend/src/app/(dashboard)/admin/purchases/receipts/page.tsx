"use client";

import { useCallback, useEffect, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ProcurementConfirmDialog from "@/components/procurement/ProcurementConfirmDialog";
import { ROUTES } from "@/lib/routes";
import {
  createGoodsReceipt,
  listGoodsReceipts,
  listInventoryItems,
  listPurchaseOrders,
  postGoodsReceipt,
  type GoodsReceipt,
  type GoodsReceiptLine,
  type InventoryItem,
  type PurchaseOrder,
} from "@/services/inventory";

function statusBadge(s: GoodsReceipt["status"]) {
  const map: Record<GoodsReceipt["status"], string> = {
    DRAFT: "bg-blue-50 text-blue-700",
    RECEIVED: "bg-green-50 text-green-700",
    CANCELLED: "bg-gray-100 text-gray-500",
  };
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${map[s] ?? ""}`}>{s}</span>;
}

function fmt(d?: string | null) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-IN"); } catch { return d; }
}

// ── Create GR form ────────────────────────────────────────────────────────────
interface CreateGRFormProps {
  purchaseOrders: PurchaseOrder[];
  items: InventoryItem[];
  onSaved: (gr: GoodsReceipt) => void;
  onCancel: () => void;
}
function CreateGRForm({ purchaseOrders, items, onSaved, onCancel }: CreateGRFormProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [poId, setPoId] = useState("");
  const [receiptDate, setReceiptDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<GoodsReceiptLine[]>([{ inventory_item: 0, quantity_received: "1" }]);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const selectedPO = purchaseOrders.find((p) => String(p.id) === poId);

  // Prefill lines from PO when PO is selected
  useEffect(() => {
    if (!selectedPO || !selectedPO.lines?.length) return;
    setLines(selectedPO.lines.map((l) => ({
      inventory_item: l.inventory_item,
      purchase_order_line: l.id ?? undefined,
      quantity_received: l.quantity,
      unit_cost: l.unit_cost,
      inventory_item_sku: l.inventory_item_sku,
      inventory_item_product_name: l.inventory_item_product_name,
    })));
  }, [poId]); // eslint-disable-line react-hooks/exhaustive-deps

  function setLine(i: number, patch: Partial<GoodsReceiptLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() { setLines((prev) => [...prev, { inventory_item: 0, quantity_received: "1" }]); }
  function removeLine(i: number) { setLines((prev) => prev.filter((_, idx) => idx !== i)); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!poId) errs.po = "Purchase order is required.";
    if (!receiptDate) errs.receipt_date = "Date is required.";
    const validLines = lines.filter((l) => l.inventory_item);
    if (!validLines.length) errs.lines = "At least one line is required.";
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setBusy(true);
    try {
      const gr = await createGoodsReceipt({
        purchase_order: Number(poId),
        receipt_date: receiptDate,
        notes,
        lines: validLines.map((l) => ({
          purchase_order_line: l.purchase_order_line ?? undefined,
          inventory_item: Number(l.inventory_item),
          quantity_received: l.quantity_received,
          unit_cost: l.unit_cost,
          notes: l.notes ?? "",
        })),
      });
      onSaved(gr);
    } catch (err: unknown) {
      const detail = (err as { body?: { detail?: string; lines?: string } })?.body;
      setErrors({ submit: detail?.detail ?? detail?.lines ?? "Failed to create goods receipt." });
    } finally {
      setBusy(false);
    }
  }

  const inputCls = "h-9 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";
  const draftPOs = purchaseOrders.filter((p) => ["DRAFT", "SENT", "PARTIALLY_RECEIVED"].includes(p.status));

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Purchase Order *</label>
          <select value={poId} onChange={(e) => setPoId(e.target.value)} className={inputCls}>
            <option value="">— Select PO —</option>
            {draftPOs.map((p) => (
              <option key={p.id} value={p.id}>{p.po_no} — {p.vendor_name}</option>
            ))}
          </select>
          {errors.po ? <p className="mt-0.5 text-[10px] text-red-600">{errors.po}</p> : null}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Receipt Date *</label>
          <input type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} className={inputCls} />
        </div>
        <div className="col-span-2">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Notes</label>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} placeholder="Optional" />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold text-foreground">Lines {selectedPO ? "(pre-filled from PO)" : ""}</p>
          <button type="button" onClick={addLine} className="h-7 rounded-lg border border-border px-3 text-[11px] font-medium hover:bg-muted">+ Add</button>
        </div>
        {errors.lines ? <p className="mb-1 text-[10px] text-red-600">{errors.lines}</p> : null}
        <div className="space-y-2">
          {lines.map((line, i) => (
            <div key={i} className="grid grid-cols-[1fr_100px_90px_32px] gap-2 items-center">
              <select
                value={line.inventory_item || ""}
                onChange={(e) => setLine(i, { inventory_item: Number(e.target.value) })}
                className={inputCls}
              >
                <option value="">— Item —</option>
                {items.map((it) => (
                  <option key={it.id} value={it.id}>{line.inventory_item === it.id && line.inventory_item_product_name ? line.inventory_item_product_name : it.product_name} ({it.sku ?? "—"})</option>
                ))}
              </select>
              <input
                type="number"
                min="0.001"
                step="0.001"
                placeholder="Qty received"
                value={line.quantity_received}
                onChange={(e) => setLine(i, { quantity_received: e.target.value })}
                className={inputCls}
              />
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Unit cost"
                value={line.unit_cost ?? ""}
                onChange={(e) => setLine(i, { unit_cost: e.target.value })}
                className={inputCls}
              />
              <button type="button" onClick={() => removeLine(i)} disabled={lines.length === 1} className="h-9 w-8 rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-30">✕</button>
            </div>
          ))}
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">Columns: Item · Qty Received · Unit Cost</p>
      </div>

      {errors.submit ? <p className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">{errors.submit}</p> : null}

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="h-9 rounded-xl border border-border bg-background px-4 text-sm font-medium hover:bg-muted">Cancel</button>
        <button type="submit" disabled={busy} className="h-9 rounded-xl border border-primary bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {busy ? "Saving…" : "Save Receipt"}
        </button>
      </div>
    </form>
  );
}

// ── Detail drawer ─────────────────────────────────────────────────────────────
interface DetailDrawerProps {
  gr: GoodsReceipt;
  onPosted: (gr: GoodsReceipt) => void;
  onClose: () => void;
}
function GRDetailDrawer({ gr, onPosted, onClose }: DetailDrawerProps) {
  const [postConfirm, setPostConfirm] = useState(false);

  async function handlePost() {
    const result = await postGoodsReceipt(gr.id);
    onPosted(result.goods_receipt);
    setPostConfirm(false);
  }

  const canPost = gr.status === "DRAFT";

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="relative z-50 flex h-full w-full max-w-lg flex-col bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="text-xs text-muted-foreground">Goods Receipt</p>
            <h2 className="text-lg font-semibold text-foreground">{gr.receipt_no}</h2>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-lg border border-border hover:bg-muted">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-[10px] text-muted-foreground">Status</p>{statusBadge(gr.status)}</div>
            <div><p className="text-[10px] text-muted-foreground">Vendor</p><p className="font-medium">{gr.vendor_name ?? "—"}</p></div>
            <div><p className="text-[10px] text-muted-foreground">PO No</p><p>{gr.purchase_order_no ?? `#${gr.purchase_order}`}</p></div>
            <div><p className="text-[10px] text-muted-foreground">Receipt Date</p><p>{fmt(gr.receipt_date)}</p></div>
            {gr.posted_at ? <div><p className="text-[10px] text-muted-foreground">Posted</p><p>{fmt(gr.posted_at)} by {gr.posted_by_username}</p></div> : null}
            {gr.notes ? <div className="col-span-2"><p className="text-[10px] text-muted-foreground">Notes</p><p className="whitespace-pre-wrap">{gr.notes}</p></div> : null}
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-foreground">Lines Received</p>
            {!gr.lines?.length ? <p className="text-xs text-muted-foreground">No lines.</p> : (
              <table className="min-w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr><th className="py-1 pr-3">Item</th><th className="py-1 pr-3">Qty Received</th><th className="py-1">Unit Cost</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {gr.lines.map((l, i) => (
                    <tr key={l.id ?? i}>
                      <td className="py-1.5 pr-3">{l.inventory_item_product_name ?? `Item #${l.inventory_item}`}</td>
                      <td className="py-1.5 pr-3">{l.quantity_received}</td>
                      <td className="py-1.5">₹{parseFloat(l.unit_cost ?? "0").toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {gr.status === "RECEIVED" ? (
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-xs text-green-800">
              Receipt posted. Stock ledger has been updated. To create a vendor bill, go to Purchase Bills.
            </div>
          ) : null}
        </div>

        <div className="border-t border-border px-5 py-4 flex gap-3 items-center">
          {canPost ? (
            <button onClick={() => setPostConfirm(true)} className="h-9 rounded-xl border border-green-600 bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700">
              Post Receipt → Stock
            </button>
          ) : null}
          {!canPost && gr.status === "DRAFT" ? null : null}
          {gr.status !== "DRAFT" && gr.status !== "RECEIVED" ? (
            <span className="text-xs text-muted-foreground italic">Cannot post — status: {gr.status}</span>
          ) : null}
          <button onClick={onClose} className="ml-auto h-9 rounded-xl border border-border bg-background px-4 text-sm font-medium hover:bg-muted">Close</button>
        </div>
      </aside>
      {postConfirm ? (
        <ProcurementConfirmDialog
          title="Post Goods Receipt"
          description={`Post ${gr.receipt_no}? This creates stock ledger IN entries and cannot be undone.`}
          confirmLabel="Post Receipt"
          onConfirm={handlePost}
          onCancel={() => setPostConfirm(false)}
        />
      ) : null}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function AdminPurchaseReceiptsPage() {
  const [rows, setRows] = useState<GoodsReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<GoodsReceipt | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [grRes, poRes, itemRes] = await Promise.allSettled([
        listGoodsReceipts(),
        listPurchaseOrders({ page_size: 200 }),
        listInventoryItems({ is_active: true, page_size: 500 }),
      ]);
      if (grRes.status === "fulfilled") setRows(grRes.value.results);
      else setError("Failed to load goods receipts.");
      if (poRes.status === "fulfilled") setPurchaseOrders(poRes.value.results);
      if (itemRes.status === "fulfilled") setItems(itemRes.value.results);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function handleSaved(gr: GoodsReceipt) {
    setRows((prev) => [gr, ...prev]);
    setShowCreate(false);
  }

  function handlePosted(gr: GoodsReceipt) {
    setRows((prev) => prev.map((r) => (r.id === gr.id ? gr : r)));
    setSelected(gr);
  }

  return (
    <ERPPageShell
      title="Goods Receipts"
      subtitle="Receive goods against a PO. Posting creates stock ledger IN entries."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Purchases", href: ROUTES.admin.purchases },
        { label: "Goods Receipts" },
      ]}
    >
      <ERPSectionShell
        title="Goods Receipts"
        description="Post only after physical verification. Stock is not updated until the receipt is posted."
        actions={<button onClick={() => setShowCreate(true)} className="h-8 rounded-xl border border-primary bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90">+ New Receipt</button>}
      >
        {loading ? <ERPLoadingState label="Loading goods receipts…" /> : null}
        {!loading && error ? <ERPErrorState title="Load error" description={error} onRetry={() => void load()} /> : null}

        {showCreate ? (
          <div className="mb-6 rounded-2xl border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold text-foreground">New Goods Receipt</h3>
            <CreateGRForm purchaseOrders={purchaseOrders} items={items} onSaved={handleSaved} onCancel={() => setShowCreate(false)} />
          </div>
        ) : null}

        {!loading && !error && rows.length === 0 && !showCreate ? (
          <ERPEmptyState title="No goods receipts" description="Create a receipt against a purchase order." />
        ) : null}

        {!loading && !error && rows.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--surface-muted)]">
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Receipt No</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">PO No</th>
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3">Lines</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {rows.map((gr) => (
                  <tr key={gr.id} onClick={() => setSelected(gr)} className="cursor-pointer hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-3 font-medium text-primary">{gr.receipt_no}</td>
                    <td className="px-4 py-3">{fmt(gr.receipt_date)}</td>
                    <td className="px-4 py-3">{gr.purchase_order_no ?? `#${gr.purchase_order}`}</td>
                    <td className="px-4 py-3">{gr.vendor_name ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{gr.lines?.length ?? 0}</td>
                    <td className="px-4 py-3">{statusBadge(gr.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </ERPSectionShell>

      {selected ? (
        <GRDetailDrawer gr={selected} onPosted={handlePosted} onClose={() => setSelected(null)} />
      ) : null}
    </ERPPageShell>
  );
}
