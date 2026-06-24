// frontend/src/components/ui/StatCard.tsx
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value: string | number;
  subtext?: string;
  icon?: ReactNode;
  tone?: "default" | "success" | "warning" | "danger" | "info";
  href?: string;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  progress?: number;
  progressLabel?: string;
  footer?: ReactNode;
  className?: string;
};

const toneColors = {
  default: {
    shell:
      "border-[color-mix(in_oklab,var(--surface-border-strong)_55%,transparent)] bg-[var(--surface-card-elevated)]",
    icon: "bg-[var(--surface-muted)] text-slate-600",
    accent: "bg-slate-400/45",
  },
  success: {
    shell: "border-emerald-200/60 bg-[var(--surface-card-elevated)]",
    icon: "bg-emerald-500/10 text-emerald-700",
    accent: "bg-emerald-500/65",
  },
  warning: {
    shell: "border-amber-200/60 bg-[var(--surface-card-elevated)]",
    icon: "bg-amber-500/10 text-amber-700",
    accent: "bg-amber-500/65",
  },
  danger: {
    shell: "border-red-200/60 bg-[var(--surface-card-elevated)]",
    icon: "bg-red-500/10 text-red-700",
    accent: "bg-red-500/65",
  },
  info: {
    shell: "border-sky-200/60 bg-[var(--surface-card-elevated)]",
    icon: "bg-sky-500/10 text-sky-700",
    accent: "bg-sky-500/65",
  },
};

function safeMetric(value: string | number): string | number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  const trimmed = value.trim();
  if (!trimmed) return "—";
  return trimmed;
}

export default function StatCard({
  label,
  value,
  subtext,
  icon,
  tone = "default",
  href,
  trend,
  trendValue,
  progress,
  progressLabel,
  footer,
  className,
}: StatCardProps) {
  const toneStyle = toneColors[tone];
  const normalizedValue = safeMetric(value);
  const progressValue =
    typeof progress === "number" && Number.isFinite(progress)
      ? Math.max(0, Math.min(100, progress))
      : undefined;

  const card = (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition motion-safe:duration-150 hover:border-[color-mix(in_oklab,var(--surface-border-strong)_80%,transparent)] hover:shadow-[0_8px_24px_-18px_rgba(15,23,42,0.32)]",
        toneStyle.shell,
        className
      )}
    >
      <div className={cn("absolute left-0 top-0 h-full w-0.5 rounded-full", toneStyle.accent)} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="enterprise-eyebrow">{label}</div>
          <div className="enterprise-metric mt-3 text-foreground">{normalizedValue}</div>
          {subtext ? <div className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">{subtext}</div> : null}
        </div>
        {icon ? (
          <div
            className={cn(
              "rounded-xl p-2.5 ring-1 ring-inset ring-[color-mix(in_oklab,var(--surface-border-strong)_45%,transparent)]",
              toneStyle.icon
            )}
          >
            {icon}
          </div>
        ) : null}
      </div>

      {trend && trendValue ? (
        <div className="mt-3 flex items-center gap-1 text-xs">
          {trend === "up" ? (
            <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600" />
          ) : trend === "down" ? (
            <ArrowDownRight className="h-3.5 w-3.5 text-red-600" />
          ) : null}
          <span
            className={cn(
              trend === "up" && "text-emerald-700",
              trend === "down" && "text-red-700",
              trend === "neutral" && "text-muted-foreground"
            )}
          >
            {trendValue}
          </span>
        </div>
      ) : null}

      {progressValue !== undefined ? (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{progressLabel || "Progress"}</span>
            <span className="font-medium text-foreground">{progressValue}%</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${progressValue}%` }} />
          </div>
        </div>
      ) : null}

      {footer ? <div className="mt-4">{footer}</div> : null}
      {href && footer ? (
        <div className="mt-4 border-t border-[color-mix(in_oklab,var(--surface-border-strong)_70%,white_30%)] pt-3">
          <Link
            href={href}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground transition hover:text-primary"
          >
            Open details
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : null}
    </div>
  );

  if (href && !footer) {
    return (
      <Link href={href} className="block">
        {card}
      </Link>
    );
  }

  return card;
}
