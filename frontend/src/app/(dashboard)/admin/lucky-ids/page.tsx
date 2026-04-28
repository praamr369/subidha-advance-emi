"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { apiFetch, toArray } from "@/lib/api";

type LuckyIdStatus =
  | "AVAILABLE"
  | "ASSIGNED"
  | "WON"
  | "BLOCKED"
  | "CANCELLED"
  | "UNKNOWN";

type BatchOption = {
  id: number;
  batch_code: string;
  status: string;
};

type LuckyIdRow = {
  id: number;
  batch_id: number | null;
  batch_code: string;
  lucky_number: number | null;
  status: LuckyIdStatus;
  customer_name?: string;
  subscription_id?: number | null;
  subscription_number?: string;
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

function toStringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : value === null ? null : null;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

function normalizeLuckyIdStatus(value: unknown): LuckyIdStatus {
  const status = String(value ?? "").toUpperCase();

  if (status === "WON" || status === "DRAWN" || status === "WINNER") {
    return "WON";
  }

  if (
    status === "AVAILABLE" ||
    status === "ASSIGNED" ||
    status === "BLOCKED" ||
    status === "CANCELLED"
  ) {
    return status;
  }

  return "UNKNOWN";
}

function normalizeBatchOption(raw: Record<string, unknown>): BatchOption {
  return {
    id: toNumber(raw.id),
    batch_code:
      toStringValue(raw.batch_code).trim() ||
      toStringValue(raw.code).trim() ||
      `BATCH-${String(raw.id ?? "")}`,
    status: toStringValue(raw.status, "UNKNOWN").toUpperCase(),
  };
}

function normalizeLuckyIdRow(raw: Record<string, unknown>): LuckyIdRow {
  return {
    id: toNumber(raw.id),
    batch_id: toNullableNumber(raw.batch) ?? toNullableNumber(raw.batch_id),
    batch_code:
      toStringValue(raw.batch_code).trim() ||
      toStringValue(raw.batch_name).trim() ||
      "Unknown batch",
    lucky_number:
      toNullableNumber(raw.lucky_number) ??
      toNullableNumber(raw.lucky_no) ??
      toNullableNumber(raw.number),
    status: normalizeLuckyIdStatus(raw.status),
    customer_name:
      toStringValue(raw.customer_name).trim() ||
      toStringValue(raw.customer_display_name).trim() ||
      undefined,
    subscription_id: toNullableNumber(raw.subscription_id),
    subscription_number:
      toStringValue(raw.subscription_number).trim() ||
      toStringValue(raw.subscription_code).trim() ||
      undefined,
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
    const payload = await apiFetch<unknown>(nextPath, { cache: "no-store" });
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

function parseErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Failed to load Lucky ID register.";

  const raw = error.message.trim();
  if (!raw) return "Failed to load Lucky ID register.";

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    if (typeof parsed.detail === "string" && parsed.detail.trim()) {
      return parsed.detail;
    }

    for (const [field, value] of Object.entries(parsed)) {
      if (Array.isArray(value) && value.length > 0) {
        return `${field}: ${String(value[0])}`;
      }
      if (typeof value === "string" && value.trim()) {
        return `${field}: ${value}`;
      }
    }

    return raw;
  } catch {
    return raw;
  }
}

function luckyIdToneClass(status: LuckyIdStatus): string {
  switch (status) {
    case "AVAILABLE":
      return "border-slate-200 bg-slate-100 text-slate-700";
    case "ASSIGNED":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "WON":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "BLOCKED":
    case "CANCELLED":
      return "border-red-200 bg-red-50 text-red-700";
    default:
      return "border-border bg-muted text-foreground";
  }
}

function formatLuckyNumber(value: number | null): string {
  if (value == null) return "—";
  return `#${String(value).padStart(2, "0")}`;
}

function downloadCsv(filename: string, rows: Record<string, string | number | null>[]) {
  if (rows.length === 0) return;

  const headers = Object.keys(rows[0]);

  const escapeCell = (value: string | number | null) => {
    const stringValue = value == null ? "" : String(value);
    const escaped = stringValue.replace(/"/g, '""');
    return `"${escaped}"`;
  };

  const csv = [
    headers.map((header) => escapeCell(header)).join(","),
    ...rows.map((row) => headers.map((header) => escapeCell(row[header] ?? "")).join(",")),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.setAttribute("download", filename);
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SummaryTile({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-xl font-semibold text-foreground">{value}</div>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export default function AdminLuckyIdsPage() {
  const [allRows, setAllRows] = useState<LuckyIdRow[]>([]);
  const [batchOptions, setBatchOptions] = useState<BatchOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [batchInput, setBatchInput] = useState("");
  const [statusInput, setStatusInput] = useState<"" | LuckyIdStatus>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [batchFilter, setBatchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | LuckyIdStatus>("");

  async function loadPage(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const [luckyRows, batchRows] = await Promise.all([
        fetchAllPagedRows("/admin/lucky-ids/"),
        fetchAllPagedRows("/admin/batches/"),
      ]);

      setAllRows(
        luckyRows
          .map(normalizeLuckyIdRow)
          .sort((a, b) => {
            if (a.batch_code !== b.batch_code) {
              return a.batch_code.localeCompare(b.batch_code);
            }
            return (a.lucky_number ?? 9999) - (b.lucky_number ?? 9999);
          })
      );

      setBatchOptions(
        batchRows
          .map(normalizeBatchOption)
          .sort((a, b) => a.batch_code.localeCompare(b.batch_code))
      );

      setError(null);
    } catch (err) {
      setError(parseErrorMessage(err));
      if (mode === "initial") {
        setAllRows([]);
        setBatchOptions([]);
      }
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadPage("initial");
  }, []);

  function handleApplyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearchQuery(searchInput.trim().toLowerCase());
    setBatchFilter(batchInput);
    setStatusFilter(statusInput);
  }

  function handleResetFilters() {
    setSearchInput("");
    setBatchInput("");
    setStatusInput("");
    setSearchQuery("");
    setBatchFilter("");
    setStatusFilter("");
  }

  const rows = useMemo(() => {
    return allRows.filter((row) => {
      if (batchFilter && String(row.batch_id ?? "") !== batchFilter) {
        return false;
      }

      if (statusFilter && row.status !== statusFilter) {
        return false;
      }

      if (!searchQuery) return true;

      const haystack = [
        row.id,
        row.batch_code,
        row.lucky_number,
        row.status,
        row.customer_name,
        row.subscription_number,
      ]
        .map((value) => String(value ?? "").toLowerCase())
        .join(" ");

      return haystack.includes(searchQuery);
    });
  }, [allRows, batchFilter, statusFilter, searchQuery]);

  const availableCount = useMemo(
    () => rows.filter((row) => row.status === "AVAILABLE").length,
    [rows]
  );

  const assignedCount = useMemo(
    () => rows.filter((row) => row.status === "ASSIGNED").length,
    [rows]
  );

  const wonCount = useMemo(
    () => rows.filter((row) => row.status === "WON").length,
    [rows]
  );

  const orphanAssignedCount = useMemo(
    () =>
      rows.filter((row) => {
        const status = row.status;
        return status === "ASSIGNED" && !row.subscription_number && !row.customer_name;
      }).length,
    [rows]
  );

  const exportRows = useMemo(
    () =>
      rows.map((row) => ({
        id: row.id,
        batch_id: row.batch_id,
        batch_code: row.batch_code,
        lucky_number: row.lucky_number != null ? String(row.lucky_number).padStart(2, "0") : "",
        status: row.status,
        customer_name: row.customer_name ?? "",
        subscription_id: row.subscription_id ?? "",
        subscription_number: row.subscription_number ?? "",
        created_at: row.created_at ?? "",
      })),
    [rows]
  );

  return (
    <PortalPage
      title="Lucky ID Register"
      subtitle="Operational register for Lucky ID visibility, batch allocation, assignment integrity, and contract linkage."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Lucky IDs" },
      ]}
      actions={[
        {
          href: "/admin/batches",
          label: "Batch Register",
          variant: "secondary",
        },
        {
          href: "/admin/subscriptions/advance-emi/create",
          label: "Create Subscription",
          variant: "primary",
        },
      ]}
      stats={[
        {
          label: "Visible Lucky IDs",
          value: String(rows.length),
        },
        {
          label: "Available",
          value: String(availableCount),
        },
        {
          label: "Assigned",
          value: String(assignedCount),
          tone: assignedCount > 0 ? "success" : undefined,
        },
        {
          label: "Won / Drawn",
          value: String(wonCount),
        },
      ]}
      statusBadge={{
        label: "Lucky ID Operations",
        tone: "info",
      }}
    >
      <div className="space-y-6">
        <SectionCard
          title="Lucky ID integrity summary"
          description="Lucky IDs should always belong to one batch, and assigned states should resolve to a customer and subscription context."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryTile
              label="Available"
              value={String(availableCount)}
              description="Lucky IDs ready for allocation to new subscriptions."
            />
            <SummaryTile
              label="Assigned"
              value={String(assignedCount)}
              description="Lucky IDs currently allocated to subscriptions and not yet won."
            />
            <SummaryTile
              label="Won / Drawn"
              value={String(wonCount)}
              description="Lucky IDs that have already entered winner state or draw completion state."
            />
            <SummaryTile
              label="Integrity Alerts"
              value={String(orphanAssignedCount)}
              description="Assigned-state Lucky IDs missing visible customer or subscription linkage."
            />
          </div>
        </SectionCard>

        <SectionCard
          title="Filter register"
          description="Narrow by batch, status, lucky number, customer, or subscription for daily administration and reconciliation."
        >
          <form onSubmit={handleApplyFilters} className="grid gap-4 lg:grid-cols-6">
            <div className="lg:col-span-3">
              <label
                htmlFor="lucky-id-search"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                Search
              </label>
              <input
                id="lucky-id-search"
                type="text"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Lucky number, customer, contract, batch"
                className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
              />
            </div>

            <div>
              <label
                htmlFor="lucky-id-batch"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                Batch
              </label>
              <select
                id="lucky-id-batch"
                value={batchInput}
                onChange={(event) => setBatchInput(event.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
              >
                <option value="">All</option>
                {batchOptions.map((option) => (
                  <option key={option.id} value={String(option.id)}>
                    {option.batch_code}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="lucky-id-status"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                Status
              </label>
              <select
                id="lucky-id-status"
                value={statusInput}
                onChange={(event) =>
                  setStatusInput(event.target.value as "" | LuckyIdStatus)
                }
                className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
              >
                <option value="">All</option>
                <option value="AVAILABLE">AVAILABLE</option>
                <option value="ASSIGNED">ASSIGNED</option>
                <option value="WON">WON</option>
                <option value="BLOCKED">BLOCKED</option>
                <option value="CANCELLED">CANCELLED</option>
              </select>
            </div>

            <div className="flex flex-wrap items-end gap-2">
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

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadPage("refresh")}
              disabled={refreshing || loading}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>

            <button
              type="button"
              disabled={exportRows.length === 0 || loading}
              onClick={() => downloadCsv("lucky-id-register-current-view.csv", exportRows)}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-foreground px-4 text-sm font-medium text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Export Current View
            </button>
          </div>
        </SectionCard>

        {loading ? <LoadingBlock label="Loading Lucky ID register..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load Lucky ID register"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error ? (
          <SectionCard
            title="Lucky ID rows"
            description="Use this register to verify batch ownership, contract linkage, and assignment integrity."
          >
            {rows.length === 0 ? (
              <EmptyState
                title="No Lucky IDs found"
                description="No Lucky IDs match the current filter set."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-0">
                  <thead>
                    <tr className="text-left">
                      <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Lucky ID
                      </th>
                      <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Batch
                      </th>
                      <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Customer / Contract
                      </th>
                      <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Status
                      </th>
                      <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {rows.map((row) => {
                      const status = row.status;

                      return (
                        <tr key={row.id} className="align-top">
                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <div className="font-medium">{formatLuckyNumber(row.lucky_number)}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Row #{row.id}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Created {formatDateTime(row.created_at)}
                            </div>
                          </td>

                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <div className="font-medium">{row.batch_code}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Batch ID {row.batch_id != null ? `#${row.batch_id}` : "—"}
                            </div>
                          </td>

                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <div>
                              {row.customer_name
                                ? row.customer_name
                                : status === "AVAILABLE"
                                ? "Unassigned"
                                : status === "WON"
                                ? "Winner without customer link"
                                : "Assigned without customer link"}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {row.subscription_number
                                ? row.subscription_number
                                : status === "AVAILABLE"
                                ? "No subscription"
                                : status === "WON"
                                ? "Missing winner subscription link"
                                : "Missing subscription link"}
                            </div>
                          </td>

                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <span
                              className={[
                                "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
                                luckyIdToneClass(status),
                              ].join(" ")}
                            >
                              {status}
                            </span>
                          </td>

                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <div className="flex flex-col items-start gap-2">
                              {row.batch_id != null ? (
                                <Link
                                  href={`/admin/batches/${row.batch_id}`}
                                  className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                                >
                                  Open Batch
                                </Link>
                              ) : null}

                              {row.subscription_id != null ? (
                                <Link
                                  href={`/admin/subscriptions/${row.subscription_id}`}
                                  className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                                >
                                  Open Contract
                                </Link>
                              ) : (
                                <Link
                                  href="/admin/subscriptions/advance-emi/create"
                                  className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                                >
                                  Create Subscription
                                </Link>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        ) : null}
      </div>
    </PortalPage>
  );
}
