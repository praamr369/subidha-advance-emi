// @ts-nocheck
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
import { useDebounce } from "@/hooks/useDebounce";
import { Download, Search } from "lucide-react";

import { INVENTORY_CONTROL_DIRECTORY_GROUPS } from "@/components/admin/control-center/businessControlDirectories";
import { WorkspaceDirectory } from "@/components/admin/control-center/WorkspaceDirectory";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ApiError } from "@/lib/api";
import { invalidateAfterOpeningStockMutation } from "@/lib/operational-query-invalidation";
import { ROUTES } from "@/lib/routes";
import ProductPickerCombobox, { type ProductPickerValue } from "@/components/ui/ProductPickerCombobox";
import {
  applyAdminOpeningStockBulkCsv,
  correctionAdminOpeningStockEntry,
  createAdminOpeningStockEntry,
  fetchOpeningStockCsvTemplateText,
  listAdminOpeningStockBatches,
  listAdminOpeningStockEntries,
  listStockLocations,
  patchAdminOpeningStockEntry,
  postAdminOpeningStockEntry,
  postOpeningStockImport,
  previewAdminOpeningStockBulkCsv,
  previewOpeningStockImport,
  type OpeningStockBulkPreview,
  type OpeningStockEntryRow,
  type OpeningStockEntriesRow,
  type OpeningStockEntriesPayload,
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

function fmt(n: string | number | null | undefined): string {
  if (n === null || n === undefined || n === "") return "—";
  const num = Number(n);
  return Number.isFinite(num) ? num.toLocaleString("en-IN") : String(n);
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "POSTED"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : status === "DRAFT"
        ? "bg-amber-50 text-amber-800 border-amber-200"
        : "bg-muted text-muted-foreground border-border";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${cls}`}>
      {status}
    </span>
  );
}

// Export to CSV helper
function exportOpeningStockToCSV(rows: OpeningStockEntriesRow[], filename: string = "opening-stock.csv") {
  const headers = ["SKU", "Product Code", "Product Name", "Location", "Qty", "Unit Cost", "Status", "Date"];
  const csvContent = [
    headers.join(","),
    ...rows.map(row => [
      row.inventory_item_sku || "",
      row.product_code || "",
      row.product_name || "",
      row.stock_location_name || "",
      row.opening_qty || "",
      row.unit_cost_snapshot || "",
      row.status || "",
      row.effective_date || "",
    ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(","))
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export default function InventoryOpeningStockPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>("manual");

  // Pagination & Filter State
  const [pagination, setPagination] = useState({ page: 1, page_size: 50, total_count: 0, num_pages: 0 });
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 350);

  // KPI State
  const [kpiCounts, setKpiCounts] = useState({ draft: 0, posted: 0 });

  const [entries, setEntries] = useState<OpeningStockEntriesRow[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entriesError, setEntriesError] = useState<string | null>(null);

  const [pickedItem, setPickedItem] = useState<ProductPickerValue | null>(null);
  const [locations, setLocations] = useState<StockLocation[]>([]);

  const [manualLocationId, setManualLocationId] = useState<number | "">("");
  const [manualQty, setManualQty] = useState("0.000");
  const [manualUnitCost, setManualUnitCost] = useState("");
  const [manualDate, setManualDate] = useState(todayIso());
  const [manualNote, setManualNote] = useState("");
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualFieldErrors, setManualFieldErrors] = useState<Record<string, string>>({});
  const [editingDraftId, setEditingDraftId] = useState<number | null>(null);

  const [correctionFor, setCorrectionFor] = useState<OpeningStockEntriesRow | null>(null);
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

  const [batches, setBatches] = useState<Awaited<ReturnType<typeof listAdminOpeningStockBatches>> | null>(null);
  const [batchesLoading, setBatchesLoading] = useState(false);

  const valuationPreview = useMemo(() => {
    const q = parseDec(manualQty);
    const c = manualUnitCost.trim() !== ""
      ? parseDec(manualUnitCost)
      : pickedItem?.standard_unit_cost
        ? parseDec(pickedItem.standard_unit_cost)
        : 0;
    return (q * c).toFixed(2);
  }, [manualQty, manualUnitCost, pickedItem]);

  const loadEntries = useCallback(async () => {
    setEntriesLoading(true);
    setEntriesError(null);
    try {
      const payload = await listAdminOpeningStockEntries({
        page: pagination.page,
        page_size: pagination.page_size,
        status: statusFilter || undefined,
        search: debouncedSearch || undefined,
      }) as OpeningStockEntriesPayload;
      setEntries(payload.results ?? []);
      setKpiCounts({ draft: payload.draft_count, posted: payload.posted_count });
      setPagination(prev => ({
        ...prev,
        total_count: payload.count,
        num_pages: payload.num_pages,
      }));
    } catch (e) {
      setEntries([]);
      setEntriesError(e instanceof Error ? e.message : "Failed to load opening stock rows.");
    } finally {
      setEntriesLoading(false);
    }
  }, [pagination.page, pagination.page_size, statusFilter, debouncedSearch]);

  const loadLocations = useCallback(async () => {
    try {
      const payload = await listStockLocations({ page_size: 200, is_active: true });
      setLocations(payload.results ?? []);
    } catch {
      setLocations([]);
    }
  }, []);

  const loadBatches = useCallback(async () => {
    setBatchesLoading(true);
    try {
      setBatches(await listAdminOpeningStockBatches());
    } catch {
      setBatches(null);
    } finally {
      setBatchesLoading(false);
    }
  }, []);

  useEffect(() => { void loadEntries(); void loadLocations(); }, [loadEntries, loadLocations]);
  useEffect(() => { if (tab === "history") void loadBatches(); }, [tab, loadBatches]);

  useEffect(() => {
    if (!pickedItem || manualLocationId !== "") return;
    if (pickedItem.default_stock_location_id) setManualLocationId(pickedItem.default_stock_location_id);
  }, [pickedItem, manualLocationId]);

  async function afterInventoryMutation() {
    await invalidateAfterOpeningStockMutation(queryClient);
    await loadEntries();
  }

  function resetManualForm() {
    setPickedItem(null);
    setManualLocationId("");
    setManualQty("0.000");
    setManualUnitCost("");
    setManualDate(todayIso());
    setManualNote("");
    setManualFieldErrors({});
    setEditingDraftId(null);
  }

  function beginEditDraft(row: OpeningStockEntriesRow) {
    if (row.status !== "DRAFT") return;
    setEditingDraftId(row.id);
    if (row.inventory_item_id) {
      setPickedItem({
        id: row.inventory_item_id,
        sku: row.inventory_item_sku ?? "",
        product_name: row.product_name ?? `Item #${row.inventory_item_id}`,
        product_code: row.product_code ?? "",
        category: "",
        subcategory: "",
        standard_unit_cost: row.unit_cost_snapshot ?? null,
        unit_of_measure: "",
      });
    }
    setManualLocationId(row.stock_location_id);
    setManualQty(row.opening_qty);
    setManualUnitCost(row.unit_cost_snapshot ?? "");
    setManualDate(row.effective_date ? row.effective_date.slice(0, 10) : todayIso());
    setManualNote("");
    setTab("manual");
    setManualFieldErrors({});
  }

  async function handleSaveManualDraft(e: React.FormEvent) {
    e.preventDefault();
    setManualSubmitting(true);
    setManualFieldErrors({});
    try {
      if (!pickedItem || !manualLocationId) {
        setManualFieldErrors({ base: "Product and location are required." });
        return;
      }
      const payload = {
        inventory_item: pickedItem.id,
        stock_location: Number(manualLocationId),
        quantity: manualQty,
        effective_date: manualDate,
        note: manualNote || "",
        unit_cost_snapshot: manualUnitCost.trim() !== "" ? manualUnitCost.trim() : null,
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
      a.href = url; a.download = "opening_stock_template.csv"; a.click();
      URL.revokeObjectURL(url);
    } catch {
      setBulkError("Template download failed.");
    }
  }

  async function handleBulkPreview() {
    if (!bulkFile) return;
    setBulkPreviewing(true); setBulkError(null); setBulkSuccess(null);
    try {
      setBulkPreview(await previewAdminOpeningStockBulkCsv(bulkFile, bulkDefaultDate));
    } catch (e) {
      setBulkPreview(null);
      setBulkError(e instanceof Error ? e.message : "Preview failed.");
    } finally {
      setBulkPreviewing(false);
    }
  }

  async function handleBulkApply() {
    if (!bulkFile) return;
    setBulkApplying(true); setBulkError(null); setBulkSuccess(null);
    try {
      const s = await applyAdminOpeningStockBulkCsv(bulkFile, {
        dry_run: bulkDryRun, auto_post: bulkAutoPost, default_effective_date: bulkDefaultDate,
      });
      setBulkSuccess(`Batch ${s.batch_key.slice(0, 12)}… — created ${s.created}, updated ${s.updated}, posted ${s.posted}, corrections ${s.corrections_created}, skipped ${s.skipped}, failed ${s.failed}${s.dry_run ? " (dry run — rolled back)" : ""}.`);
      setBulkPreview(null); setBulkFile(null);
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
      await correctionAdminOpeningStockEntry(correctionFor.id, { reason: corrReason, quantity_delta: corrDelta });
      setCorrectionFor(null); setCorrReason(""); setCorrDelta("");
      await afterInventoryMutation();
    } catch (err) {
      setEntriesError(err instanceof Error ? err.message : "Correction failed.");
    } finally {
      setCorrBusy(false);
    }
  }

  const bulkHasFatalErrors = (bulkPreview?.error_rows ?? 0) > 0;
  const canBulkApply = Boolean(bulkFile) && Boolean(bulkPreview) && !bulkHasFatalErrors && !bulkApplying && !bulkPreviewing;

  const stats = useMemo(() => [
    { label: "Draft rows", value: entriesLoading ? "—" : kpiCounts.draft, tone: "warning" as const },
    { label: "Posted rows", value: entriesLoading ? "—" : kpiCounts.posted, tone: "success" as const },
    { label: "Total rows", value: entriesLoading ? "—" : pagination.total_count, tone: "default" as const },
  ], [entriesLoading, kpiCounts, pagination.total_count]);

  const TABS: Array<[TabKey, string]> = [
    ["manual", "Manual entry"],
    ["csv", "CSV / bulk import"],
    ["history", "Batch history"],
  ];

  return (
    <ERPPageShell
      eyebrow="Inventory Opening Control"
      title="Opening Stock"
      subtitle="Draft opening balances with explicit unit costs. Posted rows are immutable — corrections create new stock adjustment drafts."
      helperNote="Posted opening stock is immutable. Corrections create a new stock adjustment. Unit cost never defaults from product selling price."
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
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      <div className="space-y-5">
        <WorkspaceDirectory
          title="Inventory route map"
          description="Navigate between opening stock, stock on hand, ledger, and workspace controls."
          groups={INVENTORY_CONTROL_DIRECTORY_GROUPS}
        />

        {/* Tab strip */}
        <div className="flex gap-1 rounded-xl border border-border bg-muted p-1">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                tab === key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {entriesError ? (
          <div className="flex items-center justify-between rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <span>{entriesError}</span>
            <button type="button" className="ml-4 font-semibold underline underline-offset-2" onClick={() => void loadEntries()}>Retry</button>
          </div>
        ) : null}

        {/* ── MANUAL TAB ── */}
        {tab === "manual" ? (
          <div className="space-y-5">

            {/* Entry form card */}
            <div className="relative overflow-hidden rounded-2xl border-2 border-border/60 bg-gradient-to-b from-card to-muted/20 shadow-lg transition-all duration-300 hover:shadow-xl">
              {/* Decorative top accent */}
              <div className="absolute left-0 right-0 top-0 h-1 bg-gradient-to-r from-primary via-primary/60 to-primary/20" />
              
              <div className="border-b border-border/60 bg-muted/10 px-6 py-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-base font-bold text-foreground flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded bg-primary/10 text-primary">
                        <svg xmlns="http://www.w3.org/大幅org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
                      </span>
                      {editingDraftId ? `Editing draft #${editingDraftId}` : "Add Opening Stock Row"}
                    </div>
                    <p className="mt-1.5 text-xs font-medium text-muted-foreground">
                      Search by SKU, name, product code or barcode — then set location, quantity and cost.
                    </p>
                  </div>
                  {editingDraftId ? (
                    <span className="rounded-full border-2 border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-800 shadow-sm">Editing Draft</span>
                  ) : null}
                </div>
              </div>

              <form onSubmit={(ev) => void handleSaveManualDraft(ev)} className="p-6 space-y-6">
                {/* Product picker — isolated z-context so dropdown floats above everything */}
                <div className="relative z-50 space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">
                    Product / Inventory Item <span className="text-destructive">*</span>
                  </label>
                  <ProductPickerCombobox
                    value={pickedItem}
                    onChange={(item) => { setPickedItem(item); if (!item) setManualLocationId(""); }}
                    data-testid="opening-stock-item-select"
                    required
                  />
                  {pickedItem ? (
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 text-xs text-muted-foreground shadow-sm">
                      {pickedItem.product_code ? <span className="flex items-center gap-1.5">Code: <span className="font-mono font-bold text-primary">{pickedItem.product_code}</span></span> : null}
                      {pickedItem.category ? <span className="flex items-center gap-1.5">Category: <span className="font-semibold text-foreground">{pickedItem.category}{pickedItem.subcategory ? ` › ${pickedItem.subcategory}` : ""}</span></span> : null}
                      {pickedItem.standard_unit_cost ? <span className="flex items-center gap-1.5">Std cost: <span className="font-bold text-foreground">₹{Number(pickedItem.standard_unit_cost).toLocaleString("en-IN")}</span></span> : null}
                      {pickedItem.unit_of_measure ? <span className="flex items-center gap-1.5">Unit: <span className="font-semibold text-foreground">{pickedItem.unit_of_measure}</span></span> : null}
                    </div>
                  ) : null}
                  {manualFieldErrors.inventory_item ? (
                    <p className="text-xs font-medium text-destructive mt-1">{manualFieldErrors.inventory_item}</p>
                  ) : null}
                </div>

                {/* Form fields grid */}
                <div className="relative z-0 grid gap-5 rounded-xl border-2 border-border/40 bg-muted/20 p-5 shadow-inner md:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">
                      Warehouse / Location <span className="text-destructive">*</span>
                    </label>
                    <select
                      required
                      data-testid="opening-stock-location-select"
                      className="w-full rounded-xl border-2 border-border bg-card px-3 py-2.5 text-sm font-medium text-foreground transition-all focus:border-primary focus:ring-4 focus:ring-primary/10"
                      value={manualLocationId === "" ? "" : String(manualLocationId)}
                      onChange={(ev) => setManualLocationId(ev.target.value ? Number(ev.target.value) : "")}
                    >
                      <option value="">Select location…</option>
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>{loc.code} — {loc.name}</option>
                      ))}
                    </select>
                    {manualFieldErrors.stock_location ? (
                      <p className="text-xs text-destructive">{manualFieldErrors.stock_location}</p>
                    ) : null}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">
                      Quantity <span className="text-destructive">*</span>
                    </label>
                    <input
                      required
                      data-testid="opening-stock-qty-input"
                      type="text"
                      inputMode="decimal"
                      value={manualQty}
                      onChange={(ev) => setManualQty(ev.target.value)}
                      className="w-full rounded-xl border-2 border-border bg-card px-3 py-2.5 text-sm font-medium text-foreground transition-all focus:border-primary focus:ring-4 focus:ring-primary/10"
                    />
                    {manualFieldErrors.quantity ? (
                      <p className="text-xs font-medium text-destructive mt-1">{manualFieldErrors.quantity}</p>
                    ) : null}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">
                      Unit cost
                      <span className="ml-1.5 font-semibold normal-case tracking-normal text-muted-foreground/60">
                        (optional — falls back to std cost)
                      </span>
                    </label>
                    <input
                      data-testid="opening-stock-cost-input"
                      type="text"
                      inputMode="decimal"
                      value={manualUnitCost}
                      onChange={(ev) => setManualUnitCost(ev.target.value)}
                      placeholder={pickedItem?.standard_unit_cost ?? "0.00"}
                      className="w-full rounded-xl border-2 border-border bg-card px-3 py-2.5 text-sm font-medium text-foreground transition-all focus:border-primary focus:ring-4 focus:ring-primary/10"
                    />
                    {manualFieldErrors.unit_cost ? (
                      <p className="text-xs font-medium text-destructive mt-1">{manualFieldErrors.unit_cost}</p>
                    ) : null}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">
                      Effective date <span className="text-destructive">*</span>
                    </label>
                    <input
                      required
                      data-testid="opening-stock-date-input"
                      type="date"
                      value={manualDate}
                      onChange={(ev) => setManualDate(ev.target.value)}
                      className="w-full rounded-xl border-2 border-border bg-card px-3 py-2.5 text-sm font-medium text-foreground transition-all focus:border-primary focus:ring-4 focus:ring-primary/10"
                    />
                    {manualFieldErrors.effective_date ? (
                      <p className="text-xs font-medium text-destructive mt-1">{manualFieldErrors.effective_date}</p>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">Note / reason</label>
                  <textarea
                    data-testid="opening-stock-note-input"
                    className="w-full rounded-xl border-2 border-border bg-card px-3 py-2.5 text-sm font-medium text-foreground transition-all focus:border-primary focus:ring-4 focus:ring-primary/10 resize-none"
                    rows={2}
                    value={manualNote}
                    onChange={(ev) => setManualNote(ev.target.value)}
                    placeholder="E.g., Initial setup physical count..."
                  />
                  {manualFieldErrors.notes ? (
                    <p className="text-xs font-medium text-destructive mt-1">{manualFieldErrors.notes}</p>
                  ) : null}
                </div>

                {/* Footer bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted px-4 py-3">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Valuation preview: </span>
                    <span className="font-semibold text-foreground">₹{Number(valuationPreview).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                    <span className="ml-1 text-xs text-muted-foreground">(qty × resolved unit cost)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {editingDraftId ? (
                      <button
                        type="button"
                        className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
                        onClick={resetManualForm}
                      >
                        Cancel edit
                      </button>
                    ) : null}
                    <button
                      type="submit"
                      disabled={manualSubmitting}
                      className="rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                    >
                      {manualSubmitting ? "Saving…" : editingDraftId ? "Update draft" : "Save draft"}
                    </button>
                  </div>
                </div>

                {manualFieldErrors.base ? (
                  <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    {manualFieldErrors.base}
                  </p>
                ) : null}
              </form>
            </div>

            {/* Opening stock rows table */}
            <div className="rounded-2xl border border-border bg-card shadow-sm">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div>
                  <div className="text-sm font-semibold text-foreground">Opening stock rows</div>
                  <p className="mt-0.5 text-xs text-muted-foreground">Drafts are editable and postable. Posted rows create an immutable ledger entry.</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => exportOpeningStockToCSV(entries, `opening-stock-${new Date().toISOString().slice(0, 10)}.csv`)}
                    disabled={entries.length === 0}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-background hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    <Download className="h-3.5 w-3.5" /> Export CSV
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-border bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                    onClick={() => void loadEntries()}
                  >
                    Refresh
                  </button>
                </div>
              </div>

              {/* Search and Filter Controls */}
              <div className="border-b border-border px-5 py-4 space-y-3">
                <div className="grid gap-4 md:grid-cols-[1fr_220px]">
                  {/* Search Input */}
                  <div>
                    <label className="text-sm font-medium text-foreground">Search</label>
                    <div className="relative mt-2">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Search by SKU, product code, or name…"
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          setPagination(p => ({...p, page: 1}));
                        }}
                        className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                    </div>
                  </div>

                  {/* Status Filter */}
                  <div>
                    <label className="text-sm font-medium text-foreground">Status</label>
                    <select
                      className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
                      value={statusFilter}
                      onChange={(event) => {
                        setStatusFilter(event.target.value);
                        setPagination(p => ({...p, page: 1}));
                      }}
                    >
                      <option value="">All statuses</option>
                      <option value="DRAFT">Draft</option>
                      <option value="POSTED">Posted</option>
                    </select>
                  </div>
                </div>
              </div>

              {entriesLoading ? (
                <div className="px-5 py-8 text-center text-sm text-muted-foreground" data-testid="opening-stock-list-skeleton">
                  Loading rows…
                </div>
              ) : entries.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <div className="text-sm font-medium text-foreground">No opening stock rows yet</div>
                  <p className="mt-1 text-xs text-muted-foreground">Use the form above to add items from your old system.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">#</th>
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Product</th>
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Location</th>
                        <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Qty</th>
                        <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Unit cost</th>
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Effective</th>
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {entries.map((row) => (
                        <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{row.id}</td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-foreground">{row.product_name ?? "—"}</div>
                            {row.inventory_item_sku ? <div className="text-xs font-mono text-muted-foreground">{row.inventory_item_sku}</div> : null}
                          </td>
                          <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{row.stock_location_name ?? "—"}</td>
                          <td className="px-4 py-3 text-right font-semibold text-foreground">{fmt(row.opening_qty)}</td>
                          <td className="px-4 py-3 text-right text-foreground">
                            {row.unit_cost_snapshot ? `₹${fmt(row.unit_cost_snapshot)}` : "—"}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{row.effective_date ? row.effective_date.slice(0, 10) : "—"}</td>
                          <td className="px-4 py-3">
                            <StatusBadge status={row.status} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              {row.status === "DRAFT" ? (
                                <>
                                  <button
                                    type="button"
                                    className="rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-muted"
                                    onClick={() => beginEditDraft(row)}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground"
                                    onClick={() => void handlePostRow(row.id)}
                                  >
                                    Post
                                  </button>
                                </>
                              ) : row.status === "POSTED" ? (
                                <button
                                  type="button"
                                  data-testid={`opening-stock-correction-open-${row.id}`}
                                  className="rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-muted"
                                  onClick={() => setCorrectionFor(row)}
                                >
                                  Correct
                                </button>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Pagination Controls */}
                  {pagination.num_pages > 1 && (
                    <div className="flex items-center justify-between gap-4 p-4 border-t border-border">
                      <div className="text-sm text-muted-foreground">
                        Showing {Math.min((pagination.page - 1) * pagination.page_size + 1, pagination.total_count)} to {Math.min(pagination.page * pagination.page_size, pagination.total_count)} of {pagination.total_count} rows
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setPagination(p => ({...p, page: Math.max(1, p.page - 1)}))}
                          disabled={pagination.page === 1 || entriesLoading}
                          className="h-9 px-3 rounded-md border border-input bg-background hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                        >
                          Previous
                        </button>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: Math.min(5, pagination.num_pages) }, (_, i) => {
                            let pageNum: number;
                            if (pagination.num_pages <= 5) {
                              pageNum = i + 1;
                            } else if (pagination.page <= 3) {
                              pageNum = i + 1;
                            } else if (pagination.page >= pagination.num_pages - 2) {
                              pageNum = pagination.num_pages - 4 + i;
                            } else {
                              pageNum = pagination.page - 2 + i;
                            }
                            return (
                              <button
                                key={pageNum}
                                onClick={() => setPagination(p => ({...p, page: pageNum}))}
                                className={`h-9 px-3 rounded-md text-sm ${
                                  pageNum === pagination.page
                                    ? "bg-primary text-primary-foreground"
                                    : "border border-input bg-background hover:bg-muted"
                                }`}
                              >
                                {pageNum}
                              </button>
                            );
                          })}
                        </div>
                        <button
                          onClick={() => setPagination(p => ({...p, page: Math.min(p.num_pages, p.page + 1)}))}
                          disabled={pagination.page === pagination.num_pages || entriesLoading}
                          className="h-9 px-3 rounded-md border border-input bg-background hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* ── CSV TAB ── */}
        {tab === "csv" ? (
          <div className="space-y-5">
            <div className="rounded-2xl border border-border bg-card shadow-sm">
              <div className="border-b border-border px-5 py-4">
                <div className="text-sm font-semibold text-foreground">Bulk CSV import</div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Columns: sku, product_code, warehouse_code, quantity, unit_cost, effective_date, update_mode, note. Duplicate file content shares a stable batch key for idempotent re-apply.
                </p>
              </div>
              <div className="p-5 space-y-4">
                <button
                  type="button"
                  data-testid="opening-stock-csv-template-btn"
                  className="rounded-xl border border-border bg-muted px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/80"
                  onClick={() => void handleTemplateDownload()}
                >
                  Download CSV template
                </button>

                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto]">
                  <input
                    ref={bulkInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    data-testid="opening-stock-csv-file-input"
                    onChange={(ev: ChangeEvent<HTMLInputElement>) => {
                      setBulkFile(ev.target.files?.[0] ?? null);
                      setBulkPreview(null); setBulkError(null); setBulkSuccess(null);
                    }}
                    className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-1 file:text-xs file:font-semibold"
                  />
                  <input
                    type="date"
                    value={bulkDefaultDate}
                    onChange={(ev) => setBulkDefaultDate(ev.target.value)}
                    className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm"
                  />
                  <button
                    type="button"
                    data-testid="opening-stock-csv-preview-btn"
                    disabled={!bulkFile || bulkPreviewing}
                    className="rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold disabled:opacity-60 hover:bg-muted"
                    onClick={() => void handleBulkPreview()}
                  >
                    {bulkPreviewing ? "Previewing…" : "Preview"}
                  </button>
                </div>

                <div className="flex flex-wrap gap-5 text-sm">
                  <label className="flex items-center gap-2 text-muted-foreground">
                    <input type="checkbox" checked={bulkDryRun} onChange={(ev) => setBulkDryRun(ev.target.checked)} />
                    Dry run (rollback after summary)
                  </label>
                  <label className="flex items-center gap-2 text-muted-foreground">
                    <input type="checkbox" checked={bulkAutoPost} onChange={(ev) => setBulkAutoPost(ev.target.checked)} />
                    Auto-post drafts after apply
                  </label>
                </div>

                {bulkPreview ? (
                  <div className="rounded-xl border border-border bg-muted px-4 py-3 space-y-1.5 text-sm">
                    <div className="flex flex-wrap gap-4">
                      <span className="text-muted-foreground">Ready: <strong className="text-foreground">{bulkPreview.ready_rows}</strong></span>
                      <span className="text-muted-foreground">Errors: <strong className={bulkHasFatalErrors ? "text-destructive" : "text-foreground"}>{bulkPreview.error_rows}</strong></span>
                      <span className="text-muted-foreground">Warnings: <strong className="text-foreground">{bulkPreview.warning_rows}</strong></span>
                      <span className="text-muted-foreground">Total qty: <strong className="text-foreground">{bulkPreview.total_quantity_preview}</strong></span>
                      <span className="text-muted-foreground">Valuation: <strong className="text-foreground">{bulkPreview.total_valuation_preview}</strong></span>
                    </div>
                    <p className="font-mono text-xs text-muted-foreground break-all">Batch: {bulkPreview.batch_key}</p>
                  </div>
                ) : null}

                {bulkError ? <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{bulkError}</p> : null}
                {bulkSuccess ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{bulkSuccess}</p> : null}

                <button
                  type="button"
                  data-testid="opening-stock-csv-apply-btn"
                  disabled={!canBulkApply}
                  className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                  onClick={() => void handleBulkApply()}
                >
                  {bulkApplying ? "Applying…" : "Apply batch"}
                </button>

                {bulkPreview?.rows?.length ? (
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/50">
                          {["Row", "SKU", "Qty", "Unit cost", "Mode", "Action", "Message"].map((h) => (
                            <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {bulkPreview.rows.map((r: any) => (
                          <tr key={`${r.row}-${r.sku}`} className="hover:bg-muted/30">
                            <td className="px-3 py-2 font-mono text-xs">{r.row}</td>
                            <td className="px-3 py-2 font-mono text-xs">{r.sku ?? r.product_code ?? "—"}</td>
                            <td className="px-3 py-2 text-right">{r.quantity ?? "—"}</td>
                            <td className="px-3 py-2 text-right">{r.unit_cost ?? "—"}</td>
                            <td className="px-3 py-2 text-xs">{r.update_mode ?? "—"}</td>
                            <td className="px-3 py-2 text-xs font-medium">{r.action}</td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">{r.message ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Legacy import */}
            <div className="rounded-2xl border border-border bg-card shadow-sm">
              <div className="border-b border-border px-5 py-4">
                <div className="text-sm font-semibold text-foreground">Legacy opening ledger import</div>
                <p className="mt-0.5 text-xs text-muted-foreground">Older additive path — posts OPENING_BALANCE_IN movements directly from CSV (duplicate-safe at ledger reference level).</p>
              </div>
              <div className="p-5 space-y-3">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto_auto]">
                  <input
                    ref={legacyInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(ev) => { setLegacyFile(ev.target.files?.[0] ?? null); setLegacyPreview(null); }}
                    className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-1 file:text-xs file:font-semibold"
                  />
                  <input
                    type="date"
                    value={legacyDate}
                    onChange={(ev) => setLegacyDate(ev.target.value)}
                    className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm"
                  />
                  <button
                    type="button"
                    disabled={!legacyFile || legacyBusy}
                    className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm font-medium disabled:opacity-60 hover:bg-muted"
                    onClick={async () => {
                      if (!legacyFile) return;
                      setLegacyBusy(true);
                      try { setLegacyPreview(await previewOpeningStockImport(legacyFile)); } finally { setLegacyBusy(false); }
                    }}
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    disabled={!legacyFile || !legacyPreview || (legacyPreview?.error_rows ?? 0) > 0 || legacyBusy}
                    className="rounded-xl bg-muted px-3 py-2.5 text-sm font-medium disabled:opacity-60 hover:bg-muted/80"
                    onClick={async () => {
                      if (!legacyFile) return;
                      setLegacyBusy(true);
                      try {
                        await postOpeningStockImport(legacyFile, legacyDate);
                        await afterInventoryMutation();
                        setLegacyFile(null); setLegacyPreview(null);
                        if (legacyInputRef.current) legacyInputRef.current.value = "";
                      } finally { setLegacyBusy(false); }
                    }}
                  >
                    Post
                  </button>
                </div>
                {legacyPreview ? (
                  <p className="text-sm text-muted-foreground">
                    Ready <strong className="text-foreground">{legacyPreview.ready_rows}</strong> · Errors <strong className={legacyPreview.error_rows > 0 ? "text-destructive" : "text-foreground"}>{legacyPreview.error_rows}</strong>
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {/* ── HISTORY TAB ── */}
        {tab === "history" ? (
          <div className="rounded-2xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-5 py-4">
              <div className="text-sm font-semibold text-foreground">Batch import history</div>
              <p className="mt-0.5 text-xs text-muted-foreground">Last 50 CSV batch envelopes recorded in this system.</p>
            </div>
            <div className="p-5">
              {batchesLoading ? (
                <p className="text-sm text-muted-foreground">Loading batches…</p>
              ) : batches?.results?.length ? (
                <ul className="space-y-2">
                  {batches.results.map((b) => (
                    <li key={b.batch_key} className="rounded-xl border border-border bg-muted/30 px-4 py-3">
                      <p className="font-mono text-xs break-all text-foreground">{b.batch_key}</p>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span>{b.original_filename || "—"}</span>
                        <span>{b.created_at}</span>
                        <span>{b.created_by_username ?? "—"}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-4 text-center text-sm text-muted-foreground">No import batches recorded yet.</p>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* Correction modal */}
      {correctionFor ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 md:items-center"
          style={{ background: "rgba(10,14,28,0.74)" }}
          role="dialog"
          aria-modal
          aria-labelledby="corr-title"
        >
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h2 id="corr-title" className="text-base font-semibold text-foreground">
                  Stock correction — row #{correctionFor.id}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Creates a draft stock adjustment linked to this opening row. Reason is required.
                </p>
              </div>
            </div>
            <div className="mt-3 rounded-xl border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{correctionFor.product_name ?? correctionFor.inventory_item_sku ?? `Item #${correctionFor.inventory_item_id}`}</span>
              {" · "}{correctionFor.stock_location_name}{" · "}Qty: {correctionFor.opening_qty}
            </div>
            <form className="mt-4 space-y-4" onSubmit={(ev) => void submitCorrection(ev)}>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Reason <span className="text-destructive">*</span>
                </label>
                <textarea
                  required
                  data-testid="opening-stock-correction-reason"
                  value={corrReason}
                  onChange={(ev) => setCorrReason(ev.target.value)}
                  className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm resize-none"
                  rows={3}
                  placeholder="Explain why this correction is needed…"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Quantity delta (+/-) <span className="text-destructive">*</span>
                </label>
                <input
                  required
                  data-testid="opening-stock-correction-delta"
                  value={corrDelta}
                  onChange={(ev) => setCorrDelta(ev.target.value)}
                  className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm"
                  placeholder="-1.000"
                />
              </div>
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={corrBusy}
                  className="rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {corrBusy ? "Saving…" : "Create correction draft"}
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
                  onClick={() => { setCorrectionFor(null); setCorrReason(""); setCorrDelta(""); }}
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
