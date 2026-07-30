"use client";

import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";

type ProfileTableProps<T extends Record<string, any>> = {
  title?: string;
  subtitle?: string;
  data: T[];
  columns: EnterpriseColumnDef<T>[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  onRowClick?: (row: T) => void;
};

export function ProfileTable<T extends Record<string, any>>({
  title = "Records",
  subtitle,
  data,
  columns,
  loading = false,
  error = null,
  onRetry,
  emptyTitle = "No records found",
  emptyDescription = "Try adjusting your search or filters.",
  emptyAction,
  onRowClick,
}: ProfileTableProps<T>) {
  if (loading) {
    return <ERPLoadingState label={`Loading ${title.toLowerCase()}...`} />;
  }

  if (error) {
    return (
      <ERPErrorState
        title={`Unable to load ${title.toLowerCase()}`}
        description={error}
        onRetry={onRetry}
      />
    );
  }

  if (data.length === 0) {
    return (
      <ERPEmptyState
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }

  return (
    <EnterpriseDataTable<T>
      title={title}
      subtitle={subtitle}
      data={data}
      columns={columns}
      onRowClick={onRowClick}
      globalFilterPlaceholder={`Search ${title.toLowerCase()}...`}
    />
  );
}
