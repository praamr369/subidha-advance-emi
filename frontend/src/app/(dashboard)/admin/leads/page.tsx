"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
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

function statusTone(status: AdminLeadStatus): string {
  switch (status) {
    case "NEW":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "IN_PROGRESS":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "CONTACTED":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "CONVERTED":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "CLOSED":
      return "border-slate-200 bg-slate-100 text-slate-700";
    default:
      return "border-border bg-muted text-foreground";
  }
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

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
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

  return (
    <PortalPage
      title="Lead Inbox"
      subtitle="Operational intake workspace for public apply submissions, assignment, follow-up, and controlled handoff into customer and subscription creation."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Leads" },
      ]}
      actions={[
        { href: "/apply", label: "Open Public Apply", variant: "secondary" },
        { href: "/admin/customers/create", label: "Create Customer", variant: "secondary" },
      ]}
      stats={stats}
      statusBadge={{ label: "Public Lead Operations", tone: "info" }}
    >
      <div className="space-y-6">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <SummaryCard label="Total" value={summaryValue(summary, "total")} hint="Current filtered queue" />
          <SummaryCard label="New" value={summaryValue(summary, "new")} hint="Unworked submissions" />
          <SummaryCard label="In Progress" value={summaryValue(summary, "in_progress")} hint="Assigned or being worked" />
          <SummaryCard label="Contacted" value={summaryValue(summary, "contacted")} hint="Follow-up has started" />
          <SummaryCard label="Converted" value={summaryValue(summary, "converted")} hint="Moved into real workflow" />
          <SummaryCard label="Closed" value={summaryValue(summary, "closed")} hint="Closed without conversion" />
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div>
            <h2 className="text-base font-semibold text-foreground">Filter Lead Inbox</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Search by lead reference, name, phone, city, product context, or assignee.
            </p>
          </div>

          <form onSubmit={handleApplyFilters} className="mt-4 grid gap-4 lg:grid-cols-5">
            <label className="grid gap-2 lg:col-span-2">
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
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={handleClearFilters}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                Reset
              </button>
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

            <div className="flex items-end">
              <button
                type="button"
                onClick={() => void loadPage("refresh")}
                disabled={loading || refreshing}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </form>
        </section>

        {loading ? <LoadingBlock label="Loading lead inbox..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load lead inbox"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error ? (
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-foreground">Lead Queue</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Public-site enquiries ready for assignment, contact, and controlled handoff.
                </p>
              </div>
            </div>

            {rows.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  title="No leads found"
                  description="No lead rows match the current filter set."
                />
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-0">
                  <thead>
                    <tr className="text-left">
                      <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Lead
                      </th>
                      <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Contact
                      </th>
                      <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Product Context
                      </th>
                      <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Workflow
                      </th>
                      <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Assignee
                      </th>
                      <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="align-top">
                        <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                          <div className="font-medium">Lead #{row.id}</div>
                          <div className="mt-1 text-sm text-foreground">{row.name}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Created {formatDateTime(row.created_at)}
                          </div>
                        </td>
                        <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                          <div>{row.phone || "—"}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {row.city || "No city submitted"}
                          </div>
                        </td>
                        <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                          <div className="font-medium">
                            {row.product_name || row.interested_product || "No product context"}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {row.product_code || "Free-text lead context"}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Preferred EMI:{" "}
                            {row.preferred_emi_amount ? `₹${row.preferred_emi_amount}` : "—"}
                          </div>
                        </td>
                        <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                          <span
                            className={[
                              "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
                              statusTone(row.status),
                            ].join(" ")}
                          >
                            {row.status.replace("_", " ")}
                          </span>
                          <div className="mt-2 text-xs text-muted-foreground">
                            Contacted {formatDateTime(row.contacted_at)}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Converted {formatDateTime(row.converted_at)}
                          </div>
                        </td>
                        <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                          <div className="font-medium">
                            {row.assigned_to_full_name || row.assigned_to_username || "Unassigned"}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {row.assigned_to_role || "No owner"}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Assigned {formatDateTime(row.assigned_at)}
                          </div>
                        </td>
                        <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                          <Link
                            href={`/admin/leads/${row.id}`}
                            className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-muted"
                          >
                            Open Detail
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}
      </div>
    </PortalPage>
  );
}
