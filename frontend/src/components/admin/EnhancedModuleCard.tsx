"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, AlertCircle, TrendingUp, Clock, Zap } from "lucide-react";

type Workflow = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  action: string;
};

type Request = {
  id: string;
  label: string;
  count: number;
  status: "active" | "pending" | "critical";
};

type EnhancedModuleCardProps = {
  label: string;
  description: string;
  href: string;
  Icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
  kpi?: { label: string; value: string | number; trend?: "up" | "down" | "neutral" };
  workflows?: Workflow[];
  requests?: Request[];
  quickActions?: Array<{ label: string; href: string }>;
};

export default function EnhancedModuleCard({
  label,
  description,
  href,
  Icon,
  colorClass,
  kpi,
  workflows = [],
  requests = [],
  quickActions = [],
}: EnhancedModuleCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const hasContent = workflows.length > 0 || requests.length > 0 || quickActions.length > 0;

  return (
    <div className="group rounded-lg border border-border bg-card transition hover:border-ring hover:shadow-sm">
      {/* Main Card */}
      <Link
        href={href}
        className="block p-3"
        onMouseEnter={() => hasContent && setIsExpanded(true)}
        onMouseLeave={() => setIsExpanded(false)}
      >
        <div className="flex items-start justify-between gap-2">
          <div className={`flex h-7 w-7 items-center justify-center rounded-md ${colorClass}`}>
            <Icon className="h-3.5 w-3.5" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {kpi?.trend === "up" && <TrendingUp className="h-3 w-3 text-emerald-600" />}
          </div>
        </div>

        <div className="mt-2 flex-1">
          <div className="text-xs font-semibold text-foreground">{label}</div>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>

          {/* KPI Display */}
          {kpi && (
            <div className="mt-2 rounded bg-muted/30 px-2 py-1.5">
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
              <p className="text-sm font-semibold text-foreground">{kpi.value}</p>
            </div>
          )}

          {/* Request Badges */}
          {requests.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {requests.slice(0, 2).map(req => (
                <span
                  key={req.id}
                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                    req.status === "critical"
                      ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                      : req.status === "active"
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                        : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                  }`}
                >
                  {req.label} ({req.count})
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center gap-1 text-xs font-medium text-primary group-hover:gap-2 transition-all">
          Access <ChevronRight className="h-3 w-3" />
        </div>
      </Link>

      {/* Expanded Content */}
      {hasContent && (
        <div className="border-t border-border/50 bg-muted/20 p-3 space-y-2">
          {/* Workflows */}
          {workflows.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-foreground mb-1">Workflows</p>
              <div className="space-y-1">
                {workflows.map(workflow => (
                  <a
                    key={workflow.id}
                    href={workflow.action}
                    className="flex items-center gap-2 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition"
                  >
                    <workflow.icon className="h-3 w-3" />
                    {workflow.label}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Quick Actions */}
          {quickActions.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-foreground mb-1">Quick Actions</p>
              <div className="flex flex-wrap gap-1">
                {quickActions.map(action => (
                  <a
                    key={action.label}
                    href={action.href}
                    className="inline-block rounded bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition"
                  >
                    {action.label}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
