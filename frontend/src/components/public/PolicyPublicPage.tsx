import { getPublicDictionary } from "@/lib/public-i18n";
import { getPublicLocale } from "@/lib/public-i18n.server";
import Link from "next/link";

import CtaBanner from "@/components/public/CtaBanner";
import PublicBanner from "@/components/public/PublicBanner";
import PublicDisclaimerBox from "@/components/public/PublicDisclaimerBox";
import PublicPageShell from "@/components/public/PublicPageShell";
import PolicyMarkdown from "@/components/public/PolicyMarkdown";
import { getPublicPolicyBySlug } from "@/lib/public-api";
import { getPublicBannerWithFallback } from "@/lib/public-page-banners";
import { ROUTES } from "@/lib/routes";

type PolicyPublicPageProps = {
  slug: string;
  pageTitle: string;
  heroTitle: string;
  heroSubtitle: string;
};

export default async function PolicyPublicPage({
  slug,
  pageTitle,
  heroTitle,
  heroSubtitle,
}: PolicyPublicPageProps) {
  const locale = await getPublicLocale();
  const dict = getPublicDictionary(locale);

  const policy = await getPublicPolicyBySlug(slug);
  const policyBanner = getPublicBannerWithFallback("policies");

  return (
    <PublicPageShell
      title={heroTitle}
      subtitle={heroSubtitle}
      hero={{
        eyebrow: dict.public.PolicyPublicPage_prop1,
        imageSrc: policyBanner.src,
        imageAlt: "Subidha Furniture legal and policy banner",
        imageExists: policyBanner.exists,
        compact: true,
        legalVariant: true,
        badges: policy
          ? [
              `Status: published v${policy.version}`,
              policy.effective_date ? `Effective: ${policy.effective_date}` : "Effective date pending",
            ]
          : ["Status: under review"],
      }}
      breadcrumbs={[
        { label: dict.public.PolicyPublicPage_prop2, href: ROUTES.public.home },
        { label: dict.public.PolicyPublicPage_prop3, href: ROUTES.public.policies },
        { label: pageTitle },
      ]}
      actions={[
        { label: dict.public.PolicyPublicPage_prop4, href: ROUTES.public.contact, variant: "secondary" },
        { label: dict.public.PolicyPublicPage_prop5, href: ROUTES.public.apply, variant: "primary" },
      ]}
    >
      {!policy ? (
        <section className="public-surface p-6">
          <h2 className="text-xl font-semibold text-foreground">{dict.public.PolicyPublicPage_text6}</h2>
          <p className="mt-3 text-sm leading-7 text-muted-foreground sm:text-base">
            This policy is being reviewed and will be published soon.
          </p>
          <p className="mt-2 text-sm leading-7 text-muted-foreground sm:text-base">
            For immediate clarification, contact the branch directly before payment or contract action.
          </p>
          <div className="mt-4">
            <Link
              href={ROUTES.public.contact}
              className="inline-flex rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-accent"
            >
              Contact support
            </Link>
          </div>
        </section>
      ) : (
        <>
          <PublicBanner
            eyebrow={dict.public.PolicyPublicPage_attr10}
            title={`${policy.title} (v${policy.version})`}
            description={policy.summary || "Published legal policy text for customer reference."}
          />

          <section className="public-surface p-6">
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="rounded-full border border-border bg-card px-2.5 py-1">Slug: {policy.slug}</span>
              {policy.effective_date ? (
                <span className="rounded-full border border-border bg-card px-2.5 py-1">
                  Effective: {policy.effective_date}
                </span>
              ) : null}
              {policy.published_at ? (
                <span className="rounded-full border border-border bg-card px-2.5 py-1">
                  Published: {new Date(policy.published_at).toLocaleDateString()}
                </span>
              ) : null}
            </div>
            <PolicyMarkdown content={policy.rendered_content || policy.content} className="mt-5" />
          </section>

          <PublicDisclaimerBox
            title={dict.public.PolicyPublicPage_attr14}
            points={[
              "Published policy text is for customer clarity and operational transparency.",
              "Contracts, invoices, receipts, and audited records remain the canonical transaction source.",
              "Contact Subidha Furniture for transaction-specific legal clarifications.",
            ]}
          />
        </>
      )}

      <CtaBanner
        title={dict.public.PolicyPublicPage_attr15}
        description={dict.public.PolicyPublicPage_attr16}
        actions={[
          { href: ROUTES.public.contact, label: dict.public.PolicyPublicPage_prop4, variant: "secondary" },
          { href: ROUTES.public.products, label: dict.public.PolicyPublicPage_prop18, variant: "secondary" },
          { href: ROUTES.public.login, label: dict.public.PolicyPublicPage_prop19, variant: "primary" },
        ]}
      />
    </PublicPageShell>
  );
}
