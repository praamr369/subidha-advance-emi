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
        <Link className="rounded-full border border-border px-3 py-1 hover:bg-muted" href={ROUTES.admin.inventoryStockNeeds}>
          Stock needs
        </Link>
      </div>
      <WorkspaceCardsPage
        title="Inventory Workspace"
        subtitle="Stock on hand, reserve/release, movement, adjustment, and delivery-blocked stock."
        boardTitle="Inventory Operations"
        loader={loader}
      />
    </div>
  );
}
