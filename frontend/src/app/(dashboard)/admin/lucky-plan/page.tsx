import Link from "next/link";
import { Award, BarChart3, ChevronRight, Hash, Layers, Shuffle } from "lucide-react";
import type { ComponentType } from "react";

import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { WorkflowCard } from "@/components/ui/operations";
import { ROUTES } from "@/lib/routes";

type SectionDef = {
  href: string;
  label: string;
  description: string;
  Icon: ComponentType<{ className?: string }>;
  dotCls: string;
  iconCls: string;
};

const SECTIONS: SectionDef[] = [
  {
    href: ROUTES.admin.luckyPlanBatches,
    label: "Batches",
    description:
      "Batch lifecycle: slot pressure, draw timing, subscription attachment, and status register.",
    Icon: Layers,
    dotCls: "bg-emerald-400",
    iconCls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  },
  {
    href: ROUTES.admin.luckyPlanLuckyIds,
    label: "Lucky IDs",
    description:
      "00–99 allocation grid, batch linkage, and assignment status per subscriber.",
    Icon: Hash,
    dotCls: "bg-sky-400",
    iconCls: "bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  },
  {
    href: ROUTES.admin.luckyPlanDraws,
    label: "Lucky Draws",
    description:
      "Draw schedule and execution: commitment hash, reveal state, and winner Lucky ID audit evidence.",
    Icon: Shuffle,
    dotCls: "bg-violet-400",
    iconCls: "bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  },
  {
    href: ROUTES.admin.luckyPlanWinners,
    label: "Winners",
    description:
      "Winner register with EMI waiver status, delivery posture, and draw evidence for audit trail.",
    Icon: Award,
    dotCls: "bg-amber-400",
    iconCls: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  },
  {
    href: ROUTES.admin.luckyPlanAnalytics,
    label: "Analytics",
    description:
      "Draw performance: total draws, verified winners, waiver totals, and success rate.",
    Icon: BarChart3,
    dotCls: "bg-indigo-400",
    iconCls: "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  },
];

export default function LuckyPlanControlPage() {
  return (
    <ERPPageShell
      eyebrow="Lucky Plan — Audit-first control room"
      title="Lucky Plan Control"
      subtitle="Batch lifecycle, Lucky ID allocation, draw execution, and winner waiver evidence are managed from this module. Commit/reveal/winner logic is unchanged by navigation."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Lucky Plan" },
      ]}
      actions={[
        { href: ROUTES.admin.luckyPlanBatches, label: "Batches", variant: "secondary" },
        { href: ROUTES.admin.luckyPlanDraws, label: "Lucky Draws", variant: "secondary" },
        { href: ROUTES.admin.luckyPlanWinners, label: "Winners", variant: "primary" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <WorkflowCard
        title="Lucky Plan — module safety contract"
        description="Lucky draw commit/reveal/winner logic is unchanged by navigation. Winner receives future EMI waiver only; no past payment changes. No fake draw readiness or fake winner data is shown. Rent/lease and direct sale operations are not owned by this module."
      />

      <ERPSectionShell
        title="Module sections"
        description="Navigate to any Lucky Plan workspace. Each section governs a distinct step of the draw lifecycle."
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {SECTIONS.map(({ href, label, description, Icon, dotCls, iconCls }) => (
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
                  {label}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {description}
                </p>
              </div>
              <div className="mt-3 flex items-center gap-1 border-t border-border/50 pt-2.5 text-xs font-medium text-primary">
                Open {label}
                <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          ))}
        </div>
      </ERPSectionShell>

      <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-5 py-4 dark:border-emerald-700 dark:bg-emerald-900/20">
        <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">Production register</p>
        <p className="mt-1.5 text-sm text-emerald-800 dark:text-emerald-300">
          The winners page is backed by the admin Lucky Draw winners endpoint and shows only revealed
          draw records with a linked winner subscription. Waiver status remains backend-owned, and
          past-paid EMI records are not changed from this page.
        </p>
      </div>
    </ERPPageShell>
  );
}
