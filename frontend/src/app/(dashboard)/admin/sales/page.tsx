"use client";

import { useCallback } from "react";

import { WorkspaceCardsPage } from "@/components/admin/erp/WorkspaceCardsPage";
import { getAdminSalesWorkspace } from "@/services/admin-erp";

export default function AdminSalesWorkspacePage() {
  const loader = useCallback(() => getAdminSalesWorkspace(), []);
  return (
    <WorkspaceCardsPage
      title="Sales Workspace"
      subtitle="Direct sale, subscription requests, rent/lease requests, invoice pending, and payment status in one board."
      boardTitle="Sales Operations Pipeline"
      loader={loader}
    />
  );
}
