"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import StatusBadge from "@/components/ui/status-badge";
import { DataTableShell, MobileSafeTable } from "@/components/ui/operations";
import TableToolbar from "@/components/ui/TableToolbar";
import { apiFetch, toArray } from "@/lib/api";

type BatchOption = {
  id: number;
  batch_code: string;
  status: string;
};

type LuckyDrawRow = {
  id: number;
  batch_id: number | null;
  batch_code: string;
  draw_month: string | null;
  committed_hash: string | null;
  is_revealed: boolean;
  winner_lucky_number: number | null;
  winner_customer_name?: string;
  winner_subscription_id?: number | null;
  winner_subscription_number?: string;
  created_at: string | null;
};

type RevealFilter = "" | "REVEALED" | "UNREVEALED";

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

function normalizeBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return ["1", "true", "yes", "y"].includes(normalized);
  }
  return false;
}



function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

function formatLuckyNumber(value: number | null): string {
  if (value == null) return "—";
  return `#${String(value).padStart(2, "0")}`;
}

function formatDrawMonth(value: string | null | undefined): string {
  if (!value) return "—";

  const normalized = value.trim();
  if (!normalized) return "—";

  if (/^\d{4}-\d{2}$/.test(normalized)) {
    const parsed = Date.parse(`${normalized}-01`);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
      });
    }
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const parsed = Date.parse(normalized);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
      });
    }
  }

  return normalized;
}

function parseErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Failed to load Lucky Draw register.";

  const raw = error.message.trim();
  if (!raw) return "Failed to load Lucky Draw register.";

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

function normalizeLuckyDrawRow(raw: Record<string, unknown>): LuckyDrawRow {
  const winnerLuckyNumber =
    toNullableNumber(raw.winner_lucky_number) ??
    toNullableNumber(raw.winning_lucky_number) ??
    toNullableNumber(raw.lucky_number) ??
    toNullableNumber(raw.winner_number) ??
    toNullableNumber(raw.winning_number);

  return {
    id: toNumber(raw.id),
    batch_id: toNullableNumber(raw.batch) ?? toNullableNumber(raw.batch_id),
    batch_code:
      toStringValue(raw.batch_code).trim() ||
      toStringValue(raw.batch_name).trim() ||
      "Unknown batch",
    draw_month:
      toNullableString(raw.draw_month) ??
      toNullableString(raw.month) ??
      toNullableString(raw.draw_for_month),
    committed_hash:
      toNullableString(raw.committed_hash) ??
      toNullableString(raw.commit_hash) ??
      toNullableString(raw.hash_commit),
    is_revealed: normalizeBoolean(raw.is_revealed ?? raw.revealed),
    winner_lucky_number: winnerLuckyNumber,
    winner_customer_name:
      toStringValue(raw.winner_customer_name).trim() ||
      toStringValue(raw.customer_name).trim() ||
      undefined,
    winner_subscription_id:
      toNullableNumber(raw.winner_subscription_id) ??
      toNullableNumber(raw.subscription_id),
    winner_subscription_number:
      toStringValue(raw.winner_subscription_number).trim() ||
      toStringValue(raw.subscription_number).trim() ||
      undefined,
    created_at:
      toNullableString(raw.created_at) ??
      toNullableString(raw.created_date),
  };
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
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
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

export default function AdminLuckyDrawsPage() {
  const [allRows, setAllRows] = useState<LuckyDrawRow[]>([]);
  const [batchOptions, setBatchOptions] = useState<BatchOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [batchInput, setBatchInput] = useState("");
  const [revealInput, setRevealInput] = useState<RevealFilter>("");
  const [monthInput, setMonthInput] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [batchFilter, setBatchFilter] = useState("");
  const [revealFilter, setRevealFilter] = useState<RevealFilter>("");
  const [monthFilter, setMonthFilter] = useState("");

  async function loadPage(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const [drawRows, batchRows] = await Promise.all([
        fetchAllPagedRows("/admin/lucky-draws/"),
        fetchAllPagedRows("/admin/batches/"),
      ]);

      setAllRows(
        drawRows
          .map(normalizeLuckyDrawRow)
          .sort((a, b) => {
            const aDate = Date.parse(a.created_at || "") || 0;
            const bDate = Date.parse(b.created_at || "") || 0;
            return bDate - aDate;
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
    setRevealFilter(revealInput);
    setMonthFilter(monthInput.trim());
  }

  function handleResetFilters() {
    setSearchInput("");
    setBatchInput("");
    setRevealInput("");
    setMonthInput("");

    setSearchQuery("");
    setBatchFilter("");
    setRevealFilter("");
    setMonthFilter("");
  }

  const rows = useMemo(() => {
    return allRows.filter((row) => {
      if (batchFilter && String(row.batch_id ?? "") !== batchFilter) {
        return false;
      }

      if (revealFilter === "REVEALED" && !row.is_revealed) {
        return false;
      }

      if (revealFilter === "UNREVEALED" && row.is_revealed) {
        return false;
      }

      if (monthFilter) {
        const normalizedDrawMonth = String(row.draw_month ?? "").slice(0, 7);
        if (normalizedDrawMonth !== monthFilter) {
          return false;
        }
      }

      if (!searchQuery) return true;

      const haystack = [
        row.id,
        row.batch_code,
        row.draw_month,
        row.winner_lucky_number,
        row.winner_customer_name,
        row.winner_subscription_number,
        row.committed_hash,
      ]
        .map((value) => String(value ?? "").toLowerCase())
        .join(" ");

      return haystack.includes(searchQuery);
    });
  }, [allRows, batchFilter, revealFilter, monthFilter, searchQuery]);

  const revealedCount = useMemo(
    () => rows.filter((row) => row.is_revealed).length,
    [rows]
  );

  const unrevealedCount = useMemo(
    () => rows.filter((row) => !row.is_revealed).length,
    [rows]
  );

  const winnerLockedCount = useMemo(
    () => rows.filter((row) => row.winner_lucky_number != null).length,
    [rows]
  );

  const exportRows = useMemo(
    () =>
      rows.map((row) => ({
        id: row.id,
        batch_id: row.batch_id,
        batch_code: row.batch_code,
        draw_month: row.draw_month ?? "",
        committed_hash: row.committed_hash ?? "",
        is_revealed: row.is_revealed ? "true" : "false",
        winner_lucky_number:
          row.winner_lucky_number != null
            ? String(row.winner_lucky_number).padStart(2, "0")
            : "",
        winner_customer_name: row.winner_customer_name ?? "",
        winner_subscription_id: row.winner_subscription_id ?? "",
        winner_subscription_number: row.winner_subscription_number ?? "",
        created_at: row.created_at ?? "",
      })),
    [rows]
  );

  return (
    <PortalPage
      title="Lucky Draw Register"
      subtitle="Operational register for Lucky Draw commitments, reveal state, winner visibility, and audit navigation."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Lucky Draws" },
      ]}
      actions={[
        {
          href: "/admin/lucky-draws/create",
          label: "Create Draw Commitment",
          variant: "primary",
        },
        {
          href: "/admin/batches",
          label: "Batch Register",
          variant: "secondary",
        },
      ]}
      stats={[
        {
          label: "Visible Draws",
          value: String(rows.length),
        },
        {
          label: "Revealed",
          value: String(revealedCount),
          tone: revealedCount > 0 ? "success" : undefined,
        },
        {
          label: "Unrevealed",
          value: String(unrevealedCount),
          tone: unrevealedCount > 0 ? "warning" : undefined,
        },
        {
          label: "Winner Locked",
          value: String(winnerLockedCount),
        },
      ]}
      statusBadge={{
        label: "Lucky Draw Operations",
        tone: "info",
      }}
    >
      <div className="space-y-6">
        <SectionCard
          title="Lucky Draw summary"
          description="Draw records should remain batch-specific, month-specific, and fully auditable from commitment through reveal."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryTile
              label="Visible Draws"
              value={String(rows.length)}
              description="All draw records visible under the current filter set."
            />
            <SummaryTile
              label="Revealed"
              value={String(revealedCount)}
              description="Draws whose result has already been revealed."
            />
            <SummaryTile
              label="Unrevealed"
              value={String(unrevealedCount)}
              description="Draw commitments still waiting for reveal workflow."
            />
            <SummaryTile
              label="Winner Locked"
              value={String(winnerLockedCount)}
              description="Draws already carrying a visible winner Lucky ID."
            />
          </div>
        </SectionCard>

        <TableToolbar
          title="Filter register"
          description="Filter by batch, reveal state, draw month, batch code, winner Lucky ID, or linked winner details."
        >
          <form onSubmit={handleApplyFilters} className="grid gap-4 lg:grid-cols-6">
            <div className="lg:col-span-2">
              <label
                htmlFor="lucky-draw-search"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                Search
              </label>
              <input
                id="lucky-draw-search"
                type="text"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Batch, winner, Lucky ID, hash"
                className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
              />
            </div>

            <div>
              <label
                htmlFor="lucky-draw-batch"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                Batch
              </label>
              <select
                id="lucky-draw-batch"
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
                htmlFor="lucky-draw-reveal"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                Reveal State
              </label>
              <select
                id="lucky-draw-reveal"
                value={revealInput}
                onChange={(event) =>
                  setRevealInput(event.target.value as RevealFilter)
                }
                className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
              >
                <option value="">All</option>
                <option value="REVEALED">Revealed</option>
                <option value="UNREVEALED">Unrevealed</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="lucky-draw-month"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                Draw Month
              </label>
              <input
                id="lucky-draw-month"
                type="month"
                value={monthInput}
                onChange={(event) => setMonthInput(event.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
              />
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
              onClick={() => downloadCsv("lucky-draw-register-current-view.csv", exportRows)}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-foreground px-4 text-sm font-medium text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Export Current View
            </button>
          </div>
        </TableToolbar>

        {loading ? <LoadingBlock label="Loading Lucky Draw register..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load Lucky Draw register"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error ? (
          <SectionCard
            title="Lucky Draw rows"
            description="Use this register to monitor commitment creation, reveal state, and winner visibility before moving into draw detail."
          >
            {rows.length === 0 ? (
              <EmptyState
                title="No Lucky Draws found"
                description="No draw records match the current filter set."
              />
            ) : (
              <DataTableShell>
                <MobileSafeTable className="border-none bg-transparent">
                  <table className="min-w-full border-separate border-spacing-0">
                  <thead>
                    <tr className="text-left">
                      <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Draw
                      </th>
                      <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Batch / Month
                      </th>
                      <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Reveal
                      </th>
                      <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Winner
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
                          <div className="font-medium">Draw #{row.id}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Created {formatDateTime(row.created_at)}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {row.committed_hash
                              ? `Commit ${row.committed_hash.slice(0, 16)}…`
                              : "No committed hash visible"}
                          </div>
                        </td>

                        <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                          <div className="font-medium">{row.batch_code}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {formatDrawMonth(row.draw_month)}
                          </div>
                        </td>

                        <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                          <StatusBadge status={row.is_revealed ? "COMPLETED" : "PENDING"} />
                        </td>

                        <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                          <div className="font-medium">
                            {row.winner_lucky_number != null
                              ? formatLuckyNumber(row.winner_lucky_number)
                              : row.is_revealed
                              ? "No winner visible"
                              : "Pending reveal"}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {row.winner_customer_name ||
                              (row.is_revealed ? "Winner customer not visible" : "No customer yet")}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {row.winner_subscription_number ||
                              (row.is_revealed ? "Winner contract not visible" : "No contract yet")}
                          </div>
                        </td>

                        <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                          <div className="flex flex-col items-start gap-2">
                            <Link
                              href={`/admin/lucky-draws/${row.id}`}
                              className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                            >
                              Open Draw
                            </Link>

                            {row.batch_id != null ? (
                              <Link
                                href={`/admin/batches/${row.batch_id}`}
                                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                              >
                                Open Batch
                              </Link>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
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