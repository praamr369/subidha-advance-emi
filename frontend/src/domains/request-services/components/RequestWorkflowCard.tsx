"use client";

import { useState } from "react";

export interface WorkflowAction {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  color?: "primary" | "success" | "warning" | "danger";
  disabled?: boolean;
  onClick: () => void | Promise<void>;
}

interface RequestWorkflowCardProps {
  title?: string;
  description?: string;
  actions: WorkflowAction[];
  isLoading?: boolean;
}

export default function RequestWorkflowCard({
  title = "Actions",
  description = "Available workflow actions for this request",
  actions,
  isLoading = false,
}: RequestWorkflowCardProps) {
  const [loadingActionId, setLoadingActionId] = useState<string | null>(null);

  async function handleAction(action: WorkflowAction) {
    if (action.disabled || isLoading || loadingActionId) return;

    setLoadingActionId(action.id);
    try {
      const result = action.onClick();
      if (result instanceof Promise) {
        await result;
      }
    } catch (err) {
      console.error(`Action ${action.id} failed:`, err);
    } finally {
      setLoadingActionId(null);
    }
  }

  const getColorClass = (color?: string) => {
    const colors: Record<string, string> = {
      primary: "bg-primary text-primary-foreground hover:opacity-90",
      success: "bg-emerald-600 text-white hover:bg-emerald-700",
      warning: "bg-amber-600 text-white hover:bg-amber-700",
      danger: "bg-red-600 text-white hover:bg-red-700",
    };
    return colors[color || "primary"];
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div>
        <h3 className="font-semibold text-foreground">{title}</h3>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </div>

      {/* Desktop-optimized horizontal layout */}
      <div className="flex flex-wrap gap-3">
        {actions.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No actions available</p>
        ) : (
          actions.map((action) => (
            <button
              key={action.id}
              onClick={() => handleAction(action)}
              disabled={action.disabled || isLoading || loadingActionId === action.id}
              title={action.description}
              className={`group flex items-center gap-3 rounded-lg px-6 py-3 text-sm font-semibold transition min-w-[200px] justify-between ${getColorClass(
                action.color
              )} disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg`}
            >
              <span className="flex-1 text-left">
                <div className="font-semibold">{action.label}</div>
                {action.description && (
                  <div className="text-xs opacity-75 font-normal mt-1">{action.description}</div>
                )}
              </span>
              {loadingActionId === action.id && (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent ml-2" />
              )}
              {action.icon && <span className="h-5 w-5 ml-2">{action.icon}</span>}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
