"use client";

import Link from "next/link";
import {
  Banknote,
  ClipboardCheck,
  FileText,
  Home,
  PackageCheck,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  Truck,
  type LucideIcon,
} from "lucide-react";

import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";

type CockpitCard = {
  title: string;
  purpose: string;
  href: string;
  icon: LucideIcon;
  status: "Active" | "Read-only" | "Setup required" | "Deferred";
};

const workflowCards: CockpitCard[] = [
  {
    title: "Rent Contracts",
    purpose: "Create and review rent contracts without exposing Lucky ID or draw workflows.",
    href: `${ROUTES.admin.subscriptions}?plan_type=RENT`,
    icon: Home,
    status: "Active",
  },
  {
    title: "Lease Contracts",
    purpose: "Create and review lease contracts with lease-specific demand and possession controls.",
    href: `${ROUTES.admin.subscriptions}?plan_type=LEASE`,
    icon: FileText,
    status: "Active",
  },
  {
    title: "Create Rent",
    purpose: "Open the existing rent contract creation workflow.",
    href: ROUTES.admin.subscriptionsRentCreate,
    icon: ClipboardCheck,
    status: "Active",
  },
  {
    title: "Create Lease",
    purpose: "Open the existing lease contract creation workflow.",
    href: ROUTES.admin.subscriptionsLeaseCreate,
    icon: ClipboardCheck,
    status: "Active",
  },
  {
    title: "Deposit Operations",
    purpose: "Collect deposits through unified collection and manage deduction/refund posture from source demand records.",
    href: ROUTES.admin.financeDeposits,
    icon: Banknote,
    status: "Active",
  },
  {
    title: "Unified Collection",
    purpose: "Collect rent/lease deposits and monthly demands through the existing unified collection route.",
    href: `${ROUTES.admin.financeCollect}?workflow=unified`,
    icon: ReceiptText,
    status: "Active",
  },
  {
    title: "Monthly Demands",
    purpose: "Review rent and lease demand rows through the existing EMI/demand register filters.",
    href: `${ROUTES.admin.emis}?plan_type=RENT`,
    icon: ReceiptText,
    status: "Read-only",
  },
  {
    title: "Account Mapping / Deposit Mapping",
    purpose: "Configure rent/lease mapping metadata for future posting bridge readiness without auto-posting journals.",
    href: `${ROUTES.admin.financeDeposits}#accounting-mapping`,
    icon: ShieldCheck,
    status: "Setup required",
  },
  {
    title: "Possession / Handover",
    purpose: "Open delivery handoff queues filtered to rent and lease source records.",
    href: `${ROUTES.admin.deliveries}?plan_type=RENT_LEASE`,
    icon: Truck,
    status: "Active",
  },
  {
    title: "Return Inspections",
    purpose: "Review rent/lease returns and inspection queues without creating fake refund actions.",
    href: `${ROUTES.admin.serviceDeskReturns}?plan_type=RENT_LEASE`,
    icon: RotateCcw,
    status: "Read-only",
  },
  {
    title: "Delivery Documents",
    purpose: "Review delivery and handover documents generated from real delivery cases.",
    href: ROUTES.admin.deliveries,
    icon: PackageCheck,
    status: "Read-only",
  },
];

const STATUS_CLASS: Record<CockpitCard["status"], string> = {
  Active: "border-emerald-200 bg-emerald-50 text-emerald-800",
  "Read-only": "border-blue-200 bg-blue-50 text-blue-800",
  "Setup required": "border-amber-200 bg-amber-50 text-amber-900",
  Deferred: "border-slate-200 bg-slate-100 text-slate-700",
};

function CockpitWorkflowCard({ card }: { card: CockpitCard }) {
  const Icon = card.icon;
  return (
    <article className="flex min-h-[13rem] flex-col rounded-[1.4rem] border border-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-muted text-foreground">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${STATUS_CLASS[card.status]}`}>
          {card.status}
        </span>
      </div>
      <div className="mt-4 flex-1 space-y-2">
        <h2 className="text-base font-semibold text-foreground">{card.title}</h2>
        <p className="text-sm leading-6 text-muted-foreground">{card.purpose}</p>
      </div>
      <div className="mt-4 border-t border-border pt-3">
        <Link
          href={card.href}
          className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-border bg-background px-3 text-sm font-semibold text-foreground transition hover:bg-muted"
        >
          Open
        </Link>
      </div>
    </article>
  );
}

export default function AdminRentLeaseCockpitPage() {
  return (
    <ERPPageShell
      eyebrow="Rent / Lease"
      title="Rent / Lease Cockpit"
      subtitle="Parent module cockpit for rent and lease contracts, deposits, monthly demands, possession, handover, inspections, returns, and documents. Lucky ID and draw workflows stay out of this module."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Rent / Lease" },
      ]}
      actions={[
        { href: ROUTES.admin.subscriptionsRentCreate, label: "Create Rent", variant: "primary" },
        { href: ROUTES.admin.subscriptionsLeaseCreate, label: "Create Lease", variant: "secondary" },
        { href: ROUTES.admin.financeDeposits, label: "Deposit Operations", variant: "secondary" },
        { href: `${ROUTES.admin.financeCollect}?workflow=unified`, label: "Unified Collection", variant: "secondary" },
      ]}
      stats={[
        { label: "Source of truth", value: "Demand records", tone: "info" },
        { label: "Accounting posting", value: "Audit-deferred", tone: "warning" },
        { label: "Lucky IDs", value: "Not used", tone: "success" },
        { label: "Draws", value: "Not used", tone: "success" },
      ]}
      statusBadge={{ label: "Parent module", tone: "info" }}
    >
      <div className="space-y-6">
        <div className="rounded-[1.25rem] border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">
          <div className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Rent/lease monthly charges and deposits are source-record workflows.
          </div>
          <p className="mt-1 text-blue-900">
            Rent/lease monthly charges and deposits are source-record workflows. Accounting posting is audit-deferred until bridge approval. This cockpit links only to existing contract, deposit, demand, delivery, and return surfaces.
          </p>
        </div>

        <ERPSectionShell
          title="Rent / lease workflows"
          description="Detailed child routes live here instead of the admin sidebar. Every card links to an existing route."
        >
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {workflowCards.map((card) => (
              <CockpitWorkflowCard key={card.title} card={card} />
            ))}
          </div>
        </ERPSectionShell>
      </div>
    </ERPPageShell>
  );
}
