import RoleGuard from "@/components/auth/RoleGuard";
import ModuleCard from "@/components/ui/module-card";
import ModuleSection from "@/components/ui/module-section";
import PortalPage from "@/components/ui/portal-page";

export default function CustomerPortalPage() {
  return (
    <RoleGuard allowedRoles={["CUSTOMER", "ADMIN"]}>
      <PortalPage
        title="Customer Portal"
        subtitle="Track subscription progress, payment schedule and lucky draw status."
        actions={[
          { href: "/customer/dashboard", label: "Overview" },
          { href: "/products", label: "Products" },
          { href: "/winners", label: "Winner History" },
        ]}
      >
        <ModuleSection
          title="Customer Modules"
          subtitle="Transparent visibility for subscriptions, EMI timelines and draw outcomes."
        >
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <ModuleCard title="Dashboard" description="Your active subscription and due EMI summary." href="/customer/dashboard" />
            <ModuleCard title="Products" description="Browse available product categories and plans." href="/products" />
            <ModuleCard title="Winner History" description="Review published monthly winners." href="/winners" />
          </div>
        </ModuleSection>
      </PortalPage>
    </RoleGuard>
  );
}
