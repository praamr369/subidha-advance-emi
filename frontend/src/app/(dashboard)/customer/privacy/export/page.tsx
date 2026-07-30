"use client";

import { useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { apiFetch } from "@/lib/api";

const DATA_CATEGORIES = [
  { key: "profile", label: "Profile & KYC", description: "Name, address, contact, identity documents" },
  { key: "subscriptions", label: "Subscriptions", description: "All subscription contracts and history" },
  { key: "payments", label: "Payment History", description: "All payments, receipts, and transactions" },
  { key: "refunds", label: "Returns & Refunds", description: "All return requests and refund records" },
  { key: "warranty", label: "Warranty & Service", description: "Claims and service visit records" },
  { key: "communications", label: "Communications", description: "SMS, email, WhatsApp logs" },
  { key: "consents", label: "Consent History", description: "All consent grants and withdrawals" },
  { key: "audit_logs", label: "Audit Trail", description: "Account activity and access logs" },
];

export default function DataExportPage() {
  const [selected, setSelected] = useState<string[]>(["profile", "subscriptions"]);
  const [format, setFormat] = useState<"JSON" | "CSV">("JSON");
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<{ url: string; expires_at: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = (key: string) =>
    setSelected((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);

  const handleExport = async () => {
    if (selected.length === 0) { setError("Select at least one data category."); return; }
    setExporting(true);
    setError(null);
    try {
      const res = await apiFetch("/api/v1/privacy/data-export/", {
        method: "POST",
        body: JSON.stringify({ categories: selected, format }),
      });
      setResult(res as { url: string; expires_at: string });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <ERPPageShell
      title="Export My Data"
      subtitle="Download a copy of your personal data — voluntary service under DPDP 2023"
      breadcrumbs={[
        { label: "Home", href: "/customer/dashboard" },
        { label: "Privacy", href: "/customer/privacy/dashboard" },
        { label: "Export Data" },
      ]}
    >
      <div className="max-w-2xl mx-auto space-y-6">
        {result ? (
          <WorkspaceSection title="Export Ready">
            <div className="text-center py-6">
              <div className="text-4xl mb-3">📥</div>
              <p className="font-semibold text-lg">Your data export is ready</p>
              <p className="text-sm text-gray-500 mt-1">Link expires: {new Date(result.expires_at).toLocaleString("en-IN")}</p>
              <a
                href={result.url}
                download
                className="mt-4 inline-block px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"
              >
                Download Export
              </a>
              <button onClick={() => setResult(null)} className="block mx-auto mt-3 text-sm text-gray-500 underline">
                Export again
              </button>
            </div>
          </WorkspaceSection>
        ) : (
          <>
            <WorkspaceSection title="Select Data to Export">
              <div className="grid grid-cols-1 gap-3 mb-4 sm:grid-cols-2">
                {DATA_CATEGORIES.map((cat) => (
                  <label key={cat.key} className={`flex items-start gap-2 p-3 border rounded-lg cursor-pointer ${
                    selected.includes(cat.key) ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : "hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}>
                    <input type="checkbox" checked={selected.includes(cat.key)} onChange={() => toggle(cat.key)} className="mt-0.5" />
                    <div>
                      <div className="text-sm font-medium">{cat.label}</div>
                      <div className="text-xs text-gray-500">{cat.description}</div>
                    </div>
                  </label>
                ))}
              </div>
              <div className="flex items-center gap-4 mb-4">
                <span className="text-sm font-medium">Format:</span>
                {(["JSON", "CSV"] as const).map((f) => (
                  <label key={f} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="format" value={f} checked={format === f} onChange={() => setFormat(f)} />
                    <span className="text-sm">{f}</span>
                  </label>
                ))}
              </div>
              {error && <div className="text-red-600 text-sm mb-3">{error}</div>}
              <button
                onClick={handleExport}
                disabled={exporting}
                className="w-full py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {exporting ? "Generating Export..." : "Export My Data"}
              </button>
            </WorkspaceSection>

            <WorkspaceSection title="About Data Exports">
              <ul className="text-sm space-y-1 list-disc list-inside text-blue-800 dark:text-blue-200">
                <li>Export link is valid for 24 hours</li>
                <li>Data is encrypted and only accessible to you</li>
                <li>Offered as a voluntary service — export your data on request</li>
                <li>Export includes data from the last 7 years (ITA 1961)</li>
              </ul>
            </WorkspaceSection>
          </>
        )}
      </div>
    </ERPPageShell>
  );
}
