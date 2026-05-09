"use client";

import { useCallback } from "react";

import { WorkspaceCardsPage } from "@/components/admin/erp/WorkspaceCardsPage";
import { getAdminProductWorkspace } from "@/services/admin-erp";

export default function AdminProductWorkspacePage() {
  const loader = useCallback(() => getAdminProductWorkspace(), []);
  return (
    <WorkspaceCardsPage
      title="Product Operations Workspace"
      subtitle="Products, stock posture, contract/direct-sale demand, and low-stock alert workflow."
      boardTitle="Product Operations"
      loader={loader}
    />
  );
}
