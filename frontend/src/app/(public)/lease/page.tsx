import type { Metadata } from "next";

import CtaBanner from "@/components/public/CtaBanner";
import PublicBanner from "@/components/public/PublicBanner";
import PublicDisclaimerBox from "@/components/public/PublicDisclaimerBox";
import PublicPolicySection from "@/components/public/PublicPolicySection";
import PublicPageShell from "@/components/public/PublicPageShell";
import { LEASE_POLICY, PUBLIC_LEGAL_DISCLAIMER_POINTS, READ_BEFORE_APPLY } from "@/lib/public-content";
import { getPublicBannerWithFallback } from "@/lib/public-page-banners";
import { buildPublicMetadata } from "@/lib/public-seo";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = buildPublicMetadata({
  title: "Lease policy",
  description: "Understand Subidha Furniture lease tenure, payment, upgrade, handover, and return rules.",
  path: "/lease",
});

export default function LeasePolicyPage() {
  const banner = getPublicBannerWithFallback("rentLease");
  return (
    <PublicPageShell
      title="Lease policy"
      subtitle="Longer-term furniture access with contract-backed controls and approval checkpoints."
      hero={{
        eyebrow: "Lease workflow",
        imageSrc: banner.src,
        imageAlt: "Lease policy banner image",
        imageExists: banner.exists,
        badges: ["Contract-backed terms", "Return and condition checks"],
      }}
      breadcrumbs={[
        { label: "Home", href: ROUTES.public.home },
        { label: "Lease policy" },
      ]}
      actions={[
        { label: "Apply Now", href: ROUTES.public.apply, variant: "primary" },
        { label: "Contact Store", href: ROUTES.public.contact, variant: "secondary" },
      ]}
    >
      <PublicBanner
        eyebrow="Read before applying"
        title="Lease renewal and upgrade are approval-based"
        description="Please review these points carefully before enrollment."
      />
      <PublicDisclaimerBox title="Read before applying" points={READ_BEFORE_APPLY.lease} />
      <PublicPolicySection id="lease-policy" title={LEASE_POLICY.title} intro={LEASE_POLICY.intro} cards={LEASE_POLICY.cards} />
      <PublicDisclaimerBox points={PUBLIC_LEGAL_DISCLAIMER_POINTS} />
      <CtaBanner
        title="Need tenure planning support?"
        description="Discuss lease tenure, payment schedule, and return responsibilities with the branch team."
        actions={[
          { href: ROUTES.public.contact, label: "Contact Store", variant: "secondary" },
          { href: ROUTES.public.products, label: "View Products", variant: "secondary" },
          { href: ROUTES.public.login, label: "Login to Customer Dashboard", variant: "primary" },
        ]}
      />
    </PublicPageShell>
  );
}
