"use client";

import React from "react";
import { Plus, Edit2, Trash2, Download, Search } from "lucide-react";

interface ProfileToolbarProps {
  onAdd?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onExport?: () => void;
  onSearch?: (query: string) => void;
  searchPlaceholder?: string;
  showSearch?: boolean;
  disabled?: boolean;
}

/**
 * Standardized toolbar for profile pages with common actions.
 * Actions: Add, Edit, Delete, Export, Search.
 */
const ProfileToolbar: React.FC<ProfileToolbarProps> = ({
  onAdd,
  onEdit,
  onDelete,
  onExport,
  onSearch,
  searchPlaceholder = "Search...",
  showSearch = true,
  disabled = false,
}) => {
  return (
    <div className="flex flex-col md:flex-row gap-4 items-end justify-between">
      {/* Search */}
      {showSearch && onSearch && (
        <div className="flex-1 min-w-64">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              onChange={(e) => onSearch(e.target.value)}
              disabled={disabled}
              className="w-full pl-10 pr-4 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
            />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        {onAdd && (
          <button
            onClick={onAdd}
            disabled={disabled}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        )}

        {onEdit && (
          <button
            onClick={onEdit}
            disabled={disabled}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <Edit2 className="h-4 w-4" />
            Edit
          </button>
        )}

        {onDelete && (
          <button
            onClick={onDelete}
            disabled={disabled}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        )}

        {onExport && (
          <button
            onClick={onExport}
            disabled={disabled}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
        )}
      </div>
    </div>
  );
};

export default ProfileToolbar;
