"use client";

import React, { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

export interface ProfileTableColumn {
  key: string;
  header: string;
  render?: (row: any) => ReactNode;
}

interface ProfileTableProps {
  columns: ProfileTableColumn[];
  rows: any[];
  isLoading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: any) => void;
  pagination?: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
  };
}

/**
 * Reusable table component for profile pages with pagination support.
 * Provides consistent formatting and interaction patterns.
 */
const ProfileTable: React.FC<ProfileTableProps> = ({
  columns,
  rows,
  isLoading = false,
  emptyMessage = "No records found",
  onRowClick,
  pagination,
}) => {
  return (
    <div className="space-y-4">
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-4 py-3 text-left font-semibold text-gray-900"
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center">
                  <div className="flex items-center justify-center gap-2 text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading...
                  </div>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-gray-500">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr
                  key={idx}
                  onClick={() => onRowClick?.(row)}
                  className={`border-b transition ${
                    onRowClick ? "cursor-pointer hover:bg-blue-50" : ""
                  }`}
                >
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3 text-gray-700">
                      {col.render ? col.render(row) : row[col.key] || "—"}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && !isLoading && rows.length > 0 && (
        <div className="flex items-center justify-between p-4 border rounded-lg bg-white">
          <div className="text-sm text-gray-600">
            Showing {Math.min((pagination.page - 1) * pagination.pageSize + 1, pagination.totalCount)} to{" "}
            {Math.min(pagination.page * pagination.pageSize, pagination.totalCount)} of{" "}
            {pagination.totalCount} records
          </div>

          <div className="flex items-center gap-4">
            {/* Page Size */}
            <select
              value={pagination.pageSize}
              onChange={(e) => pagination.onPageSizeChange(Number(e.target.value))}
              className="px-3 py-1 text-sm border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value={10}>10 per page</option>
              <option value={25}>25 per page</option>
              <option value={50}>50 per page</option>
            </select>

            {/* Navigation */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => pagination.onPageChange(Math.max(1, pagination.page - 1))}
                disabled={pagination.page === 1}
                className="p-2 rounded-md border hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <span className="text-sm text-gray-600 px-2">
                Page {pagination.page} of {pagination.totalPages}
              </span>

              <button
                onClick={() => pagination.onPageChange(Math.min(pagination.totalPages, pagination.page + 1))}
                disabled={pagination.page === pagination.totalPages}
                className="p-2 rounded-md border hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileTable;
