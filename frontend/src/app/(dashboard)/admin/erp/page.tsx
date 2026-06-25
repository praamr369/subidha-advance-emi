"use client";

import Link from "next/link";
import {
  BarChart2,
  CheckSquare,
  ChevronRight,
  Landmark,
  Package,
  Receipt,
  ShoppingCart,
  Truck,
  Users,
} from "lucide-react";
import type { ComponentType } from "react";
import { useEffect, useMemo, useState } from "react";

import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { apiFetch } from "@/lib/api";
import { ROUTES } from "@/lib/routes";
import { listDirectSales } from "@/services/billing";
import { getSetupChecklist } from "@/services/business-setup";
import {
  getAdminCrmWorkspace,
  getAdminDeliveryWorkspace,
  getAdminFinanceWorkspace,
  getAdminInventoryWorkspace,
  getAdminSalesWorkspace,
} from "@/services/admin-erp";

type ModuleStatus = {
  loading: boolean;
  error: string | null;
  count: number | null;
  detail: string;
};

type ModuleCard = {
  key: string;
  label: string;
  purpose: string;
  href: string;
  Icon: ComponentType<{ className?: string }>;
  iconCls: string;
};

const MODULES: ModuleCard[] = [
  {
    key: "sales",
    label: "Sales",
    purpose: "Direct-sale and downstream billing workflow operations.",
    href: ROUTES.admin.salesWorkspace,
    Icon: ShoppingCart,
    iconCls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  },
  {
    key: "crm",
    label: "CRM",
    purpose: "Registered customers, parties, leads, follow-ups, and service visibility.",
    href: ROUTES.admin.crmWorkspace,
    Icon: Users,
    iconCls: "bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  },
  {
    key: "billing",
    label: "Billing",
    purpose: "Direct-sale invoices, receipts, document register, and tax documents.",
    href: ROUTES.admin.billingDirectSaleWorkspace,
    Icon: Receipt,
    iconCls: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  },
  {
    key: "inventory",
    label: "Inventory",
    purpose: "Stock posture, movement control, and replenishment planning.",
    href: ROUTES.admin.inventory,
    Icon: Package,
    iconCls: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  },
  {
    key: "finance",
    label: "Finance / Accounting",
    purpose: "Collections, reconciliation, receipts, books, and accounting controls.",
    href: ROUTES.admin.finance,
    Icon: Landmark,
    iconCls: "bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  },
  {
    key: "delivery",
    label: "Delivery",
    purpose: "Delivery queue, handover controls, and return workflows.",
    href: ROUTES.admin.delivery,
    Icon: Truck,
    iconCls: "bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  },
  {
    key: "reports",
    label: "Reports",
    purpose: "Read-only business reports, SME catalog, and export-ready operational insights.",
    href: ROUTES.admin.reports,
    Icon: BarChart2,
    iconCls: "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  },
  {
    key: "setup",
    label: "Setup / Readiness",
    purpose: "Business setup checklist and go-live readiness posture.",
    href: ROUTES.admin.settingsBusinessSetupChecklist,
    Icon: CheckSquare,
    iconCls: "bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
  },
];

function sumCardCounts(cards: Array<{ count: number }>): number {
  return cards.reduce((acc, card) => acc + Number(card.count || 0), 0);
}

function moduleStatusLabel(status: ModuleStatus): string {
  if (status.loading) return "Loading module status...";
  if (status.error) return status.error;
  if (status.count === null) return status.detail;
  if (status.count === 0) return status.detail || "No open operational signals.";
  return status.detail;
}

function statusDotCls(status: ModuleStatus): string {
  if (status.loading) return "bg-muted-foreground/40";
  if (status.error) return "bg-destructive";
  if (status.count !== null && status.count > 0) return "bg-amber-400";
  return "bg-emerald-400";
}

export default function AdminErpHomePage() {
  const [statuses, setStatuses] = useState<Record<string, ModuleStatus>>(() =>
    Object.fromEntries(
      MODULES.map((module) => [
        module.key,
        { loading: true, error: null, count: null, detail: "Loading..." } satisfies ModuleStatus,
      ])
    )
  );

  useEffect(() => {
    let active = true;
    const next: Record<string, ModuleStatus> = {
      sales: { loading: true, error: null, count: null, detail: "Loading..." },
      crm: { loading: true, error: null, count: null, detail: "Loading..." },
      billing: { loading: true, error: null, count: null, detail: "Loading..." },
      inventory: { loading: true, error: null, count: null, detail: "Loading..." },
      finance: { loading: true, error: null, count: null, detail: "Loading..." },
      delivery: { loading: true, error: null, count: null, detail: "Loading..." },
      reports: { loading: true, error: null, count: null, detail: "Loading..." },
      setup: { loading: true, error: null, count: null, detail: "Loading..." },
    };

    async function load() {
      const results = await Promise.allSettled([
        getAdminSalesWorkspace(),
        getAdminCrmWorkspace(),
        listDirectSales({ page_size: 1 }),
        getAdminInventoryWorkspace(),
        getAdminFinanceWorkspace(),
        getAdminDeliveryWorkspace(),
        apiFetch<{ sections?: Array<{ reports?: unknown[] }> }>("/admin/reports-center/catalog/"),
        getSetupChecklist(),
      ]);

      const [sales, crm, billing, inventory, finance, delivery, reports, setup] = results;

      if (sales.status === "fulfilled") {
        const count = sumCardCounts(sales.value.cards || []);
        next.sales = {
          loading: false,
          error: null,
          count,
          detail: count > 0 ? `${count} open sales signals.` : "No open sales signals.",
        };
      } else {
        next.sales = { loading: false, error: "Sales status unavailable.", count: null, detail: "Sales status unavailable." };
      }

      if (crm.status === "fulfilled") {
        const count = sumCardCounts(crm.value.crm_pipeline || []);
        next.crm = {
          loading: false,
          error: null,
          count,
          detail: count > 0 ? `${count} CRM pipeline signals.` : "No open CRM pipeline signals.",
        };
      } else {
        next.crm = { loading: false, error: "CRM status unavailable.", count: null, detail: "CRM status unavailable." };
      }

      if (billing.status === "fulfilled") {
        const count = Number(billing.value.count || 0);
        next.billing = {
          loading: false,
          error: null,
          count,
          detail: count > 0 ? `${count} direct-sale records in register.` : "No direct-sale records yet.",
        };
      } else {
        next.billing = { loading: false, error: "Billing status unavailable.", count: null, detail: "Billing status unavailable." };
      }

      if (inventory.status === "fulfilled") {
        const count = sumCardCounts(inventory.value.cards || []);
        next.inventory = {
          loading: false,
          error: null,
          count,
          detail: count > 0 ? `${count} inventory control signals.` : "No open inventory control signals.",
        };
      } else {
        next.inventory = { loading: false, error: "Inventory status unavailable.", count: null, detail: "Inventory status unavailable." };
      }

      if (finance.status === "fulfilled") {
        const count = sumCardCounts(finance.value.cards || []);
        next.finance = {
          loading: false,
          error: null,
          count,
          detail: count > 0 ? `${count} finance/accounting signals.` : "No open finance/accounting signals.",
        };
      } else {
        next.finance = { loading: false, error: "Finance status unavailable.", count: null, detail: "Finance status unavailable." };
      }

      if (delivery.status === "fulfilled") {
        const count = sumCardCounts(delivery.value.cards || []);
        next.delivery = {
          loading: false,
          error: null,
          count,
          detail: count > 0 ? `${count} delivery/return signals.` : "No open delivery/return signals.",
        };
      } else {
        next.delivery = { loading: false, error: "Delivery status unavailable.", count: null, detail: "Delivery status unavailable." };
      }

      if (reports.status === "fulfilled") {
        const sectionList = reports.value.sections || [];
        const reportCount = sectionList.reduce((acc, section) => acc + ((section.reports || []).length || 0), 0);
        next.reports = {
          loading: false,
          error: null,
          count: reportCount,
          detail: reportCount > 0 ? `${reportCount} reports in catalog.` : "Report catalog has no published entries.",
        };
      } else {
        next.reports = { loading: false, error: "Reports catalog unavailable.", count: null, detail: "Reports catalog unavailable." };
      }

      if (setup.status === "fulfilled") {
        next.setup = {
          loading: false,
          error: null,
          count: Number(setup.value.percent_complete || 0),
          detail: `Setup readiness ${Number(setup.value.percent_complete || 0)}% complete.`,
        };
      } else {
        next.setup = { loading: false, error: "Setup readiness unavailable.", count: null, detail: "Setup readiness unavailable." };
      }

      if (active) {
        setStatuses(next);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, []);

  const hasErrors = useMemo(
    () => MODULES.some((module) => statuses[module.key]?.error),
    [statuses]
  );

  return (
    <ERPPageShell
      eyebrow="Command Center"
      title="ERP Home"
      subtitle="Operational entry point across Sales, CRM, Billing, Inventory, Finance, Delivery, Reports, and Setup readiness."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "ERP Home" },
      ]}
      actions={[
        { href: ROUTES.admin.salesWorkspace, label: "Sales", variant: "secondary" },
        { href: ROUTES.admin.crmWorkspace, label: "CRM", variant: "secondary" },
        { href: ROUTES.admin.finance, label: "Finance", variant: "primary" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <ERPSectionShell
        title="Module workspaces"
        description="Status signals are live reads from workspace summary endpoints. Open a module to continue work."
      >
        {hasErrors ? (
          <div className="rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm text-foreground">
            One or more module statuses are unavailable. Open the affected module directly to continue operations.
          </div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {MODULES.map((module) => {
            const status = statuses[module.key] || {
              loading: true,
              error: null,
              count: null,
              detail: "Loading...",
            };
            return (
              <Link
                key={module.key}
                href={module.href}
                className="group relative flex min-h-[11rem] flex-col rounded-xl border border-border bg-card p-4 transition hover:border-ring hover:shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${module.iconCls}`}>
                    <module.Icon className="h-5 w-5" />
                  </div>
                  <span className={`mt-1 h-2 w-2 rounded-full ${statusDotCls(status)}`} />
                </div>
                <div className="mt-3 flex-1">
                  <div className="text-sm font-semibold text-foreground group-hover:text-primary">
                    {module.label}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{module.purpose}</p>
                  <p className={`mt-2 text-xs ${status.error ? "text-destructive" : "text-muted-foreground/70"}`}>
                    {moduleStatusLabel(status)}
                  </p>
                </div>
                <div className="mt-3 flex items-center gap-1 border-t border-border/50 pt-2.5 text-xs font-medium text-primary">
                  Open {module.label}
                  <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            );
          })}
        </section>
      </ERPSectionShell>
    </ERPPageShell>
  );
}
