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
      "border-border bg-[linear-gradient(180deg,var(--surface-card-elevated),color-mix(in_oklab,var(--surface-card)_84%,var(--surface-muted)_16%))]",
    icon: "bg-[var(--surface-strong)] text-slate-700",
    accent: "bg-slate-400/55",
  },
  success: {
    shell:
      "border-emerald-200/80 bg-[linear-gradient(180deg,rgba(236,253,245,0.97),rgba(220,252,231,0.86))]",
    icon: "bg-emerald-500/10 text-emerald-700",
    accent: "bg-emerald-500/70",
  },
  warning: {
    shell:
      "border-amber-200/80 bg-[linear-gradient(180deg,rgba(255,251,235,0.98),rgba(254,243,199,0.88))]",
    icon: "bg-amber-500/10 text-amber-700",
    accent: "bg-amber-500/72",
  },
  danger: {
    shell:
      "border-red-200/80 bg-[linear-gradient(180deg,rgba(254,242,242,0.98),rgba(254,226,226,0.86))]",
    icon: "bg-red-500/10 text-red-700",
    accent: "bg-red-500/72",
  },
  info: {
    shell:
      "border-sky-200/80 bg-[linear-gradient(180deg,rgba(240,249,255,0.98),rgba(224,242,254,0.88))]",
    icon: "bg-sky-500/10 text-sky-700",
    accent: "bg-sky-500/72",
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
        "group relative overflow-hidden rounded-[1.6rem] border p-5 shadow-[0_18px_50px_-38px_rgba(15,23,42,0.46)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_26px_60px_-36px_rgba(15,23,42,0.56)]",
        toneStyle.shell,
        className
      )}
    >
      <div className={cn("absolute inset-x-5 top-0 h-px rounded-full", toneStyle.accent)} />
      <div className="pointer-events-none absolute right-0 top-0 h-24 w-24 rounded-full bg-white/40 blur-2xl" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="enterprise-eyebrow">{label}</div>
          <div className="enterprise-metric mt-3 text-foreground">{normalizedValue}</div>
          {subtext ? <div className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">{subtext}</div> : null}
        </div>
        {icon ? (
          <div
            className={cn(
              "rounded-2xl border border-slate-300 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]",
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
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {card}
      </Link>
    );
  }

  return card;
}
