"use client";

import Link from "next/link";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";

const COMPLIANCE_AREAS = [
  {
    title: "DPDP 2023 — Data Protection",
    icon: "🔒",
    items: [
      { label: "Consent Management", href: "/admin/settings/legal-controls", status: "ACTIVE" },
      { label: "Data Access Requests", href: "#", status: "ACTIVE" },
      { label: "Data Retention Policy", href: "/admin/privacy/data-retention", status: "ACTIVE" },
      { label: "Breach Incident Log", href: "/admin/privacy/breaches", status: "ACTIVE" },
      { label: "DPO Grievances", href: "/admin/privacy/grievances", status: "ACTIVE" },
      { label: "Cookie Consent (DPDP 2023)", href: "/admin/privacy/data-retention", status: "ACTIVE" },
    ],
  },
  {
    title: "CPA 2019 — Consumer Protection",
    icon: "⚖️",
    items: [
      { label: "7-day Return Policy", href: "/admin/refunds/process", status: "ACTIVE" },
      { label: "Warranty Claims Management", href: "/admin/warranty/claims", status: "ACTIVE" },
    ],
  },
  {
    title: "ITA 1961 — Tax Compliance",
    icon: "📊",
    items: [
      { label: "7-Year Record Retention", href: "/admin/privacy/data-retention", status: "ACTIVE" },
      { label: "Accounting Audit Logs", href: "/admin/audit-logs", status: "ACTIVE" },
    ],
  },
  {
    title: "RBI Guidelines — Payments",
    icon: "🏦",
    items: [
      { label: "Payment Reconciliation", href: "/admin/payments/reconciliation", status: "ACTIVE" },
      { label: "Cashier Day Close", href: "/admin/payments/cashier-close", status: "ACTIVE" },
      { label: "Payment Reversals", href: "/admin/payments/reversals", status: "ACTIVE" },
    ],
  },
];

export default function PrivacyCompliancePage() {
  return (
    <ERPPageShell
      title="Privacy & Compliance Dashboard"
      subtitle="Central hub for all compliance controls and audit links"
      breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Privacy Compliance" }]}
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Active Consents", value: "—", color: "blue" },
            { label: "Open Grievances", value: "—", color: "red" },
            { label: "Pending Requests", value: "—", color: "yellow" },
            { label: "Compliance Score", value: "—", color: "green" },
          ].map((s) => (
            <div key={s.label} className="p-4 border rounded-xl">
              <div className="text-2xl font-bold">{s.value}</div>
              <div className="text-xs text-gray-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {COMPLIANCE_AREAS.map((area) => (
          <WorkspaceSection key={area.title} title={`${area.icon} ${area.title}`}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {area.items.map((item) => (
                <Link key={item.label} href={item.href}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
                  <span className="text-sm font-medium">{item.label}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">{item.status}</span>
                </Link>
              ))}
            </div>
          </WorkspaceSection>
        ))}

        <WorkspaceSection title="Quick Links">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Audit Logs", href: "/admin/audit-logs", icon: "📋" },
              { label: "Data Breaches", href: "/admin/privacy/breaches", icon: "🚨" },
              { label: "Grievances", href: "/admin/privacy/grievances", icon: "⚖️" },
              { label: "Data Retention", href: "/admin/privacy/data-retention", icon: "🗄️" },
              { label: "Legal Controls", href: "/admin/settings/legal-controls", icon: "🔒" },
              { label: "Roles & Access", href: "/admin/settings/roles-permissions", icon: "👥" },
              { label: "KYC Review", href: "/admin/compliance/kyc", icon: "🪪" },
              { label: "Policy Editor", href: "/admin/settings/policies", icon: "📄" },
            ].map((link) => (
              <Link key={link.href} href={link.href}
                className="flex items-center gap-2 p-3 border rounded-lg hover:shadow-sm">
                <span className="text-xl">{link.icon}</span>
                <span className="text-sm">{link.label}</span>
              </Link>
            ))}
          </div>
        </WorkspaceSection>
      </div>
    </ERPPageShell>
  );
}
