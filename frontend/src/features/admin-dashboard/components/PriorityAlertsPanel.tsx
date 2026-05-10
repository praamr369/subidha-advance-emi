"use client";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import { PageSection, SectionHeader } from "@/components/ui/portal-primitives";
import { usePriorityAlerts } from "@/features/admin-dashboard/hooks/usePriorityAlerts";

function severityClass(severity: string) {
  switch (severity) {
    case "CRITICAL":
      return "chip-tone-danger";
    case "HIGH":
      return "border border-[color-mix(in_oklab,oklch(0.62_0.14_55)_40%,var(--border)_60%)] bg-[color-mix(in_oklab,oklch(0.62_0.12_55)_14%,var(--card)_86%)] text-[var(--semantic-warning-fg)] shadow-[var(--badge-inset-highlight)]";
    case "MEDIUM":
      return "chip-tone-warning";
    default:
      return "chip-tone-success";
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
        <div className="px-6 py-4">
          <LoadingBlock label="Loading priority alerts" compact />
        </div>
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
