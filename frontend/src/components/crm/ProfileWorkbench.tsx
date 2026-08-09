"use client";

import React, { ReactNode } from "react";

export interface ProfileStat {
  label: string;
  value: string | number;
  tone?: "default" | "success" | "warning" | "danger";
  subtext?: string;
}

interface ProfileWorkbenchProps {
  title: string;
  subtitle?: string;
  stats: ProfileStat[];
  toolbar?: ReactNode;
  children: ReactNode;
  isLoading?: boolean;
}

/**
 * Reusable workbench pattern for CRM profile pages (partners, vendors, staff, etc).
 * Provides standardized layout with header, KPI stats, toolbar, and content area.
 */
const ProfileWorkbench: React.FC<ProfileWorkbenchProps> = ({
  title,
  subtitle,
  stats,
  toolbar,
  children,
  isLoading = false,
}) => {
  const getToneColor = (tone?: string) => {
    switch (tone) {
      case "success":
        return "text-green-700 bg-green-50";
      case "warning":
        return "text-amber-700 bg-amber-50";
      case "danger":
        return "text-red-700 bg-red-50";
      default:
        return "text-gray-700 bg-gray-50";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-lg text-gray-600 mt-1">{subtitle}</p>}
      </div>

      {/* KPI Stats Strip */}
      {!isLoading && stats.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((stat, idx) => (
            <div
              key={idx}
              className={`rounded-lg p-4 border ${getToneColor(stat.tone)}`}
            >
              <div className="text-sm font-medium opacity-75">{stat.label}</div>
              <div className="text-2xl font-bold mt-2">{stat.value}</div>
              {stat.subtext && (
                <div className="text-xs opacity-60 mt-1">{stat.subtext}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      {toolbar && <div className="flex gap-3 justify-between">{toolbar}</div>}

      {/* Content Area */}
      <div className="bg-white rounded-lg border">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">
            <div className="animate-spin h-8 w-8 border-4 border-blue-200 border-t-blue-500 rounded-full mx-auto mb-2" />
            Loading...
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
};

export default ProfileWorkbench;
