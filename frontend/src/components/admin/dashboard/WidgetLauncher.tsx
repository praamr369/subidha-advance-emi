"use client";

import type { ReactNode } from "react";
import { Plus, CheckCircle2, Pin } from "lucide-react";

import type { AdminDashboardWidgetAttention } from "@/lib/admin-dashboard-widgets";
import { cn } from "@/lib/utils";

export type WidgetLauncherItem = {
  id: string;
  title: string;
  description: string;
  icon: ReactNode;
  attention?: AdminDashboardWidgetAttention;
  attentionLabel?: string;
};

function attentionTone(attention: AdminDashboardWidgetAttention | undefined) {
  if (attention === "urgent") return "border-red-200/80 bg-red-50/90 text-red-900";
  if (attention === "warning") return "border-amber-200/80 bg-amber-50/90 text-amber-900";
  if (attention === "quiet") return "border-emerald-200/80 bg-emerald-50/90 text-emerald-900";
  return "border-border bg-muted/50 text-foreground";
}

export default function WidgetLauncher({
  title = "Operations palette",
  subtitle = "Open and pin operational widgets based on the current workload. All widgets use real module data only.",
  items,
  openIds,
  pinnedIds,
  onOpen,
  className,
}: {
  title?: string;
  subtitle?: string;
  items: readonly WidgetLauncherItem[];
  openIds: ReadonlySet<string>;
  pinnedIds: ReadonlySet<string>;
  onOpen: (id: string) => void;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "surface-panel-elevated relative overflow-hidden rounded-[1.75rem] border border-border bg-card p-5 shadow-[0_18px_54px_-44px_rgba(15,23,42,0.52)]",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[var(--surface-border-strong)]/70 to-transparent" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-slate-950">{title}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{subtitle}</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3 py-2 text-xs font-semibold text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.76)]">
          <Pin className="h-3.5 w-3.5" />
          Pin widgets you keep open daily
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const isOpen = openIds.has(item.id);
          const isPinned = pinnedIds.has(item.id);
          const attention = item.attention;
          const label = item.attentionLabel;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpen(item.id)}
              disabled={isOpen}
              className={cn(
                "group flex min-h-[92px] items-start gap-3 rounded-[1.4rem] border border-border bg-[var(--surface-card-elevated)] px-4 py-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.78),0_12px_35px_-28px_rgba(15,23,42,0.42)] transition hover:-translate-y-0.5 hover:border-border hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60"
              )}
            >
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
                {item.icon}
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-semibold text-slate-950">
                    {item.title}
                  </span>
                  {isPinned ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      <Pin className="h-3 w-3" />
                      Pinned
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]",
                      attentionTone(attention)
                    )}
                  >
                    {label ??
                      (attention === "urgent"
                        ? "Urgent"
                        : attention === "warning"
                          ? "Attention"
                          : attention === "quiet"
                            ? "Quiet"
                            : "Normal")}
                  </span>
                </span>

                <span className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                  {item.description}
                </span>
              </span>

              <span className="mt-1 inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-muted-foreground transition group-hover:text-sky-700">
                {isOpen ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Open
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Open
                  </>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

