"use client";

import React from "react";
import { ChevronRight, MoreVertical } from "lucide-react";

export interface ModernCardProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  hover?: boolean;
  clickable?: boolean;
  onClick?: () => void;
  action?: React.ReactNode;
  badge?: { text: string; color: string };
  loading?: boolean;
  error?: string;
}

export const ModernCard: React.FC<ModernCardProps> = ({
  title,
  subtitle,
  children,
  footer,
  hover = true,
  clickable = false,
  onClick,
  action,
  badge,
  loading = false,
  error,
}) => {
  return (
    <div
      className={`bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden transition-all ${
        hover ? "hover:shadow-lg hover:border-slate-300 dark:hover:border-slate-600" : ""
      } ${clickable ? "cursor-pointer" : ""}`}
      onClick={onClick}
    >
      {/* Header */}
      {(title || action || badge) && (
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div>
            {title && <h3 className="font-semibold text-slate-900 dark:text-white">{title}</h3>}
            {subtitle && <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2">
            {badge && (
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${badge.color}`}>
                {badge.text}
              </span>
            )}
            {action && <div onClick={(e) => e.stopPropagation()}>{action}</div>}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="px-6 py-4">
        {loading ? (
          <div className="space-y-3">
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse w-5/6" />
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse w-4/6" />
          </div>
        ) : error ? (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        ) : (
          children
        )}
      </div>

      {/* Footer */}
      {footer && (
        <div className="px-6 py-3 bg-slate-50 dark:bg-slate-700/50 border-t border-slate-200 dark:border-slate-700">
          {footer}
        </div>
      )}
    </div>
  );
};

export default ModernCard;
