"use client";

import Link from "next/link";
import { useCallback } from "react";

import { WorkspaceCardsPage } from "@/components/admin/erp/WorkspaceCardsPage";
import { ROUTES } from "@/lib/routes";
import { getAdminInventoryWorkspace } from "@/services/admin-erp";

export default function AdminInventoryWorkspacePage() {
  const loader = useCallback(() => getAdminInventoryWorkspace(), []);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 px-4 text-sm">
        <Link className="rounded-full border border-border px-3 py-1 hover:bg-muted" href={ROUTES.admin.inventoryReadiness}>
          Readiness snapshot
        </Link>
        <Link className="rounded-full border border-border px-3 py-1 hover:bg-muted" href={ROUTES.admin.inventoryProfiles}>
          Inventory profiles
        </Link>
        <Link className="rounded-full border border-border px-3 py-1 hover:bg-muted" href={ROUTES.admin.inventoryStockNeeds}>
          Stock needs
        </Link>
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
