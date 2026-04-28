"use client";

import type { ReactNode } from "react";

import { SmartEmptyState } from "@/components/admin/erp/SmartEmptyState";

export function BiChartCard({
  title,
  source,
  asOf,
  href = "/admin/reports",
  actionHref = "/admin/operations",
  emptyReason,
  children,
}: {
  title: string;
  source: string;
  asOf: string;
  href?: string;
  actionHref?: string;
  emptyReason?: string | null;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/80 bg-white/80 p-5 shadow-[0_14px_26px_-24px_rgba(15,23,42,0.45)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <div className="mt-1 text-xs text-muted-foreground">
            Source: {source} · As of {new Date(asOf).toLocaleString()}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <a href={href} aria-label="View Details" className="text-xs font-semibold text-primary hover:underline">
            View Details
          </a>
          <a href={actionHref} aria-label="Take Action" className="text-xs font-semibold text-amber-700 hover:underline">
            Take Action
          </a>
        </div>
      </div>
      <div className="mt-4">
        {emptyReason ? <SmartEmptyState label={emptyReason} /> : children}
      </div>
    </section>
  );
}

