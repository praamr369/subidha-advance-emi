"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Download, RefreshCw, Search } from "lucide-react";

import {
  ERPDataToolbar,
  ERPEmptyState,
  ERPErrorState,
  ERPLoadingState,
  ERPPageShell,
  ERPSectionShell,
  ERPStatusBadge,
} from "@/components/erp";
import DataTable, { type Column } from "@/components/ui/DataTable";
import { DataTableShell, DetailPanel, KpiCard, QuickActionGrid } from "@/components/ui/operations";
import {
  type BatchStatus,
  type CanonicalBatchStatus,
  isLiveBatchStatus,
  normalizeBatchFilterStatus,
  normalizeBatchStatus,
} from "@/domains/batches/status";
import { apiFetch, toArray } from "@/lib/api";
import { downloadCsv } from "@/lib/export/csv";

type BatchRow = {
  id: number;
  batch_code: string;
  total_slots: number;
  duration_months: number;
  start_date: string | null;
  draw_day: number | null;
  status: BatchStatus;
  subscription_count: number;
  lucky_id_count: number;
  winner_count: number;
  available_slots: number;
  created_at: string | null;
};

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : value === null ? null : null;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString();
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
  return "Failed to load batch register.";
}

function normalizeBatchRow(raw: Record<string, unknown>): BatchRow {
  const luckyIdCount = toNumber(
    raw.lucky_id_count ?? raw.lucky_count ?? raw.total_lucky_ids,
    0
  );

  return {
    id: toNumber(raw.id),
    batch_code:
      String(raw.batch_code ?? "").trim() ||
      String(raw.code ?? "").trim() ||
      `BATCH-${String(raw.id ?? "")}`,
    total_slots: toNumber(raw.total_slots, 0),
    duration_months: toNumber(raw.duration_months, 0),
    start_date: toNullableString(raw.start_date),
    draw_day: toNullableNumber(raw.draw_day),
    status: normalizeBatchStatus(raw.status),
    subscription_count: toNumber(raw.subscription_count, 0),
    lucky_id_count: luckyIdCount,
    winner_count: toNumber(raw.winner_count, 0),
    available_slots: toNumber(raw.available_slots, 0),
    created_at: toNullableString(raw.created_at),
  };
}

function toObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function extractRowsAndNext(payload: unknown): {
  rows: Record<string, unknown>[];
  nextPath: string | null;
} {
  const objectPayload = toObject(payload);

  if (objectPayload && Array.isArray(objectPayload.results)) {
    const nextRaw = objectPayload.next;
    return {
      rows: toArray<Record<string, unknown>>(objectPayload.results),
      nextPath: typeof nextRaw === "string" && nextRaw.trim() ? nextRaw : null,
    };
  }

  return {
    rows: toArray<Record<string, unknown>>(payload),
    nextPath: null,
  };
}

function normalizeApiPath(nextPath: string): string {
  const trimmed = nextPath.trim();

  if (!trimmed) return "";

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const parsed = new URL(trimmed);
    const combined = `${parsed.pathname}${parsed.search}`;
    if (combined.startsWith("/api/v1/")) {
      return combined.replace(/^\/api\/v1/, "");
    }
    return combined;
  }

  if (trimmed.startsWith("/api/v1/")) {
    return trimmed.replace(/^\/api\/v1/, "");
  }

  return trimmed;
}

async function fetchAllPagedRows(path: string): Promise<Record<string, unknown>[]> {
  let nextPath: string | null = path;
  const collected: Record<string, unknown>[] = [];
  const seen = new Set<string>();

  for (let guard = 0; nextPath && guard < 100; guard += 1) {
    const payload = await apiFetch<unknown>(nextPath);
    const { rows, nextPath: rawNext } = extractRowsAndNext(payload);

    for (const row of rows) {
      const key =
        typeof row.id !== "undefined" ? String(row.id) : JSON.stringify(row);

      if (!seen.has(key)) {
        seen.add(key);
        collected.push(row);
      }
    }

    const normalizedNext = rawNext ? normalizeApiPath(rawNext) : "";
    nextPath = normalizedNext || null;
  }

  return collected;
}

export default function AdminBatchesPage() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamKey = searchParams.toString();

  const initialQuery = (searchParams.get("q") || "").trim();
  const initialStatus = normalizeBatchFilterStatus(searchParams.get("status"));

  const [rows, setRows] = useState<BatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [queryInput, setQueryInput] = useState(initialQuery);
  const [statusInput, setStatusInput] = useState<"" | CanonicalBatchStatus>(initialStatus);

  const [query, setQuery] = useState(initialQuery);
  const [statusFilter, setStatusFilter] = useState<"" | CanonicalBatchStatus>(initialStatus);

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);

      try {
        const params = new URLSearchParams();
        if (query) params.set("q", query);
        if (statusFilter) params.set("status", statusFilter);
        const payload = await fetchAllPagedRows(
          `/admin/batches/${params.toString() ? `?${params.toString()}` : ""}`
        );

        setRows(payload.map(normalizeBatchRow));
        setError(null);
      } catch (err) {
        setError(toErrorMessage(err));
        if (mode === "initial") setRows([]);
      } finally {
        if (mode === "initial") setLoading(false);
        else setRefreshing(false);
      }
    },
    [query, statusFilter]
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  useEffect(() => {
    const params = new URLSearchParams(searchParamKey);
    const nextQuery = (params.get("q") || "").trim();
    const nextStatus = normalizeBatchFilterStatus(params.get("status"));

    setQueryInput(nextQuery);
    setStatusInput(nextStatus);
    setQuery(nextQuery);
    setStatusFilter(nextStatus);
  }, [searchParamKey]);

  function replaceFilters(params: URLSearchParams) {
    const queryString = params.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname);
  }

  function handleApplyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    const nextQuery = queryInput.trim();

    if (nextQuery) params.set("q", nextQuery);
    if (statusInput) params.set("status", statusInput);
    replaceFilters(params);
  }

  function handleResetFilters() {
    setQueryInput("");
    setStatusInput("");
    replaceFilters(new URLSearchParams());
  }

  const liveCount = useMemo(
    () => rows.filter((row) => isLiveBatchStatus(row.status)).length,
    [rows]
  );

  const totalSubscriptions = useMemo(
    () => rows.reduce((sum, row) => sum + row.subscription_count, 0),
    [rows]
  );

  const totalLuckyIds = useMemo(
    () => rows.reduce((sum, row) => sum + row.lucky_id_count, 0),
    [rows]
  );

  const totalWinners = useMemo(
    () => rows.reduce((sum, row) => sum + row.winner_count, 0),
    [rows]
  );

  const fullOrTightCount = useMemo(
    () => rows.filter((row) => row.available_slots <= 5).length,
    [rows]
  );

  const exportRows = useMemo(
    () =>
      rows.map((row) => ({
        id: row.id,
        batch_code: row.batch_code,
        total_slots: row.total_slots,
        duration_months: row.duration_months,
        start_date: row.start_date ?? "",
        draw_day: row.draw_day ?? "",
        status: row.status,
        subscription_count: row.subscription_count,
        lucky_id_count: row.lucky_id_count,
        available_slots: row.available_slots,
        winner_count: row.winner_count,
        created_at: row.created_at ?? "",
      })),
    [rows]
  );

  const columns = useMemo<Column<BatchRow>[]>(
    () => [
      {
        key: "batch_code",
        title: "Batch",
        sortable: true,
        render: (row) => (
          <div className="space-y-1">
            <div className="font-medium text-foreground">{row.batch_code}</div>
            <div className="text-xs text-muted-foreground">Batch #{row.id}</div>
            <div className="text-xs text-muted-foreground">
              Created {formatDateTime(row.created_at)}
            </div>
          </div>
        ),
      },
      {
        key: "duration_months",
        title: "Schedule",
        sortable: true,
        render: (row) => (
          <div className="space-y-1">
            <div className="text-sm text-foreground">{row.duration_months} months</div>
            <div className="text-xs text-muted-foreground">
              Start {formatDate(row.start_date)}
            </div>
            <div className="text-xs text-muted-foreground">
              Draw day {row.draw_day != null ? row.draw_day : "—"}
            </div>
          </div>
        ),
      },
      {
        key: "subscription_count",
        title: "Volume",
        align: "right",
        sortable: true,
        render: (row) => {
          const assignedCount = Math.max(
            row.lucky_id_count - row.available_slots - row.winner_count,
            0
          );

          return (
            <div className="space-y-1 text-right">
              <div className="font-semibold text-foreground">
                {row.subscription_count} subscriptions
              </div>
              <div className="text-xs text-muted-foreground">
                {row.lucky_id_count} Lucky IDs
              </div>
              <div className="text-xs text-muted-foreground">
                {assignedCount} assigned · {row.available_slots} available
              </div>
            </div>
          );
        },
      },
      {
        key: "status",
        title: "State",
        sortable: true,
        render: (row) => (
          <div className="flex flex-wrap gap-2">
            <ERPStatusBadge status={row.status} />
            <ERPStatusBadge
              status={row.available_slots === 0 ? "FULL" : "AVAILABLE"}
              label={
                row.available_slots === 0
                  ? "No Slots Left"
                  : `${row.available_slots} Slots Open`
              }
            />
            {row.winner_count > 0 ? (
              <ERPStatusBadge status="WON" label={`${row.winner_count} Winners`} />
            ) : null}
          </div>
        ),
      },
    ],
    []
  );

  return (
    <ERPPageShell
      title="Batch Register"
      subtitle="Review Lucky Plan grouping, slot pressure, draw timing, and subscription attachment from one operational register without changing batch lifecycle logic."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Batches" },
      ]}
      actions={[
        { href: "/admin/batches/create", label: "Create Batch", variant: "primary" },
        {
          href: "/admin/subscriptions/advance-emi/create",
          label: "Create Subscription",
          variant: "secondary",
        },
      ]}
      stats={[
        { label: "Visible Batches", value: rows.length },
        { label: "Live Batches", value: liveCount, tone: liveCount > 0 ? "success" : undefined },
        { label: "Subscription Volume", value: totalSubscriptions },
        { label: "Winner Count", value: totalWinners, tone: totalWinners > 0 ? "info" : undefined },
      ]}
      statusBadge={{ label: "Batch Operations", tone: "info" }}
    >
      <div className="space-y-6">
        <QuickActionGrid>
          <KpiCard label="Visible Batches" value={rows.length} />
          <KpiCard
            label="Live Batches"
            value={liveCount}
            helper="Batches in an operable lifecycle state for the current filter view."
          />
          <KpiCard
            label="Lucky IDs"
            value={totalLuckyIds}
            helper="Total Lucky ID rows summed across visible batches."
          />
          <KpiCard
            label="Slot Pressure"
            value={fullOrTightCount}
            helper="Batches with five or fewer open slots."
          />
        </QuickActionGrid>

        <DetailPanel
          title="Batch workflow"
          description="Use backend-backed search and status filters to keep the register focused, then route directly into batch detail, edit, and subscription workflows."
        >
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadPage("refresh")}
              disabled={refreshing || loading}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className="h-4 w-4" />
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
            <button
              type="button"
              disabled={exportRows.length === 0 || loading}
              onClick={() =>
                downloadCsv(
                  "batch-register-current-view.csv",
                  [
                    { key: "id", header: "id" },
                    { key: "batch_code", header: "batch_code" },
                    { key: "total_slots", header: "total_slots" },
                    { key: "duration_months", header: "duration_months" },
                    { key: "start_date", header: "start_date" },
                    { key: "draw_day", header: "draw_day" },
                    { key: "status", header: "status" },
                    { key: "subscription_count", header: "subscription_count" },
                    { key: "lucky_id_count", header: "lucky_id_count" },
                    { key: "available_slots", header: "available_slots" },
                    { key: "winner_count", header: "winner_count" },
                    { key: "created_at", header: "created_at" },
                  ],
                  exportRows
                )
              }
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-foreground px-4 text-sm font-medium text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              Export Current View
            </button>
          </div>
          <ERPSectionShell
            title="Filters"
            description="Search and narrow the batch register by code and lifecycle status without changing any batch lifecycle rules."
            footer={
              query || statusFilter ? (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-semibold uppercase tracking-[0.14em]">Active filters</span>
                  {query ? (
                    <ERPStatusBadge status="OPEN" label={`Search: ${query}`} hideIcon />
                  ) : null}
                  {statusFilter ? <ERPStatusBadge status={statusFilter} hideIcon /> : null}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  This register stays read-only with respect to financial logic. Filtering only reduces operator noise while preserving batch status and Lucky ID traceability.
                </div>
              )
            }
          >
            <ERPDataToolbar
              left={
                <form
                  onSubmit={handleApplyFilters}
                  className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px_auto]"
                >
                  <label className="relative block">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      value={queryInput}
                      onChange={(event) => setQueryInput(event.target.value)}
                      placeholder="Search by batch code"
                      className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-4 text-sm outline-none transition focus:border-ring"
                    />
                  </label>

                  <select
                    value={statusInput}
                    onChange={(event) =>
                      setStatusInput(event.target.value as "" | CanonicalBatchStatus)
                    }
                    className="h-10 rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
                  >
                    <option value="">All states</option>
                    <option value="DRAFT">Draft</option>
                    <option value="OPEN">Open</option>
                    <option value="FULL">Full</option>
                    <option value="DRAW_IN_PROGRESS">Draw In Progress</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="CLOSED">Closed</option>
                  </select>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95"
                    >
                      Apply
                    </button>
                    <button
                      type="button"
                      onClick={handleResetFilters}
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
                    >
                      Reset
                    </button>
                  </div>
                </form>
              }
            />
          </ERPSectionShell>
        </DetailPanel>

        {loading ? <ERPLoadingState label="Loading batch register..." /> : null}

        {!loading && error ? (
          <ERPErrorState
            title="Unable to load batch register"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error ? (
          <DetailPanel
            title="Batch rows"
            description="Open a batch to review Lucky IDs, draw readiness, and linked subscriptions without leaving the operational register."
          >
            {rows.length === 0 ? (
              <ERPEmptyState
                title="No batches found"
                description="No batch records matched the current search and status filters."
                action={
                  <Link
                    href="/admin/batches/create"
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95"
                  >
                    Create Batch
                  </Link>
                }
              />
            ) : (
              <DataTableShell>
                <DataTable<BatchRow>
                  rows={rows}
                  columns={columns}
                  onRowClick={(row) => router.push(`/admin/batches/${row.id}`)}
                  rowActions={(row) => (
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/admin/batches/${row.id}`}
                        className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                      >
                        Open
                      </Link>
                      <Link
                        href={`/admin/batches/${row.id}/edit`}
                        className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                      >
                        Edit
                      </Link>
                      <Link
                        href={`/admin/batches/${row.id}/control-center`}
                        className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                      >
                        Control Center
                      </Link>
                      <Link
                        href="/admin/subscriptions/advance-emi/create"
                        className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                      >
                        Create Subscription
                      </Link>
                    </div>
                  )}
                />
              </DataTableShell>
            )}
          </DetailPanel>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
