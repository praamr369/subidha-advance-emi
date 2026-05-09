"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { WorkspaceShell } from "@/components/admin/erp/WorkspaceShell";
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
};

const MODULES: ModuleCard[] = [
  {
    key: "sales",
    label: "Sales",
    purpose: "Direct-sale and downstream billing workflow operations.",
    href: ROUTES.admin.salesWorkspace,
  },
  {
    key: "crm",
    label: "CRM",
    purpose: "Registered customers, parties, leads, follow-ups, and service visibility.",
    href: ROUTES.admin.crmWorkspace,
  },
  {
    key: "billing",
    label: "Billing",
    purpose: "Direct-sale invoices, receipts, document register, and tax documents.",
    href: ROUTES.admin.billingDirectSaleWorkspace,
  },
  {
    key: "inventory",
    label: "Inventory",
    purpose: "Stock posture, movement control, and replenishment planning.",
    href: ROUTES.admin.inventory,
  },
  {
    key: "finance",
    label: "Finance / Accounting",
    purpose: "Collections, reconciliation, receipts, books, and accounting controls.",
    href: ROUTES.admin.finance,
  },
  {
    key: "delivery",
    label: "Delivery",
    purpose: "Delivery queue, handover controls, and return workflows.",
    href: ROUTES.admin.delivery,
  },
  {
    key: "reports",
    label: "Reports",
    purpose: "Read-only business reports, SME catalog, and export-ready operational insights.",
    href: ROUTES.admin.reports,
  },
  {
    key: "setup",
    label: "Setup / Readiness",
    purpose: "Business setup checklist and go-live readiness posture.",
    href: ROUTES.admin.settingsBusinessSetupChecklist,
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
    <WorkspaceShell
      title="ERP Home"
      subtitle="Operational entry point across Sales, CRM, Billing, Inventory, Finance, Delivery, Reports, and Setup readiness."
    >
      {hasErrors ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          One or more module statuses are unavailable. Open the affected module directly to continue operations.
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {MODULES.map((module) => {
          const status = statuses[module.key] || {
            loading: true,
            error: null,
            count: null,
            detail: "Loading...",
          };
          return (
            <article key={module.key} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-foreground">{module.label}</h2>
                <span className="text-xs font-medium text-muted-foreground">
                  {status.loading ? "Loading" : status.error ? "Error" : status.count === 0 ? "Empty" : "Ready"}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{module.purpose}</p>
              <p className={`mt-3 text-xs ${status.error ? "text-destructive" : "text-muted-foreground"}`}>
                {moduleStatusLabel(status)}
              </p>
              <div className="mt-4">
                <Link
                  href={module.href}
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted"
                >
                  Open {module.label}
                </Link>
              </div>
            </article>
          );
        })}
      </section>
    </WorkspaceShell>
  );
}
