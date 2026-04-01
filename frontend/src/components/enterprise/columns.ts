import type { ReactNode } from "react";

export type GenericRecord = Record<string, unknown>;

export type EnterpriseColumnDef<T extends GenericRecord> = {
  /** Field key inside row object */
  key: keyof T | string;

  /** Column header label */
  header: string;

  /** Optional width control */
  width?: number | string;

  /** Header styling */
  headerClassName?: string;

  /** Cell styling */
  cellClassName?: string;

  /** Whether column should participate in global search */
  searchable?: boolean;

  /** Custom cell renderer */
  render?: (row: T) => ReactNode;
};

/**
 * Utility helper to quickly build columns
 * from plain object keys (useful for debug tables)
 */
export function buildColumns(
  keys: string[]
): EnterpriseColumnDef<GenericRecord>[] {
  return keys.map((key) => ({
    key,
    header: key
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase()),
    searchable: true,
    render: (row) => String(row[key] ?? "-"),
  }));
}