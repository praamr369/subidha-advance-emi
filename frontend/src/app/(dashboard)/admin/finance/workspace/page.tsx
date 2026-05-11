"use client";

import { useCallback } from "react";

import { WorkspaceCardsPage } from "@/components/admin/erp/WorkspaceCardsPage";
import { OperationsWorkspaceShell } from "@/components/layout/page-shells";
import { getAdminFinanceWorkspace } from "@/services/admin-erp";

export default function AdminFinanceWorkspacePage() {
  const loader = useCallback(() => getAdminFinanceWorkspace(), []);
  return (
    <OperationsWorkspaceShell>
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
    </OperationsWorkspaceShell>
  );
}
