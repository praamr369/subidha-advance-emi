"use client";

import React, { useState, useCallback } from "react";
import {
  Plus,
  Download,
  Share2,
  Trash2,
  Edit2,
  Eye,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { InteractiveDataTable, InteractiveDataField, DataRowAction } from "./InteractiveDataTable";
import { DataDetailModal, DetailField } from "./DataDetailModal";
import { useAdminKeyboardShortcuts } from "./AdminKeyboardShortcuts";

export interface AdminPageExampleProps {
  title: string;
  subtitle?: string;
  entityName: string;
  data: any[];
  onEdit?: (id: string | number) => void;
  onDelete?: (id: string | number) => void;
}

/**
 * Example Implementation of Interactive Admin Page
 *
 * Features:
 * - Hover effects showing data previews
 * - Left-click to open details
 * - Right-click context menus
 * - Keyboard shortcuts (Ctrl+Shift+? for help)
 * - Interactive data fields (copyable, clickable)
 * - Quick actions (view, edit, delete)
 * - Full detail modal with navigation
 * - Data type-specific formatting
 */
export const AdminPageExample: React.FC<AdminPageExampleProps> = ({
  title,
  subtitle,
  entityName,
  data,
  onEdit,
  onDelete,
}) => {
  const [selectedItems, setSelectedItems] = useState<Set<string | number>>(new Set());
  const [selectedDetail, setSelectedDetail] = useState<any | null>(null);
  const [currentDetailIndex, setCurrentDetailIndex] = useState(0);
  const { register, unregister } = useAdminKeyboardShortcuts();

  // Register keyboard shortcuts
  React.useEffect(() => {
    register("admin-page-help", {
      keys: ["ctrl", "shift", "?"],
      description: "Show keyboard shortcuts",
      category: "General",
      action: () => {
        // Help is shown by provider
      },
    });

    register("admin-page-new", {
      keys: ["ctrl", "n"],
      description: "Create new item",
      category: "Actions",
      action: () => {
        console.log("Create new item");
      },
    });

    register("admin-page-delete", {
      keys: ["delete"],
      description: "Delete selected items",
      category: "Actions",
      action: () => {
        selectedItems.forEach((id) => onDelete?.(id));
      },
    });

    return () => {
      unregister("admin-page-help");
      unregister("admin-page-new");
      unregister("admin-page-delete");
    };
  }, [register, unregister, selectedItems, onDelete]);

  // Get detail fields for modal
  const getDetailFields = (item: any): DetailField[] => {
    return Object.entries(item).map(([key, value]) => ({
      key,
      label: key.replace(/([A-Z])/g, " $1").trim(),
      value,
      type: typeof value === "string" && value.includes("@") ? "email" :
            typeof value === "string" && value.match(/^\d{10}$/) ? "phone" :
            typeof value === "number" ? "currency" : "text",
      copyable: true,
      section: key.startsWith("_") ? "System" : "General",
      format: (val) => String(val || "—"),
    }));
  };

  // Convert data to interactive rows
  const rows = data.map((item, idx) => {
    const fields: InteractiveDataField[] = Object.entries(item)
      .filter(([key]) => !key.startsWith("_"))
      .slice(0, 3)
      .map(([key, value]) => ({
        key,
        label: key.replace(/([A-Z])/g, " $1").trim(),
        value,
        copyable: true,
        clickable: true,
        format: (val) => {
          if (typeof val === "object") return JSON.stringify(val);
          return String(val || "—");
        },
        tooltip: `View more details about ${key}`,
        preview: String(value).substring(0, 100),
      }));

    const actions: DataRowAction[] = [
      {
        id: "view",
        label: "View Details",
        icon: <Eye className="w-4 h-4" />,
        onClick: () => {
          setSelectedDetail(item);
          setCurrentDetailIndex(idx);
        },
      },
      {
        id: "edit",
        label: "Edit",
        icon: <Edit2 className="w-4 h-4" />,
        onClick: () => onEdit?.(item.id || idx),
        hotkey: "E",
      },
      {
        id: "export",
        label: "Export",
        icon: <Download className="w-4 h-4" />,
        onClick: () => {
          const json = JSON.stringify(item, null, 2);
          const blob = new Blob([json], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${entityName}-${item.id || idx}.json`;
          a.click();
        },
      },
      {
        id: "share",
        label: "Share",
        icon: <Share2 className="w-4 h-4" />,
        onClick: async () => {
          if (navigator.share) {
            await navigator.share({
              title: entityName,
              text: `Sharing ${entityName} details`,
              url: window.location.href,
            });
          } else {
            alert("Share not supported on this browser");
          }
        },
      },
      {
        id: "delete",
        label: "Delete",
        icon: <Trash2 className="w-4 h-4" />,
        variant: "danger",
        onClick: () => onDelete?.(item.id || idx),
        requiresConfirm: true,
        confirmMessage: `Are you sure you want to delete this ${entityName}?`,
        hotkey: "Delete",
      },
    ];

    return {
      id: item.id || idx,
      data: fields,
      actions,
      selectable: true,
      expandable: true,
      expandedContent: (
        <div className="bg-slate-50 p-4 rounded space-y-3">
          <h4 className="font-semibold text-slate-900">Full Details</h4>
          <pre className="bg-white p-3 rounded border border-slate-200 text-xs overflow-x-auto">
            {JSON.stringify(item, null, 2)}
          </pre>
          <div className="flex gap-2">
            <button
              onClick={() => onEdit?.(item.id || idx)}
              className="px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition flex items-center gap-2"
            >
              <Edit2 className="w-4 h-4" />
              Edit
            </button>
            <button
              onClick={() => setSelectedDetail(item)}
              className="px-3 py-2 bg-slate-600 text-white rounded text-sm hover:bg-slate-700 transition flex items-center gap-2"
            >
              <Eye className="w-4 h-4" />
              Full View
            </button>
          </div>
        </div>
      ),
      highlight: selectedItems.has(item.id || idx),
      onSelect: (selected: boolean) => {
        const next = new Set(selectedItems);
        if (selected) next.add(item.id || idx);
        else next.delete(item.id || idx);
        setSelectedItems(next);
      },
    };
  });

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">{title}</h1>
            {subtitle && <p className="text-slate-600 mt-2">{subtitle}</p>}
          </div>

          <div className="flex gap-2">
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2">
              <Plus className="w-5 h-5" />
              New {entityName}
            </button>
          </div>
        </div>

        {/* Selection Info */}
        {selectedItems.size > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-blue-600" />
              <span className="text-blue-900 font-medium">
                {selectedItems.size} {selectedItems.size === 1 ? "item" : "items"} selected
              </span>
            </div>
            <div className="flex gap-2">
              <button className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition">
                Export Selected
              </button>
              <button
                onClick={() => {
                  selectedItems.forEach((id) => onDelete?.(id));
                  setSelectedItems(new Set());
                }}
                className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 transition"
              >
                Delete Selected
              </button>
            </div>
          </div>
        )}

        {/* Data Table */}
        <InteractiveDataTable
          rows={rows}
          title={`All ${entityName}s`}
          subtitle={`Showing ${data.length} records. Hover for preview • Right-click for actions • Ctrl+Shift+? for shortcuts`}
          emptyState={
            <div className="text-center py-12">
              <AlertCircle className="w-12 h-12 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-600">No {entityName}s found</p>
            </div>
          }
        />
      </div>

      {/* Detail Modal */}
      {selectedDetail && (
        <DataDetailModal
          isOpen={!!selectedDetail}
          onClose={() => setSelectedDetail(null)}
          title={`${entityName} Details`}
          subtitle={`ID: ${selectedDetail.id || currentDetailIndex}`}
          fields={getDetailFields(selectedDetail)}
          actions={[
            {
              id: "edit",
              label: "Edit",
              icon: <Edit2 className="w-5 h-5" />,
              onClick: () => {
                onEdit?.(selectedDetail.id || currentDetailIndex);
                setSelectedDetail(null);
              },
            },
            {
              id: "delete",
              label: "Delete",
              icon: <Trash2 className="w-5 h-5" />,
              variant: "danger",
              onClick: () => {
                if (confirm(`Delete this ${entityName}?`)) {
                  onDelete?.(selectedDetail.id || currentDetailIndex);
                  setSelectedDetail(null);
                }
              },
            },
          ]}
          onNavigatePrev={() => {
            if (currentDetailIndex > 0) {
              const prevItem = data[currentDetailIndex - 1];
              setSelectedDetail(prevItem);
              setCurrentDetailIndex(currentDetailIndex - 1);
            }
          }}
          onNavigateNext={() => {
            if (currentDetailIndex < data.length - 1) {
              const nextItem = data[currentDetailIndex + 1];
              setSelectedDetail(nextItem);
              setCurrentDetailIndex(currentDetailIndex + 1);
            }
          }}
          canNavigatePrev={currentDetailIndex > 0}
          canNavigateNext={currentDetailIndex < data.length - 1}
          onEdit={() => onEdit?.(selectedDetail.id || currentDetailIndex)}
        />
      )}
    </>
  );
};

export default AdminPageExample;
