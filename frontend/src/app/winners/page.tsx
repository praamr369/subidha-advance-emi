import PublicNav from "@/components/ui/public-nav";
import PortalPage from "@/components/ui/portal-page";

export default function WinnersPage() {
  return (
    <PortalPage title="Winner Transparency" subtitle="Public winner feed for trust and verification.">
      <PublicNav />
      <table border={1} cellPadding={8} cellSpacing={0}>
        <thead><tr><th>Batch</th><th>Month</th><th>Lucky ID</th><th>Commitment Hash</th><th>Draw Timestamp</th></tr></thead>
        <tbody>
          <tr><td>B-100</td><td>1</td><td>07</td><td>sha256:demo-commitment</td><td>2026-01-05 11:00</td></tr>
          <tr><td>B-101</td><td>1</td><td>42</td><td>sha256:demo-commitment</td><td>2026-01-06 11:00</td></tr>
        </tbody>
      </table>
    </PortalPage>
  );
}
