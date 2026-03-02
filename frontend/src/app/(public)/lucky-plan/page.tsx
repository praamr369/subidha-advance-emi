import PublicNav from "@/components/ui/public-nav";
import PortalPage from "@/components/ui/portal-page";

export default function LuckyPlanPage() {
  return (
    <PortalPage title="Lucky Plan Details" subtitle="100 subscriptions per batch (00-99) with 15-month EMI cycles and one winner per month.">
      <PublicNav />
      <ul>
        <li>Strict lucky number uniqueness per batch.</li>
        <li>One winner monthly, no repeat winner in a draw event.</li>
        <li>Future unpaid EMIs are waived after winner confirmation.</li>
        <li>All payments recorded as immutable ledger entries.</li>
      </ul>
    </PortalPage>
  );
}
