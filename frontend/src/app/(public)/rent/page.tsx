import type { Metadata } from "next";

import CtaBanner from "@/components/public/CtaBanner";
import PublicBanner from "@/components/public/PublicBanner";
import PublicDisclaimerBox from "@/components/public/PublicDisclaimerBox";
import PublicPolicySection from "@/components/public/PublicPolicySection";
import PublicPageShell from "@/components/public/PublicPageShell";
import { READ_BEFORE_APPLY, RENT_POLICY, PUBLIC_LEGAL_DISCLAIMER_POINTS } from "@/lib/public-content";
import { getPublicBannerWithFallback } from "@/lib/public-page-banners";
import { buildPublicMetadata } from "@/lib/public-seo";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = buildPublicMetadata({
  title: "Rent policy",
  description: "Understand Subidha Furniture rent purpose, deposit, payment, inspection, and refund rules.",
  path: "/rent",
});

export default function RentPolicyPage() {
  const banner = getPublicBannerWithFallback("rentLease");
  return (
    <PublicPageShell
      title="Rent policy"
      subtitle="Short-term and flexible furniture usage rules explained clearly for customers."
      hero={{
        eyebrow: "Rent workflow",
        imageSrc: banner.src,
        imageAlt: "Rent and lease banner image",
        imageExists: banner.exists,
        badges: ["Refundable deposit subject to terms", "Inspection on return"],
      }}
      breadcrumbs={[
        { label: "Home", href: ROUTES.public.home },
        { label: "Rent policy" },
      ]}
      actions={[
        { label: "Apply Now", href: ROUTES.public.apply, variant: "primary" },
        { label: "Contact Store", href: ROUTES.public.contact, variant: "secondary" },
      ]}
    >
      <PublicBanner
        eyebrow="Read before applying"
        title="Rent is usage access, not automatic ownership"
        description="Please read these points before submitting your application so expectations remain transparent."
      />
      <PublicDisclaimerBox title="Read before applying" points={READ_BEFORE_APPLY.rent} />
      <PublicPolicySection id="rent-policy" title={RENT_POLICY.title} intro={RENT_POLICY.intro} cards={RENT_POLICY.cards} />
      <PublicDisclaimerBox points={PUBLIC_LEGAL_DISCLAIMER_POINTS} />
      <CtaBanner
        title="Need help choosing Rent vs Lease?"
        description="Branch advisors can explain tenure suitability, deposit impact, and document requirements."
        actions={[
          { href: ROUTES.public.contact, label: "Contact Store", variant: "secondary" },
          { href: ROUTES.public.products, label: "View Products", variant: "secondary" },
          { href: ROUTES.public.login, label: "Login to Customer Dashboard", variant: "primary" },
        ]}
      />
    </PublicPageShell>
  );
}
