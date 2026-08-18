"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";

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
    <div className={cn("mb-6 overflow-hidden rounded-2xl border border-border bg-[var(--surface-card-soft)] p-4 shadow-sm", className)}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {actions && <div>{actions}</div>}
      </div>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((group) => (
          <div key={group.title} className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                {group.title}
              </h3>
            </div>
            <div className="grid gap-2">
              {group.items.map((item) => (
                <Link
                  key={`${group.title}:${item.href}:${item.title}`}
                  href={item.href}
                  className="group flex items-center gap-3 rounded-xl border border-border bg-background p-2.5 transition-all hover:border-foreground/30 hover:shadow-sm"
                  title={item.description}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[color-mix(in_oklab,var(--surface-border-strong)_76%,white_24%)] bg-[var(--surface-card-elevated)] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]">
                    {item.icon ?? <ArrowUpRight className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 truncate">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground group-hover:text-foreground">{item.title}</span>
                      {item.badge && (
                        <span className="workspace-pill px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {item.badge}
                        </span>
                      )}
                    </div>
                    {item.detail ? (
                      <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {item.detail}
                      </div>
                    ) : null}
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground/40 transition group-hover:translate-x-0.5 group-hover:text-foreground" />
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
