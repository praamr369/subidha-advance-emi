"use client";

import ERPPageShell from "@/components/erp/ERPPageShell";
import ActionButton from "@/components/ui/ActionButton";
import { OperationsCommandCenterWorkspace } from "@/components/workspace/OperationsCommandCenterWorkspace";
import { ROUTES } from "@/lib/routes";

export default function AdminOperationsCommandCenterPage() {
  return (
    <ERPPageShell
      eyebrow="Operations"
      title="Operations Command Center"
      subtitle="Main operations work center for approvals, financial actions, partner actions, customer actions, inventory alerts, and delivery returns."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Operations", href: ROUTES.admin.operations },
        { label: "Command Center" },
      ]}
      actions={[
        { href: ROUTES.admin.operations, label: "Operations Workspace", variant: "secondary" },
        { href: ROUTES.admin.dashboard, label: "Dashboard", variant: "secondary" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <div className="flex justify-end">
        <ActionButton href={ROUTES.admin.operations} variant="secondary" size="sm">
          Back to operations workspace
        </ActionButton>
      </div>
      <OperationsCommandCenterWorkspace />
    </ERPPageShell>
  );
}
