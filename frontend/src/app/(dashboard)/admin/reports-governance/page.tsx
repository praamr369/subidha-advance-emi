"use client";

import Link from "next/link";
import { 
  BarChart3, 
  ShieldCheck, 
  FileText, 
  Eye, 
  Scale, 
  FileSearch,
  Activity,
  PackageCheck,
  Building2
} from "lucide-react";

import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";

const REPORTS = [
  { href: "/admin/reports/advance-emi", label: "Advance EMI Performance", icon: BarChart3, description: "Advance EMI KPI and trend analytics." },
  { href: "/admin/reports/contracts", label: "Contract Performance", icon: FileText, description: "Contract fulfillment and breach analytics." },
  { href: "/admin/reports/crm", label: "CRM Analytics", icon: Activity, description: "Lead conversion and customer engagement." },
  { href: "/admin/reports/delivery", label: "Delivery Performance", icon: PackageCheck, description: "Delivery SLA and failure analysis." },
  { href: "/admin/reports/direct-sales", label: "Direct Sales", icon: BarChart3, description: "Direct sale conversion and revenue." },
  { href: "/admin/reports/finance", label: "Finance Performance", icon: Building2, description: "High-level finance overview." },
  { href: "/admin/reports/inventory", label: "Inventory Performance", icon: PackageCheck, description: "Stock velocity and aging." },
  { href: "/admin/reports/reconciliation", label: "Reconciliation Analysis", icon: FileSearch, description: "Reconciliation queue clearance metrics." },
  { href: "/admin/reports/rent-lease", label: "Rent/Lease Performance", icon: Building2, description: "Rent and lease yield analytics." },
];

const PRIVACY = [
  { href: "/admin/privacy/breach-notifications", label: "Breach Notifications", icon: Eye, description: "Data breach disclosure log." },
  { href: "/admin/privacy/breaches", label: "Breach Register", icon: ShieldCheck, description: "Internal data breach records." },
  { href: "/admin/privacy/compliance", label: "Privacy Compliance", icon: Scale, description: "Overall privacy compliance posture." },
  { href: "/admin/privacy/data-retention", label: "Data Retention", icon: FileText, description: "Data retention schedules." },
  { href: "/admin/privacy/erasure-requests", label: "Erasure Requests", icon: Eye, description: "Right to be forgotten requests." },
  { href: "/admin/privacy/grievances", label: "Grievances", icon: ShieldCheck, description: "Privacy-related grievances." },
  { href: "/admin/privacy/retention-schedule", label: "Retention Schedule", icon: FileText, description: "Configured retention periods." },
];

export default function ReportsGovernanceWorkbenchPage() {
  const laneLinkClass = "group flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium transition-colors hover:border-primary hover:bg-primary/5";

  return (
    <ERPPageShell
      eyebrow="Governance"
      title="Reports & Governance Workbench"
      subtitle="Dedicated control room for analytical reporting, audit logs, and privacy compliance."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Reports & Governance", href: "/admin/reports-governance" },
      ]}
    >
      <div className="space-y-6 max-w-[1200px]">
        <ERPSectionShell 
          title="Analytical Reports" 
          description="High-level business intelligence and performance analytics across all modules."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {REPORTS.map(r => (
              <Link key={`${r.label}-${r.href}`} href={r.href} className={laneLinkClass}>
                <r.icon className="h-5 w-5 text-indigo-600" />
                <div className="flex flex-col">
                  <span>{r.label}</span>
                  <span className="text-xs text-muted-foreground font-normal mt-0.5">{r.description}</span>
                </div>
              </Link>
            ))}
          </div>
        </ERPSectionShell>

        <ERPSectionShell 
          title="Privacy & Compliance" 
          description="Statutory privacy records, erasure requests, and data governance posture."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {PRIVACY.map(r => (
              <Link key={`${r.label}-${r.href}`} href={r.href} className={laneLinkClass}>
                <r.icon className="h-5 w-5 text-rose-600" />
                <div className="flex flex-col">
                  <span>{r.label}</span>
                  <span className="text-xs text-muted-foreground font-normal mt-0.5">{r.description}</span>
                </div>
              </Link>
            ))}
          </div>
        </ERPSectionShell>
      </div>
    </ERPPageShell>
  );
}
