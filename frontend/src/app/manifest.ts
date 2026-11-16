import type { MetadataRoute } from "next";

import { brandConfig } from "@/config/brand";
import { getResolvedPublicBusinessProfile } from "@/lib/public-profile";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const profile = await getResolvedPublicBusinessProfile().catch(() => null);
  const companyName = profile?.resolved_display_name || brandConfig.companyName;
  const description =
    profile?.resolved_tagline ||
    `${companyName} Retail Operations, POS, Inventory, and Accounting System`;

  const icons: MetadataRoute.Manifest["icons"] = [
    {
      src: "/brand/icon-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/brand/icon-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/brand/icon-maskable-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "maskable",
    },
    {
      src: "/brand/icon-maskable-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ];

  if (
    profile?.resolved_logo_src &&
    profile.resolved_logo_src !== "/brand/logo.png" &&
    profile.resolved_logo_src.startsWith("http")
  ) {
    icons.push({
      src: profile.resolved_logo_src,
      sizes: "any",
      type: "image/png",
      purpose: "any",
    });
  }

  return {
    name: `${brandConfig.systemProductName} — ERP & POS`,
    short_name: brandConfig.systemProductName,
    description,
    start_url: "/admin",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: "#0f172a",
    icons,
    categories: ["business", "finance", "productivity"],
    lang: "en-IN",
  };
}
