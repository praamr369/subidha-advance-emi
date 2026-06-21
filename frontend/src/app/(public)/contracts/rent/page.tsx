import type { Metadata } from "next";

import CtaBanner from "@/components/public/CtaBanner";
import PublicBanner from "@/components/public/PublicBanner";
import PublicDisclaimerBox from "@/components/public/PublicDisclaimerBox";
import PublicPolicySection from "@/components/public/PublicPolicySection";
import PublicPageShell from "@/components/public/PublicPageShell";
import RentLeaseAnimatedHero from "@/components/public/RentLeaseAnimatedHero";
import RentLeaseWorkflowPreview from "@/components/public/RentLeaseWorkflowPreview";
import { READ_BEFORE_APPLY, RENT_POLICY, PUBLIC_LEGAL_DISCLAIMER_POINTS } from "@/lib/public-content";
import { buildPublicMetadata } from "@/lib/public-seo";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = buildPublicMetadata({
  title: "Rent Contract",
  description:
    "Understand Subidha Furniture rent contract: purpose, deposit, payment schedule, inspection, return, and refund rules. Rent does not include Lucky ID or draw participation.",
  path: "/contracts/rent",
});

const subtitle = "Short-term and flexible furniture usage rules explained clearly for customers.";

export default function ContractsRentPage() {
  return (
    <PublicPageShell
      title="Rent contract"
      subtitle={subtitle}
      heroSlot={<RentLeaseAnimatedHero mode="rent" title="Rent contract" subtitle={subtitle} />}
      breadcrumbs={[
        { label: "Home", href: ROUTES.public.home },
        { label: "Contracts", href: ROUTES.public.contracts },
        { label: "Rent" },
      ]}
      actions={[
        { label: "Apply Now", href: ROUTES.public.apply, variant: "primary" },
        { label: "Contact Store", href: ROUTES.public.contact, variant: "secondary" },
      ]}
    >
      <PublicBanner
        eyebrow="Read before applying"
        title="Rent is usage access, not automatic ownership"
        description="Please read these points before submitting your application so expectations remain transparent. Rent does not create Lucky ID participation, winner eligibility, or EMI waiver benefits."
      />

      <RentLeaseWorkflowPreview mode="rent" />

      <PublicDisclaimerBox title="Read before applying" points={READ_BEFORE_APPLY.rent} />
      <PublicPolicySection id="rent-policy" title={RENT_POLICY.title} intro={RENT_POLICY.intro} cards={RENT_POLICY.cards} />
      <PublicDisclaimerBox points={PUBLIC_LEGAL_DISCLAIMER_POINTS} />

      <CtaBanner
        title="Need help choosing Rent vs Lease?"
        description="Branch advisors can explain tenure suitability, deposit impact, and document requirements."
        actions={[
          { href: ROUTES.public.contracts, label: "View all contracts", variant: "secondary" },
          { href: ROUTES.public.contractsLease, label: "Lease contract", variant: "secondary" },
          { href: ROUTES.public.contact, label: "Contact Store", variant: "secondary" },
          { href: ROUTES.public.login, label: "Customer Dashboard", variant: "primary" },
        ]}
      />
    </PublicPageShell>
  );
}
