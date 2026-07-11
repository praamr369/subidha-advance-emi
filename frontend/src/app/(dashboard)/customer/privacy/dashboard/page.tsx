"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { apiFetch } from "@/lib/api";

type PrivacySummary = {
  active_consents: number;
  total_consents: number;
  pending_requests: number;
  open_grievances: number;
  last_export: string | null;
  last_audit: string | null;
};

const QUICK_LINKS = [
  { href: "/customer/privacy/settings", label: "Consent Settings", icon: "🔐", color: "blue" },
  { href: "/customer/privacy/data-access", label: "Data Rights", icon: "📋", color: "purple" },
  { href: "/customer/privacy/export", label: "Export Data", icon: "📥", color: "green" },
  { href: "/customer/privacy/grievance", label: "File Complaint", icon: "⚖️", color: "red" },
  { href: "/customer/privacy/cookies", label: "Cookie Preferences", icon: "🍪", color: "orange" },
];

export default function PrivacyDashboardPage() {
  const [summary, setSummary] = useState<PrivacySummary | null>(null);

  useEffect(() => {
    apiFetch("/api/v1/privacy/dashboard-summary/")
      .then((d) => setSummary(d as PrivacySummary))
      .catch(() => {});
  }, []);

  return (
    <ERPPageShell
      title="Privacy Dashboard"
      subtitle="Manage all your privacy rights and data settings in one place"
      breadcrumbs={[{ label: "Home", href: "/customer/dashboard" }, { label: "Privacy" }]}
    >
      <div className="space-y-6">
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Active Consents", value: `${summary.active_consents}/${summary.total_consents}`, color: "blue" },
              { label: "Pending Requests", value: summary.pending_requests, color: "yellow" },
              { label: "Open Grievances", value: summary.open_grievances, color: "red" },
              { label: "Last Export", value: summary.last_export ? new Date(summary.last_export).toLocaleDateString("en-IN") : "Never", color: "green" },
            ].map((stat) => (
              <div key={stat.label} className="p-4 bg-white dark:bg-gray-800 rounded-xl border shadow-sm">
                <div className="text-2xl font-bold">{stat.value}</div>
                <div className="text-xs text-gray-500 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        )}

        <WorkspaceSection title="Privacy Controls">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {QUICK_LINKS.map((link) => (
              <Link key={link.href} href={link.href}
                className="flex items-center gap-3 p-4 border rounded-xl hover:shadow-md transition-shadow">
                <span className="text-2xl">{link.icon}</span>
                <span className="font-medium text-sm">{link.label}</span>
              </Link>
            ))}
          </div>
        </WorkspaceSection>

        <WorkspaceSection title="Your Data Rights (DPDP 2023)">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-blue-800 dark:text-blue-200">
            {[
              { right: "Right to Information & Access", desc: "Get copies of data we hold about you (Section 11)" },
              { right: "Right to Correction & Erasure", desc: "Fix inaccurate data or request deletion (Section 12)" },
              { right: "Right to Grievance Redressal", desc: "File complaint with our DPO within 30 days (Section 13)" },
              { right: "Right to Nominate", desc: "Nominate someone to exercise rights on your behalf (Section 14)" },
              { right: "Data Export (Voluntary)", desc: "Download a copy of your data — our voluntary service offering" },
              { right: "Processing Preferences", desc: "Manage your consent and communication preferences" },
            ].map((r) => (
              <div key={r.right} className="flex gap-2">
                <span className="text-green-600">✓</span>
                <div>
                  <span className="font-semibold">{r.right}</span>
                  <span className="text-xs block">{r.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </WorkspaceSection>
      </div>
    </ERPPageShell>
  );
}
