"use client";

import Link from "next/link";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import Table from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { ReconciliationRun } from "@/types/reconciliation";

export default function ReconciliationRunTable({ runs }: { runs: ReconciliationRun[] }) {
  if (!runs.length) {
    return <ERPEmptyState title="No reconciliation runs yet" description="Start the first Phase F run to populate the exception queue." />;
  }

  return (
    <Table
      head={
        <tr>
          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Run</th>
          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Status</th>
          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Scope</th>
          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Exceptions</th>
          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">High Risk</th>
          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Started</th>
        </tr>
      }
      body={
        <>
          {runs.map((run) => (
            <tr key={run.id} className={cn("border-b border-border/60 last:border-b-0 hover:bg-[var(--surface-muted)]")}>
              <td className="px-4 py-3">
                <Link href={`/admin/reconciliation/runs/${run.id}`} className="font-semibold hover:underline">
                  #{run.run_no}
                </Link>
              </td>
              <td className="px-4 py-3 text-sm">{run.status}</td>
              <td className="px-4 py-3 text-sm">{run.scope}</td>
              <td className="px-4 py-3 text-right text-sm">{run.total_exceptions}</td>
              <td className="px-4 py-3 text-right text-sm">{run.high_risk_count}</td>
              <td className="px-4 py-3 text-sm">{run.started_at}</td>
            </tr>
          ))}
        </>
      }
    />
  );
}
