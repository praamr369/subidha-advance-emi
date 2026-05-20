"use client";

import Link from "next/link";
import { useCallback } from "react";

import { WorkspaceCardsPage } from "@/components/admin/erp/WorkspaceCardsPage";
import ERPDataToolbar from "@/components/erp/ERPDataToolbar";
import { ROUTES } from "@/lib/routes";
import { getAdminInventoryWorkspace } from "@/services/admin-erp";

export default function AdminInventoryWorkspacePage() {
  const loader = useCallback(() => getAdminInventoryWorkspace(), []);
  return (
    <div className="space-y-4">
      <div className="px-3 sm:px-4 lg:px-6 xl:px-8">
        <ERPDataToolbar
          left={<div className="text-sm text-muted-foreground">Quick links</div>}
          right={
            <div className="flex flex-wrap gap-2">
              <Link className="workspace-pill px-3 py-1.5 text-xs font-semibold" href={ROUTES.admin.inventoryReadiness}>
                Readiness snapshot
              </Link>
              <Link className="workspace-pill px-3 py-1.5 text-xs font-semibold" href={ROUTES.admin.inventoryProfiles}>
                Inventory profiles
              </Link>
              <Link className="workspace-pill px-3 py-1.5 text-xs font-semibold" href={ROUTES.admin.inventoryStockNeeds}>
                Stock needs
              </Link>
            </div>
          }
        />
      </div>
      <WorkspaceCardsPage
        title="Inventory Workspace"
        subtitle="Products are catalog truth; inventory profiles make products stock-trackable. Setup snapshots carry setup only, while real quantities come from opening stock and movement workflows."
        boardTitle="Inventory Operations"
        loader={loader}
      />
    </div>
  );
}
