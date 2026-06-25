import Link from "next/link";
import {
  Building2,
  ChevronRight,
  Database,
  FileText,
  LockKeyhole,
  Scale,
  ScrollText,
  ShieldCheck,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import type { ComponentType } from "react";

import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";

type SettingsDef = {
  title: string;
  description: string;
  href: string;
  Icon: ComponentType<{ className?: string }>;
  iconCls: string;
  dotCls: string;
};

const CONTROLS: SettingsDef[] = [
  {
    title: "Business Setup",
    description:
      "Configure business profile, branches, finance accounts, cash desks, staff setup, and go-live readiness.",
    href: ROUTES.admin.settingsBusinessSetup,
    Icon: Building2,
    iconCls: "bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
    dotCls: "bg-sky-400",
  },
  {
    title: "Internal Users",
    description:
      "View and create ADMIN and CASHIER accounts for controlled business operations.",
    href: ROUTES.admin.settingsUsers,
    Icon: Users,
    iconCls: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    dotCls: "bg-blue-400",
  },
  {
    title: "Create Internal User",
    description:
      "Create ADMIN and CASHIER accounts internally. Public registration remains limited to customer and partner roles.",
    href: `${ROUTES.admin.settingsUsers}/create`,
    Icon: UserPlus,
    iconCls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    dotCls: "bg-emerald-400",
  },
  {
    title: "Role Governance",
    description: "Role boundaries, least-privilege access, and admin policy controls.",
    href: ROUTES.admin.settingsRolesPermissions,
    Icon: ShieldCheck,
    iconCls: "bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
    dotCls: "bg-violet-400",
  },
  {
    title: "Financial Controls",
    description: "Receipt controls, reversal-only correction flow, and reconciliation guardrails.",
    href: ROUTES.admin.settingsFinance,
    Icon: Wallet,
    iconCls: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    dotCls: "bg-amber-400",
  },
  {
    title: "Audit Readiness",
    description: "Immutable traceability for payment, draw, batch, and access changes.",
    href: ROUTES.admin.auditLogs,
    Icon: ScrollText,
    iconCls: "bg-slate-50 text-muted-foreground dark:bg-slate-800/50 dark:text-slate-300",
    dotCls: "bg-slate-400",
  },
  {
    title: "Session Policy",
    description: "Authentication expiry, route protection, and restricted admin surface exposure.",
    href: ROUTES.admin.settingsRolesPermissions,
    Icon: LockKeyhole,
    iconCls: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    dotCls: "bg-red-400",
  },
  {
    title: "Policy Governance",
    description:
      "Draft, publish, archive, and legal-review workflows for public legal and policy pages.",
    href: ROUTES.admin.settingsPolicies,
    Icon: FileText,
    iconCls: "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
    dotCls: "bg-indigo-400",
  },
  {
    title: "Legal & GST Controls",
    description:
      "Set waiver launch status, refund SLA, partner receipt approval, KYC masking, deposit inspection, and GST document gates.",
    href: ROUTES.admin.settingsLegalControls,
    Icon: Scale,
    iconCls: "bg-cyan-50 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
    dotCls: "bg-cyan-400",
  },
  {
    title: "Business Compliance",
    description: "Admin-only compliance document register with public-safe disclosure controls.",
    href: ROUTES.admin.settingsBusinessCompliance,
    Icon: Database,
    iconCls: "bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
    dotCls: "bg-teal-400",
  },
];

export default function AdminSettingsPage() {
  return (
    <ERPPageShell
      eyebrow="Settings & Governance"
      title="Governance Settings"
      subtitle="Operational guardrails for access, finance, auditability, and internal control."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Governance Settings" },
      ]}
      actions={[
        { href: ROUTES.admin.settingsBusinessSetup, label: "Business Setup", variant: "secondary" },
        { href: ROUTES.admin.settingsUsers, label: "Users", variant: "secondary" },
        { href: ROUTES.admin.auditLogs, label: "Audit Logs", variant: "primary" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <ERPSectionShell
        title="Control workspaces"
        description="Each workspace governs a specific governance or configuration concern. Changes are audit-traced."
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {CONTROLS.map(({ title, description, href, Icon, iconCls, dotCls }) => (
            <Link
              key={href + title}
              href={href}
              className="group relative flex min-h-[10rem] flex-col rounded-xl border border-border bg-card p-4 transition hover:border-ring hover:shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconCls}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <span className={`mt-1 h-2 w-2 rounded-full ${dotCls}`} />
              </div>
              <div className="mt-3 flex-1">
                <div className="text-sm font-semibold text-foreground group-hover:text-primary">
                  {title}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
              </div>
              <div className="mt-3 flex items-center gap-1 border-t border-border/50 pt-2.5 text-xs font-medium text-primary">
                Open {title}
                <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          ))}
        </div>
      </ERPSectionShell>
    </ERPPageShell>
  );
}
