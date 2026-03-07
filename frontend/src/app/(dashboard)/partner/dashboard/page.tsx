import RoleGuard from "@/components/auth/RoleGuard";
import PortalPage from "@/components/ui/portal-page";

export default function PartnerDashboardRoute() {
  return (
    <RoleGuard allowedRoles={["PARTNER", "ADMIN"]}>
      <PortalPage
        title="Partner Dashboard"
        subtitle="Quick route for partner KPI widgets and workflow shortcuts."
      >
        <p>Use the partner workspace cards to manage customers, subscriptions and commission reports.</p>
      </PortalPage>
    </RoleGuard>
  );
}
