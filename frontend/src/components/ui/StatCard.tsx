// frontend/src/components/ui/StatCard.tsx
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { ReactNode } from "react";

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
      "border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))]",
    icon: "bg-slate-950/5 text-slate-600",
    accent: "bg-slate-400/70",
  },
  success: {
    shell:
      "border-emerald-200/80 bg-[linear-gradient(180deg,rgba(236,253,245,0.96),rgba(220,252,231,0.84))]",
    icon: "bg-emerald-500/10 text-emerald-700",
    accent: "bg-emerald-500/75",
  },
  warning: {
    shell:
      "border-amber-200/80 bg-[linear-gradient(180deg,rgba(255,251,235,0.98),rgba(254,243,199,0.84))]",
    icon: "bg-amber-500/10 text-amber-700",
    accent: "bg-amber-500/75",
  },
  danger: {
    shell:
      "border-red-200/80 bg-[linear-gradient(180deg,rgba(254,242,242,0.98),rgba(254,226,226,0.84))]",
    icon: "bg-red-500/10 text-red-700",
    accent: "bg-red-500/75",
  },
  info: {
    shell:
      "border-sky-200/80 bg-[linear-gradient(180deg,rgba(240,249,255,0.98),rgba(224,242,254,0.84))]",
    icon: "bg-sky-500/10 text-sky-700",
    accent: "bg-sky-500/75",
  },
};

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
  const card = (
    <div
      className={cn(
        "group relative overflow-hidden rounded-[1.6rem] border p-5 shadow-[0_18px_50px_-38px_rgba(15,23,42,0.58)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_26px_60px_-36px_rgba(15,23,42,0.62)]",
        toneStyle.shell,
        className
      )}
    >
      <div className={cn("absolute inset-x-5 top-0 h-px rounded-full", toneStyle.accent)} />
      <div className="pointer-events-none absolute right-0 top-0 h-24 w-24 rounded-full bg-white/40 blur-2xl" />
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </div>
          <div className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
            {value}
          </div>
          {subtext && (
            <div className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">
              {subtext}
            </div>
          )}
        </div>
        {icon ? (
          <div
            className={cn(
              "rounded-2xl border border-white/70 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]",
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

      {progress !== undefined ? (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {progressLabel || "Progress"}
            </span>
            <span className="font-medium text-foreground">
              {Math.max(0, Math.min(100, progress))}%
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
            />
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
