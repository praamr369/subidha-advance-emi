"use client";

import { useMemo, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";

import OperationalResizableWorkspace from "./OperationalResizableWorkspace";

import { cn } from "@/lib/utils";

type Row = Record<string, unknown>;

function rowId(row: Row) {
  return String(row.id ?? row.need_no ?? "");
}

export function StockNeedsOperationalWorkspace({
  rows,
  count,
}: {
  rows: Row[];
  count: number;
}) {
  const [userSelectedId, setUserSelectedId] = useState<string | null>(null);

  const activeId = useMemo(() => {
    if (rows.length === 0) return null;
    const ids = rows.map(rowId);
    if (userSelectedId && ids.includes(userSelectedId)) {
      return userSelectedId;
    }
    return null;
  }, [rows, userSelectedId]);

  const selected = useMemo(
    () => rows.find((r) => rowId(r) === activeId) ?? null,
    [rows, activeId]
  );

  const leftPane =
    rows.length === 0 ? (
      <div className="rounded-2xl border border-border bg-card p-6">
        <EmptyState
          title="No stock needs"
          description="There are no purchase or stock needs to show in this workspace."
          tone="info"
        />
      </div>
    ) : (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Showing {rows.length} of {count} record(s).
        </p>
        <div className="max-h-[min(68vh,620px)] overflow-auto rounded-2xl border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="sticky top-0 bg-muted/40 backdrop-blur-sm">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Need</th>
                <th className="px-3 py-2 text-left font-medium">Product</th>
                <th className="px-3 py-2 text-left font-medium">Shortage</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {rows.map((r) => {
                const id = rowId(r);
                const active = id === activeId;
                return (
                  <tr
                    key={id}
                    className={cn(
                      "cursor-pointer transition",
                      active ? "bg-muted/50" : "hover:bg-muted/25"
                    )}
                    onClick={() => setUserSelectedId(id)}
                  >
                    <td className="px-3 py-2 whitespace-nowrap">{String(r.need_no ?? r.id)}</td>
                    <td className="px-3 py-2">{String(r.product_name_snapshot ?? r.product ?? "—")}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{String(r.shortage_quantity ?? "—")}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{String(r.status ?? "—")}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {String(r.source_module ?? r.source_type ?? "—")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );

  const rightPane = !selected ? (
    <div className="rounded-2xl border border-dashed border-border bg-card/60 p-6">
      <EmptyState
        title="Select a need"
        description="Choose a stock need row to inspect every field returned by the API."
        tone="info"
      />
    </div>
  ) : (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">Need detail</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Values shown exactly as returned — no synthesized fields.
      </p>
      <dl className="mt-4 grid gap-2 text-sm">
        {Object.keys(selected)
          .sort((a, b) => a.localeCompare(b))
          .map((key) => (
            <div
              key={key}
              className="flex flex-col gap-0.5 border-b border-border/70 pb-2 sm:flex-row sm:justify-between sm:gap-4"
            >
              <dt className="font-medium text-muted-foreground">{key}</dt>
              <dd className="break-all text-right text-foreground sm:text-left">
                {selected[key] === null || selected[key] === undefined
                  ? "—"
                  : typeof selected[key] === "object"
                    ? JSON.stringify(selected[key])
                    : String(selected[key])}
              </dd>
            </div>
          ))}
      </dl>
    </section>
  );

  return (
    <OperationalResizableWorkspace
      storageKey="inventory-stock-needs-v1"
      defaultLeftPercent={52}
      minLeftPercent={36}
      minRightPercent={28}
      left={leftPane}
      right={rightPane}
    />
  );
}
