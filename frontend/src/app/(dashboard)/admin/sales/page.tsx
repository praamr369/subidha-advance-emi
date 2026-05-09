"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { WorkspaceShell } from "@/components/admin/erp/WorkspaceShell";
import { ROUTES } from "@/lib/routes";
import { getAdminSalesWorkspace, type WorkspacePayload } from "@/services/admin-erp";

type ActionCard = {
  key: string;
  label: string;
  purpose: string;
  href: string;
  available: boolean;
  metric: string;
};

function lookupCardCount(payload: WorkspacePayload | null, key: string): number {
  const row = payload?.cards?.find((card) => card.key === key);
  return Number(row?.count || 0);
}

export default function AdminSalesWorkspacePage() {
  const [payload, setPayload] = useState<WorkspacePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getAdminSalesWorkspace()
      .then((data) => {
        if (!active) return;
        setPayload(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setPayload(null);
        setError(err instanceof Error ? err.message : "Unable to load sales workspace status.");
      });

    return () => {
      active = false;
    };
  }, []);

  const cards = useMemo<ActionCard[]>(() => {
    const directSaleCount = lookupCardCount(payload, "direct_sale_orders");
    const pendingInvoices = lookupCardCount(payload, "pending_invoices");
    const unpaidInvoices = lookupCardCount(payload, "unpaid_invoices");
    const subscriptionRequests = lookupCardCount(payload, "subscription_requests");

    return [
      {
        key: "direct-sales",
        label: "Direct Sales",
        purpose: "Operational direct-sale register and billing workspace.",
        href: ROUTES.admin.billingDirectSaleWorkspace,
        available: true,
        metric: `${directSaleCount} register records`,
      },
      {
        key: "create-direct-sale",
        label: "Create Direct Sale Invoice",
        purpose: "Open the full-page direct-sale invoice creation workflow.",
        href: `${ROUTES.admin.billingDirectSaleWorkspace}?mode=create`,
        available: true,
        metric: "Full-page create workflow",
      },
      {
        key: "create-direct-sale-orchestrated",
        label: "Create Direct Sale (live stock/delivery signals)",
        purpose:
          "Runs through /api/v1/admin/sales/direct-sales/ so ATP, delivery desk linkage, and stock needs surface immediately after creation.",
        href: ROUTES.admin.salesDirectSaleCreate,
        available: true,
        metric: "Composite operational response",
      },
      {
        key: "invoices",
        label: "Invoices",
        purpose: "Billing invoice register for direct-sale and other sales channels.",
        href: ROUTES.admin.billingInvoices,
        available: true,
        metric: `${pendingInvoices} draft / ${unpaidInvoices} posted-unsettled`,
      },
      {
        key: "receipts",
        label: "Receipts",
        purpose: "Receipt documents and posted collection records.",
        href: ROUTES.admin.billingReceipts,
        available: true,
        metric: "Open receipt register",
      },
      {
        key: "sales-returns",
        label: "Sales Returns",
        purpose: "Service desk return queue for exchange/return processing.",
        href: ROUTES.admin.serviceDeskReturns,
        available: true,
        metric: "Operational return queue",
      },
      {
        key: "credit-notes",
        label: "Credit Notes",
        purpose: "Credit note register for bill adjustments and return-linked reversals.",
        href: ROUTES.admin.billingCreditNotes,
        available: true,
        metric: "Open credit-note register",
      },
      {
        key: "stock-needs",
        label: "Pending Stock Requirements",
        purpose: "Unified purchase/stock need queue with REST-backed workflows.",
        href: ROUTES.admin.inventoryStockNeeds,
        available: true,
        metric: `${subscriptionRequests} subscription-demand signals`,
      },
    ];
  }, [payload]);

  return (
    <WorkspaceShell
      title="Sales Workspace"
      subtitle="Operational sales hub across direct-sale billing, invoice lifecycle, receipts, returns, and stock-demand handoff."
    >
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <article key={card.key} className="rounded-xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold text-foreground">{card.label}</h2>
            <p className="mt-2 text-xs text-muted-foreground">{card.purpose}</p>
            <p className="mt-3 text-xs text-muted-foreground">{card.metric}</p>
            <div className="mt-4">
              {card.available ? (
                <Link
                  href={card.href}
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted"
                >
                  Open
                </Link>
              ) : (
                <span className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-muted px-3 text-xs font-medium text-muted-foreground">
                  Unavailable
                </span>
              )}
            </div>
          </article>
        ))}
      </section>
    </WorkspaceShell>
  );
}
