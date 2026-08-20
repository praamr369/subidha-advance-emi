"use client";

import { useCallback, useEffect, useState } from "react";
import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import {
  classifyNpa,
  getAgingReport,
  listBadDebtCases,
  recordLegalNotice,
  writeOff,
  type AgingReport,
  type BadDebtCase,
} from "@/services/bad-debt";

const STAGE_COLOR: Record<string, string> = {
  IDENTIFIED: "bg-yellow-100 text-yellow-700",
  NOTICE_SENT: "bg-orange-100 text-orange-700",
  FIELD_VISIT: "bg-blue-100 text-blue-700",
  LEGAL: "bg-red-100 text-red-700",
  WRITTEN_OFF: "bg-gray-100 text-gray-500",
  SETTLED: "bg-green-100 text-green-700",
};

export default function BadDebtPage() {
  const [cases, setCases] = useState<BadDebtCase[]>([]);
  const [aging, setAging] = useState<AgingReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, a] = await Promise.all([listBadDebtCases(true), getAgingReport()]);
      setCases(c);
      setAging(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const kpis = [
    { label: "Recovery cases", value: cases.length },
    { label: "NPA classified", value: cases.filter((c) => c.npa_classified_at).length },
    { label: "Total overdue", value: aging ? `₹${Number(aging.total_overdue).toLocaleString("en-IN")}` : "—" },
    { label: "Written off", value: aging ? `₹${Number(aging.total_written_off).toLocaleString("en-IN")}` : "—" },
  ];

  const handleNpa = async (id: number) => {
    try {
      await classifyNpa(id);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
    }
  };

  const handleNotice = async (id: number) => {
    const noticeDate = prompt("Legal notice date (YYYY-MM-DD):");
    const noticeRef = prompt("Notice reference number:");
    if (!noticeDate || !noticeRef) return;
    try {
      await recordLegalNotice(id, noticeDate, noticeRef);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
    }
  };

  const handleWriteOff = async (id: number) => {
    if (!confirm("Write off this bad debt? Accounting entry: Dr Bad Debt Expense / Cr Customer Receivable. This action is audited.")) return;
    try {
      await writeOff(id);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
    }
  };

  return (
    <ERPPageShell
      title="Bad Debt Provisioning & Write-off"
      subtitle="IT Act s.36(1)(vii) — NPA classification, aging buckets, legal notice, write-off"
      stats={kpis}
    >
      {loading ? (
        <LoadingBlock label="Loading bad debt data…" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void reload()} />
      ) : (
        <>
          {aging && (
            <WorkspaceSection title="Aging bucket summary">
              <div className="grid grid-cols-5 gap-3 text-sm">
                {Object.entries(aging.buckets).map(([bucket, data]) => (
                  <div key={bucket} className="rounded-lg border p-3 text-center">
                    <div className="text-xs text-muted-foreground">{bucket} days</div>
                    <div className="text-lg font-semibold">{data.count}</div>
                    <div className="text-xs">₹{Number(data.total).toLocaleString("en-IN")}</div>
                  </div>
                ))}
              </div>
            </WorkspaceSection>
          )}

          <WorkspaceSection title={`Recovery cases (${cases.length})`}>
            {cases.length === 0 ? (
              <EmptyState title="No recovery cases" description="No overdue EMI recovery cases found." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="pb-2 pr-4">Customer</th>
                      <th className="pb-2 pr-4">Stage</th>
                      <th className="pb-2 pr-4">Overdue</th>
                      <th className="pb-2 pr-4">Aging</th>
                      <th className="pb-2 pr-4">Provision %</th>
                      <th className="pb-2 pr-4">NPA</th>
                      <th className="pb-2 pr-4">Legal notice</th>
                      <th className="pb-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cases.map((c) => (
                      <tr key={c.id} className="border-b">
                        <td className="py-2 pr-4">{c.customer_name ?? `Sub#${c.subscription_id}`}</td>
                        <td className="py-2 pr-4">
                          <span className={`text-xs px-2 py-0.5 rounded ${STAGE_COLOR[c.stage] ?? ""}`}>{c.stage}</span>
                        </td>
                        <td className="py-2 pr-4">₹{Number(c.overdue_amount).toLocaleString("en-IN")}</td>
                        <td className="py-2 pr-4">{c.aging_days}d ({c.aging_bucket})</td>
                        <td className="py-2 pr-4">{c.provisioning_percent}%</td>
                        <td className="py-2 pr-4">{c.npa_classified_at ? "Yes" : "No"}</td>
                        <td className="py-2 pr-4">{c.legal_notice_date ?? "—"}</td>
                        <td className="py-2 space-x-1">
                          {!c.npa_classified_at && c.aging_days >= 90 && (
                            <button onClick={() => handleNpa(c.id)} className="text-xs px-2 py-1 rounded bg-orange-100 text-orange-700 hover:bg-orange-200">NPA</button>
                          )}
                          {!c.legal_notice_date && c.stage !== "WRITTEN_OFF" && (
                            <button onClick={() => handleNotice(c.id)} className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200">Notice</button>
                          )}
                          {c.stage !== "WRITTEN_OFF" && c.stage !== "SETTLED" && c.npa_classified_at && c.legal_notice_date && c.aging_days >= 365 && (
                            <button onClick={() => handleWriteOff(c.id)} className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200">Write off</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </WorkspaceSection>
        </>
      )}
    </ERPPageShell>
  );
}
