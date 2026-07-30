"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  ChevronDown,
  Copy,
  Edit2,
  ExternalLink,
  Eye,
  MoreVertical,
  Trash2,
  Download,
  Share2,
  Lock,
  Unlock,
  AlertCircle,
} from "lucide-react";

export interface DataRowAction {
  id: string;
  label: string;
  icon?: React.ReactNode;
  variant?: "default" | "danger" | "warning" | "success";
  onClick: (data: any) => void | Promise<void>;
  requiresConfirm?: boolean;
  confirmMessage?: string;
  hotkey?: string;
}

export interface InteractiveDataField {
  key: string;
  label: string;
  value: any;
  type?: "text" | "number" | "date" | "currency" | "email" | "phone" | "status" | "link";
  tooltip?: string;
  preview?: string;
  copyable?: boolean;
  editable?: boolean;
  clickable?: boolean;
  onClick?: () => void;
  format?: (value: any) => string;
  icon?: React.ReactNode;
  badge?: { color: string; text: string };
}

export interface InteractiveDataRowProps {
  id: string | number;
  data: InteractiveDataField[];
  actions?: DataRowAction[];
  onRowClick?: () => void;
  onContextMenu?: (actions: DataRowAction[]) => void;
  expandable?: boolean;
  expandedContent?: React.ReactNode;
  highlight?: boolean;
  onSelect?: (selected: boolean) => void;
  selectable?: boolean;
  hoverBehavior?: "highlight" | "expand" | "preview" | "none";
}

// Rich Tooltip Component
export const RichTooltip: React.FC<{
  children: React.ReactNode;
  content: React.ReactNode;
  delay?: number;
}> = ({ children, content, delay = 300 }) => {
  const [show, setShow] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => setShow(true), delay);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setShow(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <div className="relative inline-block w-full" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      {children}
      {show && (
        <div className="absolute z-50 bottom-full left-0 mb-2 p-3 bg-slate-900 text-white text-sm rounded-lg shadow-lg max-w-xs break-words">
          {content}
          <div className="absolute bottom-0 left-4 w-2 h-2 bg-slate-900 transform rotate-45 -mb-1" />
        </div>
      )}
    </div>
  );
};

// Context Menu Component
export const ContextMenu: React.FC<{
  actions: DataRowAction[];
  x: number;
  y: number;
  onClose: () => void;
}> = ({ actions, x, y, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white border border-slate-200 rounded-lg shadow-lg min-w-48"
      style={{
        top: `${y}px`,
        left: `${x}px`,
      }}
    >
      {actions.map((action) => (
        <button
          key={action.id}
          className={`w-full px-4 py-2.5 text-left text-sm flex items-center gap-2 hover:bg-slate-100 first:rounded-t-lg last:rounded-b-lg transition ${
            action.variant === "danger"
              ? "text-red-600 hover:bg-red-50"
              : action.variant === "warning"
              ? "text-amber-600 hover:bg-amber-50"
              : action.variant === "success"
              ? "text-green-600 hover:bg-green-50"
              : "text-slate-700"
          }`}
          onClick={() => {
            if (action.requiresConfirm) {
              if (window.confirm(action.confirmMessage || "Are you sure?")) {
                action.onClick({});
              }
            } else {
              action.onClick({});
            }
            onClose();
          }}
          title={action.hotkey ? `${action.label} (${action.hotkey})` : action.label}
        >
          {action.icon && <span className="w-4 h-4">{action.icon}</span>}
          <span>{action.label}</span>
        </button>
      ))}
    </div>
  );
};

// Interactive Data Field Component
export const InteractiveDataFieldDisplay: React.FC<{
  field: InteractiveDataField;
  onCopy?: (value: any) => void;
}> = ({ field, onCopy }) => {
  const [copied, setCopied] = useState(false);

  const displayValue = field.format ? field.format(field.value) : String(field.value || "—");

  const handleCopy = async () => {
    if (field.copyable) {
      await navigator.clipboard.writeText(String(field.value));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      onCopy?.(field.value);
    }
  };

  const baseContent = (
    <div
      className={`flex items-center gap-2 ${
        field.clickable || field.editable ? "cursor-pointer hover:text-blue-600" : ""
      } ${field.copyable ? "cursor-copy group" : ""}`}
      onClick={field.onClick}
    >
      {field.icon && <span className="w-4 h-4 flex-shrink-0">{field.icon}</span>}
      <span className="truncate">{displayValue}</span>
      {field.badge && (
        <span className={`text-xs px-2 py-1 rounded font-medium ${field.badge.color}`}>
          {field.badge.text}
        </span>
      )}
      {field.copyable && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleCopy();
          }}
          className="opacity-0 group-hover:opacity-100 transition"
          title="Copy to clipboard"
        >
          {copied ? <span className="text-green-600 text-xs">✓</span> : <Copy className="w-3 h-3" />}
        </button>
      )}
    </div>
  );

  return (
    <RichTooltip content={field.tooltip || field.preview || displayValue}>
      {baseContent}
    </RichTooltip>
  );
};

// Main Interactive Data Row Component
export const InteractiveDataRow: React.FC<InteractiveDataRowProps> = ({
  id,
  data,
  actions = [],
  onRowClick,
  expandable = false,
  expandedContent,
  highlight = false,
  onSelect,
  selectable = false,
  hoverBehavior = "highlight",
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSelected, setIsSelected] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY });
    },
    []
  );

  const handleRowClick = useCallback(() => {
    onRowClick?.();
    if (expandable) setIsExpanded(!isExpanded);
  }, [onRowClick, expandable, isExpanded]);

  const handleSelectChange = useCallback((checked: boolean) => {
    setIsSelected(checked);
    onSelect?.(checked);
  }, [onSelect]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!rowRef.current?.contains(document.activeElement)) return;

      // Handle keyboard shortcuts for actions
      actions.forEach((action) => {
        if (action.hotkey === e.key) {
          e.preventDefault();
          action.onClick({ id });
        }
      });

      // Handle arrow keys for expansion
      if (e.key === "ArrowDown" && expandable) {
        setIsExpanded(true);
      } else if (e.key === "ArrowUp" && expandable) {
        setIsExpanded(false);
      }
    };

    rowRef.current?.addEventListener("keydown", handleKeyDown);
    return () => rowRef.current?.removeEventListener("keydown", handleKeyDown);
  }, [actions, expandable, id]);

  return (
    <>
      <div
        ref={rowRef}
        className={`border border-slate-200 rounded-lg p-4 transition ${
          isHovered ? "bg-slate-50 shadow-md" : "bg-white"
        } ${highlight ? "ring-2 ring-blue-500" : ""} ${selectable ? "cursor-pointer" : ""}`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onContextMenu={handleContextMenu}
        onClick={handleRowClick}
        tabIndex={0}
      >
        <div className="flex items-start gap-4">
          {/* Checkbox */}
          {selectable && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => handleSelectChange(e.target.checked)}
              className="mt-1 rounded border-slate-300 cursor-pointer"
              onClick={(e) => e.stopPropagation()}
            />
          )}

          {/* Expand Button */}
          {expandable && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
              className="mt-1 p-1 hover:bg-slate-200 rounded transition"
              title={isExpanded ? "Collapse" : "Expand"}
            >
              <ChevronDown
                className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
              />
            </button>
          )}

          {/* Data Fields Grid */}
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.map((field) => (
              <div key={field.key} className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">{field.label}</label>
                <InteractiveDataFieldDisplay field={field} />
              </div>
            ))}
          </div>

          {/* Action Menu */}
          {actions.length > 0 && (
            <div className="flex items-start gap-2">
              {/* Quick Actions */}
              <div className={`flex gap-1 ${isHovered ? "opacity-100" : "opacity-0"} transition`}>
                {actions.slice(0, 2).map((action) => (
                  <button
                    key={action.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      action.onClick({ id });
                    }}
                    className="p-2 hover:bg-slate-200 rounded transition"
                    title={action.label}
                  >
                    {action.icon || <Eye className="w-4 h-4" />}
                  </button>
                ))}
              </div>

              {/* More Menu */}
              {actions.length > 2 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setContextMenu({ x: e.clientX, y: e.clientY });
                  }}
                  className="p-2 hover:bg-slate-200 rounded transition"
                  title="More actions"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Expanded Content */}
        {expandable && isExpanded && expandedContent && (
          <div className="mt-4 pt-4 border-t border-slate-200 animate-in fade-in slide-in-from-top-2">
            {expandedContent}
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          actions={actions}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
};

// Interactive Data Table Component
export const InteractiveDataTable: React.FC<{
  rows: InteractiveDataRowProps[];
  title?: string;
  subtitle?: string;
  emptyState?: React.ReactNode;
  loading?: boolean;
}> = ({ rows, title, subtitle, emptyState, loading }) => {
  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading...</div>;
  }

  if (rows.length === 0) {
    return emptyState || <div className="p-8 text-center text-slate-500">No data found</div>;
  }

  return (
    <div className="space-y-4">
      {(title || subtitle) && (
        <div>
          {title && <h2 className="text-lg font-bold text-slate-900">{title}</h2>}
          {subtitle && <p className="text-sm text-slate-600">{subtitle}</p>}
        </div>
      )}
      <div className="space-y-3">
        {rows.map((row) => (
          <InteractiveDataRow key={row.id} {...row} />
        ))}
      </div>
    </div>
  );
};

export default InteractiveDataTable;
