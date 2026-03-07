"use client";

import { ReactNode, useMemo, useState } from "react";

type Align = "left" | "center" | "right";

export type Column<T> = {
  key: keyof T | string;
  title: string;

  width?: number | string;
  align?: Align;

  sortable?: boolean;

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
    let r = [...rows];

    if (sortKey) {
      r.sort((a, b) => {
        const va = (a as any)[sortKey];
        const vb = (b as any)[sortKey];

        if (va === vb) return 0;

        if (va > vb) return sortAsc ? 1 : -1;
        return sortAsc ? -1 : 1;
      });
    }

    return r;
  }, [rows, sortKey, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(processedRows.length / pageSize));

  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return processedRows.slice(start, start + pageSize);
  }, [processedRows, page, pageSize]);

  if (loading)
    return (
      <div
        style={{
          padding: 30,
          textAlign: "center",
          color: "#64748b",
        }}
      >
        Loading data...
      </div>
    );

  if (error)
    return (
      <div
        style={{
          padding: 20,
          border: "1px solid #fecaca",
          background: "#fef2f2",
          color: "#991b1b",
          borderRadius: 8,
        }}
      >
        {error}
      </div>
    );

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        overflow: "hidden",
        background: "#ffffff",
      }}
    >
      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 14,
          }}
        >
          <thead
            style={{
              background: "#f8fafc",
              borderBottom: "1px solid #e5e7eb",
            }}
          >
            <tr>
              {columns.map((col) => (
                <th
                  key={String(col.key)}
                  onClick={() => {
                    if (!col.sortable) return;

                    const key = String(col.key);

                    if (sortKey === key) {
                      setSortAsc(!sortAsc);
                    } else {
                      setSortKey(key);
                      setSortAsc(true);
                    }
                  }}
                  style={{
                    padding: "12px 14px",
                    textAlign: col.align ?? "left",
                    cursor: col.sortable ? "pointer" : "default",
                    whiteSpace: "nowrap",
                    userSelect: "none",
                    fontWeight: 600,
                  }}
                >
                  {col.title}

                  {col.sortable && sortKey === col.key && (
                    <span style={{ marginLeft: 6 }}>
                      {sortAsc ? "▲" : "▼"}
                    </span>
                  )}
                </th>
              ))}

              {rowActions && (
                <th
                  style={{
                    textAlign: "right",
                    padding: "12px 14px",
                  }}
                >
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
                  style={{
                    padding: 30,
                    textAlign: "center",
                    color: "#64748b",
                  }}
                >
                  {emptyText}
                </td>
              </tr>
            ) : (
              pageRows.map((row, idx) => (
                <tr
                  key={String(row.id ?? idx)}
                  onClick={() => onRowClick?.(row)}
                  style={{
                    borderBottom: "1px solid #f1f5f9",
                    cursor: onRowClick ? "pointer" : "default",
                  }}
                >
                  {columns.map((col) => (
                    <td
                      key={String(col.key)}
                      style={{
                        padding: "12px 14px",
                        textAlign: col.align ?? "left",
                      }}
                    >
                      {col.render
                        ? col.render(row)
                        : String(
                            (row as Record<string, unknown>)[
                              String(col.key)
                            ] ?? "-"
                          )}
                    </td>
                  ))}

                  {rowActions && (
                    <td
                      style={{
                        padding: "12px 14px",
                        textAlign: "right",
                      }}
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
        <div
          style={{
            padding: 12,
            display: "flex",
            justifyContent: "space-between",
            borderTop: "1px solid #e5e7eb",
            fontSize: 13,
          }}
        >
          <div>
            Page {page} of {totalPages}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>

            <button
              disabled={page === totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}