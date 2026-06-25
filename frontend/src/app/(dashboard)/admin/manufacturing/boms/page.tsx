"use client";

import { useEffect, useMemo, useState } from "react";

import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import DataTable from "@/components/ui/DataTable";
import {
  EntityLookupCombobox,
  FieldHelp,
  FormImpactPanel,
  RelatedRecordPreview,
  SmartFormShell,
  ValidationSummary,
  type EntityLookupOption,
} from "@/components/erp/forms";
import { ApiError } from "@/lib/api";
import { ROUTES } from "@/lib/routes";
import {
  activateManufacturingBom,
  createManufacturingBom,
  deactivateManufacturingBom,
  listManufacturingBoms,
  type ManufacturingBom,
} from "@/services/manufacturing";
import { searchAdminInventoryItems, type AdminInventoryItemSearchRow } from "@/services/inventory";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Unable to load the BOM register.";
}

type BomLineDraft = {
  inventory_item: string;
  inventory_item_option: EntityLookupOption | null;
  quantity_per_unit: string;
  wastage_percent: string;
  notes: string;
};

function createDraftLine(): BomLineDraft {
  return {
    inventory_item: "",
    inventory_item_option: null,
    quantity_per_unit: "1.000",
    wastage_percent: "0.00",
    notes: "",
  };
}

export default function AdminManufacturingBomsPage() {
  const [rows, setRows] = useState<ManufacturingBom[]>([]);
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
    finished_good_inventory_item: "",
    finished_good_inventory_item_option: null as EntityLookupOption | null,
    revision_no: "1",
    is_default: true,
    notes: "",
    lines: [createDraftLine()],
  });

  async function loadPage() {
    try {
      setLoading(true);
      const next = await listManufacturingBoms();
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

  function updateLine(index: number, field: keyof BomLineDraft, value: string) {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) =>
        lineIndex === index ? { ...line, [field]: value } : line
      ),
    }));
  }

  function updateLineOption(index: number, option: EntityLookupOption | null) {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) =>
        lineIndex === index
          ? {
              ...line,
              inventory_item: option ? String(option.id) : "",
              inventory_item_option: option,
            }
          : line
      ),
    }));
  }

  function addLine() {
    setForm((current) => ({ ...current, lines: [...current.lines, createDraftLine()] }));
  }

  function removeLine(index: number) {
    setForm((current) => ({
      ...current,
      lines: current.lines.filter((_, lineIndex) => lineIndex !== index),
    }));
  }

  async function searchInventoryOptions(query: string): Promise<EntityLookupOption[]> {
    const payload = await searchAdminInventoryItems({ q: query });
    return payload.results.map((row: AdminInventoryItemSearchRow) => ({
      id: row.id,
      label: row.product_name,
      subtitle: row.sku ? `SKU: ${row.sku}` : undefined,
      metadata: row as unknown as Record<string, unknown>,
    }));
  }

  function validateForm(): string[] {
    const errors: string[] = [];
    if (!form.finished_good_inventory_item.trim()) {
      errors.push("Finished good inventory item is required.");
    }
    const hasLine = form.lines.some((line) => line.inventory_item.trim());
    if (!hasLine) {
      errors.push("At least one raw/accessory line is required.");
    }
    return errors;
  }

  async function handleCreateBom() {
    const frontendErrors = validateForm();
    setValidation({ frontend: frontendErrors, backendMessage: null, backendFieldErrors: {} });
    if (frontendErrors.length > 0) return;
    try {
      setSaving(true);
      setNotice(null);
      setError(null);
      await createManufacturingBom({
        finished_good_inventory_item: Number(form.finished_good_inventory_item),
        revision_no: Number(form.revision_no),
        is_default: form.is_default,
        notes: form.notes,
        lines: form.lines
          .filter((line) => line.inventory_item.trim())
          .map((line, index) => ({
            inventory_item: Number(line.inventory_item),
            quantity_per_unit: line.quantity_per_unit,
            wastage_percent: line.wastage_percent,
            sort_order: index + 1,
            notes: line.notes,
          })),
      });
      setNotice("BOM draft created.");
      setForm({
        finished_good_inventory_item: "",
        finished_good_inventory_item_option: null,
        revision_no: "1",
        is_default: true,
        notes: "",
        lines: [createDraftLine()],
      });
      await loadPage();
    } catch (err) {
      if (err instanceof ApiError) {
        setValidation({
          frontend: [],
          backendMessage: err.readableMessage || "Unable to save the BOM draft.",
          backendFieldErrors: err.fieldErrors || {},
        });
        return;
      }
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleActivateBom(id: number) {
    try {
      setSaving(true);
      setNotice(null);
      await activateManufacturingBom(id);
      setNotice("BOM activated.");
      await loadPage();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivateBom(id: number) {
    try {
      setSaving(true);
      setNotice(null);
      await deactivateManufacturingBom(id);
      setNotice("BOM deactivated.");
      await loadPage();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const columns = useMemo(
    () => [
      {
        key: "bom_no",
        title: "BOM",
        render: (row: ManufacturingBom) => (
          <div>
            <div className="font-medium text-foreground">{row.bom_no}</div>
            <div className="text-xs text-muted-foreground">
              Revision {row.revision_no} · {row.lines.length} lines
            </div>
          </div>
        ),
      },
      {
        key: "finished_good_product_name",
        title: "Finished Good",
        render: (row: ManufacturingBom) => row.finished_good_product_name || row.finished_good_sku || "—",
      },
      { key: "status", title: "Status" },
      {
        key: "is_default",
        title: "Default",
        render: (row: ManufacturingBom) => (row.is_default ? "Yes" : "No"),
      },
    ],
    []
  );

  return (
    <ERPPageShell
      title="BOM Register"
      subtitle="Maintain additive furniture BOM revisions against the shared finished-good and raw-material inventory master. Activation is explicit so production jobs only release against controlled BOM revisions."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Manufacturing", href: ROUTES.admin.manufacturing },
        { label: "BOM Register" },
      ]}
      actions={[
        { href: ROUTES.admin.manufacturing, label: "Overview", variant: "secondary" },
        { href: ROUTES.admin.manufacturingJobs, label: "Production Jobs", variant: "secondary" },
      ]}
      stats={[
        { label: "Visible", value: String(rows.length), tone: "info" },
        { label: "Active", value: String(rows.filter((item) => item.status === "ACTIVE").length) },
        { label: "Draft", value: String(rows.filter((item) => item.status === "DRAFT").length) },
        { label: "Default", value: String(rows.filter((item) => item.is_default).length) },
      ]}
      statusBadge={{ label: "BOM Governance", tone: "info" }}
    >
      <div className="space-y-6">
        {notice ? (
          <div className="rounded-xl border border-emerald-600/35 bg-emerald-600/10 px-4 py-3 text-sm text-foreground">
            {notice}
          </div>
        ) : null}
        {loading ? <ERPLoadingState label="Loading BOM register..." /> : null}
        {!loading && error ? (
          <ERPErrorState title="BOM register unavailable" description={error} onRetry={() => void loadPage()} />
        ) : null}

        <ERPSectionShell
          title="Create BOM Draft"
          description="Enter the finished-good inventory profile once, then define raw-material and accessory lines against the shared inventory master."
        >
          <SmartFormShell
            sidePanel={
              <>
                <FormImpactPanel
                  items={[
                    "A BOM is created as a DRAFT until you explicitly activate it.",
                    "This step does not consume stock or post accounting entries.",
                    "Raw/material availability remains informational only; production posting stays backend-controlled.",
                  ]}
                />
                <FieldHelp
                  meaning="The finished-good inventory item this BOM produces."
                  requiredWhy="Production jobs and costing must reference a concrete finished-good inventory item for traceability."
                  examples={
                    <span>
                      Search by product name or SKU. Example: <span className="font-semibold">Sofa</span> or{" "}
                      <span className="font-semibold">SF-120</span>.
                    </span>
                  }
                />
                <RelatedRecordPreview
                  title="Finished good preview"
                  rows={
                    form.finished_good_inventory_item_option
                      ? [
                          { label: "Product", value: form.finished_good_inventory_item_option.label },
                          {
                            label: "SKU",
                            value:
                              (form.finished_good_inventory_item_option.metadata as AdminInventoryItemSearchRow | undefined)
                                ?.sku || "—",
                          },
                          {
                            label: "Stock (locations)",
                            value: String(
                              (
                                (form.finished_good_inventory_item_option.metadata as AdminInventoryItemSearchRow | undefined)
                                  ?.available_by_location || []
                              ).length
                            ),
                          },
                        ]
                      : []
                  }
                />
                <ValidationSummary
                  frontendErrors={validation.frontend}
                  backendMessage={validation.backendMessage}
                  backendFieldErrors={validation.backendFieldErrors}
                />
              </>
            }
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
              <label className="grid gap-2 text-sm">
                <span>Revision No</span>
                <input
                  value={form.revision_no}
                  onChange={(event) => setForm((current) => ({ ...current, revision_no: event.target.value }))}
                  className="rounded-xl border border-border bg-background px-3 py-2"
                />
              </label>
              <label className="grid gap-2 text-sm">
                <span>Default Revision</span>
                <select
                  value={form.is_default ? "YES" : "NO"}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, is_default: event.target.value === "YES" }))
                  }
                  className="rounded-xl border border-border bg-background px-3 py-2"
                >
                  <option value="YES">Yes</option>
                  <option value="NO">No</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm md:col-span-2 xl:col-span-4">
                <span>Notes</span>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                  className="rounded-xl border border-border bg-background px-3 py-2"
                />
              </label>
            </div>

            <div className="space-y-3">
              {form.lines.map((line, index) => (
                <div
                  key={index}
                  className="grid gap-3 rounded-xl border border-border bg-background/60 p-4 md:grid-cols-4 xl:grid-cols-5"
                >
                  <div className="md:col-span-2">
                    <EntityLookupCombobox
                      label="Raw/Accessory Inventory Item"
                      value={line.inventory_item || null}
                      onChange={(_, option) => updateLineOption(index, option ?? null)}
                      search={searchInventoryOptions}
                      required
                      placeholder="Search raw materials/accessories..."
                    />
                  </div>
                  <label className="grid gap-2 text-sm">
                    <span>Qty Per Unit</span>
                    <input
                      value={line.quantity_per_unit}
                      onChange={(event) => updateLine(index, "quantity_per_unit", event.target.value)}
                      className="rounded-xl border border-border bg-background px-3 py-2"
                    />
                  </label>
                  <label className="grid gap-2 text-sm">
                    <span>Wastage %</span>
                    <input
                      value={line.wastage_percent}
                      onChange={(event) => updateLine(index, "wastage_percent", event.target.value)}
                      className="rounded-xl border border-border bg-background px-3 py-2"
                    />
                  </label>
                  <label className="grid gap-2 text-sm md:col-span-2 xl:col-span-4">
                    <span>Line Notes</span>
                    <input
                      value={line.notes}
                      onChange={(event) => updateLine(index, "notes", event.target.value)}
                      className="rounded-xl border border-border bg-background px-3 py-2"
                    />
                  </label>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => removeLine(index)}
                      disabled={form.lines.length === 1}
                      className="w-full rounded-xl border border-border px-3 py-2 text-sm text-foreground transition hover:bg-muted disabled:opacity-50"
                    >
                      Remove Line
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={addLine}
                className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                Add BOM Line
              </button>
              <button
                type="button"
                onClick={() => void handleCreateBom()}
                disabled={saving}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Create BOM Draft"}
              </button>
            </div>
          </SmartFormShell>
        </ERPSectionShell>

        {!loading && !error ? (
          <ERPSectionShell
            title="BOM Register"
            description="Activate BOMs only when the line set is ready for release into daily furniture production."
          >
            <DataTable
              columns={columns}
              rows={rows}
              emptyText="No BOMs found."
              rowActions={(row) => (
                <div className="flex gap-2">
                  {row.status !== "ACTIVE" ? (
                    <button
                      type="button"
                      onClick={() => void handleActivateBom(row.id)}
                      className="rounded-lg border border-border px-3 py-1 text-xs font-medium text-foreground transition hover:bg-muted"
                    >
                      Activate
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleDeactivateBom(row.id)}
                      className="rounded-lg border border-border px-3 py-1 text-xs font-medium text-foreground transition hover:bg-muted"
                    >
                      Deactivate
                    </button>
                  )}
                </div>
              )}
            />
          </ERPSectionShell>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
