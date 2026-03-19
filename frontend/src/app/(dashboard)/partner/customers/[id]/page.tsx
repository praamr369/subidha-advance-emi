import PortalPage from "@/components/ui/PortalPage";
import EmptyState from "@/components/feedback/EmptyState";
import Link from "next/link";

export default function PartnerCustomerDetailPage() {
  return (
    <PortalPage
      title="Partner Customer Detail"
      subtitle="Customer-level detail is not yet available in the partner portal."
      breadcrumbs={[
        { label: "Partner", href: "/partner" },
        { label: "Customers", href: "/partner/customers" },
        { label: "Detail" },
      ]}
    >
      <div className="space-y-4">
        <EmptyState
          title="Customer detail is not exposed to partners"
          description="This view requires a dedicated partner customer detail endpoint (profile, subscriptions, due EMIs) with proper permission scoping. Use the customer list search and subscription list for current operations."
        />
        <div className="flex flex-wrap gap-2">
          <Link
            href="/partner/customers"
            className="inline-flex items-center rounded-md border border-border bg-foreground px-3 py-2 text-sm font-medium text-background shadow-sm transition hover:opacity-90"
          >
            Back to Customers
          </Link>
          <Link
            href="/partner/subscriptions"
            className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
          >
            View Subscriptions
          </Link>
        </div>
      </div>
    </PortalPage>
  );
}
