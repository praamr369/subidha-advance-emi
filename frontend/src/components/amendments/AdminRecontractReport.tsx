"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import ActionButton from "@/components/ui/ActionButton";
import { DetailPanel, MetricStrip, MobileSafeTable } from "@/components/ui/operations";
import { buildAdminProductRecontractAddendumPrintRoute } from "@/lib/route-builders";
import { ROUTES } from "@/lib/routes";
import {
  listAdminProductRecontractReport,
  type ProductRecontractReportFilters,
  type ProductRecontractReportRow,
} from "@/services/amendments";

function dateLabel(value?: string | null) {
  if (!value) return "-";
  const parsed = Date.parse(value);
  return Number.isNaN(parsed)
    ? value
    : new Date(parsed).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function moneyLabel(value?: string | null) {
  if (!value) return "-";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;
  return parsed.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
}

function productLabel(row: ProductRecontractReportRow, side: "old" | "new") {
  const name = side === "old" ? row.old_product_name : row.new_product_name;
  const code = side === "old" ? row.old_product_code : row.new_product_code;
  const id = side === "old" ? row.old_product_id : row.new_product_id;
  if (name && code) return `${name} (${code})`;
  if (name) return name;
  if (code) return code;
  return id ? `Product #${id}` : "-";
}

function EvidenceBadge({ label, status }: { label: string; status?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-2 py-1">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <ERPStatusBadge status={status || "MISSING"} />
    </div>
  );
}

function buildHref(filters: ProductRecontractReportFilters) {
  const params = new URLSearchParams();
  if (filters.executed) params.set("executed", filters.executed);
  if (filters.customerConsentStatus) params.set("customer_consent_status", filters.customerConsentStatus);
  if (filters.adminApprovalStatus) params.set("admin_approval_status", filters.adminApprovalStatus);
  if (filters.product) params.set("product", filters.product);
  if (filters.customer) params.set("customer", filters.customer);
  if (filters.dateFrom) params.set("date_from", filters.dateFrom);
  if (filters.dateTo) params.set("date_to", filters.dateTo);
  const query = params.toString();
  return query ? `${ROUTES.admin.contractAmendmentsRecontractReport}?${query}` : ROUTES.admin.contractAmendmentsRecontractReport;
}

export default function AdminRecontractReport({ filters }: { filters: ProductRecontractReportFilters }) {
  const [rows, setRows] = useState<ProductRecontractReportRow[]>([]);
  const [draft, setDraft] = useState<ProductRecontractReportFilters>(filters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listAdminProductRecontractReport(filters));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load product recontract report.");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    setDraft(filters);
    void load();
  }, [filters, load]);

  const kpis = useMemo(() => {
    const blockers = rows.filter(
      (row) =>
        row.schedule_preview_status === "MISSING" ||
        row.financial_impact_preview_status !== "PREVIEWED" ||
        row.accounting_posting_status !== "POSTED" ||
        row.reconciliation_bridge_status !== "LINKED",
    ).length;
    return [
      { label: "Total previews", value: String(rows.length) },
      { label: "Customer accepted", value: String(rows.filter((row) => row.customer_consent_status === "ACCEPTED").length) },
      { label: "Admin approved", value: String(rows.filter((row) => row.admin_approval_status === "APPROVED").length) },
      { label: "Accounting posted", value: String(rows.filter((row) => row.accounting_posting_status === "POSTED").length) },
      { label: "Reconciliation linked", value: String(rows.filter((row) => row.reconciliation_bridge_status === "LINKED").length) },
      { label: "Executed", value: String(rows.filter((row) => row.executed).length) },
      { label: "Blockers", value: String(blockers) },
    ];
  }, [rows]);

  const hasFilters = Boolean(
    filters.executed ||
      filters.customerConsentStatus ||
      filters.adminApprovalStatus ||
      filters.product ||
      filters.customer ||
      filters.dateFrom ||
      filters.dateTo,
  );

  return (
    <ERPPageShell
      eyebrow="Admin evidence"
      title="Product Recontract Report"
      subtitle="Read-only evidence view for product recontract previews, consent, approvals, accounting bridge, reconciliation bridge, and executed addendum eligibility."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Contract Amendments", href: ROUTES.admin.contractAmendments },
        { label: "Product Recontract Report" },
      ]}
      statusBadge={{ label: "Read only", tone: "info" }}
    >
      <div className="space-y-5">
        <MetricStrip className="xl:grid-cols-7" items={kpis} />

        <DetailPanel title="Filters" description="Filter persisted recontract evidence without changing contracts or financial records.">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
            <select className="h-11 rounded-xl border border-border bg-background px-3 text-sm" value={draft.executed || ""} onChange={(event) => setDraft((current) => ({ ...current, executed: event.target.value }))}>
              <option value="">All execution states</option>
              <option value="true">Executed</option>
              <option value="false">Not executed</option>
            </select>
            <select className="h-11 rounded-xl border border-border bg-background px-3 text-sm" value={draft.customerConsentStatus || ""} onChange={(event) => setDraft((current) => ({ ...current, customerConsentStatus: event.target.value }))}>
              <option value="">All customer consent</option>
              <option value="PENDING">Pending</option>
              <option value="ACCEPTED">Accepted</option>
              <option value="REJECTED">Rejected</option>
            </select>
            <select className="h-11 rounded-xl border border-border bg-background px-3 text-sm" value={draft.adminApprovalStatus || ""} onChange={(event) => setDraft((current) => ({ ...current, adminApprovalStatus: event.target.value }))}>
              <option value="">All admin approvals</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>
            <input className="h-11 rounded-xl border border-border bg-background px-3 text-sm" placeholder="Product" value={draft.product || ""} onChange={(event) => setDraft((current) => ({ ...current, product: event.target.value }))} />
            <input className="h-11 rounded-xl border border-border bg-background px-3 text-sm" placeholder="Customer" value={draft.customer || ""} onChange={(event) => setDraft((current) => ({ ...current, customer: event.target.value }))} />
            <input className="h-11 rounded-xl border border-border bg-background px-3 text-sm" type="date" value={draft.dateFrom || ""} onChange={(event) => setDraft((current) => ({ ...current, dateFrom: event.target.value }))} aria-label="Date from" />
            <input className="h-11 rounded-xl border border-border bg-background px-3 text-sm" type="date" value={draft.dateTo || ""} onChange={(event) => setDraft((current) => ({ ...current, dateTo: event.target.value }))} aria-label="Date to" />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <ActionButton href={buildHref(draft)}>Apply filters</ActionButton>
            <ActionButton href={ROUTES.admin.contractAmendmentsRecontractReport} variant="outline">
              Clear
            </ActionButton>
          </div>
        </DetailPanel>

        {loading ? <ERPLoadingState label="Loading product recontract report..." /> : null}
        {!loading && error ? <ERPErrorState title="Unable to load recontract report" description={error} onRetry={() => void load()} /> : null}
        {!loading && !error && rows.length === 0 ? (
          <ERPEmptyState
            title={hasFilters ? "No recontract rows match these filters" : "No product recontract previews found"}
            description={hasFilters ? "Adjust the report filters to widen the evidence view." : "Saved product recontract preview evidence will appear here."}
          />
        ) : null}

        {!loading && !error && rows.length > 0 ? (
          <DetailPanel title="Evidence register" description="Each row is read-only and links back to the amendment workflow for detail review.">
            <MobileSafeTable>
              <table className="min-w-[1280px] w-full text-left text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3">Amendment</th>
                    <th className="px-3 py-3">Customer</th>
                    <th className="px-3 py-3">Product change</th>
                    <th className="px-3 py-3">Contract totals</th>
                    <th className="px-3 py-3">Evidence</th>
                    <th className="px-3 py-3">Refs</th>
                    <th className="px-3 py-3">Addendum</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {rows.map((row) => (
                    <tr key={row.id} className="align-top">
                      <td className="px-3 py-3">
                        <Link className="font-semibold text-primary hover:underline" href={`${ROUTES.admin.contractAmendments}/${row.amendment_id}`}>
                          {row.amendment_no || `AMD-${row.amendment_id}`}
                        </Link>
                        <div className="mt-1 text-xs text-muted-foreground">{row.subscription_number || `Subscription #${row.subscription_id ?? "-"}`}</div>
                        <div className="mt-2">
                          <ERPStatusBadge status={row.executed_status} />
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium">{row.customer_name || `Customer #${row.customer_id ?? "-"}`}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{row.customer_phone || "-"}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="text-xs text-muted-foreground">Old</div>
                        <div>{productLabel(row, "old")}</div>
                        <div className="mt-2 text-xs text-muted-foreground">New</div>
                        <div>{productLabel(row, "new")}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="grid gap-1 text-xs">
                          <span>Old: {moneyLabel(row.old_contract_total)}</span>
                          <span>New: {moneyLabel(row.new_contract_total)}</span>
                          <span>Difference: {moneyLabel(row.price_difference)}</span>
                          <span>Executed at: {dateLabel(row.executed_at)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="grid gap-1">
                          <EvidenceBadge label="Consent" status={row.customer_consent_status} />
                          <EvidenceBadge label="Approval" status={row.admin_approval_status} />
                          <EvidenceBadge label="Schedule" status={row.schedule_preview_status} />
                          <EvidenceBadge label="Financial impact" status={row.financial_impact_preview_status} />
                          <EvidenceBadge label="Accounting" status={row.accounting_posting_status} />
                          <EvidenceBadge label="Reconciliation" status={row.reconciliation_bridge_status} />
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="grid gap-1 text-xs">
                          <span>Journal: {row.journal_entry_no || row.journal_entry_id || "-"}</span>
                          <span>Run: {row.reconciliation_run_id || "-"}</span>
                          <span>Item: {row.reconciliation_item_id || "-"}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {row.addendum_print_eligible ?? row.executed ? (
                          <Link
                            className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted"
                            href={row.addendum_print_reference?.route || buildAdminProductRecontractAddendumPrintRoute(row.amendment_id)}
                          >
                            Print addendum
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">Not available yet</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </MobileSafeTable>
          </DetailPanel>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
