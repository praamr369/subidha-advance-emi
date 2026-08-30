"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import DataTable from "@/components/ui/DataTable";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import { ROUTES } from "@/lib/routes";
import { buildAdminServiceDeskCaseRoute } from "@/lib/route-builders";
import {
  createServiceDeskCase,
  listServiceDeskCases,
  serviceDeskCustomerLookup,
  type CustomerLookupResult,
  type ServiceDeskCase,
} from "@/services/service-desk";

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString("en-IN");
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Unable to load the service ticket register.";
}

const inputCls = "rounded-xl border border-border bg-background px-3 py-2 text-sm w-full focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition";
const selectCls = inputCls;
const labelCls = "grid gap-1.5 text-sm font-medium text-muted-foreground";

const ISSUE_PRESETS = [
  { label: "Product Defect", summary: "Product defect / manufacturing issue", type: "SERVICE", icon: "🔧" },
  { label: "Warranty Repair", summary: "Warranty repair request", type: "SERVICE", icon: "🛡️" },
  { label: "Delivery Damage", summary: "Product damaged during delivery", type: "SERVICE", icon: "📦" },
  { label: "Missing Parts", summary: "Missing parts or accessories", type: "SERVICE", icon: "🧩" },
  { label: "Assembly Issue", summary: "Assembly / installation issue", type: "SERVICE", icon: "🪛" },
  { label: "Quality Concern", summary: "Quality not as expected", type: "SERVICE", icon: "⚠️" },
  { label: "Exchange Request", summary: "Customer requests product exchange", type: "SERVICE", icon: "🔄" },
  { label: "BOM / Production", summary: "Production batch quality issue", type: "SERVICE", icon: "🏭" },
] as const;

type FormState = {
  issue_summary: string;
  issue_details: string;
  support_request: string;
  direct_sale: string;
  subscription: string;
  delivery: string;
  billing_invoice: string;
  reporter_name_snapshot: string;
  reporter_phone_snapshot: string;
  warranty_status: string;
  debit_note_required: boolean;
  product: string;
  inventory_item: string;
  line_description: string;
  quantity: string;
  taxable_amount: string;
  tax_amount: string;
  priority: string;
  production_job: string;
};

const emptyForm: FormState = {
  issue_summary: "",
  issue_details: "",
  support_request: "",
  direct_sale: "",
  subscription: "",
  delivery: "",
  billing_invoice: "",
  reporter_name_snapshot: "",
  reporter_phone_snapshot: "",
  warranty_status: "UNKNOWN",
  debit_note_required: false,
  product: "",
  inventory_item: "",
  line_description: "",
  quantity: "1.000",
  taxable_amount: "0.00",
  tax_amount: "0.00",
  priority: "NORMAL",
  production_job: "",
};

export default function AdminServiceDeskTicketsPage() {
  const [rows, setRows] = useState<ServiceDeskCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ ...emptyForm });

  // Customer lookup state
  const [phoneQuery, setPhoneQuery] = useState("");
  const [lookupResult, setLookupResult] = useState<CustomerLookupResult | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"create" | "history">("create");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function loadPage(isInitial = false) {
    try {
      if (isInitial) setLoading(true); else setRefreshing(true);
      const next = await listServiceDeskCases({ case_type: "SERVICE" });
      setRows(next.results);
      setError(null);
    } catch (err) {
      if (isInitial) setRows([]);
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadPage(true);
  }, []);

  const handlePhoneLookup = useCallback(async (phone: string) => {
    if (phone.trim().length < 4) {
      setLookupResult(null);
      return;
    }
    try {
      setLookupLoading(true);
      const result = await serviceDeskCustomerLookup(phone.trim());
      setLookupResult(result);
      if (result.found && result.customer) {
        setForm((prev) => ({
          ...prev,
          reporter_name_snapshot: result.customer!.name,
          reporter_phone_snapshot: result.customer!.phone,
        }));
      }
    } catch {
      setLookupResult(null);
    } finally {
      setLookupLoading(false);
    }
  }, []);

  function onPhoneChange(value: string) {
    setPhoneQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void handlePhoneLookup(value);
    }, 600);
  }

  function applyPreset(preset: typeof ISSUE_PRESETS[number]) {
    setForm((prev) => ({ ...prev, issue_summary: preset.summary }));
  }

  function linkDirectSale(id: number) {
    setForm((prev) => ({ ...prev, direct_sale: String(id) }));
    setActiveTab("create");
  }
  function linkSubscription(id: number) {
    setForm((prev) => ({ ...prev, subscription: String(id) }));
    setActiveTab("create");
  }
  function linkDelivery(id: number) {
    setForm((prev) => ({ ...prev, delivery: String(id) }));
    setActiveTab("create");
  }
  function linkProductionJob(id: number) {
    setForm((prev) => ({ ...prev, production_job: String(id) }));
    setActiveTab("create");
  }

  async function handleCreateTicket() {
    if (!form.issue_summary.trim()) return;
    try {
      setSaving(true);
      setNotice(null);
      const hasLine =
        form.line_description.trim() &&
        (Number(form.quantity) > 0 || Number(form.taxable_amount) > 0 || Number(form.tax_amount) > 0);
      await createServiceDeskCase({
        case_type: "SERVICE",
        priority: form.priority,
        issue_summary: form.issue_summary,
        issue_details: form.issue_details,
        support_request: form.support_request ? Number(form.support_request) : null,
        direct_sale: form.direct_sale ? Number(form.direct_sale) : null,
        subscription: form.subscription ? Number(form.subscription) : null,
        delivery: form.delivery ? Number(form.delivery) : null,
        billing_invoice: form.billing_invoice ? Number(form.billing_invoice) : null,
        reporter_name_snapshot: form.reporter_name_snapshot,
        reporter_phone_snapshot: form.reporter_phone_snapshot,
        warranty_status: form.warranty_status,
        debit_note_required: form.debit_note_required,
        stock_resolution_required: Boolean(form.inventory_item),
        lines: hasLine
          ? [
              {
                product: form.product ? Number(form.product) : null,
                inventory_item: form.inventory_item ? Number(form.inventory_item) : null,
                description: form.line_description,
                quantity: form.quantity,
                disposition: "REPAIR",
                taxable_amount: form.taxable_amount,
                tax_amount: form.tax_amount,
              },
            ]
          : [],
      });
      setNotice("Service ticket created successfully.");
      setForm({ ...emptyForm });
      setPhoneQuery("");
      setLookupResult(null);
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
        key: "case_no",
        title: "Ticket",
        render: (row: ServiceDeskCase) => (
          <div>
            <div className="font-semibold text-foreground">{row.case_no}</div>
            <div className="text-xs text-muted-foreground">{formatDateTime(row.created_at)}</div>
          </div>
        ),
      },
      {
        key: "reporter",
        title: "Customer",
        render: (row: ServiceDeskCase) => (
          <div>
            <div className="font-medium text-foreground">{row.reporter_name_snapshot || row.party_display_name || "—"}</div>
            <div className="text-xs text-muted-foreground">{row.reporter_phone_snapshot || "—"}</div>
          </div>
        ),
      },
      {
        key: "issue_summary",
        title: "Issue",
        render: (row: ServiceDeskCase) => (
          <div className="max-w-xs">
            <div className="font-medium text-foreground truncate">{row.issue_summary}</div>
            <div className="text-xs text-muted-foreground">
              {row.direct_sale_no || row.billing_invoice_no || row.delivery_reference || "No source"}
            </div>
          </div>
        ),
      },
      {
        key: "priority",
        title: "Priority",
        render: (row: ServiceDeskCase) => <ERPStatusBadge status={row.priority} hideIcon />,
      },
      {
        key: "status",
        title: "Status",
        render: (row: ServiceDeskCase) => <ERPStatusBadge status={row.status} hideIcon />,
      },
      {
        key: "warranty_status",
        title: "Warranty",
        render: (row: ServiceDeskCase) => <ERPStatusBadge status={row.warranty_status} hideIcon />,
      },
    ],
    []
  );

  const cust = lookupResult?.customer;

  return (
    <ERPPageShell
      eyebrow="Service Desk"
      title="Service Tickets"
      subtitle="Complete service resolution hub — find customers by phone, auto-fill billing details, link BOMs and production jobs."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Service Desk", href: ROUTES.admin.serviceDesk },
        { label: "Service Tickets" },
      ]}
      actions={[
        { href: ROUTES.admin.serviceDesk, label: "Overview", variant: "secondary" },
        { href: ROUTES.admin.serviceDeskComplaints, label: "Complaints", variant: "secondary" },
        { href: ROUTES.admin.serviceDeskReturns, label: "Returns", variant: "secondary" },
      ]}
      stats={[
        { label: "Total", value: String(rows.length), tone: "info" },
        { label: "Open", value: String(rows.filter((r) => ["OPEN", "UNDER_REVIEW", "AUTHORIZED", "IN_SERVICE"].includes(r.status)).length), tone: "warning" },
        { label: "Resolved", value: String(rows.filter((r) => r.status === "RESOLVED").length), tone: "success" },
        { label: "In Warranty", value: String(rows.filter((r) => r.warranty_status === "IN_WARRANTY").length) },
      ]}
      statusBadge={{ label: "Service Hub", tone: "info" }}
      headerMode="erp"
    >
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        {/* Left: Ticket list */}
        <div className="space-y-4">
          {refreshing && (
            <div className="h-0.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full w-1/3 bg-primary" style={{ animation: "slide 1.2s ease-in-out infinite" }} />
              <style>{`@keyframes slide { 0% { transform:translateX(-100%) } 100% { transform:translateX(400%) } }`}</style>
            </div>
          )}
          {loading ? <ERPLoadingState label="Loading service tickets..." /> : null}
          {!loading && error ? (
            <ERPErrorState title="Service ticket register unavailable" description={error} onRetry={() => void loadPage()} />
          ) : null}
          {!loading && !error ? (
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <DataTable
                columns={columns}
                rows={rows}
                emptyText="No service tickets found."
                onRowClick={(row) => {
                  window.location.href = buildAdminServiceDeskCaseRoute(row.id);
                }}
              />
            </div>
          ) : null}
        </div>

        {/* Right: Create ticket panel */}
        <div className="space-y-4">
          {notice && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-800 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
              {notice}
            </div>
          )}

          {/* Phone lookup bar */}
          <div className="rounded-2xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Customer Lookup</h3>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">📞</span>
              <input
                type="tel"
                placeholder="Enter phone number to find customer..."
                value={phoneQuery}
                onChange={(e) => onPhoneChange(e.target.value)}
                className={`${inputCls} pl-9 pr-10`}
              />
              {lookupLoading && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground animate-pulse">
                  Searching...
                </span>
              )}
            </div>

            {/* Customer found card */}
            {lookupResult?.found && cust && (
              <div className="mt-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10 p-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-lg font-bold text-emerald-700">
                    {cust.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-foreground text-sm">{cust.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {cust.phone} {cust.email ? `· ${cust.email}` : ""} {cust.customer_code ? `· ${cust.customer_code}` : ""}
                    </div>
                    {cust.address && <div className="text-xs text-muted-foreground truncate">{cust.address}{cust.city ? `, ${cust.city}` : ""}</div>}
                  </div>
                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 rounded-full">{cust.kyc_status || "Active"}</span>
                </div>

                {/* Quick stats */}
                <div className="grid grid-cols-4 gap-2 mt-3">
                  <div className="text-center p-1.5 rounded-lg bg-background">
                    <div className="text-sm font-bold text-foreground">{lookupResult.direct_sales.length}</div>
                    <div className="text-[10px] text-muted-foreground">Sales</div>
                  </div>
                  <div className="text-center p-1.5 rounded-lg bg-background">
                    <div className="text-sm font-bold text-foreground">{lookupResult.subscriptions.length}</div>
                    <div className="text-[10px] text-muted-foreground">Plans</div>
                  </div>
                  <div className="text-center p-1.5 rounded-lg bg-background">
                    <div className="text-sm font-bold text-foreground">{lookupResult.warranty_claims.length}</div>
                    <div className="text-[10px] text-muted-foreground">Warranty</div>
                  </div>
                  <div className="text-center p-1.5 rounded-lg bg-background">
                    <div className="text-sm font-bold text-foreground">{lookupResult.service_cases.length}</div>
                    <div className="text-[10px] text-muted-foreground">Cases</div>
                  </div>
                </div>
              </div>
            )}

            {lookupResult && !lookupResult.found && phoneQuery.length >= 4 && !lookupLoading && (
              <div className="mt-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10 p-3 text-sm text-amber-700 dark:text-amber-300">
                No customer found for this phone number. You can still create a ticket manually.
              </div>
            )}
          </div>

          {/* Tabs: Create / History */}
          {lookupResult?.found && (
            <div className="flex gap-1 rounded-xl bg-muted/50 p-1">
              <button
                type="button"
                onClick={() => setActiveTab("create")}
                className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition ${activeTab === "create" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                Create Ticket
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("history")}
                className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition ${activeTab === "history" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                History & Links
              </button>
            </div>
          )}

          {/* History tab */}
          {activeTab === "history" && lookupResult?.found && (
            <div className="space-y-3">
              {/* Direct Sales */}
              {lookupResult.direct_sales.length > 0 && (
                <HistorySection title="Direct Sales" icon="🧾">
                  {lookupResult.direct_sales.map((s) => (
                    <HistoryRow
                      key={s.id}
                      label={s.sale_no}
                      sub={`${s.sale_date} · ₹${s.grand_total}`}
                      status={s.status}
                      onLink={() => linkDirectSale(s.id)}
                    />
                  ))}
                </HistorySection>
              )}

              {/* Subscriptions */}
              {lookupResult.subscriptions.length > 0 && (
                <HistorySection title="Subscriptions" icon="📋">
                  {lookupResult.subscriptions.map((s) => (
                    <HistoryRow
                      key={s.id}
                      label={s.subscription_no}
                      sub={s.plan_name}
                      status={s.status}
                      onLink={() => linkSubscription(s.id)}
                    />
                  ))}
                </HistorySection>
              )}

              {/* Deliveries */}
              {lookupResult.deliveries.length > 0 && (
                <HistorySection title="Deliveries" icon="🚚">
                  {lookupResult.deliveries.map((d) => (
                    <HistoryRow
                      key={d.id}
                      label={d.delivery_reference || `DEL-${d.id}`}
                      sub={d.scheduled_date}
                      status={d.status}
                      onLink={() => linkDelivery(d.id)}
                    />
                  ))}
                </HistorySection>
              )}

              {/* Warranty Claims */}
              {lookupResult.warranty_claims.length > 0 && (
                <HistorySection title="Warranty Claims" icon="🛡️">
                  {lookupResult.warranty_claims.map((w) => (
                    <HistoryRow
                      key={w.id}
                      label={w.case_no}
                      sub={`${w.product_name} · Expires ${w.warranty_end_date}`}
                      status={w.claim_status}
                    />
                  ))}
                </HistorySection>
              )}

              {/* Production Jobs */}
              {lookupResult.production_jobs.length > 0 && (
                <HistorySection title="Production / BOM" icon="🏭">
                  {lookupResult.production_jobs.map((j) => (
                    <HistoryRow
                      key={j.id}
                      label={j.job_no}
                      sub={`${j.bom_no} · ${j.job_date}`}
                      status={j.status}
                      onLink={() => linkProductionJob(j.id)}
                    />
                  ))}
                </HistorySection>
              )}

              {/* Existing Service Cases */}
              {lookupResult.service_cases.length > 0 && (
                <HistorySection title="Previous Service Cases" icon="📂">
                  {lookupResult.service_cases.map((c) => (
                    <HistoryRow
                      key={c.id}
                      label={c.case_no}
                      sub={c.issue_summary}
                      status={c.status}
                      href={buildAdminServiceDeskCaseRoute(c.id)}
                    />
                  ))}
                </HistorySection>
              )}
            </div>
          )}

          {/* Create ticket form */}
          {activeTab === "create" && (
            <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">New Service Ticket</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Pick a preset or describe the issue manually.</p>
              </div>

              {/* Issue presets */}
              <div className="grid grid-cols-2 gap-1.5">
                {ISSUE_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => applyPreset(p)}
                    className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition hover:bg-muted/60 ${
                      form.issue_summary === p.summary ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground"
                    }`}
                  >
                    <span>{p.icon}</span>
                    <span>{p.label}</span>
                  </button>
                ))}
              </div>

              {/* Core fields */}
              <div className="grid gap-3">
                <label className={labelCls}>
                  <span>Issue Summary *</span>
                  <input value={form.issue_summary} onChange={(e) => setForm((p) => ({ ...p, issue_summary: e.target.value }))} className={inputCls} placeholder="Describe the issue..." />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className={labelCls}>
                    <span>Priority</span>
                    <select value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))} className={selectCls}>
                      <option value="LOW">Low</option>
                      <option value="NORMAL">Normal</option>
                      <option value="HIGH">High</option>
                      <option value="URGENT">Urgent</option>
                    </select>
                  </label>
                  <label className={labelCls}>
                    <span>Warranty Status</span>
                    <select value={form.warranty_status} onChange={(e) => setForm((p) => ({ ...p, warranty_status: e.target.value }))} className={selectCls}>
                      <option value="UNKNOWN">Unknown</option>
                      <option value="IN_WARRANTY">In Warranty</option>
                      <option value="OUT_OF_WARRANTY">Out of Warranty</option>
                      <option value="GOODWILL">Goodwill</option>
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className={labelCls}>
                    <span>Reporter Name</span>
                    <input value={form.reporter_name_snapshot} onChange={(e) => setForm((p) => ({ ...p, reporter_name_snapshot: e.target.value }))} className={inputCls} />
                  </label>
                  <label className={labelCls}>
                    <span>Reporter Phone</span>
                    <input value={form.reporter_phone_snapshot} onChange={(e) => setForm((p) => ({ ...p, reporter_phone_snapshot: e.target.value }))} className={inputCls} />
                  </label>
                </div>

                <label className={labelCls}>
                  <span>Issue Details</span>
                  <textarea rows={3} value={form.issue_details} onChange={(e) => setForm((p) => ({ ...p, issue_details: e.target.value }))} className={inputCls} placeholder="Detailed description..." />
                </label>
              </div>

              {/* Linked references */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Linked References</h4>
                <div className="grid grid-cols-2 gap-2">
                  <label className={labelCls}>
                    <span>Direct Sale ID</span>
                    <input value={form.direct_sale} onChange={(e) => setForm((p) => ({ ...p, direct_sale: e.target.value }))} className={inputCls} placeholder="Auto-filled from history" />
                  </label>
                  <label className={labelCls}>
                    <span>Subscription ID</span>
                    <input value={form.subscription} onChange={(e) => setForm((p) => ({ ...p, subscription: e.target.value }))} className={inputCls} />
                  </label>
                  <label className={labelCls}>
                    <span>Delivery ID</span>
                    <input value={form.delivery} onChange={(e) => setForm((p) => ({ ...p, delivery: e.target.value }))} className={inputCls} />
                  </label>
                  <label className={labelCls}>
                    <span>Invoice ID</span>
                    <input value={form.billing_invoice} onChange={(e) => setForm((p) => ({ ...p, billing_invoice: e.target.value }))} className={inputCls} />
                  </label>
                  <label className={labelCls}>
                    <span>Support Request ID</span>
                    <input value={form.support_request} onChange={(e) => setForm((p) => ({ ...p, support_request: e.target.value }))} className={inputCls} />
                  </label>
                  <label className={labelCls}>
                    <span>Production Job</span>
                    <input value={form.production_job} onChange={(e) => setForm((p) => ({ ...p, production_job: e.target.value }))} className={inputCls} placeholder="Job reference" />
                  </label>
                </div>
              </div>

              {/* Item line */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Service Item</h4>
                <div className="grid grid-cols-2 gap-2">
                  <label className={labelCls}>
                    <span>Product ID</span>
                    <input value={form.product} onChange={(e) => setForm((p) => ({ ...p, product: e.target.value }))} className={inputCls} />
                  </label>
                  <label className={labelCls}>
                    <span>Inventory Item ID</span>
                    <input value={form.inventory_item} onChange={(e) => setForm((p) => ({ ...p, inventory_item: e.target.value }))} className={inputCls} />
                  </label>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <label className={`${labelCls} col-span-3`}>
                    <span>Description</span>
                    <input value={form.line_description} onChange={(e) => setForm((p) => ({ ...p, line_description: e.target.value }))} className={inputCls} />
                  </label>
                  <label className={labelCls}>
                    <span>Qty</span>
                    <input value={form.quantity} onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))} className={inputCls} />
                  </label>
                  <label className={labelCls}>
                    <span>Taxable Amt</span>
                    <input value={form.taxable_amount} onChange={(e) => setForm((p) => ({ ...p, taxable_amount: e.target.value }))} className={inputCls} />
                  </label>
                  <label className={labelCls}>
                    <span>Tax Amt</span>
                    <input value={form.tax_amount} onChange={(e) => setForm((p) => ({ ...p, tax_amount: e.target.value }))} className={inputCls} />
                  </label>
                </div>
              </div>

              {/* Charge note */}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.debit_note_required}
                  onChange={(e) => setForm((p) => ({ ...p, debit_note_required: e.target.checked }))}
                  className="rounded border-border"
                />
                <span className="text-muted-foreground">Charge note (debit note) required</span>
              </label>

              {/* Submit */}
              <button
                type="button"
                onClick={() => void handleCreateTicket()}
                disabled={saving || !form.issue_summary.trim()}
                className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Creating..." : "Create Service Ticket"}
              </button>
            </div>
          )}
        </div>
      </div>
    </ERPPageShell>
  );
}

function HistorySection({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/30 border-b border-border">
        <span>{icon}</span>
        <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">{title}</h4>
      </div>
      <div className="divide-y divide-border">{children}</div>
    </div>
  );
}

function HistoryRow({ label, sub, status, onLink, href }: { label: string; sub: string; status: string; onLink?: () => void; href?: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground truncate">{sub}</div>
      </div>
      <ERPStatusBadge status={status} hideIcon />
      {onLink && (
        <button
          type="button"
          onClick={onLink}
          className="text-xs font-medium text-primary hover:underline shrink-0"
        >
          Link
        </button>
      )}
      {href && (
        <a href={href} className="text-xs font-medium text-primary hover:underline shrink-0">
          View
        </a>
      )}
    </div>
  );
}
