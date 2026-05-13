"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";
import { getComplianceTaxProfile } from "@/services/compliance";
import type { BusinessTaxMode } from "@/types/compliance";

const items = [
  {
    title: "Accounting periods",
    description: "Lock and reopen accounting periods without changing operational EMI history.",
    href: ROUTES.admin.accountingPeriods,
  },
  {
    title: "Books",
    description: "Cash, bank, UPI, sales, and purchase books driven from accounting journals.",
    href: ROUTES.admin.accountingBooks,
  },
  {
    title: "Bridge runs",
    description: "Controlled admin-only bridge execution from billing, inventory, and payment events into accounting.",
    href: ROUTES.admin.accountingBridges,
  },
  {
    title: "Reconciliation",
    description: "Operational reconciliation remains separate and authoritative for Lucky Plan payment integrity.",
    href: ROUTES.admin.financeReconciliation,
  },
];

export default function AdminSettingsFinancePage() {
  const [taxMode, setTaxMode] = useState<BusinessTaxMode>("GST_UNREGISTERED");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const payload = await getComplianceTaxProfile();
        if (!active) return;
        setTaxMode(payload.active.mode);
      } catch {
        if (!active) return;
        setTaxMode("GST_UNREGISTERED");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <PortalPage
      title="Finance Configuration"
      subtitle="Accounting controls and reconciliation-adjacent configuration without overloading the live EMI/payment operational core."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Settings", href: ROUTES.admin.settings },
        { label: "Finance" },
      ]}
      actions={[{ href: ROUTES.admin.settings, label: "Settings Home", variant: "secondary" }]}
    >
      <div className="mb-4 rounded-2xl border border-border bg-muted/40 p-4 text-sm">
        Current tax mode:{" "}
        <span className="font-medium">
          {taxMode === "GST_UNREGISTERED" ? "GST Unregistered (Commercial Invoice / Non-GST)" : taxMode}
        </span>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item) => (
          <Link
            key={item.title}
            href={item.href}
            className="rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:border-ring hover:bg-accent/40"
          >
            <div className="text-base font-semibold text-card-foreground">{item.title}</div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
          </Link>
        ))}
      </div>
    </PortalPage>
  );
}
