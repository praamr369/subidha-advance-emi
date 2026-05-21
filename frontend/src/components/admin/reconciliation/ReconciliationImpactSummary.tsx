"use client";

import type { ReconciliationItem } from "@/types/reconciliation";

function formatMoney(value?: string | null) {
  if (value === null || value === undefined || value === "") return "—";
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return `₹${num.toFixed(2)}`;
}

export default function ReconciliationImpactSummary({ item }: { item: ReconciliationItem }) {
  const hasAmount =
    item.expected_amount !== null ||
    item.actual_amount !== null ||
    item.amount_delta !== null;

  if (!hasAmount) return null;

  return (
    <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border/70 bg-[var(--surface-card-elevated)] p-4 sm:grid-cols-3">
      <div>
        <div className="text-xs font-semibold text-muted-foreground">Expected</div>
        <div className="mt-1 text-sm font-semibold">{formatMoney(item.expected_amount)}</div>
      </div>
      <div>
        <div className="text-xs font-semibold text-muted-foreground">Actual</div>
        <div className="mt-1 text-sm font-semibold">{formatMoney(item.actual_amount)}</div>
      </div>
      <div>
        <div className="text-xs font-semibold text-muted-foreground">Delta</div>
        <div className="mt-1 text-sm font-semibold">{formatMoney(item.amount_delta)}</div>
      </div>
    </div>
  );
}

