"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { ControlLaneGrid } from "@/components/admin/control-center/ControlLanes";
import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ActionButton from "@/components/ui/ActionButton";
import DataTable, { type Column } from "@/components/ui/DataTable";
import PortalPage from "@/components/ui/PortalPage";
import StatCard from "@/components/ui/StatCard";
import StatusBadge from "@/components/ui/status-badge";
import TableToolbar from "@/components/ui/TableToolbar";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import {
  listAdminLeads,
  type AdminLeadListQuery,
  type AdminLeadRow,
  type AdminLeadStatus,
  type AdminLeadSummary,
} from "@/services/admin-leads";
import {
  listInternalUsers,
  type InternalUserRecord,
} from "@/services/internal-users";

type LeadFilters = {
  q: string;
  status: AdminLeadStatus | "";
  assignee: string;
  date_from: string;
  date_to: string;
};

const DEFAULT_FILTERS: LeadFilters = {
  q: "",
  status: "",
  assignee: "",
  date_from: "",
  date_to: "",
};

const EMPTY_SUMMARY: AdminLeadSummary = {
  total: 0,
  new: 0,
  in_progress: 0,
  contacted: 0,
  converted: 0,
  closed: 0,
  assigned: 0,
  unassigned: 0,
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Unable to load lead inbox.";
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString("en-IN");
}

function summaryValue(summary: AdminLeadSummary, key: keyof AdminLeadSummary): string {
  return String(summary[key] ?? 0);
}

function readFilters(searchParams: URLSearchParams): LeadFilters {
  const status = (searchParams.get("status") || "").trim().toUpperCase();
  const normalizedStatus: LeadFilters["status"] =
    status === "NEW" ||
    status === "IN_PROGRESS" ||
    status === "CONTACTED" ||
    status === "CONVERTED" ||
    status === "CLOSED"
      ? status
      : "";

  return {
    q: (searchParams.get("q") || "").trim(),
    status: normalizedStatus,
    assignee: (searchParams.get("assignee") || "").trim(),
    date_from: (searchParams.get("date_from") || "").trim(),
    date_to: (searchParams.get("date_to") || "").trim(),
  };
}

function buildQuery(filters: LeadFilters): string {
  const params = new URLSearchParams();

  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.status) params.set("status", filters.status);
  if (filters.assignee.trim()) params.set("assignee", filters.assignee.trim());
  if (filters.date_from.trim()) params.set("date_from", filters.date_from.trim());
  if (filters.date_to.trim()) params.set("date_to", filters.date_to.trim());

  return params.toString();
}

export default function AdminLeadsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamKey = searchParams.toString();

  const [draftFilters, setDraftFilters] = useState<LeadFilters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<LeadFilters>(DEFAULT_FILTERS);

  const [rows, setRows] = useState<AdminLeadRow[]>([]);
  const [count, setCount] = useState(0);
  const [summary, setSummary] = useState<AdminLeadSummary>(EMPTY_SUMMARY);
  const [assignees, setAssignees] = useState<InternalUserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const nextFilters = readFilters(new URLSearchParams(searchParamKey));
    setDraftFilters(nextFilters);
    setAppliedFilters(nextFilters);
  }, [searchParamKey]);

  useEffect(() => {
    let cancelled = false;

    async function loadAssignees() {
      try {
        const response = await listInternalUsers({ is_active: "true" });
        if (!cancelled) {
          setAssignees(response.results);
        }
      } catch {
        if (!cancelled) {
          setAssignees([]);
        }
      }
    }

    void loadAssignees();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);

      try {
        const query: AdminLeadListQuery = {
          q: appliedFilters.q,
          status: appliedFilters.status,
          assignee: appliedFilters.assignee,
          date_from: appliedFilters.date_from,
          date_to: appliedFilters.date_to,
        };
        const response = await listAdminLeads(query);

        setRows(response.results);
        setCount(response.count);
        setSummary(response.summary || EMPTY_SUMMARY);
        setError(null);
      } catch (err) {
        setRows([]);
        setCount(0);
        setSummary(EMPTY_SUMMARY);
        setError(toErrorMessage(err));
      } finally {
        if (mode === "initial") setLoading(false);
        else setRefreshing(false);
      }
    },
    [appliedFilters]
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  function handleDraftChange(
    field: keyof LeadFilters,
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    const value = event.target.value;
    setDraftFilters((current) => ({ ...current, [field]: value }));
  }

  function syncUrl(nextFilters: LeadFilters) {
    const query = buildQuery(nextFilters);
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function handleApplyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    syncUrl(draftFilters);
  }

  function handleClearFilters() {
    setDraftFilters(DEFAULT_FILTERS);
    syncUrl(DEFAULT_FILTERS);
  }

  const stats = useMemo(
    () => [
      {
        label: "Matched Leads",
        value: String(count),
      },
      {
        label: "Unassigned",
        value: summaryValue(summary, "unassigned"),
        tone: "warning" as const,
      },
      {
        label: "Contacted",
        value: summaryValue(summary, "contacted"),
      },
      {
        label: "Converted",
        value: summaryValue(summary, "converted"),
        tone: "success" as const,
      },
    ],
    [count, summary]
  );

  const columns = useMemo<Column<AdminLeadRow>[]>(
    () => [
      {
        key: "name",
        title: "Lead",
        render: (row) => (
          <div className="space-y-1">
            <div className="font-medium text-foreground">Lead #{row.id}</div>
            <div className="text-sm text-foreground">{row.name}</div>
            <div className="text-xs text-muted-foreground">
              Created {formatDateTime(row.created_at)}
            </div>
          </div>
        ),
      },
      {
        key: "phone",
        title: "Contact",
        render: (row) => (
          <div className="space-y-1">
            <div className="text-sm text-foreground">{row.phone || "—"}</div>
            <div className="text-xs text-muted-foreground">
              {row.city || "No city submitted"}
            </div>
          </div>
        ),
      },
      {
        key: "product_name",
        title: "Product Context",
        render: (row) => (
          <div className="space-y-1">
            <div className="font-medium text-foreground">
              {row.product_name || row.interested_product || "No product context"}
            </div>
            <div className="text-xs text-muted-foreground">
              {row.product_code || "Free-text lead context"}
            </div>
            <div className="text-xs text-muted-foreground">
              Preferred EMI: {row.preferred_emi_amount ? `₹${row.preferred_emi_amount}` : "—"}
            </div>
          </div>
        ),
      },
      {
        key: "status",
        title: "Workflow",
        render: (row) => (
          <div className="space-y-2">
            <StatusBadge status={row.status} />
            <div className="text-xs text-muted-foreground">
              {row.follow_up_state || "NONE"} · {row.open_follow_up_count ?? 0} open follow-ups
            </div>
            <div className="text-xs text-muted-foreground">
              {row.converted_subscription_number ||
                row.converted_customer_name ||
                row.converted_direct_sale_no ||
                "No live handoff yet"}
            </div>
          </div>
        ),
      },
      {
        key: "assigned_to_full_name",
        title: "Assignee",
        render: (row) => (
          <div className="space-y-1">
            <div className="font-medium text-foreground">
              {row.assigned_to_full_name || row.assigned_to_username || "Unassigned"}
            </div>
            <div className="text-xs text-muted-foreground">
              {row.assigned_to_role || "No owner"}
            </div>
            <div className="text-xs text-muted-foreground">
              Assigned {formatDateTime(row.assigned_at)}
            </div>
          </div>
        ),
      },
    ],
    []
  );

  return (
    <PortalPage
      eyebrow="Lead Operations"
      title="Lead Inbox"
      subtitle="Operational intake workspace for public apply submissions, assignment, follow-up, and controlled handoff into customer and subscription creation."
      helperNote="Lead inbox is the triage rail for new enquiries. CRM lead register stays separate for continuity and party-linked follow-up."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Sales & Onboarding", href: ROUTES.admin.leads },
        { label: "Leads" },
      ]}
      actions={[
        { href: "/apply", label: "Open Public Apply", variant: "secondary" },
        {
          href: `${ROUTES.admin.customers}/create`,
          label: "Create Customer",
          variant: "secondary",
        },
        {
          href: ROUTES.admin.subscriptionsCreate,
          label: "Create Subscription",
          variant: "secondary",
        },
      ]}
      stats={stats}
      statusBadge={{ label: "Public Lead Operations", tone: "info" }}
    >
      <div className="space-y-6">
        <ControlLaneGrid
          title="Lead operation lanes"
          description="Public lead intake, CRM continuity, customer creation, and billing conversion remain separate route-safe workflows."
          lanes={[
            {
              title: "CRM overview",
              description: "Cross-party CRM posture and follow-up visibility.",
              href: ROUTES.admin.crm,
              badge: "CRM",
            },
            {
              title: "CRM lead register",
              description: "Party-linked lead register for continuity review.",
              href: ROUTES.admin.crmLeads,
              badge: "Register",
            },
            {
              title: "Customer register",
              description: "Create or review customer records after controlled conversion.",
              href: ROUTES.admin.customers,
              badge: "Customer",
            },
            {
              title: "Direct sales lane",
              description: "Retail conversion and billing stay outside the lead inbox itself.",
              href: ROUTES.admin.billingDirectSales,
              badge: "Billing",
            },
          ]}
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <StatCard label="Total" value={summaryValue(summary, "total")} subtext="Current filtered queue" />
          <StatCard label="New" value={summaryValue(summary, "new")} subtext="Unworked submissions" />
          <StatCard
            label="In Progress"
            value={summaryValue(summary, "in_progress")}
            subtext="Assigned or being worked"
            tone="warning"
          />
          <StatCard
            label="Contacted"
            value={summaryValue(summary, "contacted")}
            subtext="Follow-up has started"
          />
          <StatCard
            label="Converted"
            value={summaryValue(summary, "converted")}
            subtext="Moved into real workflow"
            tone="success"
          />
          <StatCard label="Closed" value={summaryValue(summary, "closed")} subtext="Closed without conversion" />
        </div>

        <WorkspaceSection
          title="Lead queue controls"
          description="Search by lead reference, name, phone, city, product context, or assignee before routing a row into the correct operational workflow."
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
            title="Filter lead inbox"
            description="Use search, status, assignee, and created-date filters to reduce noise in the intake queue."
            footer={
              <div className="text-sm text-muted-foreground">
                {appliedFilters.q || appliedFilters.status || appliedFilters.assignee
                  ? `Active filters applied${appliedFilters.status ? ` · ${appliedFilters.status}` : ""}`
                  : "Search-first lead workflow for daily staff operations."}
              </div>
            }
          >
            <form
              onSubmit={handleApplyFilters}
              className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_180px_220px_auto]"
            >
              <label className="grid gap-2">
                <span className="text-sm font-medium text-foreground">Search</span>
                <input
                  value={draftFilters.q}
                  onChange={(event) => handleDraftChange("q", event)}
                  placeholder="Lead #, name, phone, product, assignee"
                  className="h-10 rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-foreground">Status</span>
                <select
                  value={draftFilters.status}
                  onChange={(event) => handleDraftChange("status", event)}
                  className="h-10 rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
                >
                  <option value="">All</option>
                  <option value="NEW">New</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="CONTACTED">Contacted</option>
                  <option value="CONVERTED">Converted</option>
                  <option value="CLOSED">Closed</option>
                </select>
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-foreground">Assignee</span>
                <select
                  value={draftFilters.assignee}
                  onChange={(event) => handleDraftChange("assignee", event)}
                  className="h-10 rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
                >
                  <option value="">All</option>
                  <option value="unassigned">Unassigned</option>
                  {assignees.map((user) => (
                    <option key={user.id} value={String(user.id)}>
                      {user.full_name || user.username} ({user.role})
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex flex-wrap items-end gap-2">
                <ActionButton type="submit" variant="primary">
                  Apply
                </ActionButton>
                <ActionButton type="button" variant="outline" onClick={handleClearFilters}>
                  Reset
                </ActionButton>
              </div>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-foreground">Created From</span>
                <input
                  type="date"
                  value={draftFilters.date_from}
                  onChange={(event) => handleDraftChange("date_from", event)}
                  className="h-10 rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-foreground">Created To</span>
                <input
                  type="date"
                  value={draftFilters.date_to}
                  onChange={(event) => handleDraftChange("date_to", event)}
                  className="h-10 rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
                />
              </label>
            </form>
          </TableToolbar>

          <div className="mt-5">
            {loading ? <LoadingBlock label="Loading lead inbox..." /> : null}

            {!loading && error ? (
              <ErrorState
                title="Unable to load lead inbox"
                description={error}
                onRetry={() => void loadPage("initial")}
              />
            ) : null}

            {!loading && !error ? (
              rows.length === 0 ? (
                <EmptyState
                  title="No leads found"
                  description="No lead rows match the current filter set."
                />
              ) : (
                <DataTable<AdminLeadRow>
                  rows={rows}
                  columns={columns}
                  pageSize={12}
                  onRowClick={(row) => router.push(`${ROUTES.admin.leads}/${row.id}`)}
                  rowActions={(row) => (
                    <div className="flex flex-col items-end gap-2">
                      <ActionButton href={`${ROUTES.admin.leads}/${row.id}`} size="sm" variant="primary">
                        Open Lead
                      </ActionButton>
                      {typeof row.converted_customer_id === "number" ? (
                        <ActionButton
                          href={`${ROUTES.admin.customers}/${row.converted_customer_id}`}
                          size="sm"
                          variant="outline"
                        >
                          Customer
                        </ActionButton>
                      ) : null}
                      {typeof row.converted_subscription_id === "number" ? (
                        <ActionButton
                          href={`${ROUTES.admin.subscriptions}/${row.converted_subscription_id}`}
                          size="sm"
                          variant="outline"
                        >
                          Subscription
                        </ActionButton>
                      ) : null}
                    </div>
                  )}
                />
              )
            ) : null}
          </div>
        </WorkspaceSection>
      </div>
    </PortalPage>
  );
}
