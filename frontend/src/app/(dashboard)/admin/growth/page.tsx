"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import { apiFetch } from "@/lib/api";

type HubCounts = {
  plan_templates: number;
  active_offer_packages: number;
  open_growth_requests: number;
  active_partners: number;
  retention_signals: number;
};

function StatBadge({ value, label }: { value: number | null; label: string }) {
  if (value === null) return null;
  return (
    <span className="mt-2 inline-block text-xs font-semibold text-primary">
      {value} {label}
    </span>
  );
}

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
        retention_signals: retention.status === "fulfilled" ? (retention.value.total ?? retention.value.results.length) : 0,
      });
    });
  }, []);

  const SECTIONS = [
    {
      href: ROUTES.admin.growthPlanTemplates,
      label: "Plan Templates",
      description: "Reusable EMI, RENT, and LEASE plan configuration blueprints.",
      stat: counts ? { value: counts.plan_templates, label: "templates" } : null,
    },
    {
      href: ROUTES.admin.growthOfferPackages,
      label: "Offer Packages",
      description: "Time-bounded offers built on plan templates. Status, audience, and date range controls.",
      stat: counts ? { value: counts.active_offer_packages, label: "active" } : null,
    },
    {
      href: ROUTES.admin.growthRequests,
      label: "Growth Requests",
      description: "Customer renewal, upgrade, exchange, and plan conversion requests.",
      stat: counts ? { value: counts.open_growth_requests, label: "submitted" } : null,
    },
    {
      href: ROUTES.admin.growthPartnerPerformance,
      label: "Partner Performance",
      description: "Read-only partner activity: referrals, collections, overdue, commissions, risk flags.",
      stat: counts ? { value: counts.active_partners, label: "partners" } : null,
    },
    {
      href: ROUTES.admin.growthRetention,
      label: "Retention Intelligence",
      description: "Customer retention signals and suggested follow-up actions based on live data.",
      stat: counts ? { value: counts.retention_signals, label: "customers with signals" } : null,
    },
  ];

  return (
    <ERPPageShell
      title="Growth & Offers"
      subtitle="Controlled growth configuration — plan templates, offer packages, requests, partner performance, and retention intelligence."
    >
      {counts === null && (
        <div className="mb-4">
          <ERPLoadingState />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="rounded-lg border border-border bg-card p-5 hover:bg-muted/50 transition-colors flex flex-col"
          >
            <p className="font-semibold text-sm">{s.label}</p>
            <p className="text-xs text-muted-foreground mt-1 flex-1">{s.description}</p>
            {s.stat && <StatBadge value={s.stat.value} label={s.stat.label} />}
          </Link>
        ))}
      </div>
    </ERPPageShell>
  );
}
