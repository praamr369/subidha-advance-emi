"use client";

import { useEffect, useMemo, useState } from "react";

import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import DataTable from "@/components/ui/DataTable";
import {
  EntityLookupCombobox,
  FormImpactPanel,
  OperatorHint,
  RelatedRecordPreview,
  SmartFormShell,
  ValidationSummary,
  type EntityLookupOption,
} from "@/components/erp/forms";
import { ApiError } from "@/lib/api";
import { buildAdminManufacturingJobRoute } from "@/lib/route-builders";
import { ROUTES } from "@/lib/routes";
import {
  createProductionJob,
  listProductionJobs,
  listManufacturingBoms,
  type ProductionJob,
} from "@/services/manufacturing";
import { listStockLocations, searchAdminInventoryItems, type AdminInventoryItemSearchRow, type StockLocation } from "@/services/inventory";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Unable to load the production job register.";
}

export default function AdminManufacturingJobsPage() {
  const [rows, setRows] = useState<ProductionJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [validation, setValidation] = useState<{
    frontend: string[];
    backendMessage: string | null;
    backendFieldErrors: Record<string, string[]>;
  }>({ frontend: [], backendMessage: null, backendFieldErrors: {} });
  const [form, setForm] = useState({
    job_date: new Date().toISOString().slice(0, 10),
    finished_good_inventory_item: "",
    finished_good_inventory_item_option: null as EntityLookupOption | null,
    bom: "",
    bom_option: null as EntityLookupOption | null,
    stock_location: "",
    stock_location_option: null as EntityLookupOption | null,
    planned_output_qty: "1.000",
    notes: "",
  });

  async function loadPage() {
    try {
      setLoading(true);
      const next = await listProductionJobs();
      setRows(next.results);
      setError(null);
    } catch (err) {
      setRows([]);
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPage();
  }, []);

  async function searchInventoryOptions(query: string): Promise<EntityLookupOption[]> {
    const payload = await searchAdminInventoryItems({ q: query });
    return payload.results.map((row: AdminInventoryItemSearchRow) => ({
      id: row.id,
      label: row.product_name,
      subtitle: row.sku ? `SKU: ${row.sku}` : undefined,
      metadata: row as unknown as Record<string, unknown>,
    }));
  }

  async function searchBomOptions(query: string): Promise<EntityLookupOption[]> {
    const payload = await listManufacturingBoms({ search: query, status: "ACTIVE" });
    return payload.results.map((row) => ({
      id: row.id,
      label: row.bom_no,
      subtitle: row.finished_good_product_name || row.finished_good_sku || "Finished good",
      status: row.status,
      metadata: row as unknown as Record<string, unknown>,
    }));
  }

  async function searchStockLocationOptions(query: string): Promise<EntityLookupOption[]> {
    const payload = await listStockLocations({ search: query, is_active: true });
    return payload.results.map((row: StockLocation) => ({
      id: row.id,
      label: row.name,
      code: row.code,
      subtitle: row.location_type,
      status: row.is_active ? "ACTIVE" : "INACTIVE",
      metadata: row as unknown as Record<string, unknown>,
    }));
  }

  function validateForm(): string[] {
    const errors: string[] = [];
    if (!form.finished_good_inventory_item.trim()) {
      errors.push("Finished good inventory item is required.");
    }
    if (!form.job_date.trim()) {
      errors.push("Job date is required.");
    }
    if (!form.planned_output_qty.trim() || Number(form.planned_output_qty) <= 0) {
      errors.push("Planned output quantity must be greater than zero.");
    }
    return errors;
  }

  async function handleCreateJob() {
    const frontendErrors = validateForm();
    setValidation({ frontend: frontendErrors, backendMessage: null, backendFieldErrors: {} });
    if (frontendErrors.length > 0) return;
    try {
      setSaving(true);
      setNotice(null);
      setError(null);
      await createProductionJob({
        job_date: form.job_date,
        finished_good_inventory_item: Number(form.finished_good_inventory_item),
        bom: form.bom ? Number(form.bom) : null,
        stock_location: form.stock_location ? Number(form.stock_location) : null,
        planned_output_qty: form.planned_output_qty,
        notes: form.notes,
      });
      setNotice("Production job created.");
      setForm({
        job_date: new Date().toISOString().slice(0, 10),
        finished_good_inventory_item: "",
        finished_good_inventory_item_option: null,
        bom: "",
        bom_option: null,
        stock_location: "",
        stock_location_option: null,
        planned_output_qty: "1.000",
        notes: "",
      });
      await loadPage();
    } catch (err) {
      if (err instanceof ApiError) {
        setValidation({
          frontend: [],
          backendMessage: err.readableMessage || "Unable to save the production job.",
          backendFieldErrors: err.fieldErrors || {},
        });
        return;
      }
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const columns = useMemo(
    () => [
      {
        key: "job_no",
        title: "Job",
        render: (row: ProductionJob) => (
          <div>
            <div className="font-medium text-foreground">{row.job_no}</div>
            <div className="text-xs text-muted-foreground">{row.job_date}</div>
          </div>
        ),
      },
      {
        key: "finished_good_product_name",
        title: "Finished Good",
        render: (row: ProductionJob) => row.finished_good_product_name || row.finished_good_sku || "—",
      },
      { key: "status", title: "Status" },
      {
        key: "planned_output_qty",
        title: "Output",
        render: (row: ProductionJob) => `${row.completed_output_qty} / ${row.planned_output_qty}`,
      },
      { key: "wip_cost", title: "WIP Cost", render: (row: ProductionJob) => `₹${Number(row.wip_cost || 0).toFixed(2)}` },
      { key: "accounting_status", title: "Accounting" },
    ],
    []
  );

  return (
    <ERPPageShell
      title="Production Jobs"
      subtitle="Release furniture jobs only when BOM and material planning are ready. Raw issue, output receipt, scrap capture, and job completion stay explicit and auditable."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Manufacturing", href: ROUTES.admin.manufacturing },
        { label: "Production Jobs" },
      ]}
      actions={[
        { href: ROUTES.admin.manufacturing, label: "Overview", variant: "secondary" },
        { href: ROUTES.admin.manufacturingBoms, label: "BOM Register", variant: "secondary" },
      ]}
      stats={[
        { label: "Visible", value: String(rows.length), tone: "info" },
        { label: "Released", value: String(rows.filter((item) => item.status === "RELEASED").length) },
        { label: "In Progress", value: String(rows.filter((item) => item.status === "IN_PROGRESS").length) },
        { label: "Completed", value: String(rows.filter((item) => item.status === "COMPLETED").length) },
      ]}
      statusBadge={{ label: "Production Control", tone: "info" }}
    >
      <div className="space-y-6">
        {notice ? (
          <div className="rounded-2xl border border-emerald-600/35 bg-emerald-600/10 px-4 py-3 text-sm text-foreground">
            {notice}
          </div>
        ) : null}
        {loading ? <ERPLoadingState label="Loading production jobs..." /> : null}
        {!loading && error ? (
          <ERPErrorState title="Production jobs unavailable" description={error} onRetry={() => void loadPage()} />
        ) : null}

        <ERPSectionShell
          title="Create Production Job"
          description="Use a BOM-backed job when available so material planning can seed from the active revision. Procurement remains the source of raw inward; production only consumes and converts stock."
        >
          <SmartFormShell
            sidePanel={
              <>
                <OperatorHint>
                  Creating a job does not consume stock unless the backend posts a material issue. Stock, costing, and
                  accounting effects remain backend-controlled and auditable.
                </OperatorHint>
                <FormImpactPanel
                  items={[
                    "A job starts as a draft record until you release/operate it in the job detail screen.",
                    "BOM selection is optional; use it when the active revision is ready for production control.",
                    "Material availability must come from real stock APIs only (no manual assumptions).",
                  ]}
                />
                <RelatedRecordPreview
                  title="Selected references"
                  rows={[
                    {
                      label: "Finished good",
                      value: form.finished_good_inventory_item_option?.label || "—",
                    },
                    {
                      label: "BOM",
                      value: form.bom_option?.label || "—",
                    },
                    {
                      label: "Stock location",
                      value: form.stock_location_option
                        ? `${form.stock_location_option.label}${form.stock_location_option.code ? ` (${form.stock_location_option.code})` : ""}`
                        : "—",
                    },
                  ].filter((row) => row.value !== "—")}
                />
                <ValidationSummary
                  frontendErrors={validation.frontend}
                  backendMessage={validation.backendMessage}
                  backendFieldErrors={validation.backendFieldErrors}
                />
              </>
            }
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <label className="grid gap-2 text-sm">
                <span>Job Date</span>
                <input
                  type="date"
                  value={form.job_date}
                  onChange={(event) => setForm((current) => ({ ...current, job_date: event.target.value }))}
                  className="rounded-xl border border-border bg-background px-3 py-2"
                />
              </label>
              <EntityLookupCombobox
                label="Finished Good Inventory Item"
                value={form.finished_good_inventory_item || null}
                onChange={(value, option) =>
                  setForm((current) => ({
                    ...current,
                    finished_good_inventory_item: value || "",
                    finished_good_inventory_item_option: option ?? null,
                  }))
                }
                search={searchInventoryOptions}
                required
                placeholder="Search finished goods by name or SKU..."
              />
              <EntityLookupCombobox
                label="BOM (optional)"
                value={form.bom || null}
                onChange={(value, option) =>
                  setForm((current) => ({
                    ...current,
                    bom: value || "",
                    bom_option: option ?? null,
                  }))
                }
                search={searchBomOptions}
                placeholder="Search BOM by number or finished-good name..."
              />
              <EntityLookupCombobox
                label="Stock Location (optional)"
                value={form.stock_location || null}
                onChange={(value, option) =>
                  setForm((current) => ({
                    ...current,
                    stock_location: value || "",
                    stock_location_option: option ?? null,
                  }))
                }
                search={searchStockLocationOptions}
                placeholder="Search stock location by code or name..."
              />
              <label className="grid gap-2 text-sm">
                <span>Planned Output Qty</span>
                <input
                  value={form.planned_output_qty}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, planned_output_qty: event.target.value }))
                  }
                  className="rounded-xl border border-border bg-background px-3 py-2"
                />
              </label>
              <label className="grid gap-2 text-sm md:col-span-2 xl:col-span-5">
                <span>Notes</span>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                  className="rounded-xl border border-border bg-background px-3 py-2"
                />
              </label>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => void handleCreateJob()}
                disabled={saving}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Create Production Job"}
              </button>
            </div>
          </SmartFormShell>
        </ERPSectionShell>

        {!loading && !error ? (
          <ERPSectionShell
            title="Production Job Register"
            description="Open the job detail to release the work order, post material issue, receive finished goods, record scrap, and complete the job."
          >
            <DataTable
              columns={columns}
              rows={rows}
              emptyText="No production jobs found."
              onRowClick={(row) => {
                window.location.href = buildAdminManufacturingJobRoute(row.id);
              }}
            />
          </ERPSectionShell>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
