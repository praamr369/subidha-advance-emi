import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  CalendarCheck,
  CalendarRange,
  CheckSquare,
  ChevronRight,
  Receipt,
  Settings2,
} from "lucide-react";
import type { ComponentType } from "react";

import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";

type ModuleDef = {
  href: string;
  title: string;
  description: string;
  Icon: ComponentType<{ className?: string }>;
  iconCls: string;
  dotCls: string;
};

const MODULES: ModuleDef[] = [
  {
    href: ROUTES.admin.controlApprovals,
    title: "Approval Queue",
    description:
      "Maker-checker approvals pending a decision. Approve or reject controlled actions.",
    Icon: CheckSquare,
    iconCls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    dotCls: "bg-emerald-400",
  },
  {
    href: ROUTES.admin.controlPolicies,
    title: "Business Policies",
    description:
      "Toggle enterprise control policies — e.g. cash variance approval requirement.",
    Icon: Settings2,
    iconCls: "bg-slate-50 text-slate-700 dark:bg-slate-800/50 dark:text-slate-300",
    dotCls: "bg-slate-400",
  },
  {
    href: ROUTES.admin.controlExceptions,
    title: "Exception Desk",
    description:
      "Active control exceptions raised by automated checks. Acknowledge, resolve, or suppress.",
    Icon: AlertTriangle,
    iconCls: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    dotCls: "bg-amber-400",
  },
  {
    href: ROUTES.admin.controlCashSessions,
    title: "Cash Counter Sessions",
    description: "Open and closed cash counter sessions with variance status.",
    Icon: Receipt,
    iconCls: "bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
    dotCls: "bg-sky-400",
  },
  {
    href: ROUTES.admin.controlDailyClose,
    title: "Daily Close",
    description: "Daily close readiness checks and execution history.",
    Icon: CalendarCheck,
    iconCls: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    dotCls: "bg-blue-400",
  },
  {
    href: ROUTES.admin.controlMonthEndClose,
    title: "Month-End Close",
    description: "Month-end close readiness, dry-run, and execute controls.",
    Icon: CalendarRange,
    iconCls: "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
    dotCls: "bg-indigo-400",
  },
  {
    href: ROUTES.admin.dataQuality,
    title: "Data Quality Center",
    description:
      "11-check data integrity report across customers, contracts, payments, and accounting.",
    Icon: Activity,
    iconCls: "bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
    dotCls: "bg-violet-400",
  },
];

export default function AdminControlPage() {
  return (
    <ERPPageShell
      eyebrow="Enterprise Control"
      title="Control Desk"
      subtitle="Maker-checker approvals, policy toggles, exception management, cash sessions, close controls, and data quality."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Control Desk" },
      ]}
      actions={[
        { href: ROUTES.admin.controlApprovals, label: "Approval Queue", variant: "primary" },
        { href: ROUTES.admin.controlExceptions, label: "Exception Desk", variant: "secondary" },
        { href: ROUTES.admin.dataQuality, label: "Data Quality", variant: "secondary" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <ERPSectionShell
        title="Control workspaces"
        description="Each workspace governs a distinct control concern. Approvals, policy gates, and close operations are audit-traced."
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {MODULES.map(({ href, title, description, Icon, iconCls, dotCls }) => (
            <Link
              key={href}
              href={href}
              className="group relative flex min-h-[11rem] flex-col rounded-xl border border-border bg-card p-4 transition hover:border-ring hover:shadow-sm"
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
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {description}
                </p>
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
