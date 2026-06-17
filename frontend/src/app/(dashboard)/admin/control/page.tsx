"use client";

import Link from "next/link";

import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";

const MODULES = [
  {
    href: ROUTES.admin.controlApprovals,
    title: "Approval Queue",
    description: "Maker-checker approvals pending a decision. Approve or reject controlled actions.",
  },
  {
    href: ROUTES.admin.controlPolicies,
    title: "Business Policies",
    description: "Toggle enterprise control policies (e.g. cash variance approval requirement).",
  },
  {
    href: ROUTES.admin.controlExceptions,
    title: "Exception Desk",
    description: "Active control exceptions raised by automated checks. Acknowledge, resolve, or suppress.",
  },
  {
    href: ROUTES.admin.controlCashSessions,
    title: "Cash Counter Sessions",
    description: "Open and closed cash counter sessions with variance status.",
  },
  {
    href: ROUTES.admin.controlDailyClose,
    title: "Daily Close",
    description: "Daily close readiness checks and execution history.",
  },
  {
    href: ROUTES.admin.controlMonthEndClose,
    title: "Month-End Close",
    description: "Month-end close readiness, dry-run, and execute controls.",
  },
  {
    href: ROUTES.admin.dataQuality,
    title: "Data Quality Center",
    description: "11-check data integrity report across customers, contracts, payments, and accounting.",
  },
];

export default function AdminControlPage() {
  return (
    <PortalPage
      eyebrow="Enterprise Control"
      title="Control Desk"
      subtitle="Maker-checker approvals, policy toggles, exception management, cash sessions, close controls, and data quality."
      breadcrumbs={[{ href: ROUTES.admin.dashboard, label: "Admin" }, { label: "Control Desk" }]}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MODULES.map((mod) => (
          <Link
            key={mod.href}
            href={mod.href}
            className="flex flex-col gap-1 rounded-lg border border-border bg-[var(--surface-card-elevated)] p-5 hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-muted)] transition-colors"
          >
            <span className="font-semibold text-foreground">{mod.title}</span>
            <span className="text-sm text-muted-foreground">{mod.description}</span>
          </Link>
        ))}
      </div>
    </PortalPage>
  );
}
