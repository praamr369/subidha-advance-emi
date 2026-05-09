"use client";

import { useCallback } from "react";

import { WorkspaceCardsPage } from "@/components/admin/erp/WorkspaceCardsPage";
import { getAdminDeliveryWorkspace } from "@/services/admin-erp";

export default function AdminDeliveryWorkspacePage() {
  const loader = useCallback(() => getAdminDeliveryWorkspace(), []);
  return (
    <WorkspaceCardsPage
      title="Delivery Workspace"
      subtitle="Delivery pending/blocked, handover, returns, inspection, and damage flow."
      boardTitle="Delivery Operations"
      loader={loader}
    />
  );
}
