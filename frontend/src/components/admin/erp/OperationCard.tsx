"use client";

import Link from "next/link";

import { SeverityBadge } from "@/components/admin/erp/SeverityBadge";
import { SmartEmptyState } from "@/components/admin/erp/SmartEmptyState";
import type { ErpCard } from "@/services/admin-erp";

export function OperationCard({ card }: { card: ErpCard }) {
  return (
    <article className="rounded-xl border border-white/80 bg-white/80 p-4 shadow-[0_14px_26px_-24px_rgba(15,23,42,0.45)]">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-semibold text-foreground">{card.label}</div>
        <SeverityBadge severity={card.severity} />
      </div>
      <div className="mt-3 text-2xl font-semibold text-foreground">{card.value || card.count}</div>
      <div className="mt-1 text-xs text-muted-foreground">
        {card.source_breakdown && card.source_breakdown.length > 0 ? (
          <div className="space-y-0.5">
            {card.source_breakdown.map((entry) => (
              <div key={entry.label}>
                <span className="font-medium text-foreground">{entry.label}</span>: {entry.count}
              </div>
            ))}
            <div className="text-[11px] text-muted-foreground/90">{card.source}</div>
          </div>
        ) : (
          <>Queue: {card.source}</>
        )}
      </div>
      {card.count === 0 ? (
        <div className="mt-3">
          <SmartEmptyState label={card.empty_state || "No records."} />
        </div>
      ) : null}
      <div className="mt-3">
        <Link href={card.deep_link} className="text-xs font-semibold text-primary hover:underline">
          Open workflow
        </Link>
      </div>
    </article>
  );
}
