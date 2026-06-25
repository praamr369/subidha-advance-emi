"use client";

import Link from "next/link";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import type { ReconciliationModuleSummary, ReconciliationRun } from "@/types/reconciliation";

export default function ReconciliationModuleMatrix({
  run,
  modules,
}: {
  run: ReconciliationRun | null;
  modules: ReconciliationModuleSummary[];
}) {
  if (!run) {
    return <ERPEmptyState title="No run selected" description="Start a run to populate module summaries." />;
  }
  if (!modules.length) {
    return <ERPEmptyState title="No modules" description="No items detected for this run scope." />;
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {modules.map((m) => (
        <div key={m.module} className="rounded-xl border border-border/70 bg-[var(--surface-card-elevated)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">{m.module}</div>
              <div className="mt-1 text-xs text-muted-foreground">Run #{run.run_no}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Open</div>
              <div className="mt-1 text-sm font-semibold">{m.open_count}</div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <div>High risk: {m.high_risk_count}</div>
            <Link href={`/admin/reconciliation/runs/${run.id}?module=${encodeURIComponent(m.module)}`} className="font-semibold text-foreground hover:underline">
              View queue
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}

