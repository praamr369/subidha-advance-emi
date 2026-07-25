"use client";

import { useCallback, useEffect, useState } from "react";

import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import { getComplianceTaxReadiness, getComplianceTurnoverSummary } from "@/services/compliance";
import type { ComplianceAlert, ComplianceTaxReadiness, TurnoverSummary } from "@/types/compliance";

export default function AdminComplianceTaxReadinessPage() {
  const [readiness, setReadiness] = useState<ComplianceTaxReadiness | null>(null);
  const [summary, setSummary] = useState<TurnoverSummary | null>(null);
  const [alerts, setAlerts] = useState<ComplianceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [r, t] = await Promise.all([getComplianceTaxReadiness(), getComplianceTurnoverSummary()]);
      setReadiness(r);
      setSummary(t.summary);
      setAlerts(t.alerts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load readiness.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ERPPageShell
      eyebrow="Compliance"
      title="Tax Readiness"
      subtitle="Non-GST operations today with GST transition readiness tracking."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Compliance" },
        { label: "Tax Readiness" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      <WorkspaceSection title="Readiness" description="Product and party tax master completeness for future GST activation.">
        {loading ? (
          <LoadingBlock label="Loading tax readiness…" />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : readiness ? (
          <div className="grid gap-2 text-sm">
            <p>Current tax mode: {readiness.tax_mode.mode}</p>
            <p>Product tax profiles: {readiness.product_readiness.active_product_tax_profiles} / {readiness.product_readiness.total_products}</p>
            <p>Missing product profiles: {readiness.product_readiness.missing_product_tax_profiles}</p>
            <p>Missing HSN: {readiness.product_readiness.missing_hsn_code}</p>
            <p>Party tax profiles: {readiness.party_readiness.active_party_tax_profiles}</p>
          </div>
        ) : null}
      </WorkspaceSection>
      <WorkspaceSection title="Turnover & Alerts" description="Threshold alerts are configurable and advisory.">
        {loading ? (
          <LoadingBlock label="Loading turnover summary…" />
        ) : summary ? (
          <div className="grid gap-2 text-sm">
            <p>Aggregate turnover: {summary.aggregate_turnover}</p>
            <p>Direct sale turnover: {summary.direct_sale_turnover}</p>
            <p>Rent turnover: {summary.rent_turnover}</p>
            <p>Lease turnover: {summary.lease_turnover}</p>
            <p>Service turnover: {summary.service_turnover}</p>
            <p>Supplier GST paid not claimable: {summary.supplier_gst_paid_not_claimable}</p>
            {alerts.length ? (
              <div className="mt-2 space-y-1">
                {alerts.map((alert) => (
                  <p key={alert.key} className={alert.triggered ? "text-amber-700" : "text-muted-foreground"}>
                    {alert.label}: {alert.current_value} / {alert.threshold_amount}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Turnover summary is unavailable.</p>
        )}
      </WorkspaceSection>
    </ERPPageShell>
  );
}
