import type { Metadata } from "next";

import CtaBanner from "@/components/public/CtaBanner";
import PublicBanner from "@/components/public/PublicBanner";
import PublicDisclaimerBox from "@/components/public/PublicDisclaimerBox";
import PublicPageShell from "@/components/public/PublicPageShell";
import PolicyMarkdown from "@/components/public/PolicyMarkdown";
import { getPublicBusinessComplianceSummary, getPublicPolicyBySlug } from "@/lib/public-api";
import { getPublicBannerWithFallback } from "@/lib/public-page-banners";
import { buildPublicMetadata } from "@/lib/public-seo";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = buildPublicMetadata({
  title: "Business Compliance Information",
  description: "Public-safe registration and compliance summary page for Subidha Furniture.",
  path: "/business-compliance",
});

export default async function BusinessCompliancePolicyPage() {
  const banner = getPublicBannerWithFallback("policies");
  const [summary, policy] = await Promise.all([
    getPublicBusinessComplianceSummary().catch(() => null),
    getPublicPolicyBySlug("business-compliance").catch(() => null),
  ]);

  return (
    <PublicPageShell
      title="Business Registration and Compliance"
      subtitle="Public-safe compliance disclosure with no private-document exposure and no fake registration claims."
      hero={{
        eyebrow: "Business compliance",
        imageSrc: banner.src,
        imageAlt: "Business compliance policy banner",
        imageExists: banner.exists,
        compact: true,
        legalVariant: true,
        badges: ["No fake GST/Udyam claims", policy ? "Status: published" : "Status: under review"],
      }}
      breadcrumbs={[
        { label: "Home", href: ROUTES.public.home },
        { label: "Business policies", href: ROUTES.public.policies },
        { label: "Business compliance" },
      ]}
      actions={[
        { label: "Contact Store", href: ROUTES.public.contact, variant: "secondary" },
        { label: "Policies", href: ROUTES.public.policies, variant: "secondary" },
      ]}
    >
      <PublicBanner
        eyebrow="Compliance summary"
        title="Public-safe business status"
        description="Registration and compliance details are disclosed safely without exposing private documents."
      />

      <section className="public-surface p-6">
        {summary ? (
          <div className="grid gap-2 text-sm leading-7 text-muted-foreground sm:text-base">
            <p><strong className="text-foreground">Business:</strong> {summary.business_name}</p>
            <p><strong className="text-foreground">Location:</strong> {summary.business_location}</p>
            <p><strong className="text-foreground">Website:</strong> {summary.website_url}</p>
            <p><strong className="text-foreground">Phone:</strong> {summary.business_phone}</p>
            <p><strong className="text-foreground">Email:</strong> {summary.business_email}</p>
            <p><strong className="text-foreground">Address:</strong> {summary.business_address}</p>
            <p><strong className="text-foreground">GST status:</strong> {summary.gst_status_text}</p>
            <p><strong className="text-foreground">Udyam/MSME status:</strong> {summary.udyam_status_text}</p>
            <p><strong className="text-foreground">Document policy:</strong> {summary.private_document_disclaimer}</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Compliance summary is currently unavailable.</p>
        )}
      </section>

      {policy ? (
        <section className="public-surface p-6">
          <h2 className="text-xl font-semibold text-foreground">Published policy text</h2>
          <PolicyMarkdown content={policy.rendered_content || policy.content} className="mt-4" />
        </section>
      ) : (
        <section className="public-surface p-6">
          <p className="text-sm text-muted-foreground">
            This policy is being reviewed and will be published soon.
          </p>
        </section>
      )}

      <PublicDisclaimerBox
        title="Disclosure boundary"
        points={[
          "Private compliance documents are not publicly downloadable by default.",
          "Only approved public-safe summaries are shown online.",
          "Registration claims are published only after verification.",
        ]}
      />

      <CtaBanner
        title="Need verification support?"
        description="Contact Subidha Furniture for approved verification channels and legal clarification."
        actions={[
          { href: ROUTES.public.contact, label: "Contact Store", variant: "secondary" },
          { href: ROUTES.public.udyamMsme, label: "Udyam/MSME info", variant: "secondary" },
          { href: ROUTES.public.policies, label: "All policies", variant: "primary" },
        ]}
      />
    </PublicPageShell>
  );
}
