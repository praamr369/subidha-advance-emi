import type { MetadataRoute } from "next";

import { getPublicSiteUrl } from "@/lib/public-seo";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getPublicSiteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin/",
          "/cashier/",
          "/customer/",
          "/partner/",
          "/vendor/",
          "/login",
          "/unauthorized",
          "/brochures/",
          "/quotations/",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
