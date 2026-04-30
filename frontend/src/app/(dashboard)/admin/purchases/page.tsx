"use client";

import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";

export default function AdminPurchasesPage() {
  return (
    <PortalPage
      title="Purchases"
      subtitle="Internal procure-to-pay workspace for orders, receipts, and vendor bills."
      breadcrumbs={[{ label: "Admin", href: ROUTES.admin.dashboard }, { label: "Purchases" }]}
      actions={[
        { href: ROUTES.admin.purchaseOrders, label: "Purchase Orders", variant: "primary" },
        { href: ROUTES.admin.purchaseReceipts, label: "Goods Receipts", variant: "secondary" },
        { href: ROUTES.admin.purchaseBills, label: "Vendor Bills", variant: "secondary" },
      ]}
    >
      <WorkspaceSection
        title="Procurement Modules"
        description="Use orders -> receipts -> vendor bills sequence to keep stock and accounting auditable."
      >
        <div className="text-sm text-muted-foreground">
          Open each module from the actions above to manage operational purchase flow.
        </div>
      </WorkspaceSection>
    </PortalPage>
  );
}
