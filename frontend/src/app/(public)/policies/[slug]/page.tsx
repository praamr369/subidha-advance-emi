import type { Metadata } from "next";
import { cache } from "react";

import PolicyPublicPage from "@/components/public/PolicyPublicPage";
import { getPublicPolicyBySlug } from "@/lib/public-api";
import { buildPublicMetadata } from "@/lib/public-seo";

type Params = {
  slug: string;
};

// generateMetadata and the page share one policy fetch per request.
const loadPolicy = cache((slug: string) => getPublicPolicyBySlug(slug));

function titleFromSlug(slug: string): string {
  return (slug || "policy")
    .split("-")
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const policy = await loadPolicy(slug).catch(() => null);
  return buildPublicMetadata({
    title: policy?.title || titleFromSlug(slug),
    description: policy?.summary || "Published policy page",
    path: `/policies/${slug}`,
    // Nothing published under this slug: keep the placeholder page out of search results.
    noIndex: !policy,
  });
}

export default async function GenericPolicyBySlugPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const policy = await loadPolicy(slug);
  const title = policy?.title || titleFromSlug(slug);

  return (
    <PolicyPublicPage
      slug={slug}
      policy={policy}
      pageTitle={title}
      heroTitle={title}
      heroSubtitle="Published legal policy text for customer reference."
    />
  );
}
