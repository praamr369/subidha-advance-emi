"use client";

import type { ReactNode } from "react";

import { MetricCard } from "@/components/ui/portal-primitives";
import { cn } from "@/lib/utils";

export type ERPMetric = {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  className?: string;
};

type ERPMetricStripProps = {
  metrics: ReadonlyArray<ERPMetric>;
  className?: string;
};

export default function ERPMetricStrip({ metrics, className }: ERPMetricStripProps) {
  if (metrics.length === 0) return null;

  return (
    <div className={cn("grid gap-2 grid-cols-2 sm:grid-cols-3 xl:grid-cols-6", className)}>
      {metrics.map((metric) => (
        <MetricCard
          key={metric.label}
          label={metric.label}
          value={metric.value}
          detail={metric.detail}
          className={metric.className}
        />
      ))}
    </div>
  );
}

