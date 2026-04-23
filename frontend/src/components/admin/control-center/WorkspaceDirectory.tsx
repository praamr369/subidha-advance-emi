"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";

import { PageSection, SectionHeader } from "@/components/ui/portal-primitives";
import { cn } from "@/lib/utils";

export type WorkspaceDirectoryItem = {
  title: string;
  description: string;
  href: string;
  badge?: string;
  detail?: string;
  icon?: ReactNode;
};

export type WorkspaceDirectoryGroup = {
  title: string;
  description?: string;
  items: WorkspaceDirectoryItem[];
};

export function WorkspaceDirectory({
  title,
  description,
  groups,
  actions,
  className,
}: {
  title: string;
  description?: string;
  groups: WorkspaceDirectoryGroup[];
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <PageSection className={cn("overflow-hidden rounded-[1.8rem] p-5", className)}>
      <SectionHeader title={title} description={description} actions={actions} />
      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        {groups.map((group) => (
          <section
            key={group.title}
            className="rounded-[1.55rem] border border-[color-mix(in_oklab,var(--surface-border-strong)_82%,white_18%)] bg-[linear-gradient(180deg,color-mix(in_oklab,white_98%,var(--surface-muted)_2%),color-mix(in_oklab,var(--surface-card-soft)_84%,var(--surface-muted)_16%))] p-4 shadow-[0_18px_48px_-38px_rgba(15,23,42,0.38)]"
          >
            <div>
              <div className="enterprise-eyebrow">{group.title}</div>
              {group.description ? (
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {group.description}
                </p>
              ) : null}
            </div>
            <div className="mt-4 grid gap-3">
              {group.items.map((item) => (
                <Link
                  key={`${group.title}:${item.href}:${item.title}`}
                  href={item.href}
                  className="group rounded-[1.3rem] border border-[color-mix(in_oklab,var(--surface-border-strong)_80%,white_20%)] bg-[linear-gradient(180deg,color-mix(in_oklab,white_97%,var(--surface-muted)_3%),color-mix(in_oklab,var(--surface-strong)_84%,var(--surface-muted)_16%))] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition hover:-translate-y-0.5 hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-muted)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[color-mix(in_oklab,var(--surface-border-strong)_76%,white_24%)] bg-[var(--surface-card-elevated)] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]">
                      {item.icon ?? <ArrowUpRight className="h-4 w-4" />}
                    </div>
                    {item.badge ? (
                      <span className="workspace-pill px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        {item.badge}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3">
                    <div className="text-sm font-semibold text-foreground">{item.title}</div>
                    <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                      {item.description}
                    </p>
                    {item.detail ? (
                      <p className="mt-2 text-xs font-medium leading-5 text-foreground/80">
                        {item.detail}
                      </p>
                    ) : null}
                  </div>
                  <div className="mt-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-foreground">
                    Open route
                    <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </PageSection>
  );
}
