"use client";

import Link from "next/link";
import { useCallback } from "react";

import { WorkspaceCardsPage } from "@/components/admin/erp/WorkspaceCardsPage";
import { OperationsWorkspaceShell } from "@/components/layout/page-shells";
import { ROUTES } from "@/lib/routes";
import { getAdminFinanceWorkspace } from "@/services/admin-erp";

const financeLaneLinkClass =
  "rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export default function AdminFinanceWorkspacePage() {
  const loader = useCallback(() => getAdminFinanceWorkspace(), []);
  return (
    <OperationsWorkspaceShell
      operationalActions={
        <nav aria-label="Finance work lanes" className="flex flex-wrap gap-2">
          <Link href={ROUTES.admin.collections} className={financeLaneLinkClass}>
            Collections
          </Link>
          <Link href={ROUTES.admin.financeCollect} className={financeLaneLinkClass}>
            Collect payment
          </Link>
          <Link href={ROUTES.admin.payments} className={financeLaneLinkClass}>
            Payment register
          </Link>
          <Link href={ROUTES.admin.financeReconciliation} className={financeLaneLinkClass}>
            Reconciliation
          </Link>
          <Link href={ROUTES.admin.financeDeposits} className={financeLaneLinkClass}>
            Deposits
          </Link>
          <Link href={ROUTES.admin.financeReversalControl} className={financeLaneLinkClass}>
            Refunds / reversals
          </Link>
          <Link href={ROUTES.admin.financePayoutBatches} className={financeLaneLinkClass}>
            Payout batches
          </Link>
          <Link href={ROUTES.admin.accountingSetup} className={financeLaneLinkClass}>
            Accounting setup
          </Link>
        </nav>
      }
      lanes={
        <WorkspaceCardsPage
          title="Finance Workspace"
          subtitle="Collections, dues, overdue, receipts, invoices, deposits, reconciliation, and mapping health visibility."
          boardTitle="Finance Operations"
          loader={loader}
          operationalWorkspace={{
            storageKey: "finance-admin-workspace-v1",
            persistLayout: true,
          }}
        />
      }
    />
  );
}
