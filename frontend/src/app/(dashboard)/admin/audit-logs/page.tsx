"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import StatusBadge from "@/components/ui/status-badge";
import TableToolbar from "@/components/ui/TableToolbar";
import { DataTableShell, MobileSafeTable } from "@/components/ui/operations";
import { apiFetch } from "@/lib/api";
import { downloadCsv } from "@/lib/export/csv";
import { buildAdminReconciliationRoute } from "@/lib/route-builders";

type AuditLog = {
  id: number;
  action_type: string;
  model_name: string;
  object_id: number | string | null;
  performed_by: number | null;
  performed_by_username: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type AuditLogListResponse =
  | AuditLog[]
  | {
      count?: number;
      next?: string | null;
      previous?: string | null;
      results?: AuditLog[];
    };

type AuditLogRow = {
  id: number;
  action_type: string;
  model_name: string;
  object_id: number | string | null;
  performed_by: number | null;
  performed_by_username: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type AuditLogSummary = {
  totalRows: number;
  financialRows: number;
  systemRows: number;
  userRows: number;
};

function toAuditRows(payload: AuditLogListResponse): AuditLogRow[] {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.results)
      ? payload.results
      : [];

  return rows.map((row) => ({
    id: Number(row.id ?? 0),
    action_type:
      typeof row.action_type === "string" ? row.action_type : "UNKNOWN",
    model_name: typeof row.model_name === "string" ? row.model_name : "Unknown",
    object_id:
      typeof row.object_id === "number" || typeof row.object_id === "string"
        ? row.object_id
        : null,
    performed_by:
      typeof row.performed_by === "number" ? row.performed_by : null,
    performed_by_username:
      typeof row.performed_by_username === "string"
        ? row.performed_by_username
        : null,
    metadata:
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? row.metadata
        : null,
    created_at: typeof row.created_at === "string" ? row.created_at : "",
  }));
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load audit logs.";
}

function getMetadataPreview(
  metadata: Record<string, unknown> | null | undefined
): string {
  if (!metadata) return "No metadata";

  const preferredKeys = [
    "reason",
    "note",
    "message",
    "detail",
    "status",
    "old_status",
    "new_status",
    "payment_id",
    "subscription_id",
    "emi_id",
    "batch_id",
    "lucky_id",
  ];

  for (const key of preferredKeys) {
    const value = metadata[key];
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return `${key}: ${String(value)}`;
    }
  }

  const keys = Object.keys(metadata);
  if (keys.length === 0) return "No metadata";
  if (keys.length <= 3) return keys.join(", ");
  return `${keys.slice(0, 3).join(", ")} +${keys.length - 3} more`;
}

function isFinancialRow(row: AuditLogRow): boolean {
  const financialModels = new Set([
    "payment",
    "financialledger",
    "emi",
    "subscription",
    "commission",
    "payoutbatch",
    "reconciliation",
    "luckydraw",
  ]);

  const financialActions = [
    "PAY",
    "COLLECT",
    "REVERSE",
    "WAIVE",
    "RECONCILE",
    "SETTLE",
    "PAYOUT",
    "DRAW",
  ];

  const model = row.model_name.trim().toLowerCase();
  const action = row.action_type.trim().toUpperCase();

  return (
    financialModels.has(model) ||
    financialActions.some((item) => action.includes(item))
  );
}

function isSystemRow(row: AuditLogRow): boolean {
  const action = row.action_type.trim().toUpperCase();
  return (
    action.includes("LOGIN") ||
    action.includes("LOGOUT") ||
    action.includes("TOKEN") ||
    action.includes("AUTH") ||
    action.includes("REFRESH") ||
    action.includes("SESSION")
  );
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function AdminAuditLogsPage() {
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [queryInput, setQueryInput] = useState("");
  const [modelInput, setModelInput] = useState("");
  const [actionInput, setActionInput] = useState("");

  const [query, setQuery] = useState("");
  const [modelFilter, setModelFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");

  const loadLogs = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      setError(null);

      try {
        const params = new URLSearchParams();

        if (query.trim()) params.set("q", query.trim());
        if (modelFilter.trim()) params.set("model_name", modelFilter.trim());
        if (actionFilter.trim()) params.set("action_type", actionFilter.trim());

        const queryString = params.toString();
        const payload = await apiFetch<AuditLogListResponse>(
          `/admin/audit-logs/${queryString ? `?${queryString}` : ""}`
        );

        setRows(toAuditRows(payload));
      } catch (err) {
        setError(toErrorMessage(err));
        if (mode === "initial") {
          setRows([]);
        }
      } finally {
        if (mode === "initial") {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    },
    [query, modelFilter, actionFilter]
  );

  useEffect(() => {
    void loadLogs("initial");
  }, [loadLogs]);

  function handleApplyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(queryInput.trim());
    setModelFilter(modelInput.trim());
    setActionFilter(actionInput.trim());
  }

  function handleResetFilters() {
    setQueryInput("");
    setModelInput("");
    setActionInput("");

    setQuery("");
    setModelFilter("");
    setActionFilter("");
  }

  const summary = useMemo<AuditLogSummary>(() => {
    return rows.reduce<AuditLogSummary>(
      (acc, row) => {
        acc.totalRows += 1;

        if (isFinancialRow(row)) acc.financialRows += 1;
        else if (isSystemRow(row)) acc.systemRows += 1;
        else acc.userRows += 1;

        return acc;
      },
      {
        totalRows: 0,
        financialRows: 0,
        systemRows: 0,
        userRows: 0,
      }
    );
  }, [rows]);

  const exportRows = useMemo(
    () =>
      rows.map((row) => ({
        id: row.id,
        action_type: row.action_type,
        model_name: row.model_name,
        object_id: row.object_id ?? "",
        performed_by_username: row.performed_by_username ?? "",
        created_at: row.created_at,
        metadata_preview: getMetadataPreview(row.metadata),
        metadata_json: row.metadata ? JSON.stringify(row.metadata) : "",
      })),
    [rows]
  );

  return (
    <PortalPage
      title="Audit Logs"
      subtitle="Operational and financial system audit trail with searchable event visibility for admin review."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Audit Logs" },
      ]}
      actions={[
        {
          href: "/admin/payments",
          label: "Open Payments",
          variant: "secondary",
        },
        {
          href: buildAdminReconciliationRoute(),
          label: "Open Reconciliation",
          variant: "primary",
        },
      ]}
      stats={[
        {
          label: "Visible Rows",
          value: String(summary.totalRows),
        },
        {
          label: "Financial Events",
          value: String(summary.financialRows),
          tone: summary.financialRows > 0 ? "success" : undefined,
        },
        {
          label: "System Events",
          value: String(summary.systemRows),
        },
        {
          label: "Other Events",
          value: String(summary.userRows),
        },
      ]}
      statusBadge={{
        label: "Audit Trail",
        tone: "info",
      }}
    >
      <div className="space-y-6">
        <TableToolbar
          title="Filter Audit Trail"
          description="Search by event content and narrow by model or action for finance, auth, and operational investigation."
        >
          <form
            onSubmit={handleApplyFilters}
            className="grid gap-4 lg:grid-cols-4"
          >
            <div className="lg:col-span-2">
              <label
                htmlFor="audit-q"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                Search
              </label>
              <input
                id="audit-q"
                type="text"
                value={queryInput}
                onChange={(event) => setQueryInput(event.target.value)}
                placeholder="Search action, model, user, object id, metadata"
                className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
              />
            </div>

            <div>
              <label
                htmlFor="audit-model"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                Model
              </label>
              <input
                id="audit-model"
                type="text"
                value={modelInput}
                onChange={(event) => setModelInput(event.target.value)}
                placeholder="payment, subscription"
                className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
              />
            </div>

            <div>
              <label
                htmlFor="audit-action"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                Action
              </label>
              <input
                id="audit-action"
                type="text"
                value={actionInput}
                onChange={(event) => setActionInput(event.target.value)}
                placeholder="PAYMENT_REVERSED, LOGIN"
                className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
              />
            </div>

            <div className="flex flex-wrap items-end gap-2 lg:col-span-4">
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95"
              >
                Apply Filters
              </button>

              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                Reset Filters
              </button>

              <button
                type="button"
                onClick={() => void loadLogs("refresh")}
                disabled={refreshing || loading}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>

              <button
                type="button"
                disabled={exportRows.length === 0 || loading}
                onClick={() =>
                  downloadCsv(
                    "audit-logs-current-view.csv",
                    [
                      { key: "id", header: "id" },
                      { key: "action_type", header: "action_type" },
                      { key: "model_name", header: "model_name" },
                      { key: "object_id", header: "object_id" },
                      {
                        key: "performed_by_username",
                        header: "performed_by_username",
                      },
                      { key: "created_at", header: "created_at" },
                      { key: "metadata_preview", header: "metadata_preview" },
                      { key: "metadata_json", header: "metadata_json" },
                    ],
                    exportRows
                  )
                }
                className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-foreground px-4 text-sm font-medium text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Export Current View
              </button>
            </div>
          </form>
        </TableToolbar>

        {loading ? <LoadingBlock label="Loading audit logs..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load audit logs"
            description={error}
            onRetry={() => void loadLogs("initial")}
          />
        ) : null}

        {!loading && !error ? (
          <SectionCard
            title="Audit Event Rows"
            description="Review immutable event history for payment, subscription, draw, reconciliation, auth, and operator actions."
          >
            {rows.length === 0 ? (
              <EmptyState
                title="No audit records found"
                description="No audit records match the current filter set."
              />
            ) : (
              <DataTableShell>
                <MobileSafeTable className="border-none bg-transparent">
                  <table className="min-w-full border-separate border-spacing-0">
                  <thead>
                    <tr className="text-left">
                      <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Event
                      </th>
                      <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Class
                      </th>
                      <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Model
                      </th>
                      <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Object
                      </th>
                      <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        User
                      </th>
                      <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Metadata
                      </th>
                      <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Time
                      </th>
                      <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {rows.map((row) => {
                      const modelName = row.model_name.trim().toLowerCase();
                      const objectId = row.object_id;
                      const canOpenPayment =
                        modelName === "payment" &&
                        (typeof objectId === "number" ||
                          typeof objectId === "string");
                      const canOpenSubscription =
                        modelName === "subscription" &&
                        (typeof objectId === "number" ||
                          typeof objectId === "string");

                      return (
                        <tr key={row.id} className="align-top">
                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <div className="font-medium">#{row.id}</div>
                            <div className="mt-1 text-xs text-muted-foreground">{row.action_type}</div>
                          </td>
                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <StatusBadge
                              status={
                                isFinancialRow(row)
                                  ? "COMPLETED"
                                  : isSystemRow(row)
                                    ? "LOCKED"
                                    : "OPEN"
                              }
                            />
                          </td>

                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <div className="font-medium">{row.model_name}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {isFinancialRow(row)
                                ? "Financial event"
                                : isSystemRow(row)
                                  ? "System/auth event"
                                  : "Operational event"}
                            </div>
                          </td>

                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <div className="font-medium">
                              {row.object_id ?? "—"}
                            </div>
                          </td>

                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <div className="font-medium">
                              {row.performed_by_username || "System"}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {row.performed_by !== null
                                ? `User ID ${row.performed_by}`
                                : "No user reference"}
                            </div>
                          </td>

                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <div className="max-w-sm font-medium">
                              {getMetadataPreview(row.metadata)}
                            </div>
                            <details className="mt-2">
                              <summary className="cursor-pointer text-xs text-muted-foreground">
                                View metadata
                              </summary>
                              <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-muted p-3 text-xs text-foreground">
                                {row.metadata
                                  ? JSON.stringify(row.metadata, null, 2)
                                  : "No metadata"}
                              </pre>
                            </details>
                          </td>

                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            {formatDateTime(row.created_at)}
                          </td>

                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <div className="flex flex-col items-start gap-2">
                              {canOpenPayment ? (
                                <Link
                                  href={`/admin/payments/${objectId}`}
                                  className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                                >
                                  Payment
                                </Link>
                              ) : null}

                              {canOpenSubscription ? (
                                <Link
                                  href={`/admin/subscriptions/${objectId}`}
                                  className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                                >
                                  Subscription
                                </Link>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  </table>
                </MobileSafeTable>
              </DataTableShell>
            )}
          </SectionCard>
        ) : null}
      </div>
    </PortalPage>
  );
}
