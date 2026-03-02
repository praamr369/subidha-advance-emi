import PublicNav from "@/components/ui/public-nav";
import PortalPage from "@/components/ui/portal-page";

export default function WinnerHistoryPage() {
  return (
    <PortalPage title="Winner History" subtitle="Read-only publication of monthly lucky draw winners.">
      <PublicNav />
      <p>Winner history is published from immutable draw events and includes batch, draw month and lucky number details.</p>
    </PortalPage>
  );
}
