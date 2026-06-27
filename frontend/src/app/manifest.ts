import type { MetadataRoute } from "next";

import { brandConfig } from "@/config/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${brandConfig.companyName} — ${brandConfig.publicProgramName}`,
    short_name: brandConfig.companyName,
    description: `${brandConfig.companyName} Lucky Plan Advance EMI — furniture on easy monthly installments`,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1e293b",
    icons: [
      { src: "/brand/subidha-logo.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/subidha-logo.png", sizes: "512x512", type: "image/png" },
    ],
    categories: ["shopping", "finance", "business"],
    lang: "en-IN",
  };
}
