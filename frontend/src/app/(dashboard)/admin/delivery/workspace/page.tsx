"use client";

import Link from "next/link";
import { useCallback } from "react";

import { WorkspaceCardsPage } from "@/components/admin/erp/WorkspaceCardsPage";
import { OperationsWorkspaceShell } from "@/components/layout/page-shells";
import { ROUTES } from "@/lib/routes";
import { getAdminDeliveryWorkspace } from "@/services/admin-erp";

const deliveryLaneLinkClass =
  "rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export default function AdminDeliveryWorkspacePage() {
  const loader = useCallback(() => getAdminDeliveryWorkspace(), []);
  return (
    <OperationsWorkspaceShell
      operationalActions={
        <nav aria-label="Delivery work lanes" className="flex flex-wrap gap-2">
          <Link href={ROUTES.admin.deliveries} className={deliveryLaneLinkClass}>
            Delivery register
          </Link>
          <Link href={ROUTES.admin.deliveryCreate} className={deliveryLaneLinkClass}>
            Create delivery
          </Link>
          <Link href={ROUTES.admin.deliveryWorkspace} className={deliveryLaneLinkClass}>
            Delivery workspace
          </Link>
          <Link href={ROUTES.admin.deliveryReturns} className={deliveryLaneLinkClass}>
            Returns
          </Link>
          <Link href={ROUTES.admin.subscriptions} className={deliveryLaneLinkClass}>
            Subscriptions
          </Link>
        </nav>
      }
      lanes={
        <WorkspaceCardsPage
          title="Delivery Workspace"
          subtitle="Delivery pending/blocked, handover, returns, inspection, and damage flow."
          boardTitle="Delivery Operations"
          loader={loader}
        />
      }
    />
  );
}
