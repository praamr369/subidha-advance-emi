"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { accountingErrorMessage } from "@/components/accounting/shared";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import PaginationControls from "@/components/ui/PaginationControls";
import StatusBadge from "@/components/ui/status-badge";
import { ROUTES } from "@/lib/routes";
import { formatRupee } from "@/lib/utils/currency";
import { listAdminOnlineRequests } from "@/services/online-requests";

type Row = {
  id: number;
  request_number?: string;
  customer_name?: string;
  product_name?: string;
  request_type?: string;
  quantity?: number;
  total_amount?: string | number;
  status?: string;
  status_display?: string;
  created_at?: string;
  source_lead_name?: string;
  source_lead_id?: number;
  converted_product_request_id?: number;
  converted_subscription_request_id?: number;
};

const STATUS_TABS = [
  { label: "All", value: "" },
  { label: "Draft", value: "DRAFT" },
  { label: "Quote Sent", value: "QUOTE_SENT" },
  { label: "Quote Accepted", value: "QUOTE_ACCEPTED" },
  { label: "Approved", value: "APPROVED" },
  { label: "Rejected", value: "REJECTED" },
  { label: "Completed", value: "COMPLETED" },
] as const;

const TYPE_OPTIONS = [
  { label: "All types", value: "" },
  { label: "Advance EMI", value: "ADVANCE_EMI" },
  { label: "Direct Sale", value: "DIRECT_SALE" },
  { label: "Rent", value: "RENT" },
  { label: "Lease", value: "LEASE" },
] as const;

function formatType(t?: string): string {
  const map: Record<string, string> = {
    ADVANCE_EMI: "Advance EMI",
    DIRECT_SALE: "Direct Sale",
    RENT: "Rent",
    LEASE: "Lease",
  };
  return t ? map[t] ?? t : "—";
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function AdminOnlineRequestsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await listAdminOnlineRequests({
        status: statusFilter || undefined,
        request_type: typeFilter || undefined,
        q: search || undefined,
        page,
      });
      const results = Array.isArray(payload?.results) ? payload.results : [];
      setRows(
        results.map((r) => ({
          id: Number(r.id ?? 0),
          request_number: String(r.request_number ?? ""),
          customer_name: String(r.customer_name ?? ""),
          product_name: String(r.product_name ?? ""),
          request_type: String(r.request_type ?? ""),
          quantity: Number(r.quantity ?? 0),
          total_amount: r.total_amount as string | number,
          status: String(r.status ?? ""),
          status_display: String(r.status_display ?? r.status ?? ""),
          created_at: String(r.created_at ?? ""),
          source_lead_name: r.source_lead_name as string | undefined,
          source_lead_id: r.source_lead_id as number | undefined,
          converted_product_request_id: r.converted_product_request_id as number | undefined,
          converted_subscription_request_id: r.converted_subscription_request_id as number | undefined,
        })),
      );
      setCount(Number(payload?.count ?? results.length));
    } catch (err) {
      setError(accountingErrorMessage(err, "Could not load online requests."));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter, search, page]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, typeFilter, search]);

  const activeCount = rows.filter((r) => !["COMPLETED", "REJECTED"].includes(r.status ?? "")).length;
  const completedCount = rows.filter((r) => r.status === "COMPLETED").length;
  const awaitingApprovalCount = rows.filter((r) => ["DRAFT", "QUOTE_SENT", "QUOTE_ACCEPTED"].includes(r.status ?? "")).length;
  const rejectedCount = rows.filter((r) => r.status === "REJECTED").length;

  return (
    <ERPPageShell
      eyebrow="Requests"
      title="Online Requests"
      subtitle="Quote-to-approval workflow for customer purchase, EMI, rent, and lease requests."
      helperNote="Approve requests to auto-create subscriptions or direct sales. No financial posting happens from this page alone."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Requests Hub", href: ROUTES.admin.requestsHub },
        { label: "Online Requests" },
      ]}
      actions={[
        { href: ROUTES.admin.subscriptions, label: "Subscriptions", variant: "secondary" },
        { href: ROUTES.admin.billingDirectSales, label: "Direct Sales", variant: "secondary" },
      ]}
      stats={[
        { label: "Total Requests", value: String(count), tone: "info" as const },
        { label: "Awaiting Approval", value: String(awaitingApprovalCount), tone: awaitingApprovalCount > 0 ? "warning" : ("info" as const) },
        { label: "Completed", value: String(completedCount), tone: "success" as const },
        { label: "Rejected", value: String(rejectedCount), tone: rejectedCount > 0 ? "danger" : ("info" as const) },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      <ERPSectionShell
        title="Request register"
        description="Review, quote, and approve customer online requests. Each approved request auto-creates the corresponding subscription or sale."
      >
        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <label className="flex w-full max-w-[220px] flex-col text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Search
            <input
              className="mt-2 h-10 rounded-xl border border-border bg-background px-3 text-sm font-normal tracking-normal text-foreground outline-none transition focus:border-ring"
              placeholder="Request number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="flex w-full max-w-[180px] flex-col text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Request Type
            <select
              className="mt-2 h-10 rounded-xl border border-border bg-background px-3 text-sm font-normal text-foreground outline-none transition focus:border-ring"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Status tabs */}
        <div className="flex flex-wrap gap-1 mb-4 border-b border-border pb-2">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                statusFilter === tab.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted/50"
              }`}
              onClick={() => setStatusFilter(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? <ERPLoadingState label="Loading online requests..." /> : null}
        {!loading && error ? <ERPErrorState title="Unable to load requests" description={error} /> : null}

        {!loading && !error ? (
          rows.length === 0 ? (
            <ERPEmptyState
              title="No online requests found"
              description="Online requests appear here when customers submit purchase, EMI, rent, or lease requests through the platform."
            />
          ) : (
            <>
              <div className="overflow-auto rounded-xl border border-border bg-card">
                <table className="w-full min-w-[1060px] text-left text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Request #</th>
                      <th className="px-4 py-3">Customer</th>
                      <th className="px-4 py-3">Product</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3 text-right">Qty</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3">Source</th>
                      <th className="px-4 py-3">Conversion</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-t border-border hover:bg-muted/20 transition">
                        <td className="px-4 py-3 font-medium text-foreground">
                          <Link
                            href={`${ROUTES.admin.requestsOnlineRequests}/${row.id}`}
                            className="hover:text-primary hover:underline"
                          >
                            {row.request_number || `#${row.id}`}
                          </Link>
                        </td>
                        <td className="px-4 py-3">{row.customer_name || "—"}</td>
                        <td className="px-4 py-3 text-xs">{row.product_name || "—"}</td>
                        <td className="px-4 py-3">
                          <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium">
                            {formatType(row.request_type)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{row.quantity ?? "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">
                          {formatRupee(row.total_amount)}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {row.source_lead_id ? (
                            <Link
                              href={`/admin/crm/leads?id=${row.source_lead_id}`}
                              className="text-primary hover:underline"
                            >
                              {row.source_lead_name || `Lead #${row.source_lead_id}`}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">Direct</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {row.converted_product_request_id ? (
                            <Link
                              href={`/admin/requests/product-requests/${row.converted_product_request_id}`}
                              className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
                            >
                              PR #{row.converted_product_request_id}
                            </Link>
                          ) : row.converted_subscription_request_id ? (
                            <Link
                              href={`/admin/requests/subscription-requests/${row.converted_subscription_request_id}`}
                              className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-400"
                            >
                              SR #{row.converted_subscription_request_id}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={row.status} label={row.status_display} />
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {formatDate(row.created_at)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            className="inline-flex h-9 items-center rounded-xl border border-border bg-background px-3 text-sm font-semibold transition hover:bg-muted/30"
                            href={`${ROUTES.admin.requestsOnlineRequests}/${row.id}`}
                          >
                            Open
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationControls
                page={page}
                count={count}
                pageSize={20}
                numPages={Math.max(1, Math.ceil(count / 20))}
                hasNext={page * 20 < count}
                hasPrevious={page > 1}
                onNext={() => setPage((p) => p + 1)}
                onPrevious={() => setPage((p) => Math.max(1, p - 1))}
              />
            </>
          )
        ) : null}
      </ERPSectionShell>
    </ERPPageShell>
  );
}
