"use client";

import React from "react";
import { TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight } from "lucide-react";

export interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: {
    value: number;
    direction: "up" | "down";
    timeframe?: string;
  };
  icon?: React.ReactNode;
  color?: "blue" | "green" | "red" | "amber" | "purple" | "pink" | "indigo";
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
  loading?: boolean;
  format?: (value: any) => string;
  comparison?: string;
}

const colorClasses = {
  blue: "bg-blue-50 border-blue-200 text-blue-900 icon-bg-blue-100",
  green: "bg-green-50 border-green-200 text-green-900 icon-bg-green-100",
  red: "bg-red-50 border-red-200 text-red-900 icon-bg-red-100",
  amber: "bg-amber-50 border-amber-200 text-amber-900 icon-bg-amber-100",
  purple: "bg-purple-50 border-purple-200 text-purple-900 icon-bg-purple-100",
  pink: "bg-pink-50 border-pink-200 text-pink-900 icon-bg-pink-100",
  indigo: "bg-indigo-50 border-indigo-200 text-indigo-900 icon-bg-indigo-100",
};

const iconBgClasses = {
  blue: "bg-blue-100 text-blue-600",
  green: "bg-green-100 text-green-600",
  red: "bg-red-100 text-red-600",
  amber: "bg-amber-100 text-amber-600",
  purple: "bg-purple-100 text-purple-600",
  pink: "bg-pink-100 text-pink-600",
  indigo: "bg-indigo-100 text-indigo-600",
};

const trendColors = {
  up: "text-green-600 bg-green-50",
  down: "text-red-600 bg-red-50",
};

const sizeClasses = {
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

export const ModernKPICard: React.FC<KPICardProps> = ({
  title,
  value,
  subtitle,
  trend,
  icon,
  color = "blue",
  size = "md",
  onClick,
  loading = false,
  format,
  comparison,
}) => {
  const displayValue = format ? format(value) : String(value);
  const colorClass = colorClasses[color];
  const iconBgClass = iconBgClasses[color];

  return (
    <div
      className={`border rounded-xl transition-all hover:shadow-lg hover:scale-105 cursor-pointer ${sizeClasses[size]} ${colorClass}`}
      onClick={onClick}
      style={{ borderColor: "currentColor", opacity: colorClass.includes("border") ? 1 : 0.8 }}
    >
      <div className="flex items-start justify-between">
        {/* Content */}
        <div className="flex-1">
          <p className="text-sm font-medium opacity-80">{title}</p>
          {loading ? (
            <div className="mt-2 h-8 bg-slate-200 animate-pulse rounded w-32" />
          ) : (
            <h3 className={`text-2xl font-bold mt-2 ${size === "lg" ? "text-4xl" : ""}`}>
              {displayValue}
            </h3>
          )}

          {/* Subtitle or Comparison */}
          {subtitle && <p className="text-xs opacity-70 mt-1">{subtitle}</p>}
          {comparison && <p className="text-xs opacity-70 mt-1">{comparison}</p>}

          {/* Trend */}
          {trend && (
            <div className={`flex items-center gap-1 mt-2 px-2 py-1 rounded text-xs font-medium ${trendColors[trend.direction]}`}>
              {trend.direction === "up" ? (
                <ArrowUpRight className="w-3 h-3" />
              ) : (
                <ArrowDownRight className="w-3 h-3" />
              )}
              <span>{Math.abs(trend.value)}%</span>
              {trend.timeframe && <span className="opacity-70">vs {trend.timeframe}</span>}
            </div>
          )}
        </div>

        {/* Icon */}
        {icon && (
          <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBgClass}`}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
};

export default ModernKPICard;
