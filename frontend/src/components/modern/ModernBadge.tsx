"use client";

import React from "react";
import { X } from "lucide-react";

export type BadgeColor = "blue" | "green" | "red" | "amber" | "purple" | "pink" | "slate" | "cyan";
export type BadgeSize = "sm" | "md" | "lg";

export interface ModernBadgeProps {
  children: React.ReactNode;
  color?: BadgeColor;
  size?: BadgeSize;
  variant?: "solid" | "outline" | "soft";
  icon?: React.ReactNode;
  removable?: boolean;
  onRemove?: () => void;
}

const colorClasses: Record<BadgeColor, Record<string, string>> = {
  blue: {
    solid: "bg-blue-600 text-white",
    outline: "border border-blue-600 text-blue-600",
    soft: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  },
  green: {
    solid: "bg-green-600 text-white",
    outline: "border border-green-600 text-green-600",
    soft: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  },
  red: {
    solid: "bg-red-600 text-white",
    outline: "border border-red-600 text-red-600",
    soft: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  },
  amber: {
    solid: "bg-amber-600 text-white",
    outline: "border border-amber-600 text-amber-600",
    soft: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
  purple: {
    solid: "bg-purple-600 text-white",
    outline: "border border-purple-600 text-purple-600",
    soft: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  },
  pink: {
    solid: "bg-pink-600 text-white",
    outline: "border border-pink-600 text-pink-600",
    soft: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
  },
  slate: {
    solid: "bg-slate-600 text-white",
    outline: "border border-slate-600 text-slate-600",
    soft: "bg-slate-100 text-slate-700 dark:bg-slate-700/50 dark:text-slate-300",
  },
  cyan: {
    solid: "bg-cyan-600 text-white",
    outline: "border border-cyan-600 text-cyan-600",
    soft: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  },
};

const sizeClasses: Record<BadgeSize, string> = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-3 py-1 text-sm",
  lg: "px-4 py-1.5 text-base",
};

export const ModernBadge: React.FC<ModernBadgeProps> = ({
  children,
  color = "blue",
  size = "md",
  variant = "solid",
  icon,
  removable = false,
  onRemove,
}) => {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full font-medium ${sizeClasses[size]} ${
        colorClasses[color][variant]
      }`}
    >
      {icon && <span>{icon}</span>}
      <span>{children}</span>
      {removable && (
        <button
          onClick={onRemove}
          className="hover:opacity-70 transition"
          aria-label="Remove"
        >
          <X className={size === "sm" ? "w-3 h-3" : size === "md" ? "w-4 h-4" : "w-5 h-5"} />
        </button>
      )}
    </div>
  );
};

export default ModernBadge;
