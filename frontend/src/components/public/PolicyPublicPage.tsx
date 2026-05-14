import Link from "next/link";

import CtaBanner from "@/components/public/CtaBanner";
import PublicBanner from "@/components/public/PublicBanner";
import PublicDisclaimerBox from "@/components/public/PublicDisclaimerBox";
import PublicPageShell from "@/components/public/PublicPageShell";
import PolicyMarkdown from "@/components/public/PolicyMarkdown";
import { getPublicPolicyBySlug } from "@/lib/public-api";
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
  const policy = await getPublicPolicyBySlug(slug);

  return (
    <PublicPageShell
      title={heroTitle}
      subtitle={heroSubtitle}
      breadcrumbs={[
        { label: "Home", href: ROUTES.public.home },
        { label: "Business policies", href: ROUTES.public.policies },
        { label: pageTitle },
      ]}
      actions={[
        { label: "Contact Store", href: ROUTES.public.contact, variant: "secondary" },
        { label: "Apply", href: ROUTES.public.apply, variant: "primary" },
      ]}
    >
      {!policy ? (
        <section className="public-surface p-6">
          <h2 className="text-xl font-semibold text-foreground">Policy under review</h2>
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
            eyebrow="Published policy"
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
            title="Legal usage note"
            points={[
              "Published policy text is for customer clarity and operational transparency.",
              "Contracts, invoices, receipts, and audited records remain the canonical transaction source.",
              "Contact Subidha Furniture for transaction-specific legal clarifications.",
            ]}
          />
        </>
      )}

      <CtaBanner
        title="Need transaction-specific confirmation?"
        description="Please confirm invoice, EMI, refund, warranty, delivery, and compliance terms with the branch before payment."
        actions={[
          { href: ROUTES.public.contact, label: "Contact Store", variant: "secondary" },
          { href: ROUTES.public.products, label: "View Products", variant: "secondary" },
          { href: ROUTES.public.login, label: "Login", variant: "primary" },
        ]}
      />
    </PublicPageShell>
  );
}
