"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";

import { PageSection, SectionHeader } from "@/components/ui/portal-primitives";
import { cn } from "@/lib/utils";

export type ControlLaneItem = {
  title: string;
  description: string;
  href: string;
  icon?: ReactNode;
  badge?: string;
  detail?: string;
};

export function ControlLaneGrid({
  title,
  description,
  lanes,
  actions,
  className,
}: {
  title: string;
  description: string;
  lanes: ControlLaneItem[];
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <PageSection className={cn("overflow-hidden rounded-[1.8rem] p-5", className)}>
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[var(--surface-border-strong)]/80 to-transparent" />
      <SectionHeader title={title} description={description} actions={actions} />
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {lanes.map((lane) => (
          <ControlLaneCard key={`${lane.href}:${lane.title}`} lane={lane} />
        ))}
      </div>
    </PageSection>
  );
}

export function ControlLaneCard({ lane }: { lane: ControlLaneItem }) {
  return (
    <Link
      href={lane.href}
      className="group rounded-[1.5rem] border border-border bg-[var(--surface-card-elevated)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] transition hover:-translate-y-0.5 hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-muted)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-[var(--surface-strong)] text-foreground">
          {lane.icon ?? <ArrowUpRight className="h-4 w-4" />}
        </div>
        {lane.badge ? (
          <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {lane.badge}
          </span>
        ) : null}
      </div>
      <div className="mt-4">
        <div className="text-sm font-semibold text-foreground">{lane.title}</div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{lane.description}</p>
        {lane.detail ? (
          <p className="mt-3 text-xs font-medium leading-5 text-foreground/80">{lane.detail}</p>
        ) : null}
      </div>
      <div className="mt-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-foreground">
        Open lane
        <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}
