"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ControlLaneGrid } from "@/components/admin/control-center/ControlLanes";
import { CustomerIntelligenceTrigger } from "@/components/customer-intelligence/CustomerIntelligenceTrigger";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import ActionButton from "@/components/ui/ActionButton";
import DataTable from "@/components/ui/DataTable";
import StatCard from "@/components/ui/StatCard";
import TableToolbar from "@/components/ui/TableToolbar";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import { formatRupee } from "@/lib/utils/currency";
import {
  listAdminSupportRequests,
  type AdminSupportRequest,
  type AdminSupportRequestStatus,
} from "@/services/admin-support-requests";


function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load support requests.";
}

function normalizeStatusFilter(value: string): AdminSupportRequestStatus | "" {
  if (value === "SUBMITTED" || value === "UNDER_REVIEW" || value === "CLOSED") {
    return value;
  }
  return "";
}

export default function AdminSupportRequestsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const q = (searchParams.get("q") || "").trim();
  const statusFilter = normalizeStatusFilter(
    (searchParams.get("status") || "").trim().toUpperCase()
  );
  const categoryFilter = (searchParams.get("category") || "").trim();
  const currentQuery = searchParams.toString();

  const [searchInput, setSearchInput] = useState(q);
  const [statusInput, setStatusInput] = useState(statusFilter);
  const [categoryInput, setCategoryInput] = useState(categoryFilter);
  const [rows, setRows] = useState<AdminSupportRequest[]>([]);
  const [count, setCount] = useState(0);
  const [summary, setSummary] = useState({
    total: 0,
    submitted: 0,
    under_review: 0,
    closed: 0,
    assigned: 0,
    unassigned: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSearchInput(q);
    setStatusInput(statusFilter);
    setCategoryInput(categoryFilter);
  }, [q, statusFilter, categoryFilter]);

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      try {
        const payload = await listAdminSupportRequests({
          q: q || undefined,
          status: statusFilter || undefined,
          category: categoryFilter || undefined,
        });

        setRows(payload.results);
        setCount(payload.count);
        setSummary(payload.summary);
        setError(null);
      } catch (err) {
        setError(toErrorMessage(err));
        if (mode === "initial") {
          setRows([]);
          setCount(0);
          setSummary({
            total: 0,
            submitted: 0,
            under_review: 0,
            closed: 0,
            assigned: 0,
            unassigned: 0,
          });
        }
      } finally {
        if (mode === "initial") {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    },
    [categoryFilter, q, statusFilter]
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  const columns = useMemo(
    () => [
      {
        key: "id",
        title: "Request",
        render: (row: AdminSupportRequest) => (
          <div>
            <div className="font-medium text-foreground">#{row.id}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {formatDateTime(row.created_at)}
            </div>
          </div>
        ),
      },
      {
        key: "customer_name",
        title: "Customer",
        render: (row: AdminSupportRequest) => (
          <div>
            <div className="font-medium text-foreground">
              <CustomerIntelligenceTrigger
                customerId={row.customer}
                customerName={row.customer_name || "—"}
                scope="admin"
              />
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {row.customer_phone || "—"}
            </div>
          </div>
        ),
      },
      {
        key: "category",
        title: "Category",
      },
      {
        key: "message",
        title: "Issue",
        render: (row: AdminSupportRequest) => (
          <div className="max-w-xl">
            <div className="line-clamp-2 text-sm text-foreground">{row.message}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {row.payment_reference_no
                ? `Ref ${row.payment_reference_no}`
                : row.payment
                  ? `Payment #${row.payment}`
                  : "No payment attached"}
              {" · "}
              {row.subscription_number ||
                (row.subscription ? `SUB-${row.subscription}` : "No subscription")}
            </div>
          </div>
        ),
      },
      {
        key: "status",
        title: "Status",
        render: (row: AdminSupportRequest) => <ERPStatusBadge status={row.status} hideIcon />,
      },
      {
        key: "assigned_to_full_name",
        title: "Owner",
        render: (row: AdminSupportRequest) =>
          row.assigned_to_full_name ||
          row.assigned_to_username ||
          "Unassigned",
      },
      {
        key: "payment_amount",
        title: "Payment",
        align: "right" as const,
        render: (row: AdminSupportRequest) =>
          row.payment_amount ? formatRupee(row.payment_amount) : "—",
      },
    ],
    []
  );

  function applyFilters() {
    const next = new URLSearchParams();

    if (searchInput.trim()) next.set("q", searchInput.trim());
    if (statusInput.trim()) next.set("status", statusInput.trim());
    if (categoryInput.trim()) next.set("category", categoryInput.trim());

    const query = next.toString();
    router.replace(query ? `/admin/support-requests?${query}` : "/admin/support-requests");
  }

  function clearFilters() {
    setSearchInput("");
    setStatusInput("");
    setCategoryInput("");
    router.replace("/admin/support-requests");
  }

  return (
    <ERPPageShell
      eyebrow="Support Triage"
      title="Support Requests"
      subtitle="Customer-submitted support and dispute intake with receipt and subscription context."
      helperNote="Support intake remains distinct from service-desk case execution and from payment or accounting posting. Use this queue for first review and routing."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Control Center", href: ROUTES.admin.dashboard },
        { label: "Support Requests" },
      ]}
      actions={[
        {
          href: ROUTES.admin.serviceDesk,
          label: "Service Desk",
          variant: "primary",
        },
        {
          href: ROUTES.admin.customers,
          label: "Customers",
          variant: "secondary",
        },
        {
          href: ROUTES.admin.payments,
          label: "Payments",
          variant: "secondary",
        },
      ]}
      stats={[
        { label: "Visible", value: String(count) },
        { label: "Submitted", value: String(summary.submitted), tone: "warning" },
        { label: "Under Review", value: String(summary.under_review) },
        { label: "Closed", value: String(summary.closed) },
        { label: "Assigned", value: String(summary.assigned) },
      ]}
      statusBadge={{ label: "Customer Support Intake", tone: "info" }}
      headerMode="erp"
    >
      <div className="space-y-6">
        <ControlLaneGrid
          title="Support lanes"
          description="Customer support intake, service handling, payments, and customer master data stay cross-linked but operationally separate."
          lanes={[
            {
              title: "Service desk",
              description: "Escalate complaints, returns, and service tickets into explicit after-sales cases.",
              href: ROUTES.admin.serviceDesk,
              badge: "Escalate",
            },
            {
              title: "Customer register",
              description: "Open the canonical customer module for profile and KYC context.",
              href: ROUTES.admin.customers,
              badge: "Customer",
            },
            {
              title: "Payments register",
              description: "Review linked payment rows without folding support into finance execution.",
              href: ROUTES.admin.payments,
              badge: "Payment",
            },
          ]}
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Visible Queue" value={String(count)} tone="info" />
          <StatCard
            label="Submitted"
            value={String(summary.submitted)}
            tone={summary.submitted > 0 ? "warning" : "success"}
          />
          <StatCard label="Under Review" value={String(summary.under_review)} />
          <StatCard
            label="Unassigned"
            value={String(summary.unassigned)}
            tone={summary.unassigned > 0 ? "warning" : "success"}
          />
        </div>

        <WorkspaceSection
          title="Support queue controls"
          description="Search support intake by customer, status, category, payment reference, or request id before routing the issue into detail review or service escalation."
          action={
            <ActionButton
              type="button"
              variant="outline"
              onClick={() => void loadPage("refresh")}
              disabled={loading || refreshing}
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </ActionButton>
          }
        >
          <TableToolbar
            title="Filter support intake"
            description="Keep triage fast by narrowing the queue before you jump into customer, subscription, or payment context."
            footer={
              <div className="text-sm text-muted-foreground">
                {q || statusFilter || categoryFilter
                  ? `Filtered view${statusFilter ? ` · ${statusFilter}` : ""}${categoryFilter ? ` · ${categoryFilter}` : ""}`
                  : "Queue shows the full support intake scope."}
              </div>
            }
          >
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_220px_auto]">
              <div>
                <label
                  htmlFor="support-request-search"
                  className="mb-2 block text-sm font-medium text-foreground"
                >
                  Search
                </label>
                <input
                  id="support-request-search"
                  type="text"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Customer, phone, payment ref, request id"
                  className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
                />
              </div>

              <div>
                <label
                  htmlFor="support-request-status"
                  className="mb-2 block text-sm font-medium text-foreground"
                >
                  Status
                </label>
                <select
                  id="support-request-status"
                  value={statusInput}
                  onChange={(event) =>
                    setStatusInput(
                      normalizeStatusFilter(event.target.value.trim().toUpperCase())
                    )
                  }
                  className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
                >
                  <option value="">All statuses</option>
                  <option value="SUBMITTED">Submitted</option>
                  <option value="UNDER_REVIEW">Under Review</option>
                  <option value="CLOSED">Closed</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="support-request-category"
                  className="mb-2 block text-sm font-medium text-foreground"
                >
                  Category
                </label>
                <select
                  id="support-request-category"
                  value={categoryInput}
                  onChange={(event) => setCategoryInput(event.target.value)}
                  className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
                >
                  <option value="">All categories</option>
                  <option value="PAYMENT_ISSUE">Payment issue</option>
                  <option value="RECEIPT_ISSUE">Receipt issue</option>
                  <option value="EMI_ISSUE">EMI issue</option>
                  <option value="SUBSCRIPTION_QUERY">Subscription query</option>
                  <option value="DRAW_QUERY">Lucky draw query</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div className="flex flex-wrap items-end gap-2">
                <ActionButton type="button" variant="primary" onClick={applyFilters}>
                  Apply
                </ActionButton>
                <ActionButton type="button" variant="outline" onClick={clearFilters}>
                  Clear
                </ActionButton>
              </div>
            </div>
          </TableToolbar>

          <div className="mt-5">
            {loading ? <ERPLoadingState label="Loading support requests..." /> : null}

            {!loading && error ? (
              <ERPErrorState
                title="Unable to load support requests"
                description={error}
                onRetry={() => void loadPage("initial")}
              />
            ) : null}

            {!loading && !error && rows.length === 0 ? (
              <ERPEmptyState
                title="No support requests"
                description="No customer-submitted support issues matched the current filters."
              />
            ) : null}

            {!loading && !error && rows.length > 0 ? (
              <DataTable<AdminSupportRequest>
                rows={rows}
                columns={columns}
                rowActions={(row) => (
                  <div className="flex flex-wrap justify-end gap-2">
                    <ActionButton
                      href={`/admin/support-requests/${row.id}${currentQuery ? `?${currentQuery}` : ""}`}
                      size="sm"
                      variant="primary"
                    >
                      View Detail
                    </ActionButton>
                    {typeof row.customer === "number" ? (
                      <ActionButton
                        href={`/admin/customers/${row.customer}`}
                        size="sm"
                        variant="outline"
                      >
                        Customer
                      </ActionButton>
                    ) : null}
                    {typeof row.subscription === "number" ? (
                      <ActionButton
                        href={`/admin/subscriptions/${row.subscription}`}
                        size="sm"
                        variant="outline"
                      >
                        Subscription
                      </ActionButton>
                    ) : null}
                    {typeof row.payment === "number" ? (
                      <ActionButton
                        href={`/admin/payments/${row.payment}`}
                        size="sm"
                        variant="outline"
                      >
                        Payment
                      </ActionButton>
                    ) : null}
                  </div>
                )}
              />
            ) : null}
          </div>
        </WorkspaceSection>
      </div>
    </ERPPageShell>
  );
}
