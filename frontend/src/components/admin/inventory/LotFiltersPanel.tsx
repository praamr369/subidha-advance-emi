"use client";

import React, { useState, useCallback, useEffect } from "react";
import { Search, X, Filter } from "lucide-react";

interface LotFiltersPanelProps {
  onSearch: (query: string) => void;
  onStatusChange: (status: string) => void;
  onSourceChange: (source: string) => void;
  onPriorityChange: (priority: string) => void;
  isLoading?: boolean;
}

const LotFiltersPanel: React.FC<LotFiltersPanelProps> = ({
  onSearch,
  onStatusChange,
  onSourceChange,
  onPriorityChange,
  isLoading = false,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);
  const [selectedStatus, setSelectedStatus] = useState("");
  const [selectedSource, setSelectedSource] = useState("");
  const [selectedPriority, setSelectedPriority] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);

  // Debounced search (350ms)
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value);

      if (searchTimeout) clearTimeout(searchTimeout);

      const timeout = setTimeout(() => {
        onSearch(value);
      }, 350);

      setSearchTimeout(timeout);
    },
    [onSearch, searchTimeout]
  );

  const handleStatusChange = useCallback(
    (value: string) => {
      setSelectedStatus(value);
      onStatusChange(value);
    },
    [onStatusChange]
  );

  const handleSourceChange = useCallback(
    (value: string) => {
      setSelectedSource(value);
      onSourceChange(value);
    },
    [onSourceChange]
  );

  const handlePriorityChange = useCallback(
    (value: string) => {
      setSelectedPriority(value);
      onPriorityChange(value);
    },
    [onPriorityChange]
  );

  const clearFilters = useCallback(() => {
    setSearchQuery("");
    setSelectedStatus("");
    setSelectedSource("");
    setSelectedPriority("");
    onSearch("");
    onStatusChange("");
    onSourceChange("");
    onPriorityChange("");
  }, [onSearch, onStatusChange, onSourceChange, onPriorityChange]);

  const hasActiveFilters = !!(searchQuery || selectedStatus || selectedSource || selectedPriority);

  useEffect(() => {
    return () => {
      if (searchTimeout) clearTimeout(searchTimeout);
    };
  }, [searchTimeout]);

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search lot code, product, SKU, or barcode (350ms debounce)..."
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          disabled={isLoading}
          className="w-full pl-10 pr-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
        />
      </div>

      {/* Collapsible Filter Panel */}
      <div className="border rounded-md">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between p-3 hover:bg-gray-50"
          disabled={isLoading}
        >
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            <span className="font-medium">Filters</span>
            {hasActiveFilters && (
              <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
                {[selectedStatus, selectedSource, selectedPriority].filter(Boolean).length} active
              </span>
            )}
          </div>
          <span className="text-gray-400">{isExpanded ? "−" : "+"}</span>
        </button>

        {isExpanded && (
          <div className="border-t p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Status Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
              <select
                value={selectedStatus}
                onChange={(e) => handleStatusChange(e.target.value)}
                disabled={isLoading}
                className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
              >
                <option value="">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="DEPLETED">Depleted</option>
                <option value="QUARANTINED">Quarantined</option>
                <option value="EXPIRED">Expired</option>
              </select>
            </div>

            {/* Source Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Source</label>
              <select
                value={selectedSource}
                onChange={(e) => handleSourceChange(e.target.value)}
                disabled={isLoading}
                className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
              >
                <option value="">All Sources</option>
                <option value="DIRECT_PURCHASE">Direct Purchase</option>
                <option value="MANUFACTURING">Manufacturing</option>
                <option value="TRANSFER">Transfer</option>
                <option value="ADJUSTMENT">Adjustment</option>
              </select>
            </div>

            {/* Priority Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
              <select
                value={selectedPriority}
                onChange={(e) => handlePriorityChange(e.target.value)}
                disabled={isLoading}
                className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
              >
                <option value="">All Priorities</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>

            {/* Clear Filters Button */}
            {hasActiveFilters && (
              <div className="md:col-span-3 flex justify-end pt-2 border-t">
                <button
                  onClick={clearFilters}
                  disabled={isLoading}
                  className="flex items-center gap-2 px-3 py-1 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                  Clear Filters
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default LotFiltersPanel;
