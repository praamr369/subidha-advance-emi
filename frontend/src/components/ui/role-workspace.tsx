"use client";

import type { ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Dot,
  Info,
} from "lucide-react";

import { cn } from "@/lib/utils";

type WorkspaceNoticeTone =
  | "default"
  | "info"
  | "success"
  | "warning"
  | "danger";

const noticeToneStyles: Record<
  WorkspaceNoticeTone,
  {
    shell: string;
    icon: string;
  }
> = {
  default: {
    shell:
      "border-border bg-[linear-gradient(180deg,color-mix(in_oklab,white_96%,var(--surface-muted)_4%),color-mix(in_oklab,var(--surface-card-soft)_78%,var(--surface-muted)_22%))] text-foreground",
    icon: "border-border bg-[var(--surface-card-elevated)] text-muted-foreground",
  },
  info: {
    shell:
      "border-sky-200/90 bg-[linear-gradient(180deg,rgba(240,249,255,0.98),rgba(224,242,254,0.92))] text-sky-950",
    icon: "border-sky-200/90 bg-white/90 text-sky-700",
  },
  success: {
    shell:
      "border-emerald-200/90 bg-[linear-gradient(180deg,rgba(236,253,245,0.98),rgba(220,252,231,0.92))] text-emerald-950",
    icon: "border-emerald-200/90 bg-white/90 text-emerald-700",
  },
  warning: {
    shell:
      "border-amber-200/90 bg-[linear-gradient(180deg,rgba(255,251,235,0.98),rgba(254,243,199,0.92))] text-amber-950",
    icon: "border-amber-200/90 bg-white/90 text-amber-700",
  },
  danger: {
    shell:
      "border-red-200/90 bg-[linear-gradient(180deg,rgba(254,242,242,0.98),rgba(254,226,226,0.92))] text-red-950",
    icon: "border-red-200/90 bg-white/90 text-red-700",
  },
};

function renderToneIcon(tone: WorkspaceNoticeTone) {
  switch (tone) {
    case "success":
      return <CheckCircle2 className="h-4 w-4" />;
    case "warning":
      return <AlertTriangle className="h-4 w-4" />;
    case "danger":
      return <AlertTriangle className="h-4 w-4" />;
    case "info":
      return <Info className="h-4 w-4" />;
    case "default":
    default:
      return <Clock3 className="h-4 w-4" />;
  }
}

export function WorkspaceNotice({
  title,
  children,
  tone = "default",
  action,
  className,
}: {
  title?: string;
  children: ReactNode;
  tone?: WorkspaceNoticeTone;
  action?: ReactNode;
  className?: string;
}) {
  const styles = noticeToneStyles[tone];

  return (
    <div
      className={cn(
        "rounded-[1.45rem] border px-4 py-4 shadow-[0_18px_42px_-34px_rgba(15,23,42,0.28)]",
        styles.shell,
        className
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={cn(
              "mt-0.5 rounded-2xl border p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.76)]",
              styles.icon
            )}
          >
            {renderToneIcon(tone)}
          </div>
          <div className="min-w-0">
            {title ? (
              <p className="text-sm font-semibold tracking-[0.01em]">{title}</p>
            ) : null}
            <div
              className={cn(
                "text-sm leading-6",
                title ? "mt-1" : "mt-0.5"
              )}
            >
              {children}
            </div>
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}

export type WorkspaceTimelineItem = {
  id: string | number;
  title: string;
  description?: ReactNode;
  timestamp?: ReactNode;
  badge?: ReactNode;
  meta?: ReactNode;
};

export function WorkspaceTimeline({
  items,
  className,
}: {
  items: WorkspaceTimelineItem[];
  className?: string;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <ol className={cn("space-y-4", className)}>
      {items.map((item, index) => (
        <li key={item.id} className="relative pl-8">
          <span className="absolute left-0 top-0 flex h-6 w-6 items-center justify-center rounded-full border border-[var(--surface-border-strong)] bg-[var(--surface-card-elevated)] text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.76)]">
            <Dot className="h-5 w-5" />
          </span>
          {index < items.length - 1 ? (
            <span className="absolute left-3 top-6 h-[calc(100%-0.25rem)] w-px bg-[color-mix(in_oklab,var(--surface-border-strong)_82%,transparent)]" />
          ) : null}
          <div className="rounded-[1.35rem] border border-[color-mix(in_oklab,var(--surface-border-strong)_82%,white_18%)] bg-[linear-gradient(180deg,color-mix(in_oklab,white_98%,var(--surface-muted)_2%),color-mix(in_oklab,var(--surface-card-soft)_82%,var(--surface-muted)_18%))] px-4 py-4 shadow-[0_18px_44px_-36px_rgba(15,23,42,0.32)]">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">
                    {item.title}
                  </p>
                  {item.badge}
                </div>
                {item.description ? (
                  <div className="mt-2 text-sm leading-6 text-muted-foreground">
                    {item.description}
                  </div>
                ) : null}
              </div>
              <div className="min-w-0 shrink-0 text-right text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {item.timestamp}
              </div>
            </div>
            {item.meta ? (
              <div className="mt-3 border-t border-border/80 pt-3 text-xs leading-5 text-muted-foreground">
                {item.meta}
              </div>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
