"use client";

import Link from "next/link";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import Table from "@/components/ui/table";
import type { ReconciliationItem } from "@/types/reconciliation";
import ReconciliationSeverityBadge from "./ReconciliationSeverityBadge";

export default function ReconciliationExceptionQueue({ items }: { items: ReconciliationItem[] }) {
  if (!items.length) {
    return <ERPEmptyState title="No exceptions" description="No items found for the selected filters/run." />;
  }

  return (
    <Table
      head={
        <tr>
          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Severity</th>
          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Status</th>
          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Code</th>
          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Source</th>
          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Created</th>
        </tr>
      }
      body={
        <>
          {items.map((row) => (
            <tr key={row.id} className="border-b border-border/60 last:border-b-0 hover:bg-[var(--surface-muted)]">
              <td className="px-4 py-3">
                <ReconciliationSeverityBadge severity={row.severity} />
              </td>
              <td className="px-4 py-3 text-sm">{row.status}</td>
              <td className="px-4 py-3 text-sm font-semibold">{row.exception_code}</td>
              <td className="px-4 py-3 text-sm">
                <Link href={`/admin/reconciliation/items/${row.id}`} className="hover:underline">
                  {row.source_type}#{row.source_id}
                </Link>
              </td>
              <td className="px-4 py-3 text-sm">{row.created_at}</td>
            </tr>
          ))}
        </>
      }
    />
  );
}
