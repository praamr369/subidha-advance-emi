"use client";

import React from "react";
import { ModernKPICard, type KPICardProps } from "./ModernKPICard";

export interface ModernStatsGridProps {
  stats: KPICardProps[];
  columns?: number;
  gap?: number;
  title?: string;
}

export const ModernStatsGrid: React.FC<ModernStatsGridProps> = ({
  stats,
  columns = 4,
  gap = 4,
  title,
}) => {
  const responsiveClass = {
    2: "grid-cols-1 md:grid-cols-2",
    3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 md:grid-cols-2 lg:grid-cols-4",
    5: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5",
    6: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6",
  }[columns] || "grid-cols-1 md:grid-cols-2 lg:grid-cols-4";

  const gapClass = {
    2: "gap-2",
    3: "gap-3",
    4: "gap-4",
    6: "gap-6",
    8: "gap-8",
  }[gap] || "gap-4";

  return (
    <div>
      {title && (
        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-6">{title}</h2>
      )}
      <div className={`grid ${responsiveClass} ${gapClass}`}>
        {stats.map((stat, idx) => (
          <ModernKPICard key={idx} {...stat} />
        ))}
      </div>
    </div>
  );
};

export default ModernStatsGrid;
