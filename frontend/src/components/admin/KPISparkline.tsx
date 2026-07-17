"use client";

import { useMemo } from "react";

type KPISparklineProps = {
  data: number[];
  trend: "up" | "down" | "neutral";
  height?: number;
  className?: string;
};

export default function KPISparkline({ data, trend, height = 40, className }: KPISparklineProps) {
  const { pathD, max, min } = useMemo(() => {
    if (!data || data.length === 0) return { pathD: "", max: 0, min: 0 };

    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;

    const width = 100;
    const pointWidth = width / (data.length - 1 || 1);
    const padding = 2;

    const points = data.map((value, idx) => {
      const x = idx * pointWidth + padding;
      const normalizedY = (value - min) / range;
      const y = height - normalizedY * (height - padding * 2) - padding;
      return `${x},${y}`;
    });

    const pathD = `M ${points.join(" L ")}`;
    return { pathD, max, min };
  }, [data, height]);

  const strokeColor =
    trend === "up"
      ? "#10b981"
      : trend === "down"
        ? "#ef4444"
        : "#9ca3af";

  const fillColor =
    trend === "up"
      ? "rgba(16, 185, 129, 0.1)"
      : trend === "down"
        ? "rgba(239, 68, 68, 0.1)"
        : "rgba(156, 163, 175, 0.05)";

  return (
    <svg
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      className={`w-full ${className}`}
      style={{ height: `${height}px` }}
    >
      {/* Fill area under line */}
      <defs>
        <linearGradient id={`gradient-${trend}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.2" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Area under curve */}
      {pathD && (
        <path
          d={`${pathD} L 100,${height} L 0,${height} Z`}
          fill={`url(#gradient-${trend})`}
          opacity="0.5"
        />
      )}

      {/* Line path */}
      {pathD && (
        <path
          d={pathD}
          stroke={strokeColor}
          strokeWidth="1.5"
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
      )}

      {/* Data points */}
      {data.map((_, idx) => {
        const pointWidth = 100 / (data.length - 1 || 1);
        const x = idx * pointWidth;
        const normalizedY = (data[idx] - min) / (max - min || 1);
        const y = height - normalizedY * (height - 4) - 2;
        return (
          <circle
            key={idx}
            cx={x}
            cy={y}
            r="0.8"
            fill={strokeColor}
            opacity="0.6"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
}
