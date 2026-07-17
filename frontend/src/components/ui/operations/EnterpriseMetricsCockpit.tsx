"use client";

import React, { useEffect, useState } from "react";
import { 
  ShieldAlert, 
  CheckCircle, 
  AlertCircle, 
  Activity,
  Loader2
} from "lucide-react";
import { fetchEnterpriseControlMetrics, type EnterpriseControlMetrics } from "@/services/control-enterprise";

export default function EnterpriseMetricsCockpit() {
  const [metrics, setMetrics] = useState<EnterpriseControlMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEnterpriseControlMetrics()
      .then(setMetrics)
      .catch((e) => console.error("Failed to fetch enterprise metrics", e))
      .finally(() => setLoading(false));
  }, []);

  if (loading || !metrics) {
    return (
      <div className="mb-8 flex min-h-[8rem] items-center justify-center rounded-xl border border-border bg-card">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* Metric 1 */}
      <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-muted-foreground">System Health</div>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
            <Activity className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-4 flex items-baseline gap-2">
          <div className="text-3xl font-bold tracking-tight text-foreground">{metrics.system_health}</div>
          <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400">All checks pass</div>
        </div>
      </div>

      {/* Metric 2 */}
      <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-muted-foreground">Pending Approvals</div>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
            <CheckCircle className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-4 flex items-baseline gap-2">
          <div className="text-3xl font-bold tracking-tight text-foreground">{metrics.pending_approvals}</div>
          <div className="text-xs font-medium text-muted-foreground">Awaiting review</div>
        </div>
      </div>

      {/* Metric 3 */}
      <div className="flex flex-col justify-between rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm transition-all hover:shadow-md dark:border-amber-900/50 dark:bg-amber-900/10">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-amber-800 dark:text-amber-400">Active Exceptions</div>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-200 text-amber-800 dark:bg-amber-800/50 dark:text-amber-400">
            <ShieldAlert className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-4 flex items-baseline gap-2">
          <div className="text-3xl font-bold tracking-tight text-amber-700 dark:text-amber-500">{metrics.active_exceptions}</div>
          <div className="text-xs font-medium text-amber-600 dark:text-amber-500">Require attention</div>
        </div>
      </div>

      {/* Metric 4 */}
      <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-muted-foreground">Cash Variances</div>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
            <AlertCircle className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-4 flex items-baseline gap-2">
          <div className="text-3xl font-bold tracking-tight text-foreground">{metrics.cash_variances}</div>
          <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Unresolved</div>
        </div>
      </div>
    </div>
  );
}
