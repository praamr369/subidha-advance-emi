"use client";

import DataTable, { type Column } from "@/components/ui/DataTable";

type WorkbenchDataGridProps<T extends { id?: number | string }> = {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  error?: string | null;
  emptyText?: string;
  onRowClick?: (row: T) => void;
};

export default function WorkbenchDataGrid<T extends { id?: number | string }>(
  props: WorkbenchDataGridProps<T>
) {
  return <DataTable {...props} showDensityToggle />;
}
