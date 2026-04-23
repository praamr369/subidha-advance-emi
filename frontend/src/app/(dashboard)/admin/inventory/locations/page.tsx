"use client";

import { useEffect, useState } from "react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import { INVENTORY_CONTROL_DIRECTORY_GROUPS } from "@/components/admin/control-center/businessControlDirectories";
import { WorkspaceDirectory } from "@/components/admin/control-center/WorkspaceDirectory";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import { accountingErrorMessage } from "@/components/accounting/shared";
import { listBranches, type BranchRecord } from "@/services/branch-control";
import type { StockLocation } from "@/services/inventory";
import {
  createStockLocation,
  listStockLocations,
  updateStockLocation,
} from "@/services/inventory";

const FIELD_CLASS =
  "h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60";

type LocationFormState = {
  id: number | null;
  code: string;
  name: string;
  branch: string;
  location_type: StockLocation["location_type"];
  is_active: boolean;
  notes: string;
};

const EMPTY_FORM: LocationFormState = {
  id: null,
  code: "",
  name: "",
  branch: "",
  location_type: "STORE",
  is_active: true,
  notes: "",
};

function toFormState(location: StockLocation): LocationFormState {
  return {
    id: location.id,
    code: location.code,
    name: location.name,
    branch: location.branch ? String(location.branch) : "",
    location_type: location.location_type,
    is_active: location.is_active,
    notes: location.notes ?? "",
  };
}

export default function InventoryLocationsPage() {
  const [rows, setRows] = useState<StockLocation[]>([]);
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [form, setForm] = useState<LocationFormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadPage() {
    setLoading(true);
    try {
      const [payload, branchPayload] = await Promise.all([
        listStockLocations(),
        listBranches({ status: "ACTIVE" }),
      ]);
      setRows(payload.results);
      setBranches(branchPayload.results);
      setError(null);
    } catch (err) {
      setRows([]);
      setBranches([]);
      setError(accountingErrorMessage(err, "Failed to load stock locations."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPage();
  }, []);

  const columns: EnterpriseColumnDef<StockLocation>[] = [
    { key: "code", header: "Code" },
    { key: "name", header: "Name" },
    {
      key: "branch_name",
      header: "Branch",
      render: (row) => row.branch_code || row.branch_name || "Primary default",
    },
    { key: "location_type", header: "Type" },
    {
      key: "is_active",
      header: "Status",
      render: (row) => (row.is_active ? "Active" : "Inactive"),
    },
    { key: "notes", header: "Notes", render: (row) => row.notes?.trim() || "No notes" },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <button
          type="button"
          onClick={() => {
            setForm(toFormState(row));
            setMessage(null);
            setError(null);
          }}
          className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted"
        >
          Edit
        </button>
      ),
    },
  ];

  const activeCount = rows.filter((row) => row.is_active).length;
  const warehouseCount = rows.filter((row) => row.location_type === "WAREHOUSE").length;
  const showroomCount = rows.filter((row) => row.location_type === "SHOWROOM").length;

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      if (form.id) {
        await updateStockLocation(form.id, {
          code: form.code,
          name: form.name,
          branch: form.branch ? Number(form.branch) : null,
          location_type: form.location_type,
          is_active: form.is_active,
          notes: form.notes,
        });
        setMessage("Stock location updated.");
      } else {
        await createStockLocation({
          code: form.code,
          name: form.name,
          branch: form.branch ? Number(form.branch) : null,
          location_type: form.location_type,
          is_active: form.is_active,
          notes: form.notes,
        });
        setMessage("Stock location created.");
      }
      setForm(EMPTY_FORM);
      await loadPage();
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to save stock location."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <PortalPage
      eyebrow="Inventory Master Control"
      title="Stock Locations"
      subtitle="Govern store, warehouse, and showroom stock locations as explicit operational masters separate from product and contract truth."
      helperNote="Stock locations remain inventory-only masters. They do not alter product identity, billing documents, or contract state."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Locations" },
      ]}
      actions={[
        { href: ROUTES.admin.inventoryItems, label: "Inventory Items", variant: "secondary" },
        { href: ROUTES.admin.inventoryOpeningStock, label: "Opening Stock", variant: "primary" },
      ]}
      stats={[
        { label: "Total Locations", value: rows.length, tone: "info" },
        { label: "Active", value: activeCount, tone: "success" },
        { label: "Warehouses", value: warehouseCount },
        { label: "Showrooms", value: showroomCount },
      ]}
      statusBadge={{ label: "Master Data", tone: "info" }}
    >
      <WorkspaceDirectory
        title="Inventory route map"
        description="Use the shared inventory directory to move between stock masters, live stock review, movement registers, and counted stock workflows."
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
        title={form.id ? "Edit Location" : "Create Location"}
        description="Location codes and names are stock-only masters. Use them for inventory issue, receipt, and daily location visibility."
      >
        <div className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <label className="grid gap-2 text-sm text-foreground">
              <span className="font-medium">Location Code</span>
              <input
                type="text"
                value={form.code}
                onChange={(event) =>
                  setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))
                }
                disabled={saving}
                className={FIELD_CLASS}
                placeholder="MAIN"
              />
            </label>
            <label className="grid gap-2 text-sm text-foreground">
              <span className="font-medium">Location Name</span>
              <input
                type="text"
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                disabled={saving}
                className={FIELD_CLASS}
                placeholder="Main Showroom"
              />
            </label>
            <label className="grid gap-2 text-sm text-foreground">
              <span className="font-medium">Location Type</span>
              <select
                value={form.location_type}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    location_type: event.target.value as StockLocation["location_type"],
                  }))
                }
                disabled={saving}
                className={FIELD_CLASS}
              >
                <option value="STORE">Store</option>
                <option value="WAREHOUSE">Warehouse</option>
                <option value="SHOWROOM">Showroom</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm text-foreground">
              <span className="font-medium">Branch</span>
              <select
                value={form.branch}
                onChange={(event) =>
                  setForm((current) => ({ ...current, branch: event.target.value }))
                }
                disabled={saving}
                className={FIELD_CLASS}
              >
                <option value="">Primary default</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.code} · {branch.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(event) =>
                  setForm((current) => ({ ...current, is_active: event.target.checked }))
                }
                disabled={saving}
              />
              Location is active for daily stock operations
            </label>
          </div>

          <label className="grid gap-2 text-sm text-foreground">
            <span className="font-medium">Notes</span>
            <textarea
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({ ...current, notes: event.target.value }))
              }
              rows={3}
              disabled={saving}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="Optional operational note"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={saving || !form.code.trim() || !form.name.trim()}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : form.id ? "Update Location" : "Create Location"}
            </button>
            <button
              type="button"
              onClick={() => {
                setForm(EMPTY_FORM);
                setMessage(null);
                setError(null);
              }}
              disabled={saving}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              Reset
            </button>
          </div>
        </div>
      </WorkspaceSection>

      <WorkspaceSection
        title="Location Register"
        description="Inventory locations are reusable stock masters that inventory items and stock movements can reference safely."
      >
        <EnterpriseDataTable
          data={rows}
          columns={columns}
          loading={loading}
          error={error}
          emptyTitle="No stock locations configured"
          emptyDescription="Create at least one active location before relying on stock issues and receipts in daily operations."
        />
      </WorkspaceSection>
    </PortalPage>
  );
}
