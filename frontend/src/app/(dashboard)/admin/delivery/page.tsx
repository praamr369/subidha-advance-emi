"use client";

import { useCallback } from "react";

import { WorkspaceCardsPage } from "@/components/admin/erp/WorkspaceCardsPage";
import { getAdminDeliveryWorkspace } from "@/services/admin-erp";

export default function AdminDeliveryLandingPage() {
  const loader = useCallback(() => getAdminDeliveryWorkspace(), []);
  return (
    <WorkspaceCardsPage
      title="Delivery Workspace"
      subtitle="Delivery requests, blocked deliveries, handover, returns, return inspections, and damaged return workflow."
      boardTitle="Delivery & Returns"
      loader={loader}
    />
  );
}
