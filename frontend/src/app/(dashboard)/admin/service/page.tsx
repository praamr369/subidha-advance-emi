"use client";

import { useCallback } from "react";

import { WorkspaceCardsPage } from "@/components/admin/erp/WorkspaceCardsPage";
import { getAdminDeliveryWorkspace } from "@/services/admin-erp";

export default function AdminServiceWorkspacePage() {
  const loader = useCallback(() => getAdminDeliveryWorkspace(), []);
  return (
    <WorkspaceCardsPage
      title="Service Workspace"
      subtitle="Delivery, return, inspection, and service issue execution from real operational records."
      boardTitle="Delivery and Service Pipeline"
      loader={loader}
    />
  );
}
