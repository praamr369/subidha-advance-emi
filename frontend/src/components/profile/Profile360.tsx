/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import { WorkspaceSection } from "@/components/ui/workspace";
import {
  buildAdminBillingDocumentRoute,
  buildAdminDeliveryRoute,
  buildAdminServiceDeskCaseRoute,
  buildAdminSubscriptionRoute,
} from "@/lib/route-builders";
import { ROUTES } from "@/lib/routes";
import { apiFetch } from "@/lib/api";
import type { PartyDetailResponse } from "@/services/crm";
import { 
  ClipboardList, 
  ShieldAlert, 
  BadgeIndianRupee, 
  Box, 
  CheckCircle, 
  FileSignature 
} from "lucide-react";

export function UniversalQuickWidgets({ payload }: { payload: PartyDetailResponse }) {
  if (!payload) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 mb-6">
      <div className="rounded-xl border border-border bg-card p-4 flex flex-col justify-between gap-2 shadow-sm">
        <div className="flex items-center gap-1.5 text-muted-foreground text-[11px] font-bold uppercase tracking-wider">
          <FileSignature className="h-3.5 w-3.5" /> Contracts
        </div>
        <div className="text-sm">
          {payload.summary.subscription_count > 0 ? <span className="font-bold text-foreground">{payload.summary.subscription_count} Subscriptions</span> : <span className="text-muted-foreground font-medium">No Contracts</span>}
          <div className="text-xs text-muted-foreground mt-0.5">
            Amendments: 0
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 flex flex-col justify-between gap-2 shadow-sm">
        <div className="flex items-center gap-1.5 text-muted-foreground text-[11px] font-bold uppercase tracking-wider">
          <ClipboardList className="h-3.5 w-3.5" /> Service & Leads
        </div>
        <div className="text-sm">
          {(() => {
            const activeLeads = payload.summary.open_lead_count ?? payload.summary.lead_count ?? 0;
            return activeLeads > 0 ? (
              <span className="text-amber-600 font-bold">{activeLeads} Active Leads</span>
            ) : (
              <span className="text-muted-foreground font-medium">No active leads</span>
            );
          })()}
          <div className="text-xs text-muted-foreground mt-0.5">
            {payload.summary.service_case_count > 0 ? <span className="text-red-600 font-medium">{payload.summary.service_case_count} Open Cases</span> : <span>No open cases</span>}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 flex flex-col justify-between gap-2 shadow-sm">
        <div className="flex items-center gap-1.5 text-muted-foreground text-[11px] font-bold uppercase tracking-wider">
          <BadgeIndianRupee className="h-3.5 w-3.5" /> Collections
        </div>
        <div className="text-sm">
          {Number(payload.financials?.outstanding || 0) > 0 ? <span className="text-red-600 font-bold">{money(payload.financials?.outstanding)} Overdue</span> : <span className="text-emerald-600 font-bold">All clear</span>}
          <div className="text-xs text-muted-foreground mt-0.5">
            Debit/Credit Notes: 0
          </div>
        </div>
      </div>
      
      <div className="rounded-xl border border-border bg-card p-4 flex flex-col justify-between gap-2 shadow-sm">
        <div className="flex items-center gap-1.5 text-muted-foreground text-[11px] font-bold uppercase tracking-wider">
          <ShieldAlert className="h-3.5 w-3.5" /> Warranty
        </div>
        <div className="text-sm">
          {payload.summary.subscription_count > 0 ? <span className="text-emerald-600 font-bold">Active</span> : <span className="text-muted-foreground font-medium">None</span>}
          <div className="text-xs text-muted-foreground mt-0.5">
            Product warranty
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 flex flex-col justify-between gap-2 shadow-sm">
        <div className="flex items-center gap-1.5 text-muted-foreground text-[11px] font-bold uppercase tracking-wider">
          <Box className="h-3.5 w-3.5" /> Delivery
        </div>
        <div className="text-sm">
          {payload.summary.delivery_count > 0 ? <span className="text-foreground font-bold">{payload.summary.delivery_count} Deliveries</span> : <span className="text-muted-foreground font-medium">No deliveries</span>}
          <div className="text-xs text-muted-foreground mt-0.5">
            {payload.summary.pending_delivery_count ? <span className="text-amber-600 font-medium">{payload.summary.pending_delivery_count} Pending</span> : <span>All delivered</span>}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 flex flex-col justify-between gap-2 shadow-sm">
        <div className="flex items-center gap-1.5 text-muted-foreground text-[11px] font-bold uppercase tracking-wider">
          <CheckCircle className="h-3.5 w-3.5" /> Profile KYC
        </div>
        <div className="text-sm">
          {payload.summary.pending_kyc_count ? <span className="text-amber-600 font-bold">{payload.summary.pending_kyc_count} Missing Docs</span> : <span className="text-emerald-600 font-bold">Verified</span>}
          <div className="text-xs text-muted-foreground mt-0.5">
            Identity checks
          </div>
        </div>
      </div>
    </div>
  );
}

export function UniversalQuickWidgetsEmbed({ role, sourceId }: { role: ProfileRole; sourceId: number }) {
  const [payload, setPayload] = useState<PartyDetailResponse | null>(null);

  useEffect(() => {
    if (!sourceId) return;
    apiFetch<PartyDetailResponse>(`/crm/parties/resolve/?role=${role}&source_id=${sourceId}`)
      .then(setPayload)
      .catch(() => {}); // silent fail, widgets just won't render
  }, [role, sourceId]);

  if (!payload) return null;
  return <UniversalQuickWidgets payload={payload} />;
}

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export function cellText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

export function money(value: unknown): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return cellText(value);
  return `₹${num.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Col = {
  key: string;
  label: string;
  align?: "right";
  render?: (row: Record<string, any>) => ReactNode;
};

/** Generic, dependency-free table for a related module list. Renders nothing
 *  when the list is empty so a profile only shows the modules it touches. */
export function ModuleTable({
  rows,
  cols,
  hrefFor,
}: {
  rows: Array<Record<string, any>>;
  cols: Col[];
  hrefFor?: (row: Record<string, any>) => string | null;
}) {
  if (!rows || rows.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="min-w-full text-sm">
        <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider text-left">
          <tr>
            {cols.map((c) => (
              <th key={c.key} className={`px-4 py-2.5 font-medium ${c.align === "right" ? "text-right" : ""}`}>
                {c.label}
              </th>
            ))}
            {hrefFor ? <th className="px-4 py-2.5" /> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row, index) => {
            const href = hrefFor?.(row) ?? null;
            return (
              <tr key={index} className="hover:bg-muted/30 transition-colors">
                {cols.map((c) => (
                  <td key={c.key} className={`px-4 py-2.5 ${c.align === "right" ? "text-right tabular-nums" : ""}`}>
                    {c.render ? c.render(row) : cellText(row[c.key])}
                  </td>
                ))}
                {hrefFor ? (
                  <td className="px-4 py-2.5 text-right">
                    {href ? (
                      <Link href={href} className="text-xs font-medium text-primary hover:underline">
                        Open →
                      </Link>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const ALERT_STYLE: Record<string, string> = {
  high: "border-red-200 bg-red-50 text-red-800",
  medium: "border-amber-200 bg-amber-50 text-amber-800",
  info: "border-sky-200 bg-sky-50 text-sky-800",
};

/** "Needs Attention" operational urgency cards. */
export function ProfileAlerts({ alerts }: { alerts?: PartyDetailResponse["alerts"] }) {
  if (!alerts || alerts.length === 0) return null;
  return (
    <WorkspaceSection
      title="Needs Attention"
      description="Live operational flags aggregated across every module linked to this profile."
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {alerts.map((alert, index) => (
          <div
            key={`${alert.module}-${index}`}
            className={`rounded-xl border px-4 py-3 ${ALERT_STYLE[alert.level] || ALERT_STYLE.info}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wide opacity-70">{alert.module}</span>
              {alert.count != null ? (
                <span className="rounded-full bg-white/60 px-2 py-0.5 text-xs font-bold">{alert.count}</span>
              ) : null}
            </div>
            <div className="mt-1 text-sm font-semibold">{alert.label}</div>
            <div className="mt-0.5 text-xs opacity-80">{alert.detail}</div>
          </div>
        ))}
      </div>
    </WorkspaceSection>
  );
}

/** Financial position tiles derived from linked invoices & receipts. */
export function ProfileFinancials({ financials }: { financials?: PartyDetailResponse["financials"] }) {
  if (!financials) return null;
  return (
    <WorkspaceSection title="Financial Position" description="Derived from this profile's linked invoices and receipts.">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Total Invoiced</div>
          <div className="mt-1 text-2xl font-bold">{money(financials.total_invoiced)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Total Received</div>
          <div className="mt-1 text-2xl font-bold text-emerald-600">{money(financials.total_received)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Outstanding</div>
          <div className={`mt-1 text-2xl font-bold ${Number(financials.outstanding) > 0 ? "text-red-600" : "text-foreground"}`}>
            {money(financials.outstanding)}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Direct Sales Value</div>
          <div className="mt-1 text-2xl font-bold">{money(financials.total_direct_sales)}</div>
        </div>
        {Number(financials.legacy_outstanding || 0) > 0 && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-4">
            <div className="text-xs text-muted-foreground">Legacy Outstanding (Old Books)</div>
            <div className="mt-1 text-2xl font-bold text-amber-700 dark:text-amber-400">{money(financials.legacy_outstanding)}</div>
          </div>
        )}
      </div>
    </WorkspaceSection>
  );
}

/** All cross-module data tables for a party payload. Each section renders only
 *  when it has rows, so any role (customer/partner/vendor/staff/lead) shows the
 *  modules it actually touches. */
export function ProfileModuleSections({ payload }: { payload: PartyDetailResponse }) {
  const r = payload.related;
  return (
    <>
      {r.customers.length > 0 ? (
        <WorkspaceSection title={`Customer Records (${r.customers.length})`} description="Registered customer identities linked to this profile.">
          <ModuleTable
            rows={r.customers}
            hrefFor={(row) => `/admin/customers/${row.id}`}
            cols={[
              { key: "name", label: "Name" },
              { key: "phone", label: "Phone" },
              { key: "city", label: "City" },
              { key: "kyc_status", label: "KYC", render: (row) => (
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${row.kyc_status === "VERIFIED" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{cellText(row.kyc_status)}</span>
              ) },
            ]}
          />
        </WorkspaceSection>
      ) : null}

      {r.leads.length > 0 ? (
        <WorkspaceSection title={`Lead / Enquiry Records (${r.leads.length})`} description="Pre-conversion enquiries linked to this profile.">
          <ModuleTable
            rows={r.leads as Array<Record<string, any>>}
            hrefFor={(row) => `${ROUTES.admin.leads}/${row.id}`}
            cols={[
              { key: "name", label: "Name" },
              { key: "phone", label: "Phone" },
              { key: "product_name", label: "Product" },
              { key: "status", label: "Status" },
            ]}
          />
        </WorkspaceSection>
      ) : null}

      {r.partners.length > 0 ? (
        <WorkspaceSection title={`Partner Records (${r.partners.length})`} description="Partner accounts linked to this profile.">
          <ModuleTable
            rows={r.partners}
            cols={[
              { key: "username", label: "Username" },
              { key: "phone", label: "Phone" },
              { key: "email", label: "Email" },
              { key: "is_active", label: "Active", render: (row) => (row.is_active ? "Yes" : "No") },
            ]}
          />
        </WorkspaceSection>
      ) : null}

      {r.vendors.length > 0 ? (
        <WorkspaceSection title={`Vendor Records (${r.vendors.length})`} description="Vendor identities linked to this profile.">
          <ModuleTable
            rows={r.vendors}
            cols={[
              { key: "name", label: "Name" },
              { key: "phone", label: "Phone" },
              { key: "email", label: "Email" },
              { key: "is_active", label: "Active", render: (row) => (row.is_active ? "Yes" : "No") },
            ]}
          />
        </WorkspaceSection>
      ) : null}

      {r.staff.length > 0 ? (
        <WorkspaceSection title={`Staff Records (${r.staff.length})`} description="Employee / cashier identities linked to this profile.">
          <ModuleTable
            rows={r.staff}
            cols={[
              { key: "employee_code", label: "Code" },
              { key: "name", label: "Name" },
              { key: "department", label: "Department" },
              { key: "designation", label: "Designation" },
              { key: "is_active", label: "Active", render: (row) => (row.is_active ? "Yes" : "No") },
            ]}
          />
        </WorkspaceSection>
      ) : null}

      {r.subscriptions.length > 0 ? (
        <WorkspaceSection title={`Subscriptions (${payload.summary.subscription_count})`} description="Advance-EMI / rent / lease contracts.">
          <ModuleTable
            rows={r.subscriptions}
            hrefFor={(row) => buildAdminSubscriptionRoute(row.id)}
            cols={[
              { key: "contract_reference", label: "Contract" },
              { key: "product_name", label: "Product" },
              { key: "status", label: "Status" },
              { key: "total_amount", label: "Total", align: "right", render: (row) => money(row.total_amount) },
              { key: "monthly_amount", label: "Monthly", align: "right", render: (row) => money(row.monthly_amount) },
            ]}
          />
        </WorkspaceSection>
      ) : null}

      {r.direct_sales.length > 0 ? (
        <WorkspaceSection title={`Direct Sales (${payload.summary.direct_sale_count})`} description="One-time counter sales.">
          <ModuleTable
            rows={r.direct_sales}
            hrefFor={(row) => `${ROUTES.admin.billingDirectSales}?focus_sale=${row.id}`}
            cols={[
              { key: "sale_no", label: "Sale No" },
              { key: "status", label: "Status" },
              { key: "sale_date", label: "Date" },
              { key: "grand_total", label: "Total", align: "right", render: (row) => money(row.grand_total) },
            ]}
          />
        </WorkspaceSection>
      ) : null}

      {r.deliveries.length > 0 ? (
        <WorkspaceSection title={`Deliveries (${payload.summary.delivery_count})`} description="Dispatch & handover records.">
          <ModuleTable
            rows={r.deliveries}
            hrefFor={(row) => buildAdminDeliveryRoute(row.id)}
            cols={[
              { key: "delivery_reference", label: "Reference" },
              { key: "status", label: "Status", render: (row) => {
                const urgent = ["FAILED", "BLOCKED_STOCK_UNAVAILABLE", "RETURN_REQUESTED"].includes(String(row.status));
                const done = ["DELIVERED", "CANCELLED", "RETURNED"].includes(String(row.status));
                return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${urgent ? "bg-red-100 text-red-700" : done ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{cellText(row.status)}</span>;
              } },
              { key: "scheduled_date", label: "Scheduled" },
              { key: "branch_code", label: "Branch" },
            ]}
          />
        </WorkspaceSection>
      ) : null}

      {r.invoices.length > 0 ? (
        <WorkspaceSection title={`Invoices (${payload.summary.invoice_count})`} description="Billing documents.">
          <ModuleTable
            rows={r.invoices}
            hrefFor={(row) => buildAdminBillingDocumentRoute(row.id)}
            cols={[
              { key: "document_no", label: "Invoice No" },
              { key: "status", label: "Status" },
              { key: "invoice_date", label: "Date" },
              { key: "grand_total", label: "Total", align: "right", render: (row) => money(row.grand_total) },
            ]}
          />
        </WorkspaceSection>
      ) : null}

      {r.receipts.length > 0 ? (
        <WorkspaceSection title={`Receipts (${payload.summary.receipt_count})`} description="Money collected.">
          <ModuleTable
            rows={r.receipts}
            cols={[
              { key: "receipt_no", label: "Receipt No" },
              { key: "status", label: "Status" },
              { key: "receipt_date", label: "Date" },
              { key: "amount", label: "Amount", align: "right", render: (row) => money(row.amount) },
            ]}
          />
        </WorkspaceSection>
      ) : null}

      {r.reminders.length > 0 ? (
        <WorkspaceSection title={`Payment Reminders (${payload.summary.reminder_count})`} description="Collection reminders.">
          <ModuleTable
            rows={r.reminders}
            hrefFor={() => ROUTES.admin.reminders}
            cols={[
              { key: "reminder_no", label: "Reminder No" },
              { key: "reminder_type", label: "Type" },
              { key: "status", label: "Status" },
              { key: "due_date", label: "Due" },
            ]}
          />
        </WorkspaceSection>
      ) : null}

      {r.support_requests.length > 0 ? (
        <WorkspaceSection title={`Support Requests (${payload.summary.support_count})`} description="Customer support tickets.">
          <ModuleTable
            rows={r.support_requests}
            hrefFor={() => ROUTES.admin.supportRequests}
            cols={[
              { key: "id", label: "ID", render: (row) => `#${cellText(row.id)}` },
              { key: "category", label: "Category" },
              { key: "status", label: "Status" },
              { key: "branch_code", label: "Branch" },
            ]}
          />
        </WorkspaceSection>
      ) : null}

      {r.service_cases.length > 0 ? (
        <WorkspaceSection title={`Service Cases (${payload.summary.service_case_count})`} description="Service desk cases: returns, exchanges, complaints, repairs.">
          <ModuleTable
            rows={r.service_cases}
            hrefFor={(row) => buildAdminServiceDeskCaseRoute(row.id)}
            cols={[
              { key: "case_no", label: "Case No" },
              { key: "case_type", label: "Type" },
              { key: "status", label: "Status" },
              { key: "issue_summary", label: "Issue" },
              { key: "total_amount", label: "Amount", align: "right", render: (row) => money(row.total_amount) },
            ]}
          />
        </WorkspaceSection>
      ) : null}

      {(r.legacy_outstandings ?? []).length > 0 ? (
        <WorkspaceSection
          title={`Legacy Outstandings (${(r.legacy_outstandings ?? []).length})`}
          description="Opening balances migrated from old books. Collect via Collection Workspace."
        >
          <ModuleTable
            rows={r.legacy_outstandings ?? []}
            hrefFor={() => ROUTES.admin.outstandings}
            cols={[
              { key: "customer_name", label: "Customer" },
              { key: "phone", label: "Phone" },
              { key: "outstanding_amount", label: "Original", align: "right", render: (row) => money(row.outstanding_amount) },
              { key: "collected_amount", label: "Collected", align: "right", render: (row) => money(row.collected_amount) },
              { key: "balance_remaining", label: "Remaining", align: "right", render: (row) => (
                <span className={Number(row.balance_remaining) > 0 ? "font-semibold text-red-600" : "text-emerald-600"}>
                  {money(row.balance_remaining)}
                </span>
              ) },
              { key: "entry_date", label: "Entry Date" },
              { key: "is_settled", label: "Status", render: (row) => (
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${row.is_settled ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                  {row.is_settled ? "Settled" : "Due"}
                </span>
              ) },
            ]}
          />
        </WorkspaceSection>
      ) : null}
    </>
  );
}

export type ProfileRole = "CUSTOMER" | "PARTNER" | "VENDOR" | "STAFF" | "LEAD";

/**
 * Self-contained cross-module 360 view for any role's own detail page. Resolves
 * the linked PartyMaster by role + source id, then renders the shared alerts,
 * financials, and module tables. Zero duplication of the aggregation logic.
 */
export function Party360Embed({ role, sourceId }: { role: ProfileRole; sourceId: number }) {
  const [payload, setPayload] = useState<PartyDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sourceId) return;
    setLoading(true);
    try {
      const data = await apiFetch<PartyDetailResponse>(
        `/crm/parties/resolve/?role=${role}&source_id=${sourceId}`
      );
      setPayload(data);
      setError(null);
    } catch (err) {
      setPayload(null);
      setError(err instanceof Error && err.message ? err.message : "Unable to load the 360 view.");
    } finally {
      setLoading(false);
    }
  }, [role, sourceId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingBlock label="Loading cross-module 360 view..." />;
  if (error || !payload) {
    return (
      <EmptyState
        title="360 view unavailable"
        description={error || "No linked party record was found for this profile yet."}
        tone="info"
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Aggregated from the shared party identity layer.
        </p>
        <Link
          href={`${ROUTES.admin.crmParties}/${payload.party.id}`}
          className="text-xs font-medium text-primary hover:underline"
        >
          Open full Party 360 →
        </Link>
      </div>
      <UniversalQuickWidgets payload={payload} />
      <ProfileAlerts alerts={payload.alerts} />
      <ProfileFinancials financials={payload.financials} />
      <ProfileModuleSections payload={payload} />
    </div>
  );
}
