"use client";

import { useEffect, useMemo, useState } from "react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import { INVENTORY_CONTROL_DIRECTORY_GROUPS } from "@/components/admin/control-center/businessControlDirectories";
import { WorkspaceDirectory } from "@/components/admin/control-center/WorkspaceDirectory";
import ConfirmActionButton from "@/components/ui/ConfirmActionButton";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import { accountingDate, accountingErrorMessage } from "@/components/accounting/shared";
import type { InventoryItem, StockAdjustment, StockLocation } from "@/services/inventory";
import {
  approveStockAdjustment,
  createStockAdjustment,
  listInventoryItems,
  listStockAdjustments,
  listStockLocations,
  postStockAdjustment,
} from "@/services/inventory";

const FIELD_CLASS =
  "h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60";

type AdjustmentLineForm = {
  inventory_item: string;
  quantity_delta: string;
  notes: string;
};

type AdjustmentFormState = {
  adjustment_no: string;
  adjustment_date: string;
  reason: string;
  stock_location: string;
  lines: AdjustmentLineForm[];
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function createEmptyLine(defaultItemId?: number): AdjustmentLineForm {
  return {
    inventory_item: defaultItemId ? String(defaultItemId) : "",
    quantity_delta: "",
    notes: "",
  };
}

function createInitialForm(defaultItemId?: number): AdjustmentFormState {
  return {
    adjustment_no: "",
    adjustment_date: todayIso(),
    reason: "",
    stock_location: "",
    lines: [createEmptyLine(defaultItemId)],
  };
}

export default function InventoryAdjustmentsPage() {
  const [rows, setRows] = useState<StockAdjustment[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [form, setForm] = useState<AdjustmentFormState>(createInitialForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadPage() {
    setLoading(true);
    try {
      const [adjustmentPayload, itemPayload, locationPayload] = await Promise.all([
        listStockAdjustments(),
        listInventoryItems({ is_active: 1 }),
        listStockLocations({ is_active: 1 }),
      ]);
      setRows(adjustmentPayload.results);
      setItems(itemPayload.results);
      setLocations(locationPayload.results);
      setError(null);
      setForm((current) => {
        if (current.lines.some((line) => line.inventory_item)) return current;
        return createInitialForm(itemPayload.results[0]?.id);
      });
    } catch (err) {
      setRows([]);
      setItems([]);
      setLocations([]);
      setError(accountingErrorMessage(err, "Failed to load stock adjustments."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPage();
  }, []);

  const columns: EnterpriseColumnDef<StockAdjustment>[] = [
    { key: "adjustment_no", header: "Adjustment" },
    { key: "adjustment_date", header: "Date", render: (row) => accountingDate(row.adjustment_date) },
    { key: "status", header: "Status" },
    { key: "stock_location_name", header: "Location", render: (row) => row.stock_location_name || "Default" },
    { key: "reason", header: "Reason" },
    {
      key: "lines",
      header: "Lines",
      render: (row) => String(row.lines.length),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div className="flex flex-wrap gap-2">
          {row.status === "DRAFT" ? (
            <ConfirmActionButton
              label="Approve"
              title={`Approve ${row.adjustment_no}?`}
              description="Only approved adjustments can be posted into the stock ledger."
              onConfirm={async () => {
                try {
                  await approveStockAdjustment(row.id);
                  setMessage(`${row.adjustment_no} approved.`);
                  setError(null);
                  await loadPage();
                } catch (err) {
                  setError(accountingErrorMessage(err, "Failed to approve stock adjustment."));
                }
              }}
              variant="secondary"
            />
          ) : null}
          {row.status === "APPROVED" ? (
            <ConfirmActionButton
              label="Post"
              title={`Post ${row.adjustment_no}?`}
              description="Posting will write stock ledger rows and make the adjustment operationally final."
              onConfirm={async () => {
                try {
                  await postStockAdjustment(row.id);
                  setMessage(`${row.adjustment_no} posted to the stock ledger.`);
                  setError(null);
                  await loadPage();
                } catch (err) {
                  setError(accountingErrorMessage(err, "Failed to post stock adjustment."));
                }
              }}
              variant="primary"
            />
          ) : null}
        </div>
      ),
    },
  ];

  const draftCount = rows.filter((row) => row.status === "DRAFT").length;
  const approvedCount = rows.filter((row) => row.status === "APPROVED").length;
  const postedCount = rows.filter((row) => row.status === "POSTED").length;

  async function handleCreateAdjustment() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await createStockAdjustment({
        adjustment_no: form.adjustment_no.trim() || undefined,
        adjustment_date: form.adjustment_date,
        reason: form.reason.trim(),
        stock_location: form.stock_location ? Number(form.stock_location) : null,
        lines: form.lines.map((line) => ({
          inventory_item: Number(line.inventory_item),
          quantity_delta: line.quantity_delta,
          notes: line.notes.trim() || undefined,
        })),
      });
      setMessage("Draft stock adjustment created.");
      setForm(createInitialForm(items[0]?.id));
      await loadPage();
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to create stock adjustment."));
    } finally {
      setSaving(false);
    }
  }

  function updateLine(index: number, field: keyof AdjustmentLineForm, value: string) {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) =>
        lineIndex === index ? { ...line, [field]: value } : line
      ),
    }));
  }

  const canCreate =
    !saving &&
    form.reason.trim().length > 0 &&
    form.lines.length > 0 &&
    form.lines.every((line) => line.inventory_item && line.quantity_delta.trim().length > 0);

  const locationOptions = useMemo(() => locations, [locations]);

  return (
    <PortalPage
      eyebrow="Inventory Adjustment Control"
      title="Stock Adjustments"
      subtitle="Create counted stock corrections with explicit reasons, then approve and post them into the stock ledger without rewriting product or billing history."
      helperNote="Counted stock corrections remain explicit inventory actions. Approval and posting stay separate to preserve stock auditability."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Adjustments" },
      ]}
      actions={[
        { href: ROUTES.admin.inventoryLedger, label: "Stock Ledger", variant: "secondary" },
        { href: ROUTES.admin.inventoryItems, label: "Inventory Items", variant: "secondary" },
      ]}
      stats={[
        { label: "Draft", value: draftCount, tone: draftCount > 0 ? "warning" : "default" },
        { label: "Approved", value: approvedCount, tone: approvedCount > 0 ? "warning" : "success" },
        { label: "Posted", value: postedCount, tone: "success" },
      ]}
      statusBadge={{ label: "Reason Required", tone: "info" }}
    >
      <WorkspaceDirectory
        title="Inventory route map"
        description="Move between counted-stock adjustments, movement review, ledger inspection, live stock, and stock masters from one inventory workspace."
        groups={INVENTORY_CONTROL_DIRECTORY_GROUPS}
      />

      {message ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <WorkspaceSection
        title="Create Draft Adjustment"
        description="Use draft adjustments for counted shortages, surpluses, or stock corrections. Approval and posting stay explicit."
      >
        <div className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-4">
            <label className="grid gap-2 text-sm text-foreground">
              <span className="font-medium">Adjustment Number</span>
              <input
                type="text"
                value={form.adjustment_no}
                onChange={(event) =>
                  setForm((current) => ({ ...current, adjustment_no: event.target.value }))
                }
                placeholder="Optional auto-generated"
                disabled={saving}
                className={FIELD_CLASS}
              />
            </label>
            <label className="grid gap-2 text-sm text-foreground">
              <span className="font-medium">Adjustment Date</span>
              <input
                type="date"
                value={form.adjustment_date}
                onChange={(event) =>
                  setForm((current) => ({ ...current, adjustment_date: event.target.value }))
                }
                disabled={saving}
                className={FIELD_CLASS}
              />
            </label>
            <label className="grid gap-2 text-sm text-foreground xl:col-span-2">
              <span className="font-medium">Stock Location</span>
              <select
                value={form.stock_location}
                onChange={(event) =>
                  setForm((current) => ({ ...current, stock_location: event.target.value }))
                }
                disabled={saving}
                className={FIELD_CLASS}
              >
                <option value="">Use item default location</option>
                {locationOptions.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.code} - {location.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="grid gap-2 text-sm text-foreground">
            <span className="font-medium">Reason</span>
            <textarea
              value={form.reason}
              onChange={(event) =>
                setForm((current) => ({ ...current, reason: event.target.value }))
              }
              rows={3}
              disabled={saving}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="Explain why physical stock differs from ledger stock."
            />
          </label>

          <div className="space-y-3">
            {form.lines.map((line, index) => (
              <div
                key={`line-${index}`}
                className="grid gap-3 rounded-2xl border border-border bg-muted/30 p-4 xl:grid-cols-[minmax(0,1.3fr)_180px_minmax(0,1fr)_auto]"
              >
                <select
                  value={line.inventory_item}
                  onChange={(event) => updateLine(index, "inventory_item", event.target.value)}
                  disabled={saving}
                  className={FIELD_CLASS}
                >
                  <option value="">Select inventory item</option>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.product_code} - {item.product_name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.001"
                  value={line.quantity_delta}
                  onChange={(event) => updateLine(index, "quantity_delta", event.target.value)}
                  disabled={saving}
                  className={FIELD_CLASS}
                  placeholder="Quantity delta"
                />
                <input
                  type="text"
                  value={line.notes}
                  onChange={(event) => updateLine(index, "notes", event.target.value)}
                  disabled={saving}
                  className={FIELD_CLASS}
                  placeholder="Line note"
                />
                <button
                  type="button"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      lines:
                        current.lines.length === 1
                          ? [createEmptyLine(items[0]?.id)]
                          : current.lines.filter((_, lineIndex) => lineIndex !== index),
                    }))
                  }
                  disabled={saving}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  lines: [...current.lines, createEmptyLine(items[0]?.id)],
                }))
              }
              disabled={saving}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              Add Line
            </button>
            <button
              type="button"
              onClick={() => void handleCreateAdjustment()}
              disabled={!canCreate}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Creating..." : "Create Draft Adjustment"}
            </button>
          </div>
        </div>
      </WorkspaceSection>

      <WorkspaceSection
        title="Adjustment Register"
        description="Approve and post counted adjustments only after review so stock mutations remain explicit and auditable."
      >
        <EnterpriseDataTable
          data={rows}
          columns={columns}
          loading={loading}
          error={error}
          emptyTitle="No stock adjustments yet"
          emptyDescription="Create a counted stock adjustment to move stock in or out safely."
        />
      </WorkspaceSection>
    </PortalPage>
  );
}
