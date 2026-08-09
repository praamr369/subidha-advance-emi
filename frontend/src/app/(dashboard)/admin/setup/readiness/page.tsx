"use client";

import Link from "next/link";
import { ArrowRight, ClipboardCheck } from "lucide-react";

import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";

type ReadinessArea = {
  label: string;
  description: string;
  href: string;
};

// Go-live readiness hub. Aggregates the domain-specific readiness checks into a
// single pre-production landing. TODO: wire a backend rollup endpoint so this
// page can show live pass/blocker status per area instead of static links.
const READINESS_AREAS: ReadinessArea[] = [
  {
    label: "Accounting setup",
    description: "Chart of accounts, finance-account mappings, and posting defaults.",
    href: ROUTES.admin.accountingSetup,
  },
  {
    label: "Inventory readiness",
    description: "Opening stock, item masters, and stock-ledger prerequisites.",
    href: ROUTES.admin.inventoryReadiness,
  },
  {
    label: "Tax readiness",
    description: "GST/HSN configuration and tax posting checks.",
    href: "/admin/compliance/tax-readiness",
  },
  {
    label: "AI assistant readiness",
    description: "Knowledge sources and assistant configuration.",
    href: ROUTES.admin.aiReadiness,
  },
];

export default function AdminSetupReadinessPage() {
  return (
    <ERPPageShell
      title="Go-live Readiness"
      subtitle="Pre-production checks across every setup domain, in one place."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {READINESS_AREAS.map((area) => (
          <Link
            key={area.href}
            href={area.href}
            className="group flex items-start justify-between gap-4 rounded-lg border border-border bg-card p-4 transition hover:border-primary hover:shadow-sm"
          >
            <div className="flex items-start gap-3">
              <ClipboardCheck className="mt-0.5 h-5 w-5 text-primary" aria-hidden />
              <div>
                <p className="font-medium">{area.label}</p>
                <p className="text-sm text-muted-foreground">{area.description}</p>
              </div>
            </div>
            <ArrowRight
              className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary"
              aria-hidden
            />
          </Link>
        ))}
      </div>
    </ERPPageShell>
  );
}
