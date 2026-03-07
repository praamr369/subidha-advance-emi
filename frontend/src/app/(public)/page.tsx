import ModuleCard from "@/components/ui/module-card";
import ModuleSection from "@/components/ui/module-section";
import PortalPage from "@/components/ui/portal-page";
import PublicNav from "@/components/ui/public-nav";

export default function PublicLandingPage() {
  return (
    <PortalPage
      title="Subidha Lucky Plan"
      subtitle="Public information center for plans, trust model, process and winner publications."
    >
      <PublicNav />

      <ModuleSection
        title="Public Modules"
        subtitle="Explore all public-facing sections with clear financial transparency messaging."
      >
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <ModuleCard title="How It Works" description="Understand end-to-end subscription and draw flow." href="/how-it-works" />
          <ModuleCard title="Lucky Plan" description="Plan details, terms and customer eligibility." href="/lucky-plan" />
          <ModuleCard title="Winner History" description="Published monthly winner information." href="/winner-history" />
          <ModuleCard title="Vision & Trust" description="Governance, auditability and customer protection principles." href="/vision-trust" />
          <ModuleCard title="About" description="About Subidha and platform mission." href="/about" />
          <ModuleCard title="Contact" description="Support channels for enrollment and payment help." href="/contact" />
        </div>
      </ModuleSection>
    </PortalPage>
  );
}
