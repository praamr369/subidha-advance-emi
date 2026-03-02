import PublicNav from "@/components/ui/public-nav";
import PortalPage from "@/components/ui/portal-page";

export default function HowItWorksPage() {
  return (
    <PortalPage title="How It Works" subtitle="A controlled subscription flow designed for operational and financial integrity.">
      <PublicNav />
      <ol>
        <li>Customer is enrolled into an available batch slot by admin/partner.</li>
        <li>System auto-generates EMI schedule for the full tenure.</li>
        <li>Monthly collections are posted in append-only transaction ledger.</li>
        <li>Lucky draw is executed with commitment + reveal traceability.</li>
        <li>Winner future EMIs are waived and frozen in audit history.</li>
      </ol>
    </PortalPage>
  );
}
