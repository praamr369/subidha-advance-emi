"use client";

import { useCallback } from "react";

import { WorkspaceCardsPage } from "@/components/admin/erp/WorkspaceCardsPage";
import { getAdminInventoryWorkspace } from "@/services/admin-erp";

export default function AdminInventoryWorkspacePage() {
  const loader = useCallback(() => getAdminInventoryWorkspace(), []);
  return (
    <WorkspaceCardsPage
      title="Inventory Workspace"
      subtitle="Stock on hand, reserve/release, movement, adjustment, and delivery-blocked stock."
      boardTitle="Inventory Operations"
      loader={loader}
    />
  );
}
