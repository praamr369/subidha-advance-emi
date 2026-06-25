"use client";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";

export default function AdminVendorReturnsPage(){
  return (
    <ERPPageShell title="Vendor Returns" subtitle="Purchase return workflow is available from vendor-specific operations." breadcrumbs={[{label:"Admin",href:ROUTES.admin.dashboard},{label:"Purchases",href:ROUTES.admin.purchases},{label:"Vendor Returns"}]}> 
      <WorkspaceSection title="Blocked: Aggregate register endpoint unavailable" description="Current API exposes purchase returns per vendor (`/admin/vendors/{id}/purchase-returns/`) and not as a global register. Use Vendor > Detail > Purchase returns until aggregate endpoint is added.">
        <div className="rounded border p-3 text-sm text-muted-foreground">This page intentionally avoids fake aggregate data and synthetic KPIs.</div>
      </WorkspaceSection>
    </ERPPageShell>
  );
}
