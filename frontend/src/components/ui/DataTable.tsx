// frontend/src/components/ui/DataTable.tsx
"use client";

import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, ChevronsUpDown, Loader2 } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

type Align = "left" | "center" | "right";

export type Column<T> = {
  key: keyof T | string;
  title: string;
  width?: number | string;
  align?: Align;
  sortable?: boolean;
  sortAccessor?: (row: T) => string | number | null | undefined;
  render?: (row: T) => ReactNode;
};

type DataTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  error?: string | null;
  emptyText?: string;
  pageSize?: number;
  onRowClick?: (row: T) => void;
  rowActions?: (row: T) => ReactNode;
};

function compareValues(
  left: string | number | null | undefined,
  right: string | number | null | undefined,
  asc: boolean
): number {
  const a = left ?? "";
  const b = right ?? "";
  if (a === b) return 0;
  if (a > b) return asc ? 1 : -1;
  return asc ? -1 : 1;
}

export default function DataTable<T extends { id?: number | string }>({
  columns,
  rows,
  loading,
  error,
  emptyText = "No records found",
  pageSize = 15,
  onRowClick,
  rowActions,
}: DataTableProps<T>) {
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  const processedRows = useMemo(() => {
    const nextRows = [...rows];
    if (!sortKey) return nextRows;

    const activeColumn = columns.find((column) => String(column.key) === sortKey);

    nextRows.sort((a, b) => {
      const left = activeColumn?.sortAccessor
        ? activeColumn.sortAccessor(a)
        : (a as Record<string, unknown>)[sortKey] as string | number | null | undefined;
      const right = activeColumn?.sortAccessor
        ? activeColumn.sortAccessor(b)
        : (b as Record<string, unknown>)[sortKey] as string | number | null | undefined;

      return compareValues(left, right, sortAsc);
    });

    return nextRows;
  }, [columns, rows, sortAsc, sortKey]);

  const totalPages = Math.max(1, Math.ceil(processedRows.length / pageSize));
  const clampedPage = Math.min(page, totalPages);

  const pageRows = useMemo(() => {
    const start = (clampedPage - 1) * pageSize;
    return processedRows.slice(start, start + pageSize);
  }, [clampedPage, pageSize, processedRows]);

  const handleSort = (columnKey: string, sortable?: boolean) => {
    if (!sortable) return;
    if (sortKey === columnKey) {
      setSortAsc((prev) => !prev);
    } else {
      setSortKey(columnKey);
      setSortAsc(true);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-border bg-card">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Loading data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead className="bg-muted/30 border-b border-border">
            <tr>
              {columns.map((column) => {
                const columnKey = String(column.key);
                const isActiveSort = sortKey === columnKey;
                const SortIcon = isActiveSort
                  ? sortAsc
                    ? ChevronUp
                    : ChevronDown
                  : ChevronsUpDown;

                return (
                  <th
                    key={columnKey}
                    onClick={() => handleSort(columnKey, column.sortable)}
                    className={cn(
                      "px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground",
                      column.sortable && "cursor-pointer select-none hover:text-foreground",
                      column.align === "right" && "text-right",
                      column.align === "center" && "text-center"
                    )}
                    style={{ width: column.width }}
                  >
                    <div className="flex items-center gap-1">
                      {column.title}
                      {column.sortable && (
                        <SortIcon className="h-3.5 w-3.5" />
                      )}
                    </div>
                  </th>
                );
              })}
              {rowActions && (
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (rowActions ? 1 : 0)}
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  {emptyText}
                </td>
              </tr>
            ) : (
              pageRows.map((row, index) => (
                <tr
                  key={row.id ?? index}
                  onClick={() => onRowClick?.(row)}
                  className={cn(
                    "border-b border-border transition-colors hover:bg-muted/30",
                    onRowClick && "cursor-pointer"
                  )}
                >
                  {columns.map((column) => {
                    const key = String(column.key);
                    const fallback = (row as Record<string, unknown>)[key];
                    const content = column.render
                      ? column.render(row)
                      : String(fallback ?? "-");
                    return (
                      <td
                        key={key}
                        className={cn(
                          "px-4 py-3 text-sm text-foreground",
                          column.align === "right" && "text-right",
                          column.align === "center" && "text-center"
                        )}
                      >
                        {content}
                      </td>
                    );
                  })}
                  {rowActions && (
                    <td
                      className="px-4 py-3 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {rowActions(row)}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
          <div className="text-muted-foreground">
            Page {clampedPage} of {totalPages}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={clampedPage === 1}
              className="rounded-md border border-border px-3 py-1 text-foreground transition hover:bg-muted disabled:opacity-50 disabled:hover:bg-transparent"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={clampedPage === totalPages}
              className="rounded-md border border-border px-3 py-1 text-foreground transition hover:bg-muted disabled:opacity-50 disabled:hover:bg-transparent"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}