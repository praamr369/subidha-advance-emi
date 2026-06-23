"use client";

import { useCallback, useEffect, useState } from "react";

import { accountingErrorMessage } from "@/components/accounting/shared";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";
import {
  approvePurchaseRequest,
  convertPurchaseRequestToPO,
  createPurchaseRequest,
  listInventoryItems,
  listPurchaseRequests,
  listVendorsLite,
  type InventoryItem,
  type PurchaseRequest,
  type PurchaseRequestLine,
  type VendorLite,
} from "@/services/inventory";

function statusBadge(s: PurchaseRequest["status"]) {
  const map: Record<PurchaseRequest["status"], string> = {
    DRAFT: "bg-blue-50 text-blue-700",
    APPROVED: "bg-green-50 text-green-700",
    PARTIALLY_ORDERED: "bg-amber-50 text-amber-700",
    ORDERED: "bg-purple-50 text-purple-700",
    CANCELLED: "bg-gray-100 text-gray-500",
  };
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${map[s] ?? ""}`}>{s.replace(/_/g, " ")}</span>;
}

function fmt(d?: string | null) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-IN"); } catch { return d; }
}

// ── Create Request form ────────────────────────────────────────────────────────
interface CreateRequestFormProps {
  vendors: VendorLite[];
  items: InventoryItem[];
  onSaved: (req: PurchaseRequest) => void;
  onCancel: () => void;
}

function EmptyLine(): PurchaseRequestLine {
  return { inventory_item: 0, quantity_requested: "1" };
}

function CreateRequestForm({ vendors, items, onSaved, onCancel }: CreateRequestFormProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [requestDate, setRequestDate] = useState(today);
  const [vendorId, setVendorId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<PurchaseRequestLine[]>([EmptyLine()]);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function setLine(i: number, patch: Partial<PurchaseRequestLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() { setLines((prev) => [...prev, EmptyLine()]); }
  function removeLine(i: number) { setLines((prev) => prev.filter((_, idx) => idx !== i)); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!requestDate) errs.request_date = "Date is required.";
    const validLines = lines.filter((l) => l.inventory_item && parseFloat(l.quantity_requested) > 0);
    if (!validLines.length) errs.lines = "At least one line with item and quantity > 0 is required.";
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setBusy(true);
    try {
      const req = await createPurchaseRequest({
        request_date: requestDate,
        vendor: vendorId ? Number(vendorId) : null,
        notes,
        lines: validLines.map((l) => ({
          inventory_item: Number(l.inventory_item),
          quantity_requested: l.quantity_requested,
          notes: l.notes ?? "",
        })),
      });
      onSaved(req);
    } catch (err: unknown) {
      setErrors({ submit: accountingErrorMessage(err, "Failed to create purchase request.") });
    } finally {
      setBusy(false);
    }
  }

  const inputCls = "h-9 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Request Date *</label>
          <input type="date" value={requestDate} onChange={(e) => setRequestDate(e.target.value)} className={inputCls} />
          {errors.request_date ? <p className="mt-0.5 text-[10px] text-red-600">{errors.request_date}</p> : null}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Preferred Vendor (optional)</label>
          <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className={inputCls}>
            <option value="">— None —</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Notes</label>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} placeholder="Reason for request (optional)" />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold text-foreground">Requested Items</p>
          <button type="button" onClick={addLine} className="h-7 rounded-lg border border-border px-3 text-[11px] font-medium hover:bg-muted">+ Add</button>
        </div>
        {errors.lines ? <p className="mb-1 text-[10px] text-red-600">{errors.lines}</p> : null}
        <div className="space-y-2">
          {lines.map((line, i) => (
            <div key={i} className="grid grid-cols-[1fr_100px_32px] gap-2 items-center">
              <select
                value={line.inventory_item || ""}
                onChange={(e) => setLine(i, { inventory_item: Number(e.target.value) })}
                className={inputCls}
              >
                <option value="">— Item —</option>
                {items.map((it) => <option key={it.id} value={it.id}>{it.product_name} ({it.sku ?? "—"})</option>)}
              </select>
              <input
                type="number"
                min="1"
                step="1"
                placeholder="Qty"
                value={line.quantity_requested}
                onChange={(e) => setLine(i, { quantity_requested: e.target.value })}
                className={inputCls}
              />
              <button type="button" onClick={() => removeLine(i)} disabled={lines.length === 1} className="h-9 w-8 rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-30">✕</button>
            </div>
          ))}
        </div>
      </div>

      {errors.submit ? <p className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">{errors.submit}</p> : null}

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="h-9 rounded-xl border border-border bg-background px-4 text-sm font-medium hover:bg-muted">Cancel</button>
        <button type="submit" disabled={busy} className="h-9 rounded-xl border border-primary bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {busy ? "Saving…" : "Save Request"}
        </button>
      </div>
    </form>
  );
}

// ── Detail drawer ─────────────────────────────────────────────────────────────
interface DetailDrawerProps {
  req: PurchaseRequest;
  onUpdated: (req: PurchaseRequest) => void;
  onClose: () => void;
}
function RequestDetailDrawer({ req: initialReq, onUpdated, onClose }: DetailDrawerProps) {
  const [req, setReq] = useState(initialReq);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"approve" | "convert" | null>(null);

  async function handleApprove() {
    setBusy("approve");
    setActionError(null);
    try {
      const result = await approvePurchaseRequest(req.id);
      const updated = result.purchase_request;
      setReq(updated);
      onUpdated(updated);
    } catch (err: unknown) {
      const msg = (err as { body?: { detail?: string } })?.body?.detail ?? (err instanceof Error ? err.message : "Approve failed.");
      setActionError(msg);
    } finally {
      setBusy(null);
    }
  }

  async function handleConvert() {
    setBusy("convert");
    setActionError(null);
    try {
      const result = await convertPurchaseRequestToPO(req.id);
      const updatedReq = result.purchase_request;
      setReq(updatedReq);
      onUpdated(updatedReq);
    } catch (err: unknown) {
      const msg = (err as { body?: { detail?: string } })?.body?.detail ?? (err instanceof Error ? err.message : "Convert failed.");
      setActionError(msg);
    } finally {
      setBusy(null);
    }
  }

  const canApprove = req.status === "DRAFT";
  const canConvert = (req.status === "DRAFT" || req.status === "APPROVED") && !!req.vendor;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="relative z-50 flex h-full w-full max-w-lg flex-col bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="text-xs text-muted-foreground">Purchase Request</p>
            <h2 className="text-lg font-semibold text-foreground">{req.request_no}</h2>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-lg border border-border hover:bg-muted">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-[10px] text-muted-foreground">Status</p>{statusBadge(req.status)}</div>
            <div><p className="text-[10px] text-muted-foreground">Request Date</p><p>{fmt(req.request_date)}</p></div>
            {req.vendor_name ? <div><p className="text-[10px] text-muted-foreground">Vendor</p><p>{req.vendor_name}</p></div> : null}
            {req.requested_by_username ? <div><p className="text-[10px] text-muted-foreground">Requested By</p><p>{req.requested_by_username}</p></div> : null}
            {req.notes ? <div className="col-span-2"><p className="text-[10px] text-muted-foreground">Notes</p><p className="whitespace-pre-wrap">{req.notes}</p></div> : null}
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-foreground">Requested Items</p>
            {!req.lines?.length ? <p className="text-xs text-muted-foreground">No lines.</p> : (
              <table className="min-w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr><th className="py-1 pr-3">Item</th><th className="py-1">Qty Requested</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {req.lines.map((l, i) => (
                    <tr key={l.id ?? i}>
                      <td className="py-1.5 pr-3">{l.inventory_item_product_name ?? `Item #${l.inventory_item}`}</td>
                      <td className="py-1.5">{l.quantity_requested}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {!req.vendor && (req.status === "DRAFT" || req.status === "APPROVED") ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              Assign a vendor to this request before converting to a PO.
            </div>
          ) : null}

          {req.status === "ORDERED" ? (
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-xs text-green-800">
              This request has been converted to a purchase order.
            </div>
          ) : null}

          {actionError ? (
            <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-xs text-red-700">
              <p className="font-semibold">Action blocked</p>
              <p className="mt-1">{actionError}</p>
            </div>
          ) : null}
        </div>
        <div className="border-t border-border px-5 py-4 flex gap-3 flex-wrap">
          {canApprove ? (
            <button
              onClick={() => void handleApprove()}
              disabled={busy !== null}
              className="h-9 rounded-xl border border-blue-600 bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy === "approve" ? "Approving…" : "Approve"}
            </button>
          ) : null}
          {canConvert ? (
            <button
              onClick={() => void handleConvert()}
              disabled={busy !== null}
              className="h-9 rounded-xl border border-primary bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy === "convert" ? "Converting…" : "Convert to PO"}
            </button>
          ) : null}
          <button onClick={onClose} className="ml-auto h-9 rounded-xl border border-border bg-background px-4 text-sm font-medium hover:bg-muted">Close</button>
        </div>
      </aside>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function AdminPurchaseRequestsPage() {
  const [rows, setRows] = useState<PurchaseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vendors, setVendors] = useState<VendorLite[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<PurchaseRequest | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [reqRes, vendorRes, itemRes] = await Promise.allSettled([
        listPurchaseRequests(),
        listVendorsLite({ page_size: 200, is_active: true }),
        listInventoryItems({ is_active: true, page_size: 500 }),
      ]);
      if (reqRes.status === "fulfilled") setRows(reqRes.value.results);
      else setError("Failed to load purchase requests.");
      if (vendorRes.status === "fulfilled") setVendors(vendorRes.value.results);
      if (itemRes.status === "fulfilled") setItems(itemRes.value.results);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function handleSaved(req: PurchaseRequest) {
    setRows((prev) => [req, ...prev]);
    setShowCreate(false);
  }

  function handleUpdated(req: PurchaseRequest) {
    setRows((prev) => prev.map((r) => (r.id === req.id ? req : r)));
    setSelected(req);
  }

  return (
    <ERPPageShell
      title="Purchase Requests"
      subtitle="Internal demand-to-order intake. Approve and convert to PO once the backend exposes those actions."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Purchases", href: ROUTES.admin.purchases },
        { label: "Purchase Requests" },
      ]}
    >
      <ERPSectionShell
        title="Purchase Requests"
        description="Approve / Convert to PO actions are disabled — PurchaseRequestViewSet has no /approve/ or /convert-to-po/ endpoint. Create a PO manually and reference the request number."
        actions={<button onClick={() => setShowCreate(true)} className="h-8 rounded-xl border border-primary bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90">+ New Request</button>}
      >
        {loading ? <ERPLoadingState label="Loading purchase requests…" /> : null}
        {!loading && error ? <ERPErrorState title="Load error" description={error} onRetry={() => void load()} /> : null}

        {showCreate ? (
          <div className="mb-6 rounded-2xl border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold text-foreground">New Purchase Request</h3>
            <CreateRequestForm vendors={vendors} items={items} onSaved={handleSaved} onCancel={() => setShowCreate(false)} />
          </div>
        ) : null}

        {!loading && !error && rows.length === 0 && !showCreate ? (
          <ERPEmptyState title="No purchase requests" description="Create purchase requests through inventory demand planning or manual procurement intake." />
        ) : null}

        {!loading && !error && rows.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--surface-muted)]">
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Request No</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3">Lines</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {rows.map((req) => (
                  <tr key={req.id} onClick={() => setSelected(req)} className="cursor-pointer hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-3 font-medium text-primary">{req.request_no}</td>
                    <td className="px-4 py-3">{fmt(req.request_date)}</td>
                    <td className="px-4 py-3">{req.vendor_name ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{req.lines?.length ?? 0}</td>
                    <td className="px-4 py-3">{statusBadge(req.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </ERPSectionShell>

      {selected ? (
        <RequestDetailDrawer req={selected} onUpdated={handleUpdated} onClose={() => setSelected(null)} />
      ) : null}
    </ERPPageShell>
  );
}
