"use client";

import { useCallback } from "react";

import { WorkspaceCardsPage } from "@/components/admin/erp/WorkspaceCardsPage";
import { getAdminPartnerWorkspace } from "@/services/admin-erp";

export default function AdminPartnerWorkspacePage() {
  const loader = useCallback(() => getAdminPartnerWorkspace(), []);
  return (
    <WorkspaceCardsPage
      title="Partner Workspace"
      subtitle="Partner requests, collections, customer linkage, commissions, payouts, and performance insights."
      boardTitle="Partner Operations"
      loader={loader}
    />
  );
}
