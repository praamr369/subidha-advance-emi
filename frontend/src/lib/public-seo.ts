import type { Metadata } from "next";

import { brandConfig } from "@/config/brand";
import { PUBLIC_MARKETING_ASSETS } from "@/lib/public-marketing-assets";
import type { ResolvedPublicBusinessProfile } from "@/lib/public-profile";

const fallbackBaseUrl = "https://subidha.example.com";
const defaultSiteName = "Subidha Furniture";
const defaultDescription =
  "Subidha Furniture public site for Lucky Plan EMI, rent, lease, direct sale, product enquiry, policy reading, and winner transparency.";
const productsSearchPath = "/products?search={search_term_string}";

export function getPublicSiteUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL || fallbackBaseUrl).trim();
  return raw.replace(/\/+$/, "");
}

export function absolutePublicUrl(path = "/"): string {
  const trimmed = path.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const normalizedPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${getPublicSiteUrl()}${normalizedPath}`;
}

function defaultSocialImagePath(): string {
  const image = PUBLIC_MARKETING_ASSETS.heroShowroom;
  return image.imageExists ? image.src : "/brand/subidha-logo.png";
}

export function buildPublicMetadata(input: {
  title: string;
  description: string;
  path: string;
  imagePath?: string;
  noIndex?: boolean;
}): Metadata {
  const canonicalPath = input.path.startsWith("/") ? input.path : `/${input.path}`;
  const title = input.title === "Home" ? defaultSiteName : `${input.title} | ${defaultSiteName}`;
  const description = input.description || defaultDescription;
  const imageUrl = absolutePublicUrl(input.imagePath || defaultSocialImagePath());
  const url = absolutePublicUrl(canonicalPath);

  return {
    metadataBase: new URL(getPublicSiteUrl()),
    title,
    description,
    alternates: { canonical: canonicalPath },
    robots: input.noIndex
      ? { index: false, follow: false }
      : {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            "max-image-preview": "large",
            "max-snippet": -1,
            "max-video-preview": -1,
          },
        },
    openGraph: {
      title,
      description,
      url,
      siteName: defaultSiteName,
      type: "website",
      locale: "en_IN",
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: `${defaultSiteName} public website`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

export function buildOrganizationJsonLd(profile?: Partial<ResolvedPublicBusinessProfile>) {
  const name = profile?.resolved_display_name || profile?.display_name || defaultSiteName;
  const url = getPublicSiteUrl();
  const logo = profile?.resolved_logo_src || brandConfig.publicLogoSrc;
  const sameAs = [profile?.facebook_url, profile?.instagram_url, profile?.youtube_url]
    .map((value) => (value || "").trim())
    .filter(Boolean);

  return {
    "@context": "https://schema.org",
    "@type": "FurnitureStore",
    "@id": `${url}/#organization`,
    name,
    description: profile?.resolved_tagline || profile?.tagline || defaultDescription,
    url,
    logo: absolutePublicUrl(logo),
    image: absolutePublicUrl(defaultSocialImagePath()),
    areaServed: {
      "@type": "AdministrativeArea",
      name: "Asansol, West Bengal, India",
    },
    address: profile?.address_text
      ? {
          "@type": "PostalAddress",
          streetAddress: profile.address_text,
          addressLocality: "Asansol",
          addressRegion: "West Bengal",
          addressCountry: "IN",
        }
      : undefined,
    telephone: profile?.support_phone || undefined,
    email: profile?.support_email || undefined,
    sameAs: sameAs.length > 0 ? sameAs : undefined,
  };
}

export function buildWebsiteJsonLd() {
  const url = getPublicSiteUrl();

  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${url}/#website`,
    name: defaultSiteName,
    url,
    publisher: { "@id": `${url}/#organization` },
    inLanguage: ["en-IN", "bn-IN", "hi-IN"],
    potentialAction: {
      "@type": "SearchAction",
      target: `${url}${productsSearchPath}`,
      "query-input": "required name=search_term_string",
    },
  };
}

export function buildBreadcrumbJsonLd(items: Array<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absolutePublicUrl(item.path),
    })),
  };
}
