import PortalPage from "@/components/ui/PortalPage";
import EmptyState from "@/components/feedback/EmptyState";
import Link from "next/link";

export default function PartnerPayoutsPage() {
  return (
    <PortalPage
      title="Partner Payouts"
      subtitle="Payout visibility for finalized payout batches created from settled commissions."
      breadcrumbs={[{ label: "Partner", href: "/partner" }, { label: "Payouts" }]}
    >
      <EmptyState
        title="Payout list not available in partner portal"
        description="Payout batches are created and finalized by admin finance operations. Use the commissions page for real-time earnings and settlement visibility."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/partner/commissions"
              className="inline-flex items-center rounded-md border border-border bg-foreground px-3 py-2 text-sm font-medium text-background shadow-sm transition hover:opacity-90"
            >
              View Commissions
            </Link>
            <Link
              href="/partner/reports"
              className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
            >
              View Reports
            </Link>
          </div>
        }
      />
    </PortalPage>
  );
}
