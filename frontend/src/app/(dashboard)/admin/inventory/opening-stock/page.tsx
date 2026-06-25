"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { INVENTORY_CONTROL_DIRECTORY_GROUPS } from "@/components/admin/control-center/businessControlDirectories";
import { WorkspaceDirectory } from "@/components/admin/control-center/WorkspaceDirectory";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ApiError } from "@/lib/api";
import { invalidateAfterOpeningStockMutation } from "@/lib/operational-query-invalidation";
import { ROUTES } from "@/lib/routes";
import {
  applyAdminOpeningStockBulkCsv,
  correctionAdminOpeningStockEntry,
  createAdminOpeningStockEntry,
  fetchOpeningStockCsvTemplateText,
  listAdminOpeningStockBatches,
  listAdminOpeningStockEntries,
  listInventoryItems,
  listStockLocations,
  patchAdminOpeningStockEntry,
  postAdminOpeningStockEntry,
  postOpeningStockImport,
  previewAdminOpeningStockBulkCsv,
  previewOpeningStockImport,
  type InventoryItem,
  type OpeningStockBulkPreview,
  type OpeningStockEntryRow,
  type OpeningStockPreview,
  type StockLocation,
} from "@/services/inventory";

type TabKey = "manual" | "csv" | "history";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseDec(s: string): number {
  const n = Number.parseFloat(String(s || "0"));
  return Number.isFinite(n) ? n : 0;
}

export default function InventoryOpeningStockPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>("manual");

  const [entries, setEntries] = useState<OpeningStockEntryRow[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entriesError, setEntriesError] = useState<string | null>(null);

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemSearch, setItemSearch] = useState("");
  const [locations, setLocations] = useState<StockLocation[]>([]);

  const [manualItemId, setManualItemId] = useState<number | "">("");
  const [manualLocationId, setManualLocationId] = useState<number | "">("");
  const [manualQty, setManualQty] = useState("0.000");
  const [manualUnitCost, setManualUnitCost] = useState("");
  const [manualDate, setManualDate] = useState(todayIso());
  const [manualNote, setManualNote] = useState("");
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualFieldErrors, setManualFieldErrors] = useState<Record<string, string>>({});
  const [editingDraftId, setEditingDraftId] = useState<number | null>(null);

  const [correctionFor, setCorrectionFor] = useState<OpeningStockEntryRow | null>(null);
  const [corrReason, setCorrReason] = useState("");
  const [corrDelta, setCorrDelta] = useState("");
  const [corrBusy, setCorrBusy] = useState(false);

  const bulkInputRef = useRef<HTMLInputElement | null>(null);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkDefaultDate, setBulkDefaultDate] = useState(todayIso());
  const [bulkPreview, setBulkPreview] = useState<OpeningStockBulkPreview | null>(null);
  const [bulkPreviewing, setBulkPreviewing] = useState(false);
  const [bulkApplying, setBulkApplying] = useState(false);
  const [bulkDryRun, setBulkDryRun] = useState(false);
  const [bulkAutoPost, setBulkAutoPost] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkSuccess, setBulkSuccess] = useState<string | null>(null);

  const legacyInputRef = useRef<HTMLInputElement | null>(null);
  const [legacyFile, setLegacyFile] = useState<File | null>(null);
  const [legacyDate, setLegacyDate] = useState(todayIso());
  const [legacyPreview, setLegacyPreview] = useState<OpeningStockPreview | null>(null);
  const [legacyBusy, setLegacyBusy] = useState(false);

  const [batches, setBatches] = useState<Awaited<ReturnType<typeof listAdminOpeningStockBatches>> | null>(
    null
  );
  const [batchesLoading, setBatchesLoading] = useState(false);

  const selectedItem = useMemo(
    () => items.find((i) => i.id === manualItemId) ?? null,
    [items, manualItemId]
  );

  const valuationPreview = useMemo(() => {
    const q = parseDec(manualQty);
    const c =
      manualUnitCost.trim() !== ""
        ? parseDec(manualUnitCost)
        : selectedItem?.standard_unit_cost
          ? parseDec(selectedItem.standard_unit_cost)
          : 0;
    return (q * c).toFixed(2);
  }, [manualQty, manualUnitCost, selectedItem]);

  const loadEntries = useCallback(async () => {
    setEntriesLoading(true);
    setEntriesError(null);
    try {
      const payload = await listAdminOpeningStockEntries({ page_size: 100 });
      setEntries(payload.results ?? []);
    } catch (e) {
      setEntries([]);
      setEntriesError(e instanceof Error ? e.message : "Failed to load opening stock rows.");
    } finally {
      setEntriesLoading(false);
    }
  }, []);

  const loadLocations = useCallback(async () => {
    try {
      const payload = await listStockLocations({ page_size: 200, is_active: true });
      setLocations(payload.results ?? []);
    } catch {
      setLocations([]);
    }
  }, []);

  const loadItems = useCallback(async (search: string) => {
    setItemsLoading(true);
    try {
      const payload = await listInventoryItems({
        page_size: 100,
        search: search.trim() || undefined,
        stock_tracking_enabled: true,
      });
      setItems(payload.results ?? []);
    } catch {
      setItems([]);
    } finally {
      setItemsLoading(false);
    }
  }, []);

  const loadBatches = useCallback(async () => {
    setBatchesLoading(true);
    try {
      const data = await listAdminOpeningStockBatches();
      setBatches(data);
    } catch {
      setBatches(null);
    } finally {
      setBatchesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEntries();
    void loadLocations();
  }, [loadEntries, loadLocations]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadItems(itemSearch);
    }, 280);
    return () => window.clearTimeout(t);
  }, [itemSearch, loadItems]);

  useEffect(() => {
    if (tab === "history") void loadBatches();
  }, [tab, loadBatches]);

  useEffect(() => {
    if (!manualItemId || manualLocationId !== "") return;
    const item = items.find((i) => i.id === manualItemId);
    if (item?.default_stock_location) {
      setManualLocationId(item.default_stock_location);
    }
  }, [manualItemId, manualLocationId, items]);

  async function afterInventoryMutation() {
    await invalidateAfterOpeningStockMutation(queryClient);
    await loadEntries();
  }

  function resetManualForm() {
    setManualItemId("");
    setManualLocationId("");
    setManualQty("0.000");
    setManualUnitCost("");
    setManualDate(todayIso());
    setManualNote("");
    setManualFieldErrors({});
    setEditingDraftId(null);
  }

  function beginEditDraft(row: OpeningStockEntryRow) {
    if (row.status !== "DRAFT") return;
    setEditingDraftId(row.id);
    setManualItemId(row.inventory_item);
    setManualLocationId(row.stock_location);
    setManualQty(row.quantity);
    setManualUnitCost(row.unit_cost_snapshot ?? "");
    setManualDate(row.effective_date.slice(0, 10));
    setManualNote(row.note ?? "");
    setTab("manual");
    setManualFieldErrors({});
  }

  async function handleSaveManualDraft(e: React.FormEvent) {
    e.preventDefault();
    setManualSubmitting(true);
    setManualFieldErrors({});
    try {
      if (!manualItemId || !manualLocationId) {
        setManualFieldErrors({ base: "Product (inventory item) and location are required." });
        return;
      }
      const payload = {
        inventory_item: Number(manualItemId),
        stock_location: Number(manualLocationId),
        quantity: manualQty,
        effective_date: manualDate,
        note: manualNote || "",
        unit_cost_snapshot:
          manualUnitCost.trim() !== "" ? manualUnitCost.trim() : null,
      };
      if (editingDraftId) {
        await patchAdminOpeningStockEntry(editingDraftId, payload);
      } else {
        await createAdminOpeningStockEntry(payload);
      }
      resetManualForm();
      await afterInventoryMutation();
    } catch (err) {
      if (err instanceof ApiError) {
        const next: Record<string, string> = {};
        for (const [k, msgs] of Object.entries(err.fieldErrors)) {
          if (msgs[0]) next[k] = msgs[0];
        }
        if (Object.keys(next).length) setManualFieldErrors(next);
        else setManualFieldErrors({ base: err.readableMessage });
      } else {
        setManualFieldErrors({ base: err instanceof Error ? err.message : "Save failed." });
      }
    } finally {
      setManualSubmitting(false);
    }
  }

  async function handlePostRow(id: number) {
    try {
      await postAdminOpeningStockEntry(id);
      await afterInventoryMutation();
    } catch (e) {
      setEntriesError(e instanceof Error ? e.message : "Post failed.");
    }
  }

  async function handleTemplateDownload() {
    try {
      const text = await fetchOpeningStockCsvTemplateText();
      const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "opening_stock_template.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setBulkError("Template download failed.");
    }
  }

  async function handleBulkPreview() {
    if (!bulkFile) return;
    setBulkPreviewing(true);
    setBulkError(null);
    setBulkSuccess(null);
    try {
      const p = await previewAdminOpeningStockBulkCsv(bulkFile, bulkDefaultDate);
      setBulkPreview(p);
    } catch (e) {
      setBulkPreview(null);
      setBulkError(e instanceof Error ? e.message : "Preview failed.");
    } finally {
      setBulkPreviewing(false);
    }
  }

  async function handleBulkApply() {
    if (!bulkFile) return;
    setBulkApplying(true);
    setBulkError(null);
    setBulkSuccess(null);
    try {
      const summary = await applyAdminOpeningStockBulkCsv(bulkFile, {
        dry_run: bulkDryRun,
        auto_post: bulkAutoPost,
        default_effective_date: bulkDefaultDate,
      });
      setBulkSuccess(
        `Batch ${summary.batch_key.slice(0, 12)}… — created ${summary.created}, updated ${summary.updated}, posted ${summary.posted}, corrections ${summary.corrections_created}, skipped ${summary.skipped}, failed ${summary.failed}${summary.dry_run ? " (dry run — rolled back)" : ""}.`
      );
      setBulkPreview(null);
      setBulkFile(null);
      if (bulkInputRef.current) bulkInputRef.current.value = "";
      await afterInventoryMutation();
      if (tab === "history") void loadBatches();
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : "Apply failed.");
    } finally {
      setBulkApplying(false);
    }
  }

  async function submitCorrection(e: React.FormEvent) {
    e.preventDefault();
    if (!correctionFor) return;
    setCorrBusy(true);
    try {
      await correctionAdminOpeningStockEntry(correctionFor.id, {
        reason: corrReason,
        quantity_delta: corrDelta,
      });
      setCorrectionFor(null);
      setCorrReason("");
      setCorrDelta("");
      await afterInventoryMutation();
    } catch (err) {
      setEntriesError(err instanceof Error ? err.message : "Correction failed.");
    } finally {
      setCorrBusy(false);
    }
  }

  const bulkHasFatalErrors = (bulkPreview?.error_rows ?? 0) > 0;
  const canBulkApply =
    Boolean(bulkFile) &&
    Boolean(bulkPreview) &&
    !bulkHasFatalErrors &&
    !bulkApplying &&
    !bulkPreviewing;

  const stats = useMemo(
    () => [
      { label: "Tab", value: tab === "manual" ? "Manual" : tab === "csv" ? "CSV" : "History", tone: "info" as const },
      {
        label: "Rows loaded",
        value: entriesLoading ? "…" : String(entries.length),
        tone: "default" as const,
      },
    ],
    [tab, entries.length, entriesLoading]
  );

  return (
    <ERPPageShell
      eyebrow="Inventory Opening Control"
      title="Opening Stock"
      subtitle="Draft and post opening balances with explicit unit costs. Posted rows are immutable; corrections create stock adjustment drafts."
      helperNote="Posted opening stock is immutable. Corrections create a new stock adjustment. Unit cost never defaults from product selling price (base_price)."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Opening Stock" },
      ]}
      actions={[
        { href: ROUTES.admin.inventoryStockOnHand, label: "Stock On Hand", variant: "secondary" },
        { href: ROUTES.admin.inventoryLedger, label: "Stock Ledger", variant: "secondary" },
      ]}
      stats={stats}
    >
      <div className="space-y-6">
        <WorkspaceDirectory
          title="Inventory route map"
          description="Navigate between opening stock, stock on hand, ledger, and workspace controls."
          groups={INVENTORY_CONTROL_DIRECTORY_GROUPS}
        />

        <div className="flex flex-wrap gap-2 border-b border-border pb-2">
          {(
            [
              ["manual", "Manual Entry"],
              ["csv", "CSV import / bulk"],
              ["history", "Import history"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              data-testid={`opening-stock-tab-${key}`}
              onClick={() => setTab(key)}
              className={`rounded-t-lg px-4 py-2 text-sm font-medium transition ${
                tab === key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {entriesError ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <p>{entriesError}</p>
            <button
              type="button"
              className="mt-2 text-xs font-semibold underline"
              onClick={() => void loadEntries()}
            >
              Retry
            </button>
          </div>
        ) : null}

        {tab === "manual" ? (
          <>
            <ERPSectionShell
              title="Manual draft"
              description="Search inventory items by SKU or product code. Save as draft, then post to create one immutable ledger movement per row."
            >
              <form className="grid gap-4 md:grid-cols-2" onSubmit={(ev) => void handleSaveManualDraft(ev)}>
                <label className="grid gap-1 text-sm">
                  <span className="text-muted-foreground">Search items</span>
                  <input
                    type="search"
                    value={itemSearch}
                    onChange={(ev) => setItemSearch(ev.target.value)}
                    placeholder="SKU / code / name"
                    className="rounded-xl border border-border bg-background px-3 py-2"
                  />
                  <span className="text-xs text-muted-foreground">{itemsLoading ? "Loading…" : null}</span>
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-muted-foreground">Inventory item</span>
                  <select
                    required
                    data-testid="opening-stock-item-select"
                    className="rounded-xl border border-border bg-background px-3 py-2"
                    value={manualItemId === "" ? "" : String(manualItemId)}
                    onChange={(ev) =>
                      setManualItemId(ev.target.value ? Number(ev.target.value) : "")
                    }
                  >
                    <option value="">Select item…</option>
                    {items.map((it) => (
                      <option key={it.id} value={it.id}>
                        {(it.sku || it.product_code || "").trim()} — {it.product_name ?? `#${it.product}`}
                      </option>
                    ))}
                  </select>
                  {manualFieldErrors.inventory_item ? (
                    <span className="text-xs text-destructive">{manualFieldErrors.inventory_item}</span>
                  ) : null}
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-muted-foreground">Warehouse / location</span>
                  <select
                    required
                    data-testid="opening-stock-location-select"
                    className="rounded-xl border border-border bg-background px-3 py-2"
                    value={manualLocationId === "" ? "" : String(manualLocationId)}
                    onChange={(ev) =>
                      setManualLocationId(ev.target.value ? Number(ev.target.value) : "")
                    }
                  >
                    <option value="">Select location…</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.code} — {loc.name}
                      </option>
                    ))}
                  </select>
                  {manualFieldErrors.stock_location ? (
                    <span className="text-xs text-destructive">{manualFieldErrors.stock_location}</span>
                  ) : null}
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-muted-foreground">Quantity</span>
                  <input
                    required
                    data-testid="opening-stock-qty-input"
                    type="text"
                    inputMode="decimal"
                    value={manualQty}
                    onChange={(ev) => setManualQty(ev.target.value)}
                    className="rounded-xl border border-border bg-background px-3 py-2"
                  />
                  {manualFieldErrors.quantity ? (
                    <span className="text-xs text-destructive">{manualFieldErrors.quantity}</span>
                  ) : null}
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-muted-foreground">
                    Unit cost (explicit; optional if standard cost on item)
                  </span>
                  <input
                    data-testid="opening-stock-unit-cost-input"
                    type="text"
                    inputMode="decimal"
                    value={manualUnitCost}
                    onChange={(ev) => setManualUnitCost(ev.target.value)}
                    placeholder={selectedItem?.standard_unit_cost ?? ""}
                    className="rounded-xl border border-border bg-background px-3 py-2"
                  />
                  {manualFieldErrors.unit_cost_snapshot ? (
                    <span className="text-xs text-destructive">{manualFieldErrors.unit_cost_snapshot}</span>
                  ) : null}
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-muted-foreground">Effective date</span>
                  <input
                    required
                    data-testid="opening-stock-effective-date-input"
                    type="date"
                    value={manualDate}
                    onChange={(ev) => setManualDate(ev.target.value)}
                    className="rounded-xl border border-border bg-background px-3 py-2"
                  />
                  {manualFieldErrors.effective_date ? (
                    <span className="text-xs text-destructive">{manualFieldErrors.effective_date}</span>
                  ) : null}
                </label>
                <label className="grid gap-1 text-sm md:col-span-2">
                  <span className="text-muted-foreground">Note / reason</span>
                  <textarea
                    value={manualNote}
                    onChange={(ev) => setManualNote(ev.target.value)}
                    rows={2}
                    className="rounded-xl border border-border bg-background px-3 py-2"
                  />
                </label>
                <div className="md:col-span-2 flex flex-wrap items-center gap-3">
                  <p className="text-sm text-muted-foreground">
                    Valuation preview: <strong className="text-foreground">{valuationPreview}</strong>{" "}
                    (quantity × resolved unit cost)
                  </p>
                  <button
                    type="submit"
                    disabled={manualSubmitting}
                    className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                  >
                    {manualSubmitting ? "Saving…" : editingDraftId ? "Update draft" : "Save draft"}
                  </button>
                  {editingDraftId ? (
                    <button
                      type="button"
                      className="rounded-xl border border-border px-4 py-2 text-sm"
                      onClick={() => resetManualForm()}
                    >
                      Cancel edit
                    </button>
                  ) : null}
                </div>
                {manualFieldErrors.base ? (
                  <p className="md:col-span-2 text-sm text-destructive">{manualFieldErrors.base}</p>
                ) : null}
              </form>
            </ERPSectionShell>

            <ERPSectionShell title="Opening stock rows" description="Drafts are editable; posted rows are read-only.">
              {entriesLoading ? (
                <p className="text-sm text-muted-foreground" data-testid="opening-stock-list-skeleton">
                  Loading rows…
                </p>
              ) : entries.length === 0 ? (
                <p className="text-sm text-muted-foreground">No opening stock rows yet.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">ID</th>
                        <th className="px-3 py-2">SKU</th>
                        <th className="px-3 py-2">Location</th>
                        <th className="px-3 py-2">Qty</th>
                        <th className="px-3 py-2">Unit cost</th>
                        <th className="px-3 py-2">Effective</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((row) => (
                        <tr key={row.id} className="border-t border-border">
                          <td className="px-3 py-2">{row.id}</td>
                          <td className="px-3 py-2">{row.sku ?? "—"}</td>
                          <td className="px-3 py-2">{row.stock_location_code}</td>
                          <td className="px-3 py-2">{row.quantity}</td>
                          <td className="px-3 py-2">{row.unit_cost_snapshot ?? "—"}</td>
                          <td className="px-3 py-2">{row.effective_date.slice(0, 10)}</td>
                          <td className="px-3 py-2">
                            <span
                              data-testid={`opening-stock-status-${row.id}`}
                              className={
                                row.status === "POSTED"
                                  ? "text-emerald-800"
                                  : row.status === "DRAFT"
                                    ? "text-amber-800"
                                    : "text-muted-foreground"
                              }
                            >
                              {row.status}
                            </span>
                          </td>
                          <td className="space-x-2 px-3 py-2 whitespace-nowrap">
                            {row.status === "DRAFT" ? (
                              <>
                                <button
                                  type="button"
                                  className="text-primary underline text-xs font-semibold"
                                  onClick={() => beginEditDraft(row)}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="text-primary underline text-xs font-semibold"
                                  onClick={() => void handlePostRow(row.id)}
                                >
                                  Post
                                </button>
                              </>
                            ) : row.status === "POSTED" ? (
                              <button
                                type="button"
                                data-testid={`opening-stock-correction-open-${row.id}`}
                                className="text-primary underline text-xs font-semibold"
                                onClick={() => setCorrectionFor(row)}
                              >
                                Create correction
                              </button>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </ERPSectionShell>
          </>
        ) : null}

        {tab === "csv" ? (
          <>
            <ERPSectionShell
              title="Bulk CSV (preview / apply)"
              description="Columns: sku, product_code, warehouse_code, quantity, unit_cost, effective_date, update_mode, note. Duplicate file content shares a stable batch key for idempotent re-apply."
            >
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  data-testid="opening-stock-csv-template-btn"
                  className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium"
                  onClick={() => void handleTemplateDownload()}
                >
                  Download CSV template
                </button>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_200px_auto]">
                <input
                  ref={bulkInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  data-testid="opening-stock-csv-file-input"
                  onChange={(ev: ChangeEvent<HTMLInputElement>) => {
                    setBulkFile(ev.target.files?.[0] ?? null);
                    setBulkPreview(null);
                    setBulkError(null);
                    setBulkSuccess(null);
                  }}
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                />
                <input
                  type="date"
                  value={bulkDefaultDate}
                  onChange={(ev) => setBulkDefaultDate(ev.target.value)}
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  data-testid="opening-stock-csv-preview-btn"
                  disabled={!bulkFile || bulkPreviewing}
                  className="rounded-xl border border-border px-4 py-2 text-sm disabled:opacity-60"
                  onClick={() => void handleBulkPreview()}
                >
                  {bulkPreviewing ? "Preview…" : "Preview"}
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={bulkDryRun}
                    onChange={(ev) => setBulkDryRun(ev.target.checked)}
                  />
                  Dry run (rollback after summary)
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={bulkAutoPost}
                    onChange={(ev) => setBulkAutoPost(ev.target.checked)}
                  />
                  Auto-post drafts after apply
                </label>
              </div>
              {bulkPreview ? (
                <div className="mt-4 rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm space-y-1">
                  <p>
                    Ready: <strong>{bulkPreview.ready_rows}</strong> · Errors:{" "}
                    <strong className={bulkHasFatalErrors ? "text-destructive" : ""}>{bulkPreview.error_rows}</strong>{" "}
                    · Warnings: <strong>{bulkPreview.warning_rows}</strong>
                  </p>
                  <p>
                    Total qty: {bulkPreview.total_quantity_preview} · Total valuation:{" "}
                    {bulkPreview.total_valuation_preview}
                  </p>
                  <p className="font-mono text-xs text-muted-foreground break-all">
                    Batch key: {bulkPreview.batch_key}
                  </p>
                </div>
              ) : null}
              {bulkError ? <p className="mt-3 text-sm text-destructive">{bulkError}</p> : null}
              {bulkSuccess ? <p className="mt-3 text-sm text-emerald-800">{bulkSuccess}</p> : null}
              <button
                type="button"
                data-testid="opening-stock-csv-apply-btn"
                disabled={!canBulkApply}
                className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                onClick={() => void handleBulkApply()}
              >
                {bulkApplying ? "Applying…" : "Apply"}
              </button>

              {bulkPreview?.rows?.length ? (
                <div className="mt-6 overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Row</th>
                        <th className="px-3 py-2">SKU</th>
                        <th className="px-3 py-2">Qty</th>
                        <th className="px-3 py-2">Unit cost</th>
                        <th className="px-3 py-2">Mode</th>
                        <th className="px-3 py-2">Action</th>
                        <th className="px-3 py-2">Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkPreview.rows.map((r) => (
                        <tr key={`${r.row}-${r.sku}`} className="border-t border-border">
                          <td className="px-3 py-2">{r.row}</td>
                          <td className="px-3 py-2">{r.sku ?? r.product_code ?? "—"}</td>
                          <td className="px-3 py-2">{r.quantity ?? "—"}</td>
                          <td className="px-3 py-2">{r.unit_cost ?? "—"}</td>
                          <td className="px-3 py-2">{r.update_mode ?? "—"}</td>
                          <td className="px-3 py-2">{r.action}</td>
                          <td className="px-3 py-2">{r.message ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </ERPSectionShell>

            <ERPSectionShell
              title="Legacy opening ledger import"
              description="Older additive path posts OPENING_BALANCE_IN movements directly from CSV (still duplicate-safe at ledger reference level)."
            >
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto_auto]">
                <input
                  ref={legacyInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(ev) => {
                    setLegacyFile(ev.target.files?.[0] ?? null);
                    setLegacyPreview(null);
                  }}
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                />
                <input
                  type="date"
                  value={legacyDate}
                  onChange={(ev) => setLegacyDate(ev.target.value)}
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  disabled={!legacyFile || legacyBusy}
                  className="rounded-xl border border-border px-3 py-2 text-sm disabled:opacity-60"
                  onClick={async () => {
                    if (!legacyFile) return;
                    setLegacyBusy(true);
                    try {
                      setLegacyPreview(await previewOpeningStockImport(legacyFile));
                    } finally {
                      setLegacyBusy(false);
                    }
                  }}
                >
                  Legacy preview
                </button>
                <button
                  type="button"
                  disabled={
                    !legacyFile ||
                    !legacyPreview ||
                    (legacyPreview?.error_rows ?? 0) > 0 ||
                    legacyBusy
                  }
                  className="rounded-xl bg-muted px-3 py-2 text-sm font-medium disabled:opacity-60"
                  onClick={async () => {
                    if (!legacyFile) return;
                    setLegacyBusy(true);
                    try {
                      await postOpeningStockImport(legacyFile, legacyDate);
                      await afterInventoryMutation();
                      setLegacyFile(null);
                      setLegacyPreview(null);
                      if (legacyInputRef.current) legacyInputRef.current.value = "";
                    } finally {
                      setLegacyBusy(false);
                    }
                  }}
                >
                  Legacy post
                </button>
              </div>
              {legacyPreview ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Ready {legacyPreview.ready_rows} · Errors {legacyPreview.error_rows}
                </p>
              ) : null}
            </ERPSectionShell>
          </>
        ) : null}

        {tab === "history" ? (
          <ERPSectionShell title="Import batch history" description="Last 50 CSV batch envelopes.">
            {batchesLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
            {!batchesLoading && batches?.results?.length ? (
              <ul className="space-y-2 text-sm">
                {batches.results.map((b) => (
                  <li key={b.batch_key} className="rounded-lg border border-border px-3 py-2">
                    <p className="font-mono text-xs break-all">{b.batch_key}</p>
                    <p className="text-muted-foreground">
                      {b.original_filename || "—"} · {b.created_at} · {b.created_by_username ?? "—"}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
            {!batchesLoading && !batches?.results?.length ? (
              <p className="text-sm text-muted-foreground">No import batches recorded yet.</p>
            ) : null}
          </ERPSectionShell>
        ) : null}
      </div>

      {correctionFor ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 md:items-center"
          role="dialog"
          aria-modal
          aria-labelledby="corr-title"
        >
          <div className="max-w-lg rounded-xl border border-border bg-background p-6 shadow-lg w-full">
            <h2 id="corr-title" className="text-lg font-semibold">
              Correction for opening #{correctionFor.id}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Creates a draft stock adjustment linked to this opening row. Reason is required.
            </p>
            <form className="mt-4 grid gap-3" onSubmit={(ev) => void submitCorrection(ev)}>
              <label className="grid gap-1 text-sm">
                <span>Reason</span>
                <textarea
                  required
                  data-testid="opening-stock-correction-reason"
                  value={corrReason}
                  onChange={(ev) => setCorrReason(ev.target.value)}
                  className="rounded-xl border border-border px-3 py-2"
                  rows={3}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span>Quantity delta (+/-)</span>
                <input
                  required
                  data-testid="opening-stock-correction-delta"
                  value={corrDelta}
                  onChange={(ev) => setCorrDelta(ev.target.value)}
                  className="rounded-xl border border-border px-3 py-2"
                  placeholder="-1.000"
                />
              </label>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={corrBusy}
                  className="rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-60"
                >
                  {corrBusy ? "Saving…" : "Create correction draft"}
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-border px-4 py-2 text-sm"
                  onClick={() => {
                    setCorrectionFor(null);
                    setCorrReason("");
                    setCorrDelta("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </ERPPageShell>
  );
}
