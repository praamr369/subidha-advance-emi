"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle, Edit2, Package, Trash2, X, ChevronDown, ChevronUp, Plus, Wrench, Star, AlertCircle } from "lucide-react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import QRCode from "react-qr-code";
import {
  fetchFGProfile,
  listAccessories,
  listAccessoryVariantGroups,
  listServiceCatalog,
  addFGAccessoryLink,
  addFGAccessoryGroupLink,
  deleteFGAccessoryLink,
  updateFGAccessoryLink,
  addFGServiceLink,
  deleteFGServiceLink,
  updateFGServiceLink,
  createServiceCatalogItem,
  patchFGBarcode,
  quickCreateAndLinkAccessory,
  type FGProfileDetail,
  type FGAccessoryLink,
  type FGServiceLink,
  type AccessoryRow,
  type ServiceCatalogItem,
  type AccessoryVariantGroup,
  SERVICE_TYPE_LABELS,
  type ServiceType,
} from "@/services/inventory";

// ─── Shared style tokens ─────────────────────────────────────────────────────
const INP = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
const SEL = INP;
const BTN_PRIMARY = "inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition";
const BTN_GHOST = "inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/60 disabled:opacity-50 transition";
const BTN_DANGER = "inline-flex items-center gap-1 rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition";

const SERVICE_TYPES: ServiceType[] = ["WARRANTY", "INSTALLATION", "MAINTENANCE", "POLISH", "DELIVERY", "REPAIR", "ADDON", "OTHER"];
const SERVICE_TYPE_COLORS: Record<ServiceType, string> = {
  WARRANTY: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  INSTALLATION: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  MAINTENANCE: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
  POLISH: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  DELIVERY: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  REPAIR: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  ADDON: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  OTHER: "bg-muted text-muted-foreground",
};

type Tab = "overview" | "accessories" | "services" | "bom";

// ─── Inline edit form state helpers ──────────────────────────────────────────
type LinkEditState = { charge_mode: string; sale_price: string; is_default_included: boolean; notes: string };
const defaultLinkEdit = (): LinkEditState => ({ charge_mode: "FREE", sale_price: "0.00", is_default_included: true, notes: "" });

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionCard({ title, description, action, children }: { title: string; description?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <div>
          <div className="text-sm font-semibold text-foreground">{title}</div>
          {description && <div className="text-xs text-muted-foreground mt-0.5">{description}</div>}
        </div>
        {action}
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function KpiTile({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: "green" | "amber" | "red" | "blue" | "default" }) {
  const color = tone === "green" ? "text-green-600 dark:text-green-400" : tone === "amber" ? "text-amber-600 dark:text-amber-400" : tone === "red" ? "text-red-600 dark:text-red-400" : tone === "blue" ? "text-blue-600 dark:text-blue-400" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function ChargeBadge({ mode, price, stdPrice }: { mode: string; price: string; stdPrice?: string }) {
  if (mode === "FREE") return <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">Free / Included</span>;
  const display = price && price !== "0.00" ? price : (stdPrice ?? "0.00");
  return <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Chargeable ₹{display}</span>;
}

function InlineLinkEditor({
  init,
  onSave,
  onCancel,
  saving,
  error,
}: {
  init: LinkEditState;
  onSave: (v: LinkEditState) => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}) {
  const [v, setV] = useState<LinkEditState>(init);
  return (
    <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-4 grid gap-3 sm:grid-cols-2">
      <div>
        <label htmlFor="f-charge-mode" className="mb-1 block text-xs font-medium text-muted-foreground">Charge Mode</label>
        <select id="f-charge-mode" value={v.charge_mode} onChange={(e) => setV((s) => ({ ...s, charge_mode: e.target.value, sale_price: e.target.value === "FREE" ? "0.00" : s.sale_price }))} className={SEL}>
          <option value="FREE">Free / Included</option>
          <option value="CHARGEABLE">Chargeable (add price)</option>
        </select>
      </div>
      {v.charge_mode === "CHARGEABLE" && (
        <div>
          <label htmlFor="f-sale-price-override" className="mb-1 block text-xs font-medium text-muted-foreground">Sale Price Override (₹)</label>
          <input id="f-sale-price-override" type="number" min="0" step="0.01" value={v.sale_price} onChange={(e) => setV((s) => ({ ...s, sale_price: e.target.value }))} className={INP} />
        </div>
      )}
      <div>
        <label htmlFor="f-notes" className="mb-1 block text-xs font-medium text-muted-foreground">Notes</label>
        <input id="f-notes" value={v.notes} onChange={(e) => setV((s) => ({ ...s, notes: e.target.value }))} placeholder="Optional" className={INP} />
      </div>
      <div className="flex items-center gap-2 sm:col-span-2">
        <input type="checkbox" id="ile-def" checked={v.is_default_included} onChange={(e) => setV((s) => ({ ...s, is_default_included: e.target.checked }))} className="h-4 w-4 rounded border-border" />
        <label htmlFor="ile-def" className="text-sm">Pre-select on new sales / subscriptions</label>
      </div>
      {error && <div className="sm:col-span-2 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">{error}</div>}
      <div className="sm:col-span-2 flex gap-2">
        <button onClick={() => onSave(v)} disabled={saving} className={BTN_PRIMARY}><CheckCircle className="h-3.5 w-3.5" />{saving ? "Saving…" : "Save Changes"}</button>
        <button onClick={onCancel} className={BTN_GHOST}><X className="h-3.5 w-3.5" />Cancel</button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function FGProfilePage() {
  const params = useParams();
  const id = Number(params.id);

  const [data, setData] = useState<FGProfileDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");

  // Catalog data
  const [accItems, setAccItems] = useState<AccessoryRow[]>([]);
  const [accGroups, setAccGroups] = useState<AccessoryVariantGroup[]>([]);
  const [svcItems, setSvcItems] = useState<ServiceCatalogItem[]>([]);

  // Accessory add form
  const [showAccForm, setShowAccForm] = useState(false);
  const [accMode, setAccMode] = useState<"single" | "group">("single");
  const [accForm, setAccForm] = useState({ accessory: 0, variant_group: 0, charge_mode: "FREE", sale_price: "0.00", is_default_included: true, notes: "", sort_order: 1 });
  const [accSaving, setAccSaving] = useState(false);
  const [accErr, setAccErr] = useState<string | null>(null);

  // Accessory inline edit
  const [editAccId, setEditAccId] = useState<number | null>(null);
  const [editAccState, setEditAccState] = useState<LinkEditState>(defaultLinkEdit());
  const [editAccSaving, setEditAccSaving] = useState(false);
  const [editAccErr, setEditAccErr] = useState<string | null>(null);

  // Service add form
  const [showSvcForm, setShowSvcForm] = useState(false);
  const [svcForm, setSvcForm] = useState({ service: 0, charge_mode: "FREE", sale_price: "0.00", is_default_included: true, notes: "", sort_order: 1 });
  const [svcSaving, setSvcSaving] = useState(false);
  const [svcErr, setSvcErr] = useState<string | null>(null);

  // Service inline edit
  const [editSvcId, setEditSvcId] = useState<number | null>(null);
  const [editSvcState, setEditSvcState] = useState<LinkEditState>(defaultLinkEdit());
  const [editSvcSaving, setEditSvcSaving] = useState(false);
  const [editSvcErr, setEditSvcErr] = useState<string | null>(null);

  // Barcode
  const [barcodeEditing, setBarcodeEditing] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [barcodeSaving, setBarcodeSaving] = useState(false);
  const [barcodeErr, setBarcodeErr] = useState<string | null>(null);

  // Quick-create accessory (create new + link in one step)
  const [showQuickAcc, setShowQuickAcc] = useState(false);
  const [qaForm, setQaForm] = useState({ name: "", product_code: "", base_price: "0.00", unit_of_measure: "PCS", charge_mode: "FREE", sale_price: "0.00", is_default_included: true, notes: "" });
  const [qaSaving, setQaSaving] = useState(false);
  const [qaErr, setQaErr] = useState<string | null>(null);

  // Quick-create service
  const [showQuickSvc, setShowQuickSvc] = useState(false);
  const [qsForm, setQsForm] = useState({ code: "", name: "", service_type: "OTHER" as ServiceType, category: "", standard_price: "", tax_rate_percent: "0", hsn_sac_code: "", notes: "" });
  const [qsSaving, setQsSaving] = useState(false);
  const [qsErr, setQsErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const d = await fetchFGProfile(id);
      setData(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load profile.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    void listAccessories({ page_size: 200 }).then((r) => setAccItems(r.results ?? []));
    void listAccessoryVariantGroups({ page_size: 100 }).then((r) => setAccGroups(r.results ?? []));
    void listServiceCatalog({ status: "ACTIVE", page_size: 200 }).then((r) => setSvcItems(r.results ?? []));
  }, []);

  // ── Accessory handlers ──────────────────────────────────────────────────────
  async function handleAddAccessory(e: React.FormEvent) {
    e.preventDefault();
    setAccSaving(true); setAccErr(null);
    try {
      if (accMode === "group") {
        if (!accForm.variant_group) { setAccErr("Select a variant group."); setAccSaving(false); return; }
        await addFGAccessoryGroupLink(id, {
          variant_group: accForm.variant_group,
          charge_mode: accForm.charge_mode,
          sale_price: accForm.charge_mode === "FREE" ? "0.00" : accForm.sale_price,
          is_default_included: accForm.is_default_included,
          notes: accForm.notes,
          sort_order: accForm.sort_order,
        });
      } else {
        if (!accForm.accessory) { setAccErr("Select an accessory."); setAccSaving(false); return; }
        await addFGAccessoryLink(id, {
          accessory: accForm.accessory,
          charge_mode: accForm.charge_mode,
          sale_price: accForm.charge_mode === "FREE" ? "0.00" : accForm.sale_price,
          is_default_included: accForm.is_default_included,
          notes: accForm.notes,
          sort_order: accForm.sort_order,
        });
      }
      setAccForm({ accessory: 0, variant_group: 0, charge_mode: "FREE", sale_price: "0.00", is_default_included: true, notes: "", sort_order: 1 });
      setShowAccForm(false);
      await load();
    } catch (e) {
      setAccErr(e instanceof Error ? e.message : "Failed to add accessory.");
    } finally {
      setAccSaving(false);
    }
  }

  async function handleSaveAccEdit(v: LinkEditState) {
    if (!editAccId) return;
    setEditAccSaving(true); setEditAccErr(null);
    try {
      await updateFGAccessoryLink(id, editAccId, v);
      setEditAccId(null);
      await load();
    } catch (e) {
      setEditAccErr(e instanceof Error ? e.message : "Failed to update.");
    } finally {
      setEditAccSaving(false);
    }
  }

  async function handleDeleteAcc(link: FGAccessoryLink) {
    const name = link.accessory_name ?? link.variant_group_name ?? "this accessory";
    if (!confirm(`Remove "${name}" from this finished good?`)) return;
    try { await deleteFGAccessoryLink(id, link.id); await load(); }
    catch (e) { alert(e instanceof Error ? e.message : "Failed to remove."); }
  }

  // ── Service handlers ────────────────────────────────────────────────────────
  async function handleAddService(e: React.FormEvent) {
    e.preventDefault();
    if (!svcForm.service) { setSvcErr("Select a service."); return; }
    setSvcSaving(true); setSvcErr(null);
    try {
      await addFGServiceLink(id, {
        service: svcForm.service,
        charge_mode: svcForm.charge_mode,
        sale_price: svcForm.charge_mode === "FREE" ? "0.00" : svcForm.sale_price,
        is_default_included: svcForm.is_default_included,
        notes: svcForm.notes,
        sort_order: svcForm.sort_order,
      });
      setSvcForm({ service: 0, charge_mode: "FREE", sale_price: "0.00", is_default_included: true, notes: "", sort_order: 1 });
      setShowSvcForm(false);
      await load();
    } catch (e) {
      setSvcErr(e instanceof Error ? e.message : "Failed to add service.");
    } finally {
      setSvcSaving(false);
    }
  }

  async function handleSaveSvcEdit(v: LinkEditState) {
    if (!editSvcId) return;
    setEditSvcSaving(true); setEditSvcErr(null);
    try {
      await updateFGServiceLink(id, editSvcId, v);
      setEditSvcId(null);
      await load();
    } catch (e) {
      setEditSvcErr(e instanceof Error ? e.message : "Failed to update.");
    } finally {
      setEditSvcSaving(false);
    }
  }

  async function handleDeleteSvc(link: FGServiceLink) {
    if (!confirm(`Remove "${link.service_name}" from this finished good?`)) return;
    try { await deleteFGServiceLink(id, link.id); await load(); }
    catch (e) { alert(e instanceof Error ? e.message : "Failed to remove."); }
  }

  // ── Barcode ─────────────────────────────────────────────────────────────────
  async function handleSaveBarcode(manual?: string) {
    setBarcodeSaving(true); setBarcodeErr(null);
    try {
      const result = await patchFGBarcode(id, manual);
      setData((d) => d ? { ...d, profile: { ...d.profile, barcode: result.barcode } } : d);
      setBarcodeEditing(false);
    } catch (e) {
      setBarcodeErr(e instanceof Error ? e.message : "Failed to save barcode.");
    } finally {
      setBarcodeSaving(false);
    }
  }

  // ── Quick-create accessory ──────────────────────────────────────────────────
  async function handleQuickCreateAccessory(e: React.FormEvent) {
    e.preventDefault();
    if (!qaForm.name.trim() || !qaForm.product_code.trim()) { setQaErr("Name and Product Code are required."); return; }
    setQaSaving(true); setQaErr(null);
    try {
      await quickCreateAndLinkAccessory(id, {
        ...qaForm,
        sale_price: qaForm.charge_mode === "FREE" ? "0.00" : qaForm.sale_price,
      });
      // Refresh accessories list
      const r = await listAccessories({ page_size: 200 });
      setAccItems(r.results ?? []);
      setShowQuickAcc(false);
      setQaForm({ name: "", product_code: "", base_price: "0.00", unit_of_measure: "PCS", charge_mode: "FREE", sale_price: "0.00", is_default_included: true, notes: "" });
      await load();
    } catch (e) {
      setQaErr(e instanceof Error ? e.message : "Failed to create accessory.");
    } finally {
      setQaSaving(false);
    }
  }

  // ── Quick-create service ────────────────────────────────────────────────────
  async function handleQuickCreateService(e: React.FormEvent) {
    e.preventDefault();
    if (!qsForm.code.trim() || !qsForm.name.trim() || !qsForm.standard_price) {
      setQsErr("Code, Name and Standard Price are required."); return;
    }
    setQsSaving(true); setQsErr(null);
    try {
      const created = await createServiceCatalogItem({ ...qsForm, code: qsForm.code.trim().toUpperCase(), status: "ACTIVE" });
      const r = await listServiceCatalog({ status: "ACTIVE", page_size: 200 });
      setSvcItems(r.results ?? []);
      setSvcForm((f) => ({ ...f, service: created.id ?? 0 }));
      setShowQuickSvc(false);
      setQsForm({ code: "", name: "", service_type: "OTHER", category: "", standard_price: "", tax_rate_percent: "0", hsn_sac_code: "", notes: "" });
    } catch (e) {
      setQsErr(e instanceof Error ? e.message : "Failed to create.");
    } finally {
      setQsSaving(false);
    }
  }

  // ── Derived ──────────────────────────────────────────────────────────────────
  const p = data?.profile;
  const linkedAccIds = new Set((data?.accessories ?? []).map((a) => a.accessory).filter(Boolean) as number[]);
  const linkedGroupIds = new Set((data?.accessories ?? []).map((a) => a.variant_group).filter(Boolean) as number[]);
  const linkedSvcIds = new Set((data?.services ?? []).map((s) => s.service));
  const availableAcc = accItems.filter((a) => !linkedAccIds.has(a.id));
  const availableGroups = accGroups.filter((g) => !linkedGroupIds.has(g.id));
  const availableSvc = svcItems.filter((s) => !linkedSvcIds.has(s.id));

  const stockQty = parseFloat(p?.physical_qty ?? "0");
  const reorderQty = parseFloat(p?.reorder_level_qty ?? "0");
  const stockTone = stockQty <= 0 ? "red" : stockQty <= reorderQty ? "amber" : "green";

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "accessories", label: "Accessories", count: data?.accessories.length ?? 0 },
    { key: "services", label: "Services", count: data?.services.length ?? 0 },
    { key: "bom", label: "BOM", count: data?.bom_count ?? 0 },
  ];

  return (
    <ERPPageShell
      eyebrow="Finished Good"
      title={p ? p.product_name : "Loading…"}
      subtitle={p ? `${p.product_code} · ${p.unit_of_measure} · ${p.stock_item_type.replace(/_/g, " ")}` : ""}
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Finished Goods", href: ROUTES.admin.inventoryFinishedGoods },
        { label: p?.product_name ?? "Profile" },
      ]}
      statusBadge={p ? { label: p.stock_tracking_status, tone: p.stock_tracking_status === "STOCK_ACTIVE" ? "success" : "warning" } : undefined}
      stats={[
        { label: "Stock Qty", value: p ? stockQty.toFixed(2) : "—", tone: stockTone === "green" ? "success" : stockTone === "amber" ? "warning" : "danger" },
        { label: "Accessories", value: data?.accessories.length ?? "—", tone: "info" },
        { label: "Services", value: data?.services.length ?? "—", tone: "info" },
        { label: "BOM Revisions", value: data?.bom_count ?? "—", tone: "default" },
        { label: "Base Price", value: p ? `₹${parseFloat(p.base_price).toLocaleString("en-IN")}` : "—", tone: "default" },
      ]}
    >
      {loading ? <ERPLoadingState label="Loading finished good profile…" /> : null}
      {!loading && error ? <ERPErrorState title="Failed to load" description={error} /> : null}

      {!loading && !error && data && p ? (
        <div className="space-y-5">

          {/* ── Tab bar ─────────────────────────────────────────────────── */}
          <div className="flex gap-1 overflow-x-auto border-b border-border pb-0">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`shrink-0 rounded-t-lg px-4 py-2.5 text-sm font-medium transition ${
                  tab === t.key
                    ? "border border-b-card border-border bg-card text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
                {t.count !== undefined ? (
                  <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${t.count > 0 ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                    {t.count}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          {/* ══════════════════════════════════════════════════════════════
              OVERVIEW TAB
          ══════════════════════════════════════════════════════════════ */}
          {tab === "overview" ? (
            <div className="space-y-5">
              {/* Stock KPIs */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <KpiTile label="Stock on Hand" value={stockQty.toFixed(2)} sub={p.unit_of_measure} tone={stockTone} />
                <KpiTile label="Reorder Level" value={parseFloat(p.reorder_level_qty).toFixed(2)} sub={p.unit_of_measure} />
                <KpiTile label="Unit Cost" value={`₹${parseFloat(p.standard_unit_cost).toLocaleString("en-IN")}`} tone="blue" />
                <KpiTile label="Base Price" value={`₹${parseFloat(p.base_price).toLocaleString("en-IN")}`} tone="blue" />
              </div>

              {/* Profile details */}
              <SectionCard title="Inventory Profile" description="Core fields from this item's inventory profile record.">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
                  {([
                    ["Product Code", p.product_code],
                    ["SKU", p.sku || "—"],
                    ["Unit of Measure", p.unit_of_measure],
                    ["Valuation Method", p.valuation_method],
                    ["Std Unit Cost", `₹${p.standard_unit_cost}`],
                    ["Base Sale Price", `₹${p.base_price}`],
                    ["Reorder Level", `${p.reorder_level_qty} ${p.unit_of_measure}`],
                    ["Category", p.category || "—"],
                    ["Subcategory", p.subcategory || "—"],
                    ["Barcode", p.barcode || "—"],
                    ["Tracking Status", p.stock_tracking_status.replace(/_/g, " ")],
                    ["Active", p.is_active ? "Yes" : "No"],
                  ] as [string, string][]).map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
                      <dd className="mt-0.5 font-medium text-foreground">{value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-4 border-t border-border pt-4 flex flex-wrap gap-2">
                  <Link href={`${ROUTES.admin.inventoryItems}?search=${p.product_code}`} className={BTN_GHOST}>
                    View in Items Register →
                  </Link>
                  <Link href={ROUTES.admin.manufacturingBoms} className={BTN_GHOST}>
                    View BOMs →
                  </Link>
                </div>
              </SectionCard>

              {/* Barcode & QR */}
              <SectionCard title="Barcode & QR Code" description="Scan at warehouse for stock movements and label printing.">
                <div className="flex flex-wrap items-start gap-6">
                  {/* QR */}
                  <div className="shrink-0 rounded-xl border border-border bg-white p-3">
                    {p.barcode ? (
                      <QRCode value={p.barcode} size={96} />
                    ) : (
                      <div className="flex h-24 w-24 items-center justify-center text-xs text-muted-foreground text-center">No barcode set</div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-3">
                    {p.barcode && !barcodeEditing && (
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Current Barcode</div>
                        <div className="font-mono text-lg font-bold text-foreground">{p.barcode}</div>
                      </div>
                    )}

                    {barcodeEditing ? (
                      <div className="space-y-2">
                        <label htmlFor="f-custom-barcode-value" className="text-xs font-medium text-muted-foreground">Custom Barcode Value</label>
                        <input id="f-custom-barcode-value"
                          value={barcodeInput}
                          onChange={(e) => setBarcodeInput(e.target.value)}
                          placeholder="e.g. BC-SHAKBED-0042"
                          className={INP + " font-mono"}
                          autoFocus
                        />
                        {barcodeErr && <div className="text-xs text-destructive">{barcodeErr}</div>}
                        <div className="flex gap-2">
                          <button onClick={() => handleSaveBarcode(barcodeInput.trim() || undefined)} disabled={barcodeSaving} className={BTN_PRIMARY}>
                            <CheckCircle className="h-3.5 w-3.5" />{barcodeSaving ? "Saving…" : "Save"}
                          </button>
                          <button onClick={() => { setBarcodeEditing(false); setBarcodeErr(null); }} className={BTN_GHOST}>
                            <X className="h-3.5 w-3.5" />Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => { setBarcodeInput(p.barcode || ""); setBarcodeEditing(true); setBarcodeErr(null); }}
                          className={BTN_GHOST}
                        >
                          <Edit2 className="h-3.5 w-3.5" />{p.barcode ? "Edit Barcode" : "Set Barcode"}
                        </button>
                        <button
                          onClick={() => handleSaveBarcode(undefined)}
                          disabled={barcodeSaving}
                          className={BTN_GHOST}
                        >
                          {barcodeSaving ? "Generating…" : "Auto-Generate"}
                        </button>
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">Auto-generate creates a code like <code className="font-mono bg-muted px-1 rounded">BC-SKU-XXXX</code>. QR code updates on save.</div>
                  </div>
                </div>
              </SectionCard>

              {/* Quick summary of linked items */}
              <div className="grid gap-3 sm:grid-cols-3">
                <button onClick={() => setTab("accessories")} className="group rounded-xl border border-border bg-card p-4 text-left hover:border-primary/40 hover:bg-muted/30 transition">
                  <div className="flex items-center gap-2 mb-2">
                    <Wrench className="h-4 w-4 text-amber-500" />
                    <span className="text-sm font-semibold">Accessories</span>
                  </div>
                  <div className="text-2xl font-bold">{data.accessories.length}</div>
                  <div className="text-xs text-muted-foreground mt-1">{data.accessories.filter((a) => a.charge_mode === "FREE").length} free · {data.accessories.filter((a) => a.charge_mode !== "FREE").length} chargeable</div>
                  <div className="mt-2 text-xs font-semibold text-primary opacity-0 group-hover:opacity-100 transition">Manage →</div>
                </button>
                <button onClick={() => setTab("services")} className="group rounded-xl border border-border bg-card p-4 text-left hover:border-primary/40 hover:bg-muted/30 transition">
                  <div className="flex items-center gap-2 mb-2">
                    <Star className="h-4 w-4 text-purple-500" />
                    <span className="text-sm font-semibold">Services</span>
                  </div>
                  <div className="text-2xl font-bold">{data.services.length}</div>
                  <div className="text-xs text-muted-foreground mt-1">{data.services.filter((s) => s.charge_mode === "FREE").length} free · {data.services.filter((s) => s.charge_mode !== "FREE").length} chargeable</div>
                  <div className="mt-2 text-xs font-semibold text-primary opacity-0 group-hover:opacity-100 transition">Manage →</div>
                </button>
                <button onClick={() => setTab("bom")} className="group rounded-xl border border-border bg-card p-4 text-left hover:border-primary/40 hover:bg-muted/30 transition">
                  <div className="flex items-center gap-2 mb-2">
                    <Package className="h-4 w-4 text-sky-500" />
                    <span className="text-sm font-semibold">Bill of Materials</span>
                  </div>
                  <div className="text-2xl font-bold">{data.bom_count}</div>
                  <div className="text-xs text-muted-foreground mt-1">{data.active_bom ? `Active: ${data.active_bom.bom_no}` : "No active BOM"}</div>
                  <div className="mt-2 text-xs font-semibold text-primary opacity-0 group-hover:opacity-100 transition">View BOM →</div>
                </button>
              </div>
            </div>
          ) : null}

          {/* ══════════════════════════════════════════════════════════════
              ACCESSORIES TAB
          ══════════════════════════════════════════════════════════════ */}
          {tab === "accessories" ? (
            <div className="space-y-4">
              <SectionCard
                title={`Linked Accessories (${data.accessories.length})`}
                description="Items sold or included alongside this finished good."
                action={
                  <div className="flex gap-2">
                    <button onClick={() => { setShowQuickAcc((v) => !v); setQaErr(null); }} className={BTN_GHOST}>
                      {showQuickAcc ? <><X className="h-3.5 w-3.5" />Cancel</> : <><Plus className="h-3.5 w-3.5" />Create New</>}
                    </button>
                    <button onClick={() => { setShowAccForm((v) => !v); setAccErr(null); }} className={BTN_PRIMARY}>
                      {showAccForm ? <><X className="h-3.5 w-3.5" />Cancel</> : <><Plus className="h-3.5 w-3.5" />Link Existing</>}
                    </button>
                  </div>
                }
              >
                {/* ── Quick-create accessory ── */}
                {showQuickAcc && (
                  <form onSubmit={handleQuickCreateAccessory} className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 grid gap-3 sm:grid-cols-2 dark:border-amber-900/40 dark:bg-amber-900/10">
                    <div className="sm:col-span-2 text-xs font-semibold text-amber-700 dark:text-amber-400">Create New Accessory → Saved to Accessories catalog and linked immediately</div>
                    <div>
                      <label htmlFor="f-product-code" className="mb-1 block text-xs font-medium text-muted-foreground">Product Code *</label>
                      <input id="f-product-code" value={qaForm.product_code} onChange={(e) => setQaForm((f) => ({ ...f, product_code: e.target.value.toUpperCase() }))} placeholder="ACC-SIDERAIL-01" maxLength={40} className={INP + " font-mono"} />
                    </div>
                    <div>
                      <label htmlFor="f-unit-of-measure" className="mb-1 block text-xs font-medium text-muted-foreground">Unit of Measure</label>
                      <input id="f-unit-of-measure" value={qaForm.unit_of_measure} onChange={(e) => setQaForm((f) => ({ ...f, unit_of_measure: e.target.value }))} placeholder="PCS" className={INP} />
                    </div>
                    <div className="sm:col-span-2">
                      <label htmlFor="f-accessory-name" className="mb-1 block text-xs font-medium text-muted-foreground">Accessory Name *</label>
                      <input id="f-accessory-name" value={qaForm.name} onChange={(e) => setQaForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Side Rail – Sagwan Wood" maxLength={200} className={INP} />
                    </div>
                    <div>
                      <label htmlFor="f-catalogue-price" className="mb-1 block text-xs font-medium text-muted-foreground">Catalogue Price (₹)</label>
                      <input id="f-catalogue-price" type="number" min="0" step="0.01" value={qaForm.base_price} onChange={(e) => setQaForm((f) => ({ ...f, base_price: e.target.value }))} className={INP} />
                    </div>
                    <div>
                      <label htmlFor="f-charge-mode-on-this-fg" className="mb-1 block text-xs font-medium text-muted-foreground">Charge Mode on this FG</label>
                      <select id="f-charge-mode-on-this-fg" value={qaForm.charge_mode} onChange={(e) => setQaForm((f) => ({ ...f, charge_mode: e.target.value, sale_price: e.target.value === "FREE" ? "0.00" : f.sale_price }))} className={SEL}>
                        <option value="FREE">Free / Included</option>
                        <option value="CHARGEABLE">Chargeable</option>
                      </select>
                    </div>
                    {qaForm.charge_mode === "CHARGEABLE" && (
                      <div>
                        <label htmlFor="f-sale-price-override-2" className="mb-1 block text-xs font-medium text-muted-foreground">Sale Price Override (₹)</label>
                        <input id="f-sale-price-override-2" type="number" min="0" step="0.01" value={qaForm.sale_price} onChange={(e) => setQaForm((f) => ({ ...f, sale_price: e.target.value }))} className={INP} />
                      </div>
                    )}
                    <div>
                      <label htmlFor="f-notes-2" className="mb-1 block text-xs font-medium text-muted-foreground">Notes</label>
                      <input id="f-notes-2" value={qaForm.notes} onChange={(e) => setQaForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional" className={INP} />
                    </div>
                    <div className="flex items-center gap-2 sm:col-span-2">
                      <input id="qa-def" type="checkbox" checked={qaForm.is_default_included} onChange={(e) => setQaForm((f) => ({ ...f, is_default_included: e.target.checked }))} className="h-4 w-4 rounded border-border" />
                      <label htmlFor="qa-def" className="text-sm">Pre-select on new sales / subscriptions</label>
                    </div>
                    {qaErr && <div className="sm:col-span-2 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">{qaErr}</div>}
                    <div className="sm:col-span-2 flex gap-2">
                      <button type="submit" disabled={qaSaving} className={BTN_PRIMARY}>{qaSaving ? "Creating & Linking…" : "Create & Link Accessory"}</button>
                      <button type="button" onClick={() => setShowQuickAcc(false)} className={BTN_GHOST}>Cancel</button>
                    </div>
                  </form>
                )}

                {/* ── Add form ── */}
                {showAccForm && (
                  <div className="mb-5 rounded-xl border border-primary/30 bg-primary/5 p-4">
                    <div className="mb-3 text-xs font-semibold text-primary">Link Accessory to this Finished Good</div>
                    {/* Mode toggle */}
                    <div className="mb-3 flex gap-2">
                      {(["single", "group"] as const).map((m) => (
                        <button key={m} type="button" onClick={() => setAccMode(m)}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${accMode === m ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}>
                          {m === "single" ? "Single Item" : "Variant Group"}
                        </button>
                      ))}
                    </div>
                    <form onSubmit={handleAddAccessory} className="grid gap-3 sm:grid-cols-2">
                      {accMode === "single" ? (
                        availableAcc.length === 0 ? (
                          <div className="sm:col-span-2 text-sm text-muted-foreground">All accessories already linked. <Link href={ROUTES.admin.inventoryAccessories} className="underline">Manage accessories →</Link></div>
                        ) : (
                          <div>
                            <label htmlFor="f-accessory" className="mb-1 block text-xs font-medium text-muted-foreground">Accessory *</label>
                            <select id="f-accessory" value={accForm.accessory} onChange={(e) => setAccForm((f) => ({ ...f, accessory: Number(e.target.value) }))} className={SEL}>
                              <option value={0}>— Select accessory —</option>
                              {availableAcc.map((a) => <option key={a.id} value={a.id}>{a.product_name} ({a.product_code})</option>)}
                            </select>
                          </div>
                        )
                      ) : (
                        availableGroups.length === 0 ? (
                          <div className="sm:col-span-2 text-sm text-muted-foreground">All groups already linked.</div>
                        ) : (
                          <div>
                            <label htmlFor="f-variant-group" className="mb-1 block text-xs font-medium text-muted-foreground">Variant Group *</label>
                            <select id="f-variant-group" value={accForm.variant_group} onChange={(e) => setAccForm((f) => ({ ...f, variant_group: Number(e.target.value) }))} className={SEL}>
                              <option value={0}>— Select group —</option>
                              {availableGroups.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.code}) — {g.variant_count} variants</option>)}
                            </select>
                          </div>
                        )
                      )}
                      <div>
                        <label htmlFor="f-charge-mode-2" className="mb-1 block text-xs font-medium text-muted-foreground">Charge Mode</label>
                        <select id="f-charge-mode-2" value={accForm.charge_mode} onChange={(e) => setAccForm((f) => ({ ...f, charge_mode: e.target.value, sale_price: e.target.value === "FREE" ? "0.00" : f.sale_price }))} className={SEL}>
                          <option value="FREE">Free / Included</option>
                          <option value="CHARGEABLE">Chargeable</option>
                        </select>
                      </div>
                      {accForm.charge_mode === "CHARGEABLE" && (
                        <div>
                          <label htmlFor="f-sale-price" className="mb-1 block text-xs font-medium text-muted-foreground">Sale Price (₹) *</label>
                          <input id="f-sale-price" type="number" step="0.01" min="0.01" value={accForm.sale_price} onChange={(e) => setAccForm((f) => ({ ...f, sale_price: e.target.value }))} className={INP} />
                        </div>
                      )}
                      <div>
                        <label htmlFor="f-sort-order" className="mb-1 block text-xs font-medium text-muted-foreground">Sort Order</label>
                        <input id="f-sort-order" type="number" min={1} value={accForm.sort_order} onChange={(e) => setAccForm((f) => ({ ...f, sort_order: Number(e.target.value) }))} className={INP} />
                      </div>
                      <div>
                        <label htmlFor="f-notes-3" className="mb-1 block text-xs font-medium text-muted-foreground">Notes</label>
                        <input id="f-notes-3" type="text" value={accForm.notes} onChange={(e) => setAccForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional" className={INP} />
                      </div>
                      <div className="flex items-center gap-2 sm:col-span-2">
                        <input id="acc-def" type="checkbox" checked={accForm.is_default_included} onChange={(e) => setAccForm((f) => ({ ...f, is_default_included: e.target.checked }))} className="h-4 w-4 rounded border-border" />
                        <label htmlFor="acc-def" className="text-sm">Pre-select on new sales / subscriptions</label>
                      </div>
                      {accErr && <div className="sm:col-span-2 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">{accErr}</div>}
                      <div className="sm:col-span-2">
                        <button type="submit" disabled={accSaving} className={BTN_PRIMARY}>{accSaving ? "Linking…" : "Link Accessory"}</button>
                      </div>
                    </form>
                  </div>
                )}

                {/* ── Linked list ── */}
                {data.accessories.length === 0 ? (
                  <ERPEmptyState title="No accessories linked" description="Click 'Add Accessory' above to link single items or variant groups." />
                ) : (
                  <div className="space-y-3">
                    {data.accessories.map((link) => {
                      const isGroup = !!link.variant_group;
                      const isEditing = editAccId === link.id;
                      return (
                        <div key={link.id} className="rounded-xl border border-border bg-background">
                          <div className="flex flex-wrap items-start gap-3 px-4 py-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold">{link.accessory_name ?? link.variant_group_name ?? "—"}</span>
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${isGroup ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" : "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300"}`}>
                                  {isGroup ? "Variant Group" : "Single Item"}
                                </span>
                                {link.is_default_included && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">Default</span>}
                              </div>
                              <div className="mt-0.5 text-xs text-muted-foreground">
                                {isGroup ? "All active variants offered at billing" : `Code: ${link.accessory_code ?? "—"} · SKU: ${link.accessory_sku ?? "—"}`}
                                {link.notes ? ` · ${link.notes}` : ""}
                              </div>
                            </div>
                            <div className="flex shrink-0 flex-wrap items-center gap-2">
                              <ChargeBadge mode={link.charge_mode} price={link.sale_price} />
                              <button onClick={() => { setEditAccId(isEditing ? null : link.id); setEditAccState({ charge_mode: link.charge_mode, sale_price: link.sale_price, is_default_included: link.is_default_included, notes: link.notes }); setEditAccErr(null); }} className={BTN_GHOST}>
                                {isEditing ? <><ChevronUp className="h-3.5 w-3.5" />Close</> : <><Edit2 className="h-3.5 w-3.5" />Edit</>}
                              </button>
                              <button onClick={() => handleDeleteAcc(link)} className={BTN_DANGER}><Trash2 className="h-3.5 w-3.5" />Remove</button>
                            </div>
                          </div>
                          {isEditing && (
                            <div className="border-t border-border px-4 pb-4">
                              <InlineLinkEditor
                                init={editAccState}
                                onSave={handleSaveAccEdit}
                                onCancel={() => setEditAccId(null)}
                                saving={editAccSaving}
                                error={editAccErr}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </SectionCard>
            </div>
          ) : null}

          {/* ══════════════════════════════════════════════════════════════
              SERVICES TAB
          ══════════════════════════════════════════════════════════════ */}
          {tab === "services" ? (
            <div className="space-y-4">
              <SectionCard
                title={`Linked Services (${data.services.length})`}
                description="Warranty, installation, AMC, and other services bundled with this product."
                action={
                  <div className="flex gap-2">
                    <button onClick={() => setShowQuickSvc((v) => !v)} className={BTN_GHOST}>
                      {showQuickSvc ? <><X className="h-3.5 w-3.5" />Cancel</> : <><Plus className="h-3.5 w-3.5" />New Service</>}
                    </button>
                    <button onClick={() => { setShowSvcForm((v) => !v); setSvcErr(null); }} className={BTN_PRIMARY}>
                      {showSvcForm ? <><X className="h-3.5 w-3.5" />Cancel</> : <><Plus className="h-3.5 w-3.5" />Add Service</>}
                    </button>
                  </div>
                }
              >
                {/* ── Quick-create service ── */}
                {showQuickSvc && (
                  <form onSubmit={handleQuickCreateService} className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 grid gap-3 sm:grid-cols-2 dark:border-amber-900/40 dark:bg-amber-900/10">
                    <div className="sm:col-span-2 text-xs font-semibold text-amber-700 dark:text-amber-400">Create New Service → Saved to catalog and auto-selected below</div>
                    <div>
                      <label htmlFor="f-code" className="mb-1 block text-xs font-medium text-muted-foreground">Code *</label>
                      <input id="f-code" value={qsForm.code} onChange={(e) => setQsForm((f) => ({ ...f, code: e.target.value }))} placeholder="SVC-INSTALL-BED" maxLength={40} className={INP} />
                    </div>
                    <div>
                      <label htmlFor="f-service-type" className="mb-1 block text-xs font-medium text-muted-foreground">Service Type *</label>
                      <select id="f-service-type" value={qsForm.service_type} onChange={(e) => setQsForm((f) => ({ ...f, service_type: e.target.value as ServiceType }))} className={SEL}>
                        {SERVICE_TYPES.map((t) => <option key={t} value={t}>{SERVICE_TYPE_LABELS[t]}</option>)}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label htmlFor="f-name" className="mb-1 block text-xs font-medium text-muted-foreground">Name *</label>
                      <input id="f-name" value={qsForm.name} onChange={(e) => setQsForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Bed Assembly & Installation" maxLength={160} className={INP} />
                    </div>
                    <div>
                      <label htmlFor="f-standard-price" className="mb-1 block text-xs font-medium text-muted-foreground">Standard Price (₹) *</label>
                      <input id="f-standard-price" type="number" min="0" step="0.01" value={qsForm.standard_price} onChange={(e) => setQsForm((f) => ({ ...f, standard_price: e.target.value }))} className={INP} />
                    </div>
                    <div>
                      <label htmlFor="f-gst-rate" className="mb-1 block text-xs font-medium text-muted-foreground">GST Rate %</label>
                      <input id="f-gst-rate" type="number" min="0" max="100" step="0.01" value={qsForm.tax_rate_percent} onChange={(e) => setQsForm((f) => ({ ...f, tax_rate_percent: e.target.value }))} className={INP} />
                    </div>
                    <div>
                      <label htmlFor="f-category" className="mb-1 block text-xs font-medium text-muted-foreground">Category</label>
                      <input id="f-category" value={qsForm.category} onChange={(e) => setQsForm((f) => ({ ...f, category: e.target.value }))} placeholder="After-Sales" className={INP} />
                    </div>
                    <div>
                      <label htmlFor="f-hsn-sac-code" className="mb-1 block text-xs font-medium text-muted-foreground">HSN / SAC Code</label>
                      <input id="f-hsn-sac-code" value={qsForm.hsn_sac_code} onChange={(e) => setQsForm((f) => ({ ...f, hsn_sac_code: e.target.value }))} placeholder="998391" className={INP} />
                    </div>
                    {qsErr && <div className="sm:col-span-2 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">{qsErr}</div>}
                    <div className="sm:col-span-2 flex gap-2">
                      <button type="submit" disabled={qsSaving} className={BTN_PRIMARY}>{qsSaving ? "Creating…" : "Create Service"}</button>
                      <button type="button" onClick={() => setShowQuickSvc(false)} className={BTN_GHOST}>Cancel</button>
                    </div>
                  </form>
                )}

                {/* ── Add service form ── */}
                {showSvcForm && (
                  <div className="mb-5 rounded-xl border border-primary/30 bg-primary/5 p-4">
                    <div className="mb-3 text-xs font-semibold text-primary">Link Service to this Finished Good</div>
                    {availableSvc.length === 0 ? (
                      <div className="text-sm text-muted-foreground">All active services already linked. <Link href={ROUTES.admin.inventoryServiceCatalog} className="underline">Manage catalog →</Link></div>
                    ) : (
                      <form onSubmit={handleAddService} className="grid gap-3 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <label htmlFor="f-service" className="mb-1 block text-xs font-medium text-muted-foreground">Service *</label>
                          <select id="f-service" value={svcForm.service} onChange={(e) => setSvcForm((f) => ({ ...f, service: Number(e.target.value) }))} className={SEL}>
                            <option value={0}>— Select service —</option>
                            {availableSvc.map((s) => (
                              <option key={s.id} value={s.id}>[{SERVICE_TYPE_LABELS[s.service_type as ServiceType] ?? s.service_type}] {s.name} ({s.code}) — ₹{s.standard_price}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label htmlFor="f-charge-mode-3" className="mb-1 block text-xs font-medium text-muted-foreground">Charge Mode</label>
                          <select id="f-charge-mode-3" value={svcForm.charge_mode} onChange={(e) => setSvcForm((f) => ({ ...f, charge_mode: e.target.value, sale_price: e.target.value === "FREE" ? "0.00" : f.sale_price }))} className={SEL}>
                            <option value="FREE">Free / Included</option>
                            <option value="CHARGEABLE">Chargeable</option>
                          </select>
                        </div>
                        {svcForm.charge_mode === "CHARGEABLE" && (
                          <div>
                            <label htmlFor="f-sale-price-override-0-use-standard" className="mb-1 block text-xs font-medium text-muted-foreground">Sale Price Override (₹) — 0 = use standard</label>
                            <input id="f-sale-price-override-0-use-standard" type="number" step="0.01" min="0" value={svcForm.sale_price} onChange={(e) => setSvcForm((f) => ({ ...f, sale_price: e.target.value }))} className={INP} />
                          </div>
                        )}
                        <div>
                          <label htmlFor="f-sort-order-2" className="mb-1 block text-xs font-medium text-muted-foreground">Sort Order</label>
                          <input id="f-sort-order-2" type="number" min={1} value={svcForm.sort_order} onChange={(e) => setSvcForm((f) => ({ ...f, sort_order: Number(e.target.value) }))} className={INP} />
                        </div>
                        <div>
                          <label htmlFor="f-notes-4" className="mb-1 block text-xs font-medium text-muted-foreground">Notes</label>
                          <input id="f-notes-4" value={svcForm.notes} onChange={(e) => setSvcForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional" className={INP} />
                        </div>
                        <div className="flex items-center gap-2 sm:col-span-2">
                          <input id="svc-def" type="checkbox" checked={svcForm.is_default_included} onChange={(e) => setSvcForm((f) => ({ ...f, is_default_included: e.target.checked }))} className="h-4 w-4 rounded border-border" />
                          <label htmlFor="svc-def" className="text-sm">Pre-select on new sales / subscriptions</label>
                        </div>
                        {svcErr && <div className="sm:col-span-2 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">{svcErr}</div>}
                        <div className="sm:col-span-2">
                          <button type="submit" disabled={svcSaving} className={BTN_PRIMARY}>{svcSaving ? "Linking…" : "Link Service"}</button>
                        </div>
                      </form>
                    )}
                  </div>
                )}

                {/* ── Linked list ── */}
                {data.services.length === 0 ? (
                  <ERPEmptyState title="No services linked" description="Click 'Add Service' above to link warranty, installation, or other services." />
                ) : (
                  <div className="space-y-3">
                    {data.services.map((link) => {
                      const isEditing = editSvcId === link.id;
                      const typeColor = SERVICE_TYPE_COLORS[link.service_type] ?? SERVICE_TYPE_COLORS.OTHER;
                      return (
                        <div key={link.id} className="rounded-xl border border-border bg-background">
                          <div className="flex flex-wrap items-start gap-3 px-4 py-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold">{link.service_name}</span>
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${typeColor}`}>
                                  {SERVICE_TYPE_LABELS[link.service_type] ?? link.service_type}
                                </span>
                                {link.is_default_included && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">Default</span>}
                              </div>
                              <div className="mt-0.5 text-xs text-muted-foreground">
                                {link.service_code}
                                {link.service_category ? ` · ${link.service_category}` : ""}
                                {` · Std ₹${link.service_standard_price}`}
                                {link.service_hsn_sac_code ? ` · SAC ${link.service_hsn_sac_code}` : ""}
                                {Number(link.service_tax_rate_percent) > 0 ? ` · GST ${link.service_tax_rate_percent}%` : ""}
                                {link.notes ? ` · ${link.notes}` : ""}
                              </div>
                            </div>
                            <div className="flex shrink-0 flex-wrap items-center gap-2">
                              <ChargeBadge mode={link.charge_mode} price={link.sale_price} stdPrice={link.service_standard_price} />
                              <button onClick={() => { setEditSvcId(isEditing ? null : link.id); setEditSvcState({ charge_mode: link.charge_mode, sale_price: link.sale_price, is_default_included: link.is_default_included, notes: link.notes }); setEditSvcErr(null); }} className={BTN_GHOST}>
                                {isEditing ? <><ChevronUp className="h-3.5 w-3.5" />Close</> : <><Edit2 className="h-3.5 w-3.5" />Edit</>}
                              </button>
                              <button onClick={() => handleDeleteSvc(link)} className={BTN_DANGER}><Trash2 className="h-3.5 w-3.5" />Remove</button>
                            </div>
                          </div>
                          {isEditing && (
                            <div className="border-t border-border px-4 pb-4">
                              <InlineLinkEditor
                                init={editSvcState}
                                onSave={handleSaveSvcEdit}
                                onCancel={() => setEditSvcId(null)}
                                saving={editSvcSaving}
                                error={editSvcErr}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </SectionCard>
            </div>
          ) : null}

          {/* ══════════════════════════════════════════════════════════════
              BOM TAB
          ══════════════════════════════════════════════════════════════ */}
          {tab === "bom" ? (
            <div className="space-y-4">
              <SectionCard
                title={`Bill of Materials (${data.bom_count} revision${data.bom_count === 1 ? "" : "s"})`}
                description="Raw material inputs and quantities required to produce one unit of this finished good."
                action={
                  <Link href={ROUTES.admin.manufacturingBoms} className={BTN_PRIMARY}>
                    Manage in Manufacturing →
                  </Link>
                }
              >
                {data.bom_count === 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/30 dark:bg-amber-900/10">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      <div className="text-sm text-amber-700 dark:text-amber-400">
                        <strong>No BOM created yet.</strong> Without a BOM, production jobs cannot be released and raw material costs won&apos;t roll into this finished good.
                      </div>
                    </div>
                    <Link href={ROUTES.admin.manufacturingBoms} className={BTN_PRIMARY}>
                      <Plus className="h-3.5 w-3.5" /> Create BOM in Manufacturing
                    </Link>
                  </div>
                ) : !data.active_bom ? (
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/30 dark:bg-amber-900/10">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      <div className="text-sm text-amber-700 dark:text-amber-400">
                        <strong>{data.bom_count} BOM revision{data.bom_count === 1 ? "" : "s"} exist</strong> but none are currently <strong>ACTIVE</strong>. Activate a BOM in Manufacturing to enable production jobs.
                      </div>
                    </div>
                    <Link href={ROUTES.admin.manufacturingBoms} className={BTN_GHOST}>View all BOMs in Manufacturing →</Link>
                  </div>
                ) : (
                  <>
                    {/* BOM header */}
                    <div className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900/30 dark:bg-emerald-900/10">
                      <CheckCircle className="h-4 w-4 shrink-0 text-emerald-600" />
                      <div className="flex flex-wrap gap-4 text-sm">
                        <span><span className="text-muted-foreground">BOM No: </span><strong>{data.active_bom.bom_no}</strong></span>
                        <span><span className="text-muted-foreground">Revision: </span><strong>#{data.active_bom.revision_no}</strong></span>
                        <span><span className="text-muted-foreground">Status: </span><strong className="text-emerald-700 dark:text-emerald-400">{data.active_bom.status}</strong></span>
                        <span><span className="text-muted-foreground">Lines: </span><strong>{data.active_bom.lines.length}</strong></span>
                      </div>
                      {data.bom_count > 1 && (
                        <Link href={ROUTES.admin.manufacturingBoms} className="ml-auto text-xs text-primary underline">
                          {data.bom_count - 1} other revision{data.bom_count - 1 === 1 ? "" : "s"} →
                        </Link>
                      )}
                    </div>

                    {/* BOM lines table */}
                    <div className="overflow-x-auto rounded-xl border border-border">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            <th className="px-4 py-2.5 text-left">#</th>
                            <th className="px-4 py-2.5 text-left">Material</th>
                            <th className="px-4 py-2.5 text-left">Code</th>
                            <th className="px-4 py-2.5 text-left">Type</th>
                            <th className="px-4 py-2.5 text-right">Qty / Unit</th>
                            <th className="px-4 py-2.5 text-right">Wastage %</th>
                            <th className="px-4 py-2.5 text-left">UoM</th>
                            <th className="px-4 py-2.5 text-left">Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.active_bom.lines.map((ln, i) => (
                            <tr key={ln.id} className="border-b border-border/50 hover:bg-muted/20">
                              <td className="px-4 py-2.5 text-muted-foreground">{i + 1}</td>
                              <td className="px-4 py-2.5 font-medium">{ln.product_name}</td>
                              <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{ln.product_code}</td>
                              <td className="px-4 py-2.5">
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ln.item_type === "RAW_MATERIAL" ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"}`}>
                                  {ln.item_type === "RAW_MATERIAL" ? "Raw Material" : "Accessory"}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-right font-semibold">{ln.quantity_per_unit}</td>
                              <td className="px-4 py-2.5 text-right text-muted-foreground">{ln.wastage_percent}%</td>
                              <td className="px-4 py-2.5 text-muted-foreground">{ln.unit_of_measure}</td>
                              <td className="px-4 py-2.5 text-xs text-muted-foreground italic">{ln.notes || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-3 flex gap-3">
                      <Link href={ROUTES.admin.manufacturingBoms} className={BTN_GHOST}>Edit BOM in Manufacturing →</Link>
                      <Link href={ROUTES.admin.manufacturingJobs} className={BTN_GHOST}>Create Production Job →</Link>
                    </div>
                  </>
                )}
              </SectionCard>
            </div>
          ) : null}

        </div>
      ) : null}
    </ERPPageShell>
  );
}
