"use client";

import { useEffect, useState } from "react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import { accountingDate, accountingErrorMessage } from "@/components/accounting/shared";
import ERPDataToolbar from "@/components/erp/ERPDataToolbar";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import ActionButton from "@/components/ui/ActionButton";
import { ROUTES } from "@/lib/routes";
import type { InventoryItem, InventoryLot, StockLocation } from "@/services/inventory";
import { createInventoryLot, listInventoryItems, listInventoryLots, listStockLocations } from "@/services/inventory";

const FIELD_CLASS = "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-ring";

type LotFormState = {
  inventory_item: string;
  stock_location: string;
  lot_code: string;
  barcode: string;
  qr_code: string;
  received_date: string;
  expiry_date: string;
  quantity_on_hand: string;
  notes: string;
};

const emptyForm: LotFormState = {
  inventory_item: "",
  stock_location: "",
  lot_code: "",
  barcode: "",
  qr_code: "",
  received_date: "",
  expiry_date: "",
  quantity_on_hand: "0.000",
  notes: "",
};

export default function InventoryLotsPage() {
  const [rows, setRows] = useState<InventoryLot[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [form, setForm] = useState<LotFormState>(emptyForm);
  const [expiringOnly, setExpiringOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadPage(nextExpiringOnly = expiringOnly) {
    setLoading(true);
    try {
      const [lotPayload, itemPayload, locationPayload] = await Promise.all([
        listInventoryLots(nextExpiringOnly ? { expiring: 1 } : {}),
        listInventoryItems({ lot_tracking_enabled: 1 }),
        listStockLocations({ is_active: 1 }),
      ]);
      setRows(lotPayload.results);
      setItems(itemPayload.results);
      setLocations(locationPayload.results);
      setError(null);
    } catch (err) {
      setRows([]);
      setError(accountingErrorMessage(err, "Failed to load inventory lot tracking."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPage(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns: EnterpriseColumnDef<InventoryLot>[] = [
    { key: "lot_code", header: "Lot" },
    { key: "product_name", header: "Product" },
    { key: "inventory_item_sku", header: "SKU" },
    { key: "barcode", header: "Barcode", render: (row) => row.barcode || "Not set" },
    { key: "qr_code", header: "QR", render: (row) => row.qr_code || "Not set" },
    { key: "quantity_on_hand", header: "Qty" },
    { key: "stock_location_name", header: "Location", render: (row) => row.stock_location_name || "Unassigned" },
    { key: "expiry_date", header: "Expiry", render: (row) => accountingDate(row.expiry_date) },
    {
      key: "status",
      header: "Status",
      render: (row) => <ERPStatusBadge status={row.status} label={row.status.replaceAll("_", " ")} />,
    },
  ];

  async function handleCreateLot() {
    if (!form.inventory_item || !form.lot_code.trim()) {
      setError("Inventory item and lot code are required.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await createInventoryLot({
        inventory_item: Number(form.inventory_item),
        stock_location: form.stock_location ? Number(form.stock_location) : null,
        lot_code: form.lot_code,
        barcode: form.barcode,
        qr_code: form.qr_code,
        received_date: form.received_date || null,
        expiry_date: form.expiry_date || null,
        quantity_on_hand: form.quantity_on_hand || "0.000",
        notes: form.notes,
      });
      setForm(emptyForm);
      setMessage("Inventory lot created.");
      await loadPage();
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to create inventory lot."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ERPPageShell
      eyebrow="Inventory"
      title="Barcode & Lot Tracking"
      subtitle="Operational lot, QR, barcode, and expiry visibility for inventory."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Barcode & Lots" },
      ]}
      statusBadge={{ label: "Traceability", tone: "info" }}
      stats={[
        { label: "Lots", value: String(rows.length), tone: "info" },
        { label: "Expiring", value: String(rows.filter((row) => row.expiry_date).length), tone: "warning" },
        { label: "Tracked Items", value: String(items.length), tone: "success" },
      ]}
      headerMode="erp"
    >
      <div className="space-y-4">
        {message ? <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{message}</div> : null}

        <ERPDataToolbar
          left={<div className="text-sm text-muted-foreground">Lots are additive traceability records; stock ledger movement history remains immutable.</div>}
          right={
            <ActionButton
              variant={expiringOnly ? "primary" : "secondary"}
              onClick={() => {
                const next = !expiringOnly;
                setExpiringOnly(next);
                void loadPage(next);
              }}
            >
              {expiringOnly ? "Show All Lots" : "Expiring Next 30 Days"}
            </ActionButton>
          }
        />

        <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
          <ERPSectionShell title="Lot register" description="Barcode, QR, expiry, and lot status by stock item.">
            <EnterpriseDataTable
              data={rows}
              columns={columns}
              loading={loading}
              error={error}
              emptyTitle="No lot records"
              emptyDescription="Enable lot tracking on an inventory item, then create lot records here."
            />
          </ERPSectionShell>

          <ERPSectionShell title="Create lot" description="Add traceability metadata for a tracked inventory item.">
            <div className="space-y-3">
              <select className={FIELD_CLASS} value={form.inventory_item} onChange={(event) => setForm((current) => ({ ...current, inventory_item: event.target.value }))}>
                <option value="">Select tracked item</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>{item.product_name || item.sku || item.id}</option>
                ))}
              </select>
              <select className={FIELD_CLASS} value={form.stock_location} onChange={(event) => setForm((current) => ({ ...current, stock_location: event.target.value }))}>
                <option value="">No location</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>{location.name}</option>
                ))}
              </select>
              <input className={FIELD_CLASS} value={form.lot_code} onChange={(event) => setForm((current) => ({ ...current, lot_code: event.target.value }))} placeholder="Lot code" />
              <div className="grid gap-3 md:grid-cols-2">
                <input className={FIELD_CLASS} value={form.barcode} onChange={(event) => setForm((current) => ({ ...current, barcode: event.target.value }))} placeholder="Barcode" />
                <input className={FIELD_CLASS} value={form.qr_code} onChange={(event) => setForm((current) => ({ ...current, qr_code: event.target.value }))} placeholder="QR code" />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <input className={FIELD_CLASS} type="date" value={form.received_date} onChange={(event) => setForm((current) => ({ ...current, received_date: event.target.value }))} />
                <input className={FIELD_CLASS} type="date" value={form.expiry_date} onChange={(event) => setForm((current) => ({ ...current, expiry_date: event.target.value }))} />
              </div>
              <input className={FIELD_CLASS} value={form.quantity_on_hand} onChange={(event) => setForm((current) => ({ ...current, quantity_on_hand: event.target.value }))} placeholder="Quantity on hand" />
              <textarea className="min-h-24 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-ring" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes" />
              <ActionButton variant="primary" disabled={saving} onClick={() => void handleCreateLot()}>
                {saving ? "Saving..." : "Create Lot"}
              </ActionButton>
            </div>
          </ERPSectionShell>
        </div>
      </div>
    </ERPPageShell>
  );
}
