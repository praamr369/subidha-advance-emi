"use client";

import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import { PageSection, SectionHeader } from "@/components/ui/portal-primitives";
import { usePriorityAlerts } from "@/features/admin-dashboard/hooks/usePriorityAlerts";

function severityClass(severity: string) {
  switch (severity) {
    case "CRITICAL":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    case "HIGH":
      return "border-orange-500/30 bg-orange-500/10 text-orange-600";
    case "MEDIUM":
      return "border-yellow-500/30 bg-yellow-500/10 text-yellow-700";
    default:
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700";
  }
}

export default function PriorityAlertsPanel() {
  const { data, isLoading, isError, error } = usePriorityAlerts();

  return (
    <PageSection className="p-0">
      <div className="px-6 py-4">
        <SectionHeader
          title="Priority Alerts"
          description="Operational and financial exceptions that need review."
          className="border-b-0 pb-0"
        />
      </div>

      {isLoading ? (
        <div className="px-6 py-8 text-sm text-muted-foreground">Loading alerts...</div>
      ) : isError ? (
        <div className="px-6 py-6">
          <ErrorState
            message={error instanceof Error ? error.message : "Failed to load alerts."}
          />
        </div>
      ) : !data || data.length === 0 ? (
        <div className="px-6 py-6">
          <EmptyState
            title="No active alerts"
            description="No critical workflow or finance alerts are pending."
          />
        </div>
      ) : (
        <div className="space-y-3 px-6 py-4">
          {data.map((alert) => (
            <div key={alert.id} className="rounded-xl border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-foreground">{alert.title}</div>
                  <p className="mt-1 text-sm text-muted-foreground">{alert.description}</p>
                </div>

                <span
                  className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${severityClass(
                    alert.severity
                  )}`}
                >
                  {alert.severity}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageSection>
  );
}
