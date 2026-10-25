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
import { getCodifiedPolicy } from "@/lib/public-policies-data";
import { ROUTES } from "@/lib/routes";
import type { PublicPolicyPage } from "@/services/public";

type PolicyPublicPageProps = {
  slug: string;
  /** Already-loaded policy (null = none published); omit to fetch it here. */
  policy?: PublicPolicyPage | null;
  pageTitle: string;
  heroTitle: string;
  heroSubtitle: string;
};

export default async function PolicyPublicPage({
  slug,
  policy: preloadedPolicy,
  pageTitle,
  heroTitle,
  heroSubtitle,
}: PolicyPublicPageProps) {
  const locale = await getPublicLocale();
  const dict = getPublicDictionary(locale);

  const remotePolicy = preloadedPolicy !== undefined ? preloadedPolicy : await getPublicPolicyBySlug(slug).catch(() => null);
  const codified = getCodifiedPolicy(slug);

  const effectivePolicy =
    remotePolicy && remotePolicy.content?.trim()
      ? remotePolicy
      : codified
        ? {
            slug: codified.slug,
            title: codified.title,
            category: codified.category,
            version: codified.version,
            summary: codified.summary,
            content: codified.content,
            rendered_content: codified.content,
            status: "PUBLISHED",
            effective_date: codified.effectiveDate,
            published_at: codified.effectiveDate,
            last_reviewed_at: codified.effectiveDate,
          }
        : null;

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
        badges: effectivePolicy
          ? [
              `Status: Codified & Effective v${effectivePolicy.version}`,
              effectivePolicy.effective_date ? `Effective: ${effectivePolicy.effective_date}` : "Effective date published",
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
      {!effectivePolicy ? (
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
            title={`${effectivePolicy.title} (v${effectivePolicy.version})`}
            description={effectivePolicy.summary || "Published legal policy text for customer reference."}
          />

          <section className="public-surface p-6">
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="rounded-full border border-border bg-card px-2.5 py-1">Slug: {effectivePolicy.slug}</span>
              {effectivePolicy.effective_date ? (
                <span className="rounded-full border border-border bg-card px-2.5 py-1">
                  Effective: {effectivePolicy.effective_date}
                </span>
              ) : null}
              {effectivePolicy.published_at ? (
                <span className="rounded-full border border-border bg-card px-2.5 py-1">
                  Published: {new Date(effectivePolicy.published_at).toLocaleDateString()}
                </span>
              ) : null}
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-600 dark:text-emerald-400">
                Statutory & Rulebook Codified
              </span>
            </div>
            <PolicyMarkdown content={effectivePolicy.rendered_content || effectivePolicy.content} className="mt-5" />
          </section>

          <PublicDisclaimerBox
            title={dict.public.PolicyPublicPage_attr14}
            points={[
              "Published policy text is for customer clarity, operational governance, and statutory compliance.",
              "Contracts, tax invoices, receipts, and audited delivery records remain the canonical transaction source.",
              "For contract-specific clarifications, contact the Subidha Furniture showroom administration.",
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
