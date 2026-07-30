"use client";

import { useState } from "react";

export interface RequestAction {
  id: number;
  actionType: string;
  performedByName?: string;
  notes?: string;
  createdAt?: string;
}

interface RequestActionHistoryProps {
  actions: RequestAction[];
  title?: string;
  isCollapsible?: boolean;
}

function formatActionType(type: string): string {
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function formatDateTime(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function getActionColor(type: string) {
  const colors: Record<string, string> = {
    CREATED: "bg-blue-100 text-blue-800 border-blue-200",
    QUOTE_GENERATED: "bg-purple-100 text-purple-800 border-purple-200",
    QUOTE_SENT: "bg-cyan-100 text-cyan-800 border-cyan-200",
    QUOTE_ACCEPTED: "bg-green-100 text-green-800 border-green-200",
    APPROVED: "bg-emerald-100 text-emerald-800 border-emerald-200",
    REJECTED: "bg-red-100 text-red-800 border-red-200",
    COMPLETED: "bg-teal-100 text-teal-800 border-teal-200",
  };
  return colors[type] || "bg-gray-100 text-gray-800 border-gray-200";
}

export default function RequestActionHistory({
  actions,
  title = "Action History",
  isCollapsible = true,
}: RequestActionHistoryProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (actions.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground mt-2">No actions yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {isCollapsible ? (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full px-5 py-3 flex items-center justify-between hover:bg-muted/30 transition border-b border-border"
        >
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <svg
            className={`h-5 w-5 text-muted-foreground transition ${isExpanded ? "rotate-0" : "-rotate-90"}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      ) : (
        <div className="px-5 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
      )}

      {isExpanded && (
        <div className="p-6 bg-muted/20">
          {/* Desktop Horizontal Timeline */}
          <div className="flex gap-6 overflow-x-auto pb-4">
            {actions.map((action) => (
              <div key={action.id} className="flex-shrink-0 w-72 rounded-lg border border-border bg-card p-4 hover:shadow-md transition">
                {/* Timeline marker */}
                <div className="flex items-center gap-2 mb-3">
                  <div className={`h-3 w-3 rounded-full border-2 ${getActionColor(action.actionType)}`} />
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold border ${getActionColor(action.actionType)}`}>
                    {formatActionType(action.actionType)}
                  </span>
                </div>

                {/* Action details */}
                <div className="space-y-2">
                  {action.performedByName && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">By: </span>
                      <span className="font-semibold text-foreground">{action.performedByName}</span>
                    </div>
                  )}
                  {action.createdAt && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">When: </span>
                      <span className="font-medium text-foreground">{formatDateTime(action.createdAt)}</span>
                    </div>
                  )}
                  {action.notes && (
                    <div className="mt-3 p-3 rounded-lg bg-muted/40 border border-muted">
                      <p className="text-xs text-foreground">{action.notes}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Timeline visual connector */}
          <div className="mt-4 flex gap-6 px-2">
            {actions.map((_, idx) => (
              idx < actions.length - 1 && (
                <div key={`connector-${idx}`} className="flex-shrink-0 w-64 h-0.5 bg-gradient-to-r from-primary to-transparent" />
              )
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
