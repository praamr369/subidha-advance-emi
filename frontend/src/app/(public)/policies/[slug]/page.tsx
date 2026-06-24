import type { Metadata } from "next";

import PolicyPublicPage from "@/components/public/PolicyPublicPage";
import { buildPublicMetadata } from "@/lib/public-seo";

type Params = {
  slug: string;
};

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const label = (slug || "policy").replace(/-/g, " ");
  return buildPublicMetadata({
    title: `${label} policy`,
    description: "Published policy page",
    path: `/policies/${slug}`,
  });
}

export default async function GenericPolicyBySlugPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const label = (slug || "policy").replace(/-/g, " ");
  const title = label
    .split(" ")
    .filter(Boolean)
    .map((token) => token[0]?.toUpperCase() + token.slice(1))
    .join(" ");

  return (
    <PolicyPublicPage
      slug={slug}
      pageTitle={title}
      heroTitle={title}
      heroSubtitle="Published legal policy text for customer reference."
    />
  );
}
