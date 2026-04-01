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
  default: "border-border bg-card",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  danger: "border-red-200 bg-red-50 text-red-700",
  info: "border-blue-200 bg-blue-50 text-blue-700",
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
  const card = (
    <div className={cn("rounded-2xl border p-5 shadow-sm", toneColors[tone], className)}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">{value}</div>
          {subtext && (
            <div className="mt-1 text-sm text-muted-foreground">{subtext}</div>
          )}
        </div>
        {icon ? (
          <div className="rounded-xl bg-background/60 p-2 text-muted-foreground">
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
    return <Link href={href}>{card}</Link>;
  }

  return card;
}
