// frontend/src/components/ui/DataTable.tsx
"use client";

import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, ChevronsUpDown, Loader2 } from "lucide-react";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  TableRowContextMenu,
  type SafeRowContextAction,
} from "@/components/ui/table-row-context-menu";

export type TableDensity = "compact" | "comfortable";

export const DATA_TABLE_DENSITY_STORAGE_KEY = "subidha:table-density:v1";

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
  /** Optional right-click shortcuts (links + copy only). */
  buildRowContextMenu?: (row: T) => SafeRowContextAction[];
  /** Show compact / comfortable density toggle (persists per browser). */
  showDensityToggle?: boolean;
};

function readInitialDensity(): TableDensity {
  if (typeof window === "undefined") {
    return "comfortable";
  }
  try {
    const stored = window.localStorage.getItem(DATA_TABLE_DENSITY_STORAGE_KEY);
    return stored === "compact" ? "compact" : "comfortable";
  } catch {
    return "comfortable";
  }
}

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

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      'a, button, input, select, textarea, summary, [role="button"], [role="link"], [data-row-action="true"]'
    )
  );
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
  buildRowContextMenu,
  showDensityToggle = false,
}: DataTableProps<T>) {
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [density, setDensity] = useState<TableDensity>(() => readInitialDensity());

  useEffect(() => {
    try {
      window.localStorage.setItem(DATA_TABLE_DENSITY_STORAGE_KEY, density);
    } catch {
      // preference-only
    }
  }, [density]);

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

  const thCell = cn(
    density === "compact"
      ? "px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em]"
      : "px-4 py-3 text-xs font-semibold uppercase tracking-[0.15em]",
    "text-muted-foreground"
  );

  const tdCell = cn(
    density === "compact" ? "px-3 py-2 text-[0.8125rem] leading-snug" : "px-4 py-3.5 text-sm leading-snug",
    "text-foreground"
  );

  if (loading) {
    return (
      <div className="table-surface-frame flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Loading data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }

  return (
    <div className="table-surface-frame">
      {showDensityToggle ? (
        <div className="flex flex-wrap items-center justify-end gap-2 border-b border-border px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground">Table density</span>
          <ToggleGroup
            type="single"
            value={density}
            onValueChange={(value: string) => {
              if (value === "compact" || value === "comfortable") {
                setDensity(value);
              }
            }}
            aria-label="Table density"
          >
            <ToggleGroupItem value="comfortable" aria-label="Comfortable spacing">
              Comfortable
            </ToggleGroupItem>
            <ToggleGroupItem value="compact" aria-label="Compact spacing">
              Compact
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      ) : null}
      <div className="ops-table-scroll max-w-full">
        <table className="w-full min-w-0 border-collapse text-sm">
          <thead className="border-b border-border bg-[color-mix(in_oklab,var(--surface-muted)_86%,white_14%)]">
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
                    className={cn(
                      thCell,
                      column.align === "right" && "text-right",
                      column.align === "center" && "text-center"
                    )}
                    style={{ width: column.width }}
                    aria-sort={
                      column.sortable && isActiveSort
                        ? sortAsc
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                  >
                    {column.sortable ? (
                      <button
                        type="button"
                        onClick={() => handleSort(columnKey, column.sortable)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md text-left transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/35",
                          column.align === "right" && "justify-end text-right",
                          column.align === "center" && "justify-center text-center"
                        )}
                      >
                        <span>{column.title}</span>
                        <SortIcon className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    ) : (
                      <div
                        className={cn(
                          "flex items-center gap-1",
                          column.align === "right" && "justify-end",
                          column.align === "center" && "justify-center"
                        )}
                      >
                        {column.title}
                      </div>
                    )}
                  </th>
                );
              })}
              {rowActions && (
                <th className={cn(thCell, "text-right")}>Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (rowActions ? 1 : 0)}
                  className="px-4 py-10 text-center text-sm text-muted-foreground"
                >
                  {emptyText}
                </td>
              </tr>
            ) : (
              pageRows.map((row, index) => {
                const rowKey = row.id ?? index;
                const actions = buildRowContextMenu?.(row) ?? [];

                const tr = (
                  <tr
                    onClick={(event) => {
                      if (!onRowClick || isInteractiveTarget(event.target)) return;
                      onRowClick(row);
                    }}
                    onKeyDown={(event) => {
                      if (!onRowClick) return;
                      if (isInteractiveTarget(event.target)) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onRowClick(row);
                      }
                    }}
                    tabIndex={onRowClick ? 0 : undefined}
                    className={cn(
                      "border-b border-border/80 transition-colors-smooth hover:bg-[color-mix(in_oklab,var(--surface-muted)_72%,transparent)] focus-within:bg-[color-mix(in_oklab,var(--surface-muted)_68%,transparent)]",
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
                            tdCell,
                            column.align === "right" && "text-right",
                            column.align === "center" && "text-center"
                          )}
                        >
                          {content}
                        </td>
                      );
                    })}
                    {rowActions && (
                      <td className={cn(tdCell, "text-right")} onClick={(e) => e.stopPropagation()}>
                        {rowActions(row)}
                      </td>
                    )}
                  </tr>
                );

                const wrapped =
                  buildRowContextMenu && actions.length > 0 ? (
                    <TableRowContextMenu actions={actions}>{tr}</TableRowContextMenu>
                  ) : (
                    tr
                  );

                return <Fragment key={rowKey}>{wrapped}</Fragment>;
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="workspace-filter-bar m-3 flex flex-col gap-3 border-t-0 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="text-muted-foreground">
            Showing page{" "}
            <span className="font-semibold text-foreground">{clampedPage}</span> of{" "}
            <span className="font-semibold text-foreground">{totalPages}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={clampedPage === 1}
              className="rounded-lg border border-border bg-[var(--surface-card-elevated)] px-3 py-1.5 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.76)] transition hover:-translate-y-0.5 hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-muted)] disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:bg-[var(--surface-card-elevated)]"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={clampedPage === totalPages}
              className="rounded-lg border border-border bg-[var(--surface-card-elevated)] px-3 py-1.5 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.76)] transition hover:-translate-y-0.5 hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-muted)] disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:bg-[var(--surface-card-elevated)]"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
