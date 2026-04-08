"use client";

import { useState } from "react";

import ActionButton from "@/components/ui/ActionButton";
import type { DashboardQuery } from "@/services/dashboard-types";
import {
  downloadDashboardSurfaceCsv,
  type DashboardSurfaceKind,
} from "@/services/dashboards";

type ExportAction = {
  surface: DashboardSurfaceKind;
  label: string;
};

type DashboardSurfaceExportActionsProps = {
  query: DashboardQuery;
  actions: ExportAction[];
};

export default function DashboardSurfaceExportActions({
  query,
  actions,
}: DashboardSurfaceExportActionsProps) {
  const [loadingSurface, setLoadingSurface] = useState<DashboardSurfaceKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload(surface: DashboardSurfaceKind) {
    setLoadingSurface(surface);
    setError(null);
    try {
      await downloadDashboardSurfaceCsv(surface, query);
    } catch (downloadError) {
      if (downloadError instanceof Error && downloadError.message.trim()) {
        setError(downloadError.message);
      } else {
        setError("Unable to export this dashboard surface right now.");
      }
    } finally {
      setLoadingSurface(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {actions.map((action) => (
        <ActionButton
          key={action.surface}
          variant="outline"
          loading={loadingSurface === action.surface}
          onClick={() => void handleDownload(action.surface)}
          className="h-9 px-3 text-xs"
        >
          {action.label}
        </ActionButton>
      ))}
      {error ? (
        <span className="text-xs font-medium text-red-700">{error}</span>
      ) : null}
    </div>
  );
}
