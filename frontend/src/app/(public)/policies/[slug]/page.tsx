import type { Metadata } from "next";
import { cache } from "react";

import PolicyPublicPage from "@/components/public/PolicyPublicPage";
import { getPublicPolicyBySlug } from "@/lib/public-api";
import { getCodifiedPolicy } from "@/lib/public-policies-data";
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
  const codified = getCodifiedPolicy(slug);

  const title = policy?.title || codified?.title || titleFromSlug(slug);
  const description = policy?.summary || codified?.summary || "Published legal policy page for Subidha Furniture.";

  return buildPublicMetadata({
    title,
    description,
    path: `/policies/${slug}`,
    // Index if either remote policy or codified policy exists
    noIndex: !policy && !codified,
  });
}

export default async function GenericPolicyBySlugPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const policy = await loadPolicy(slug).catch(() => null);
  const codified = getCodifiedPolicy(slug);
  const title = policy?.title || codified?.title || titleFromSlug(slug);

  return (
    <PolicyPublicPage
      slug={slug}
      policy={policy}
      pageTitle={title}
      heroTitle={title}
      heroSubtitle={policy?.summary || codified?.summary || "Published legal policy text for customer reference."}
    />
  );
}
