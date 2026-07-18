"use client";

import React, { useState, useCallback } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Share2,
  Edit2,
  Trash2,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
} from "lucide-react";

export interface DetailField {
  key: string;
  label: string;
  value: any;
  type?: "text" | "textarea" | "number" | "date" | "currency" | "email" | "phone" | "status" | "json";
  editable?: boolean;
  copyable?: boolean;
  icon?: React.ReactNode;
  badge?: { color: string; text: string };
  format?: (value: any) => string;
  section?: string;
}

export interface DataDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  fields: DetailField[];
  actions?: Array<{
    id: string;
    label: string;
    icon: React.ReactNode;
    onClick: () => void | Promise<void>;
    variant?: "default" | "danger" | "warning";
  }>;
  onNavigatePrev?: () => void;
  onNavigateNext?: () => void;
  canNavigatePrev?: boolean;
  canNavigateNext?: boolean;
  onEdit?: () => void;
  loading?: boolean;
}

export const DataDetailModal: React.FC<DataDetailModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  fields,
  actions = [],
  onNavigatePrev,
  onNavigateNext,
  canNavigatePrev = false,
  canNavigateNext = false,
  onEdit,
  loading = false,
}) => {
  const [copied, setCopied] = useState<string | null>(null);
  const [expandedJsons, setExpandedJsons] = useState<Set<string>>(new Set());

  const handleCopy = async (key: string, value: any) => {
    await navigator.clipboard.writeText(String(value));
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const toggleJsonExpand = (key: string) => {
    const next = new Set(expandedJsons);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpandedJsons(next);
  };

  if (!isOpen) return null;

  // Group fields by section
  const groupedFields = fields.reduce(
    (acc, field) => {
      const section = field.section || "General";
      if (!acc[section]) acc[section] = [];
      acc[section].push(field);
      return acc;
    },
    {} as Record<string, DetailField[]>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-in slide-in-from-bottom-4">
        {/* Header */}
        <div className="border-b border-slate-200 p-6 flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
            </div>
            {subtitle && <p className="text-sm text-slate-600 mt-1">{subtitle}</p>}
          </div>

          <div className="flex items-center gap-2">
            {/* Navigation */}
            {(onNavigatePrev || onNavigateNext) && (
              <div className="flex gap-1 border-r border-slate-200 pr-4">
                <button
                  onClick={onNavigatePrev}
                  disabled={!canNavigatePrev}
                  className="p-2 hover:bg-slate-100 disabled:opacity-50 rounded transition"
                  title="Previous"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={onNavigateNext}
                  disabled={!canNavigateNext}
                  className="p-2 hover:bg-slate-100 disabled:opacity-50 rounded transition"
                  title="Next"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}

            {/* Quick Actions */}
            {onEdit && (
              <button
                onClick={onEdit}
                className="p-2 hover:bg-blue-100 text-blue-600 rounded transition"
                title="Edit (E)"
              >
                <Edit2 className="w-5 h-5" />
              </button>
            )}

            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded transition"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {loading ? (
            <div className="text-center py-12 text-slate-500">Loading details...</div>
          ) : (
            Object.entries(groupedFields).map(([section, sectionFields]) => (
              <div key={section}>
                <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4 pb-2 border-b border-slate-200">
                  {section}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {sectionFields.map((field) => (
                    <div key={field.key} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                          {field.icon && <span className="w-4 h-4">{field.icon}</span>}
                          {field.label}
                        </label>
                        {field.copyable && (
                          <button
                            onClick={() => handleCopy(field.key, field.value)}
                            className="text-xs text-slate-500 hover:text-slate-700 transition"
                          >
                            {copied === field.key ? "✓ Copied" : <Copy className="w-3 h-3" />}
                          </button>
                        )}
                      </div>

                      {/* Value Display Based on Type */}
                      <div className="bg-slate-50 rounded p-3 font-mono text-sm break-words">
                        {field.type === "json" ? (
                          <div>
                            <button
                              onClick={() => toggleJsonExpand(field.key)}
                              className="text-xs text-blue-600 hover:text-blue-700 mb-2 flex items-center gap-1"
                            >
                              {expandedJsons.has(field.key) ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                              {expandedJsons.has(field.key) ? "Collapse" : "Expand"}
                            </button>
                            {expandedJsons.has(field.key) && (
                              <pre className="text-xs overflow-x-auto bg-white p-2 rounded border border-slate-200">
                                {JSON.stringify(field.value, null, 2)}
                              </pre>
                            )}
                          </div>
                        ) : field.type === "textarea" ? (
                          <textarea
                            value={field.format ? field.format(field.value) : String(field.value || "")}
                            readOnly={!field.editable}
                            className="w-full h-24 p-2 border border-slate-300 rounded font-sans text-sm resize-none"
                          />
                        ) : (
                          <div className="flex items-center gap-2">
                            {field.format ? field.format(field.value) : String(field.value || "—")}
                            {field.badge && (
                              <span className={`text-xs px-2 py-1 rounded font-medium ${field.badge.color}`}>
                                {field.badge.text}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer with Actions */}
        {actions.length > 0 && (
          <div className="border-t border-slate-200 p-6 flex items-center justify-between">
            <div className="flex gap-3">
              {actions.map((action) => (
                <button
                  key={action.id}
                  onClick={action.onClick}
                  className={`flex items-center gap-2 px-4 py-2 rounded transition ${
                    action.variant === "danger"
                      ? "bg-red-100 text-red-700 hover:bg-red-200"
                      : action.variant === "warning"
                      ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                      : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                  }`}
                >
                  {action.icon}
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DataDetailModal;
