"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

import LoadingBlock from "@/components/feedback/LoadingBlock";
import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import type { EnterpriseColumnDef, GenericRecord } from "@/components/enterprise/columns";

type Props<T extends GenericRecord> = {
  title?: string;
  subtitle?: string;
  data: T[];
  columns: EnterpriseColumnDef<T>[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  globalFilterPlaceholder?: string;
  pageSize?: number;
  rowKey?: (row: T, index: number) => string | number;
  onRowClick?: (row: T) => void;
  toolbar?: React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
};

const DEFAULT_PAGE_SIZE = 25;

function getSearchableValue<T extends GenericRecord>(row: T, column: EnterpriseColumnDef<T>) {
  const raw = row[column.key as keyof T];
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "string") return raw.toLowerCase();
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw).toLowerCase();
  return String(raw).toLowerCase();
}

export default function EnterpriseDataTable<T extends GenericRecord>({
  title,
  subtitle,
  data,
  columns,
  loading = false,
  error = null,
  onRetry,
  globalFilterPlaceholder = "Search records...",
  pageSize = DEFAULT_PAGE_SIZE,
  rowKey,
  onRowClick,
  toolbar,
  emptyTitle = "No records found",
  emptyDescription = "Try changing the search or create a new record.",
}: Props<T>) {
  const [globalFilterInput, setGlobalFilterInput] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const deferredGlobalFilter = useDeferredValue(globalFilterInput.trim().toLowerCase());

  const filteredRows = useMemo(() => {
    if (!deferredGlobalFilter) return data;

    return data.filter((row) =>
      columns.some((column) => getSearchableValue(row, column).includes(deferredGlobalFilter))
    );
  }, [columns, data, deferredGlobalFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePageIndex = Math.min(pageIndex, pageCount - 1);
  const paginatedRows = useMemo(() => {
    const start = safePageIndex * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, pageSize, safePageIndex]);

  

  const pageInfo = `Page ${safePageIndex + 1} of ${pageCount}`;
  const showData = !loading && !error && filteredRows.length > 0;
  const clickableRows = typeof onRowClick === "function";

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold tracking-tight text-card-foreground">
              {title || "Records"}
            </h3>
            {subtitle ? (
              <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>

          <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
            <div className="relative min-w-0 sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className="h-10 w-full rounded-xl border border-input bg-background pl-10 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring"
                value={globalFilterInput}
                onChange={(e) => {
                  setGlobalFilterInput(e.target.value);
                  setPageIndex(0);
                }}
                placeholder={globalFilterPlaceholder}
              />
            </div>

            {toolbar ? <div className="flex flex-wrap items-center gap-2">{toolbar}</div> : null}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-6">
          <LoadingBlock label="Loading records..." />
        </div>
      ) : null}

      {!loading && error ? (
        <div className="p-6">
          <ErrorState title="Failed to load records" description={error} onRetry={onRetry} />
        </div>
      ) : null}

      {!loading && !error && filteredRows.length === 0 ? (
        <div className="p-6">
          <EmptyState title={emptyTitle} description={emptyDescription} />
        </div>
      ) : null}

      {showData ? (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                <tr className="border-b border-border">
                  {columns.map((column) => (
                    <th
                      key={String(column.key)}
                      className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                    >
                      {column.header}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {paginatedRows.map((row, index) => {
                  const resolvedKey = rowKey
                    ? rowKey(row, index)
                    : ("id" in row && row.id != null
                        ? String(row.id)
                        : `${safePageIndex}-${index}`);

                  return (
                    <tr
                      key={resolvedKey}
                      onClick={clickableRows ? () => onRowClick(row) : undefined}
                      className={[
                        "border-b border-border align-top transition",
                        clickableRows ? "cursor-pointer hover:bg-muted/40" : "hover:bg-muted/20",
                      ].join(" ")}
                    >
                      {columns.map((column) => (
                        <td
                          key={String(column.key)}
                          className="px-4 py-4 text-foreground"
                        >
                          {column.render
                            ? column.render(row)
                            : String(row[column.key as keyof T] ?? "-")}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="text-sm text-muted-foreground">
              {pageInfo} ·{" "}
              <span className="font-medium text-foreground">
                {filteredRows.length}
              </span>{" "}
              total result{filteredRows.length === 1 ? "" : "s"}
            </div>

            <div className="flex items-center gap-2">
              <button
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => setPageIndex((prev) => Math.max(0, prev - 1))}
                disabled={safePageIndex <= 0}
                type="button"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>

              <button
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => setPageIndex((prev) => Math.min(pageCount - 1, prev + 1))}
                disabled={safePageIndex >= pageCount - 1}
                type="button"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}