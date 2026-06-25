"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ChevronRight,
  Gift,
  LayoutTemplate,
  TrendingUp,
  Users,
} from "lucide-react";
import type { ComponentType } from "react";

import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";
import { apiFetch } from "@/lib/api";

type HubCounts = {
  plan_templates: number;
  active_offer_packages: number;
  open_growth_requests: number;
  active_partners: number;
  retention_signals: number;
};

type SectionDef = {
  href: string;
  label: string;
  description: string;
  Icon: ComponentType<{ className?: string }>;
  iconCls: string;
  dotCls: string;
  statKey: keyof HubCounts;
  statLabel: string;
};

const SECTIONS: SectionDef[] = [
  {
    href: ROUTES.admin.growthPlanTemplates,
    label: "Plan Templates",
    description: "Reusable EMI, RENT, and LEASE plan configuration blueprints.",
    Icon: LayoutTemplate,
    iconCls: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    dotCls: "bg-blue-400",
    statKey: "plan_templates",
    statLabel: "templates",
  },
  {
    href: ROUTES.admin.growthOfferPackages,
    label: "Offer Packages",
    description:
      "Time-bounded offers built on plan templates. Status, audience, and date range controls.",
    Icon: Gift,
    iconCls: "bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
    dotCls: "bg-rose-400",
    statKey: "active_offer_packages",
    statLabel: "active",
  },
  {
    href: ROUTES.admin.growthRequests,
    label: "Growth Requests",
    description:
      "Customer renewal, upgrade, exchange, and plan conversion requests.",
    Icon: TrendingUp,
    iconCls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    dotCls: "bg-emerald-400",
    statKey: "open_growth_requests",
    statLabel: "submitted",
  },
  {
    href: ROUTES.admin.growthPartnerPerformance,
    label: "Partner Performance",
    description:
      "Read-only partner activity: referrals, collections, overdue, commissions, risk flags.",
    Icon: Users,
    iconCls: "bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
    dotCls: "bg-violet-400",
    statKey: "active_partners",
    statLabel: "partners",
  },
  {
    href: ROUTES.admin.growthRetention,
    label: "Retention Intelligence",
    description:
      "Customer retention signals and suggested follow-up actions based on live data.",
    Icon: Activity,
    iconCls: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    dotCls: "bg-amber-400",
    statKey: "retention_signals",
    statLabel: "signals",
  },
];

export default function GrowthHubPage() {
  const [counts, setCounts] = useState<HubCounts | null>(null);

  useEffect(() => {
    Promise.allSettled([
      apiFetch<{ results: unknown[] }>("/admin/growth/plan-templates/"),
      apiFetch<{ results: unknown[] }>("/admin/growth/offer-packages/?status=ACTIVE"),
      apiFetch<{ results: unknown[] }>("/admin/growth/requests/?status=SUBMITTED"),
      apiFetch<{ results: unknown[] }>("/admin/growth/partner-performance/"),
      apiFetch<{ results: unknown[]; total: number }>("/admin/growth/retention/"),
    ]).then(([templates, packages, requests, partners, retention]) => {
      setCounts({
        plan_templates: templates.status === "fulfilled" ? templates.value.results.length : 0,
        active_offer_packages: packages.status === "fulfilled" ? packages.value.results.length : 0,
        open_growth_requests: requests.status === "fulfilled" ? requests.value.results.length : 0,
        active_partners: partners.status === "fulfilled" ? partners.value.results.length : 0,
        retention_signals:
          retention.status === "fulfilled"
            ? (retention.value.total ?? retention.value.results.length)
            : 0,
      });
    });
  }, []);

  return (
    <ERPPageShell
      eyebrow="Growth & Offers"
      title="Growth & Offers Hub"
      subtitle="Controlled growth configuration — plan templates, offer packages, requests, partner performance, and retention intelligence."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Growth & Offers" },
      ]}
      actions={[
        { href: ROUTES.admin.growthPlanTemplates, label: "Plan Templates", variant: "secondary" },
        { href: ROUTES.admin.growthOfferPackages, label: "Offer Packages", variant: "secondary" },
        { href: ROUTES.admin.growthRequests, label: "Growth Requests", variant: "primary" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      {counts === null ? <ERPLoadingState label="Loading growth hub..." /> : null}

      <ERPSectionShell
        title="Growth workspaces"
        description="Each workspace manages a distinct growth lever. Changes in plan templates propagate to new offers; existing subscriptions are not retroactively altered."
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {SECTIONS.map(({ href, label, description, Icon, iconCls, dotCls, statKey, statLabel }) => (
            <Link
              key={href}
              href={href}
              className="group relative flex min-h-[11rem] flex-col rounded-xl border border-border bg-card p-4 transition hover:border-ring hover:shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconCls}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex items-center gap-2">
                  {counts !== null ? (
                    <span className="text-xs font-semibold text-primary">
                      {counts[statKey]} {statLabel}
                    </span>
                  ) : null}
                  <span className={`h-2 w-2 rounded-full ${dotCls}`} />
                </div>
              </div>
              <div className="mt-3 flex-1">
                <div className="text-sm font-semibold text-foreground group-hover:text-primary">
                  {label}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
              </div>
              <div className="mt-3 flex items-center gap-1 border-t border-border/50 pt-2.5 text-xs font-medium text-primary">
                Open {label}
                <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          ))}
        </div>
      </ERPSectionShell>
    </ERPPageShell>
  );
}
