"use client";

import { useEffect, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import { getDataQualityReport, type DQReport, type DQCheck } from "@/services/control-enterprise";

const SEVERITY_CLASS: Record<string, string> = {
  CRITICAL: "text-destructive font-semibold",
  WARNING: "text-yellow-600 font-semibold",
  INFO: "text-muted-foreground",
};

function DQCheckRow({ check }: { check: DQCheck }) {
  return (
    <tr className="hover:bg-muted/30">
      <td className="px-4 py-3 font-mono text-xs">{check.check_key}</td>
      <td className={`px-4 py-3 text-xs ${SEVERITY_CLASS[check.severity] ?? ""}`}>{check.severity}</td>
      <td className="px-4 py-3">
        <span className={check.passed ? "text-green-600 font-semibold" : "text-destructive font-semibold"}>
          {check.passed ? "Pass" : "Fail"}
        </span>
      </td>
      <td className="px-4 py-3 font-mono text-xs">
        <span className={check.count > 0 ? "text-destructive" : "text-green-600"}>{check.count}</span>
      </td>
      <td className="px-4 py-3 text-xs">{check.detail}</td>
    </tr>
  );
}

export default function AdminDataQualityPage() {
  const [report, setReport] = useState<DQReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setReport(await getDataQualityReport());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data quality report.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const stats = report
    ? [
        { label: "Critical Issues", value: String(report.critical_count), tone: report.critical_count > 0 ? ("danger" as const) : ("success" as const) },
        { label: "Warnings", value: String(report.warning_count), tone: report.warning_count > 0 ? ("warning" as const) : ("success" as const) },
        { label: "Total Issues", value: String(report.total_issues), tone: report.total_issues > 0 ? ("warning" as const) : ("success" as const) },
      ]
    : undefined;

  return (
    <ERPPageShell
      eyebrow="Enterprise Control"
      title="Data Quality Center"
      subtitle="11 read-only integrity checks across customers, products, contracts, payments, and accounting. No records are mutated."
      breadcrumbs={[{ href: ROUTES.admin.dashboard, label: "Admin" }, { label: "Data Quality" }]}
      stats={stats}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      {loading && <LoadingBlock />}
      {!loading && error && <ErrorState message={error} onRetry={() => void load()} />}
      {!loading && !error && !report && <EmptyState title="No report" description="No data quality report available." />}
      {!loading && !error && report && (
        <div className="flex flex-col gap-4">
          {report.total_issues === 0 && (
            <p className="rounded-lg border border-green-600/30 bg-green-600/10 px-4 py-3 text-sm text-green-700 font-medium">
              All checks passed — no data quality issues detected.
            </p>
          )}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Check</th>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">Result</th>
                  <th className="px-4 py-3">Count</th>
                  <th className="px-4 py-3">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {report.checks.map((c) => (
                  <DQCheckRow key={c.check_key} check={c} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </ERPPageShell>
  );
}
