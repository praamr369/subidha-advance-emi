import type { Metadata } from "next";

import PolicyPublicPage from "@/components/public/PolicyPublicPage";
import { buildPublicMetadata } from "@/lib/public-seo";

type Params = {
  slug: string;
};

export function generateMetadata({ params }: { params: Params }): Metadata {
  const label = (params.slug || "policy").replace(/-/g, " ");
  return buildPublicMetadata({
    title: `${label} policy`,
    description: "Published policy page",
    path: `/policies/${params.slug}`,
  });
}

export default function GenericPolicyBySlugPage({ params }: { params: Params }) {
  const label = (params.slug || "policy").replace(/-/g, " ");
  const title = label
    .split(" ")
    .filter(Boolean)
    .map((token) => token[0]?.toUpperCase() + token.slice(1))
    .join(" ");

  return (
    <PolicyPublicPage
      slug={params.slug}
      pageTitle={title}
      heroTitle={title}
      heroSubtitle="Published legal policy text for customer reference."
    />
  );
}
