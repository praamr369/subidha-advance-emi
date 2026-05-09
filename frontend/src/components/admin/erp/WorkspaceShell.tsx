"use client";

import type { ReactNode } from "react";

import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";

export function WorkspaceShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <PortalPage
      eyebrow="ERP + CRM"
      title={title}
      subtitle={subtitle}
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "ERP Workspace" },
      ]}
      actions={[
        { href: ROUTES.admin.erp, label: "ERP Home", variant: "secondary" },
        { href: ROUTES.admin.crmWorkspace, label: "CRM", variant: "secondary" },
        { href: ROUTES.admin.salesWorkspace, label: "Sales", variant: "secondary" },
        { href: ROUTES.admin.serviceWorkspace, label: "Service", variant: "secondary" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      {children}
    </PortalPage>
  );
}
