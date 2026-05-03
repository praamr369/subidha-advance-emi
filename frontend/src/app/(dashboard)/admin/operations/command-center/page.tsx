"use client";

import PortalPage from "@/components/ui/PortalPage";
import { OperationsCommandCenterWorkspace } from "@/components/workspace/OperationsCommandCenterWorkspace";
import { ROUTES } from "@/lib/routes";

export default function AdminOperationsCommandCenterPage() {
  return (
    <PortalPage
      title="Operations Command Center"
      subtitle="Main operations work center for approvals, financial actions, partner actions, customer actions, inventory alerts, and delivery returns."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Operations", href: ROUTES.admin.operations },
        { label: "Command Center" },
      ]}
    >
      <OperationsCommandCenterWorkspace />
    </PortalPage>
  );
}
