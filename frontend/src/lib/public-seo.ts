import type { Metadata } from "next";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://subidha.example.com";

export function buildPublicMetadata(input: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  const url = `${baseUrl}${input.path}`;

  return {
    title: input.title,
    description: input.description,
    alternates: { canonical: input.path },
    openGraph: {
      title: input.title,
      description: input.description,
      url,
      siteName: "SUBIDHA CORE",
      type: "website",
      locale: "en_IN",
    },
    twitter: {
      card: "summary_large_image",
      title: input.title,
      description: input.description,
    },
  };
}

export function buildOrganizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Subidha Furniture",
    description: "Lucky Plan EMI system for furniture, electronics, and home appliances.",
    areaServed: "Asansol, West Bengal, India",
    url: baseUrl,
  };
}
