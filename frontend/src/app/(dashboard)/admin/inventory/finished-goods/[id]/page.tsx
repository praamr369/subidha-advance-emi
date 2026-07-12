"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, useCallback } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import { ROUTES } from "@/lib/routes";
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
  type FGProfileDetail,
  type FGAccessoryLink,
  type FGServiceLink,
  type AccessoryRow,
  type ServiceCatalogItem,
  type AccessoryVariantGroup,
  SERVICE_TYPE_LABELS,
  type ServiceType,
} from "@/services/inventory";

type Tab = "overview" | "accessories" | "services" | "bom";
type AccLinkMode = "single" | "group";

const SERVICE_TYPE_COLORS: Record<ServiceType, string> = {
  WARRANTY: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  INSTALLATION: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  MAINTENANCE: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  POLISH: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
  DELIVERY: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  REPAIR: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  ADDON: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  OTHER: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
};

const SERVICE_TYPES: ServiceType[] = ["WARRANTY", "INSTALLATION", "MAINTENANCE", "POLISH", "DELIVERY", "REPAIR", "ADDON", "OTHER"];

export default function FGProfilePage() {
  const params = useParams();
  const id = Number(params.id);

  const [data, setData] = useState<FGProfileDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");

  // Accessory add form
  const [accMode, setAccMode] = useState<AccLinkMode>("single");
  const [accItems, setAccItems] = useState<AccessoryRow[]>([]);
  const [accGroups, setAccGroups] = useState<AccessoryVariantGroup[]>([]);
  const [accForm, setAccForm] = useState({ accessory: 0, variant_group: 0, charge_mode: "FREE", sale_price: "0.00", is_default_included: true, notes: "", sort_order: 1 });
  const [accSaving, setAccSaving] = useState(false);
  const [accErr, setAccErr] = useState<string | null>(null);

  // Service add form
  const [svcItems, setSvcItems] = useState<ServiceCatalogItem[]>([]);
  const [svcForm, setSvcForm] = useState({ service: 0, charge_mode: "FREE", sale_price: "0.00", is_default_included: true, notes: "", sort_order: 1 });
  const [svcSaving, setSvcSaving] = useState(false);
  const [svcErr, setSvcErr] = useState<string | null>(null);

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
    void listAccessories({ page_size: 100 }).then((r) => setAccItems(r.results ?? []));
    void listAccessoryVariantGroups({ active_only: true, page_size: 100 }).then((r) => setAccGroups(r.results ?? []));
    void listServiceCatalog({ status: "ACTIVE", page_size: 200 }).then((r) => setSvcItems(r.results ?? []));
  }, []);

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
        });
      }
      setAccForm({ accessory: 0, variant_group: 0, charge_mode: "FREE", sale_price: "0.00", is_default_included: true, notes: "", sort_order: 1 });
      await load();
    } catch (e) {
      setAccErr(e instanceof Error ? e.message : "Failed to add accessory.");
    } finally {
      setAccSaving(false);
    }
  }

  async function handleRemoveAccessory(link: FGAccessoryLink) {
    if (!confirm(`Remove "${link.accessory_name}"?`)) return;
    try { await deleteFGAccessoryLink(id, link.id); await load(); }
    catch (e) { alert(e instanceof Error ? e.message : "Failed to remove."); }
  }

  async function handleToggleAccCharge(link: FGAccessoryLink) {
    const newMode = link.charge_mode === "FREE" ? "CHARGEABLE" : "FREE";
    if (newMode === "CHARGEABLE") {
      const price = prompt("Enter sale price for this accessory:", link.sale_price || "0.00");
      if (!price) return;
      try { await updateFGAccessoryLink(id, link.id, { charge_mode: newMode, sale_price: price }); await load(); } catch (e) { alert(String(e)); }
    } else {
      try { await updateFGAccessoryLink(id, link.id, { charge_mode: newMode, sale_price: "0.00" }); await load(); } catch (e) { alert(String(e)); }
    }
  }

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
      });
      setSvcForm({ service: 0, charge_mode: "FREE", sale_price: "0.00", is_default_included: true, notes: "", sort_order: 1 });
      await load();
    } catch (e) {
      setSvcErr(e instanceof Error ? e.message : "Failed to add service.");
    } finally {
      setSvcSaving(false);
    }
  }

  async function handleRemoveService(link: FGServiceLink) {
    if (!confirm(`Remove "${link.service_name}"?`)) return;
    try { await deleteFGServiceLink(id, link.id); await load(); }
    catch (e) { alert(e instanceof Error ? e.message : "Failed to remove."); }
  }

  async function handleToggleSvcCharge(link: FGServiceLink) {
    const newMode = link.charge_mode === "FREE" ? "CHARGEABLE" : "FREE";
    if (newMode === "CHARGEABLE") {
      const price = prompt("Sale price override (₹). Leave 0 to use standard price:", link.sale_price !== "0.00" ? link.sale_price : link.service_standard_price);
      if (price === null) return;
      try { await updateFGServiceLink(id, link.id, { charge_mode: newMode, sale_price: price || "0.00" }); await load(); } catch (e) { alert(String(e)); }
    } else {
      try { await updateFGServiceLink(id, link.id, { charge_mode: newMode, sale_price: "0.00" }); await load(); } catch (e) { alert(String(e)); }
    }
  }

  async function handleQuickCreateService(e: React.FormEvent) {
    e.preventDefault();
    if (!qsForm.code.trim() || !qsForm.name.trim() || !qsForm.standard_price) {
      setQsErr("Code, Name and Standard Price are required.");
      return;
    }
    setQsSaving(true); setQsErr(null);
    try {
      const created = await createServiceCatalogItem({
        ...qsForm,
        code: qsForm.code.trim().toUpperCase(),
        status: "ACTIVE",
      });
      // Refresh the service items list
      void listServiceCatalog({ status: "ACTIVE", page_size: 200 }).then((r) => setSvcItems(r.results ?? []));
      // Pre-select the newly created service
      setSvcForm((f) => ({ ...f, service: created.id }));
      setShowQuickSvc(false);
      setQsForm({ code: "", name: "", service_type: "OTHER", category: "", standard_price: "", tax_rate_percent: "0", hsn_sac_code: "", notes: "" });
    } catch (e) {
      setQsErr(e instanceof Error ? e.message : "Failed to create service.");
    } finally {
      setQsSaving(false);
    }
  }

  const p = data?.profile;
  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "accessories", label: "Accessories", count: data?.accessories.length },
    { key: "services", label: "Services", count: data?.services.length },
    { key: "bom", label: "BOM", count: data?.bom_count },
  ];

  const linkedAccIds = new Set((data?.accessories ?? []).map((a) => a.accessory));
  const availableAccItems = accItems.filter((a) => !linkedAccIds.has(a.id));
  const linkedGroupIds = new Set((data?.accessories ?? []).map((a) => (a as FGAccessoryLink & { variant_group?: number }).variant_group).filter(Boolean));
  const availableGroups = accGroups.filter((g) => !linkedGroupIds.has(g.id));
  const linkedSvcIds = new Set((data?.services ?? []).map((s) => s.service));
  const availableSvcItems = svcItems.filter((s) => !linkedSvcIds.has(s.id));

  return (
    <ERPPageShell
      eyebrow="Finished Good"
      title={p ? p.product_name : "Loading…"}
      subtitle={p ? `${p.product_code} · ${p.unit_of_measure} · ${p.stock_item_type.replace("_", " ")}` : ""}
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Finished Goods", href: ROUTES.admin.inventoryFinishedGoods },
        { label: p?.product_name ?? "Profile" },
      ]}
      statusBadge={p ? { label: p.stock_tracking_status, tone: p.stock_tracking_status === "STOCK_ACTIVE" ? "success" : "warning" } : undefined}
      stats={[
        { label: "Accessories", value: data?.accessories.length ?? "—", tone: "info" },
        { label: "Services", value: data?.services.length ?? "—", tone: "info" },
        { label: "BOM Revisions", value: data?.bom_count ?? "—", tone: "default" },
        { label: "Base Price", value: p ? `₹${p.base_price}` : "—", tone: "default" },
      ]}
    >
      {loading ? <ERPLoadingState label="Loading profile…" /> : null}
      {!loading && error ? <ERPErrorState title="Failed to load" description={error} /> : null}

      {!loading && !error && data ? (
        <>
          {/* Tab bar */}
          <div className="flex gap-1 border-b border-border">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition ${
                  tab === t.key
                    ? "bg-card border border-b-card border-border text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
                {t.count !== undefined ? (
                  <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${(t.count ?? 0) > 0 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                    {t.count}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          {/* ── Overview Tab ── */}
          {tab === "overview" ? (
            <ERPSectionShell title="Inventory Profile Details">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                {[
                  ["Product Code", p!.product_code],
                  ["SKU", p!.sku ?? "—"],
                  ["Unit of Measure", p!.unit_of_measure],
                  ["Valuation Method", p!.valuation_method],
                  ["Standard Unit Cost", `₹${p!.standard_unit_cost}`],
                  ["Base Price", `₹${p!.base_price}`],
                  ["Reorder Level", p!.reorder_level_qty],
                  ["Tracking Status", p!.stock_tracking_status],
                  ["Category", p!.category || "—"],
                  ["Subcategory", p!.subcategory || "—"],
                  ["Barcode", p!.barcode ?? "—"],
                  ["Active", p!.is_active ? "Yes" : "No"],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</dt>
                    <dd className="mt-0.5 font-medium text-foreground">{value}</dd>
                  </div>
                ))}
              </dl>
            </ERPSectionShell>
          ) : null}

          {/* ── Accessories Tab ── */}
          {tab === "accessories" ? (
            <>
              <ERPSectionShell title="Linked Accessories" description="Accessories sold alongside this finished good. Single items or variant groups (e.g. Side Rail — Teak/Sal/Pine).">
                {data.accessories.length === 0 ? (
                  <ERPEmptyState title="No accessories linked yet" description="Use the form below to attach accessories." />
                ) : (
                  <div className="grid gap-2">
                    {data.accessories.map((link) => {
                      const extLink = link as FGAccessoryLink & { variant_group?: number; variant_group_name?: string };
                      const isGroup = !!extLink.variant_group;
                      return (
                        <div key={link.id} className="flex flex-wrap items-start gap-3 rounded-xl border border-border bg-card px-4 py-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold">{link.accessory_name || extLink.variant_group_name || "—"}</span>
                              {isGroup ? (
                                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">Variant Group</span>
                              ) : (
                                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-900/30 dark:text-sky-400">Single Item</span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {isGroup ? "All active variants offered at billing" : `Code: ${link.accessory_code} · SKU: ${link.accessory_sku ?? "—"}`}
                            </div>
                            {link.notes ? <div className="mt-0.5 text-xs italic text-muted-foreground">{link.notes}</div> : null}
                          </div>
                          <div className="flex items-center gap-2 shrink-0 flex-wrap">
                            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${link.charge_mode === "FREE" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"}`}>
                              {link.charge_mode === "FREE" ? "Free" : `Chargeable ₹${link.sale_price}`}
                            </span>
                            {link.is_default_included && (
                              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Default</span>
                            )}
                            <button onClick={() => handleToggleAccCharge(link)} className="rounded border border-border px-2 py-1 text-[11px] hover:bg-muted/50">Toggle</button>
                            <button onClick={() => handleRemoveAccessory(link)} className="rounded border border-destructive/30 px-2 py-1 text-[11px] text-destructive hover:bg-destructive/10">Remove</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ERPSectionShell>

              {/* Add accessory form */}
              <ERPSectionShell title="Link Accessory">
                {/* Mode toggle */}
                <div className="flex gap-2 mb-4">
                  {(["single", "group"] as AccLinkMode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setAccMode(m)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${accMode === m ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}
                    >
                      {m === "single" ? "Single Accessory" : "Variant Group"}
                    </button>
                  ))}
                  <span className="ml-2 self-center text-xs text-muted-foreground">
                    {accMode === "group" ? "Group offers multiple variants (e.g. Side Rail types) for selection at billing time." : "One specific accessory item, no variant choice."}
                  </span>
                </div>

                <form onSubmit={handleAddAccessory} className="grid gap-3 sm:grid-cols-2">
                  {accMode === "single" ? (
                    availableAccItems.length === 0 ? (
                      <div className="sm:col-span-2 rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
                        All accessories are already linked.{" "}
                        <a href={ROUTES.admin.inventoryAccessories} className="underline">Manage accessories →</a>
                      </div>
                    ) : (
                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">Accessory *</label>
                        <select value={accForm.accessory} onChange={(e) => setAccForm((f) => ({ ...f, accessory: Number(e.target.value) }))} className={SEL}>
                          <option value={0}>— Select accessory —</option>
                          {availableAccItems.map((a) => (
                            <option key={a.id} value={a.id}>{a.product_name} ({a.product_code})</option>
                          ))}
                        </select>
                      </div>
                    )
                  ) : (
                    availableGroups.length === 0 ? (
                      <div className="sm:col-span-2 rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
                        All variant groups are already linked.{" "}
                        <a href={ROUTES.admin.inventoryAccessoryVariantGroups} className="underline">Manage variant groups →</a>
                      </div>
                    ) : (
                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">Variant Group *</label>
                        <select value={accForm.variant_group} onChange={(e) => setAccForm((f) => ({ ...f, variant_group: Number(e.target.value) }))} className={SEL}>
                          <option value={0}>— Select group —</option>
                          {availableGroups.map((g) => (
                            <option key={g.id} value={g.id}>{g.name} ({g.code}) — {g.variant_count} variants</option>
                          ))}
                        </select>
                      </div>
                    )
                  )}

                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Charge Mode</label>
                    <select value={accForm.charge_mode} onChange={(e) => setAccForm((f) => ({ ...f, charge_mode: e.target.value, sale_price: e.target.value === "FREE" ? "0.00" : f.sale_price }))} className={SEL}>
                      <option value="FREE">Free (Included)</option>
                      <option value="CHARGEABLE">Chargeable</option>
                    </select>
                  </div>

                  {accForm.charge_mode === "CHARGEABLE" && (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">Sale Price (₹) *</label>
                      <input type="number" step="0.01" min="0.01" value={accForm.sale_price} onChange={(e) => setAccForm((f) => ({ ...f, sale_price: e.target.value }))} className={INP} />
                    </div>
                  )}

                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Sort Order</label>
                    <input type="number" min={1} value={accForm.sort_order} onChange={(e) => setAccForm((f) => ({ ...f, sort_order: Number(e.target.value) }))} className={INP} />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Notes</label>
                    <input type="text" value={accForm.notes} onChange={(e) => setAccForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional note" className={INP} />
                  </div>

                  <div className="flex items-center gap-2 sm:col-span-2">
                    <input id="acc-default" type="checkbox" checked={accForm.is_default_included} onChange={(e) => setAccForm((f) => ({ ...f, is_default_included: e.target.checked }))} className="h-4 w-4 rounded border-border" />
                    <label htmlFor="acc-default" className="text-sm">Pre-select on new sales / subscriptions</label>
                  </div>

                  {accErr && <div className="sm:col-span-2 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">{accErr}</div>}

                  <div className="sm:col-span-2">
                    <button type="submit" disabled={accSaving} className={BTN}>
                      {accSaving ? "Adding…" : accMode === "group" ? "Link Variant Group" : "Add Accessory"}
                    </button>
                  </div>
                </form>
              </ERPSectionShell>
            </>
          ) : null}

          {/* ── Services Tab ── */}
          {tab === "services" ? (
            <>
              <ERPSectionShell
                title="Linked Services"
                description="Services bundled with this finished good — warranty, installation, polish, AMC, and more."
              >
                {data.services.length === 0 ? (
                  <ERPEmptyState title="No services linked yet" description="Use the form below to attach services." />
                ) : (
                  <div className="grid gap-2">
                    {data.services.map((link) => (
                      <div key={link.id} className="flex flex-wrap items-start gap-3 rounded-xl border border-border bg-card px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold">{link.service_name}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${SERVICE_TYPE_COLORS[link.service_type] ?? SERVICE_TYPE_COLORS.OTHER}`}>
                              {SERVICE_TYPE_LABELS[link.service_type] ?? link.service_type}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {link.service_code}
                            {link.service_category ? ` · ${link.service_category}` : ""}
                            {" · Std ₹"}{link.service_standard_price}
                            {link.service_hsn_sac_code ? ` · SAC ${link.service_hsn_sac_code}` : ""}
                            {Number(link.service_tax_rate_percent) > 0 ? ` · GST ${link.service_tax_rate_percent}%` : ""}
                          </div>
                          {link.notes ? <div className="mt-0.5 text-xs italic text-muted-foreground">{link.notes}</div> : null}
                        </div>
                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${link.charge_mode === "FREE" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"}`}>
                            {link.charge_mode === "FREE" ? "Free" : `Chargeable ₹${link.sale_price !== "0.00" ? link.sale_price : link.service_standard_price}`}
                          </span>
                          {link.is_default_included && (
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Default</span>
                          )}
                          <button onClick={() => handleToggleSvcCharge(link)} className="rounded border border-border px-2 py-1 text-[11px] hover:bg-muted/50">Toggle</button>
                          <button onClick={() => handleRemoveService(link)} className="rounded border border-destructive/30 px-2 py-1 text-[11px] text-destructive hover:bg-destructive/10">Remove</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ERPSectionShell>

              {/* Add service form */}
              <ERPSectionShell title="Add Service">
                <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
                  <p className="text-sm text-muted-foreground">Pick from service catalog or quick-create a new service below.</p>
                  <button
                    type="button"
                    onClick={() => setShowQuickSvc((v) => !v)}
                    className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
                  >
                    {showQuickSvc ? "▲ Hide Quick Create" : "+ Quick Create Service"}
                  </button>
                </div>

                {/* Quick-create service inline form */}
                {showQuickSvc && (
                  <form onSubmit={handleQuickCreateService} className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-4 grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2 text-xs font-semibold text-primary mb-1">Quick Create Service — saved to catalog and auto-selected below</div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">Code *</label>
                      <input value={qsForm.code} onChange={(e) => setQsForm((f) => ({ ...f, code: e.target.value }))} placeholder="e.g. SVC-WRTY-1YR" maxLength={40} className={INP} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">Service Type *</label>
                      <select value={qsForm.service_type} onChange={(e) => setQsForm((f) => ({ ...f, service_type: e.target.value as ServiceType }))} className={SEL}>
                        {SERVICE_TYPES.map((t) => <option key={t} value={t}>{SERVICE_TYPE_LABELS[t]}</option>)}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">Name *</label>
                      <input value={qsForm.name} onChange={(e) => setQsForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. 1-Year Extended Warranty" maxLength={160} className={INP} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">Standard Price (₹) *</label>
                      <input type="number" min="0" step="0.01" value={qsForm.standard_price} onChange={(e) => setQsForm((f) => ({ ...f, standard_price: e.target.value }))} placeholder="0.00" className={INP} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">GST Rate %</label>
                      <input type="number" min="0" max="100" step="0.01" value={qsForm.tax_rate_percent} onChange={(e) => setQsForm((f) => ({ ...f, tax_rate_percent: e.target.value }))} className={INP} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">Category</label>
                      <input value={qsForm.category} onChange={(e) => setQsForm((f) => ({ ...f, category: e.target.value }))} placeholder="e.g. After-Sales" className={INP} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">HSN/SAC Code</label>
                      <input value={qsForm.hsn_sac_code} onChange={(e) => setQsForm((f) => ({ ...f, hsn_sac_code: e.target.value }))} placeholder="SAC code" className={INP} />
                    </div>
                    {qsErr && <div className="sm:col-span-2 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">{qsErr}</div>}
                    <div className="sm:col-span-2 flex gap-2">
                      <button type="submit" disabled={qsSaving} className={BTN}>{qsSaving ? "Creating…" : "Create & Select"}</button>
                      <button type="button" onClick={() => setShowQuickSvc(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50">Cancel</button>
                    </div>
                  </form>
                )}

                {availableSvcItems.length === 0 ? (
                  <div className="rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
                    All active services are already linked.{" "}
                    <a href={ROUTES.admin.inventoryServiceCatalog} className="underline">Manage service catalog →</a>
                  </div>
                ) : (
                  <form onSubmit={handleAddService} className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">Service *</label>
                      <select value={svcForm.service} onChange={(e) => setSvcForm((f) => ({ ...f, service: Number(e.target.value) }))} className={SEL}>
                        <option value={0}>— Select service —</option>
                        {availableSvcItems.map((s) => (
                          <option key={s.id} value={s.id}>
                            [{SERVICE_TYPE_LABELS[s.service_type]}] {s.name} ({s.code}) — ₹{s.standard_price}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">Charge Mode</label>
                      <select value={svcForm.charge_mode} onChange={(e) => setSvcForm((f) => ({ ...f, charge_mode: e.target.value, sale_price: e.target.value === "FREE" ? "0.00" : f.sale_price }))} className={SEL}>
                        <option value="FREE">Free (Included)</option>
                        <option value="CHARGEABLE">Chargeable</option>
                      </select>
                    </div>

                    {svcForm.charge_mode === "CHARGEABLE" && (
                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">Sale Price Override (₹) — 0 = use standard</label>
                        <input type="number" step="0.01" min="0" value={svcForm.sale_price} onChange={(e) => setSvcForm((f) => ({ ...f, sale_price: e.target.value }))} className={INP} />
                      </div>
                    )}

                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">Notes</label>
                      <input type="text" value={svcForm.notes} onChange={(e) => setSvcForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional note" className={INP} />
                    </div>

                    <div className="flex items-center gap-2 sm:col-span-2">
                      <input id="svc-default" type="checkbox" checked={svcForm.is_default_included} onChange={(e) => setSvcForm((f) => ({ ...f, is_default_included: e.target.checked }))} className="h-4 w-4 rounded border-border" />
                      <label htmlFor="svc-default" className="text-sm">Pre-select on new sales / subscriptions</label>
                    </div>

                    {svcErr && <div className="sm:col-span-2 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">{svcErr}</div>}

                    <div className="sm:col-span-2">
                      <button type="submit" disabled={svcSaving} className={BTN}>{svcSaving ? "Adding…" : "Add Service"}</button>
                    </div>
                  </form>
                )}
              </ERPSectionShell>
            </>
          ) : null}

          {/* ── BOM Tab ── */}
          {tab === "bom" ? (
            <ERPSectionShell title="Bill of Materials" description="Active default BOM for this finished good. Manage full BOM list in Manufacturing.">
              {!data.active_bom ? (
                <div className="grid gap-3">
                  <ERPEmptyState title="No active BOM" description="Create a BOM for this finished good in the Manufacturing module." />
                  <a href={ROUTES.admin.manufacturingBoms} className="inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 w-fit">
                    Go to Manufacturing BOMs →
                  </a>
                </div>
              ) : (
                <>
                  <div className="mb-4 flex flex-wrap gap-4 text-sm">
                    <div><span className="text-muted-foreground">BOM No:</span> <strong>{data.active_bom.bom_no}</strong></div>
                    <div><span className="text-muted-foreground">Revision:</span> <strong>#{data.active_bom.revision_no}</strong></div>
                    <div><span className="text-muted-foreground">Status:</span> <ERPStatusBadge status={data.active_bom.status} label={data.active_bom.status} /></div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          <th className="pb-2 text-left">Material</th>
                          <th className="pb-2 text-left">Code</th>
                          <th className="pb-2 text-left">Type</th>
                          <th className="pb-2 text-right">Qty/Unit</th>
                          <th className="pb-2 text-right">Wastage%</th>
                          <th className="pb-2 text-left">UoM</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.active_bom.lines.map((ln) => (
                          <tr key={ln.id} className="border-b border-border/50 hover:bg-muted/30">
                            <td className="py-2 font-medium">{ln.product_name}</td>
                            <td className="py-2 text-muted-foreground">{ln.product_code}</td>
                            <td className="py-2">
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ln.item_type === "RAW_MATERIAL" ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"}`}>
                                {ln.item_type === "RAW_MATERIAL" ? "Raw" : "Accessory"}
                              </span>
                            </td>
                            <td className="py-2 text-right">{ln.quantity_per_unit}</td>
                            <td className="py-2 text-right">{ln.wastage_percent}%</td>
                            <td className="py-2">{ln.unit_of_measure}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3">
                    <a href={ROUTES.admin.manufacturingBoms} className="text-sm text-primary underline">
                      View all {data.bom_count} BOM revision{data.bom_count === 1 ? "" : "s"} →
                    </a>
                  </div>
                </>
              )}
            </ERPSectionShell>
          ) : null}
        </>
      ) : null}
    </ERPPageShell>
  );
}

const SEL = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
const INP = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
const BTN = "rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-colors";
