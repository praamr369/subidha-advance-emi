"use client";

import { useEffect, useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { apiFetch } from "@/lib/api";

type RetentionRule = {
  id: number;
  data_category: string;
  retention_years: number;
  legal_basis: string;
  auto_delete: boolean;
  last_purge_at: string | null;
  next_purge_at: string | null;
};

const DEFAULT_RULES = [
  { data_category: "TAX_RECORDS", retention_years: 7, legal_basis: "ITA 1961 Section 44AA", auto_delete: false },
  { data_category: "PAYMENT_RECORDS", retention_years: 7, legal_basis: "ITA 1961 + RBI Guidelines", auto_delete: false },
  { data_category: "PERSONAL_DATA", retention_years: 3, legal_basis: "DPDP 2023 Section 8(7) — minimum necessary period", auto_delete: true },
  { data_category: "AUDIT_LOGS", retention_years: 5, legal_basis: "IT Act 2000", auto_delete: false },
  { data_category: "CONSENT_RECORDS", retention_years: 3, legal_basis: "DPDP 2023", auto_delete: false },
  { data_category: "COOKIE_DATA", retention_years: 1, legal_basis: "DPDP 2023 — purpose-limited consent", auto_delete: true },
  { data_category: "KYC_DOCUMENTS", retention_years: 7, legal_basis: "RBI KYC Guidelines", auto_delete: false },
  { data_category: "COMMUNICATION_LOGS", retention_years: 2, legal_basis: "DPDP 2023 Section 8(7) — minimum necessary period", auto_delete: true },
];

export default function DataRetentionPage() {
  const [rules, setRules] = useState<RetentionRule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/v1/privacy/retention-policies/")
      .then((d) => setRules(Array.isArray(d) ? d as RetentionRule[] : ((d as { results?: RetentionRule[] })?.results ?? [])))
      .catch(() => setRules(DEFAULT_RULES as RetentionRule[]))
      .finally(() => setLoading(false));
  }, []);

  const handlePurge = async (id: number) => {
    if (!confirm("Run data purge for this category? This permanently deletes eligible records.")) return;
    await apiFetch(`/api/v1/privacy/retention-policies/${id}/purge/`, { method: "POST" });
    setRules((prev) => prev.map((r) => r.id === id ? { ...r, last_purge_at: new Date().toISOString() } : r));
  };

  return (
    <ERPPageShell
      title="Data Retention & Deletion"
      subtitle="Configure retention schedules — DPDP 2023 + ITA 1961 + RBI compliance"
      breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Privacy", href: "/admin/privacy/compliance" }, { label: "Data Retention" }]}
    >
      <div className="space-y-6">
        <WorkspaceSection title="Legal Retention Requirements">
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              { law: "ITA 1961", req: "7 years for tax/financial records" },
              { law: "DPDP 2023", req: "Minimum necessary period only" },
              { law: "RBI Guidelines", req: "7 years for payment records" },
              { law: "DPDP 2023", req: "Purpose-limited retention — delete when purpose fulfilled" },
            ].map((item) => (
              <div key={item.law} className="p-3 border rounded-lg">
                <div className="font-semibold text-xs text-blue-700 dark:text-blue-300">{item.law}</div>
                <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{item.req}</div>
              </div>
            ))}
          </div>
        </WorkspaceSection>

        <WorkspaceSection title="Retention Schedule">
          {loading && <div className="py-8 text-center text-gray-500">Loading...</div>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-gray-500 text-left">
                  <th className="pb-3 pr-4">Data Category</th>
                  <th className="pb-3 pr-4">Retention</th>
                  <th className="pb-3 pr-4">Legal Basis</th>
                  <th className="pb-3 pr-4">Auto-Delete</th>
                  <th className="pb-3 pr-4">Last Purge</th>
                  <th className="pb-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {rules.map((r, i) => (
                  <tr key={r.id || i}>
                    <td className="py-3 pr-4 font-medium">{r.data_category?.replace(/_/g, " ")}</td>
                    <td className="py-3 pr-4">{r.retention_years}y</td>
                    <td className="py-3 pr-4 text-xs text-gray-500">{r.legal_basis}</td>
                    <td className="py-3 pr-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${r.auto_delete ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {r.auto_delete ? "Yes" : "Manual"}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-xs text-gray-500">
                      {r.last_purge_at ? new Date(r.last_purge_at).toLocaleDateString("en-IN") : "Never"}
                    </td>
                    <td className="py-3">
                      {r.id && (
                        <button onClick={() => handlePurge(r.id)} className="text-xs text-red-600 hover:underline">
                          Run Purge
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </WorkspaceSection>
      </div>
    </ERPPageShell>
  );
}
