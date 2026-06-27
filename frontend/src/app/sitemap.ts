import type { MetadataRoute } from "next";

import { getPublicSiteUrl } from "@/lib/public-seo";

const DAILY = "daily" as const;
const WEEKLY = "weekly" as const;
const MONTHLY = "monthly" as const;

// Static public pages with their crawl priority
const STATIC_ROUTES: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }> = [
  { path: "/", priority: 1.0, changeFrequency: DAILY },
  { path: "/products", priority: 0.9, changeFrequency: DAILY },
  { path: "/lucky-plan", priority: 0.9, changeFrequency: WEEKLY },
  { path: "/about", priority: 0.8, changeFrequency: MONTHLY },
  { path: "/contact", priority: 0.8, changeFrequency: MONTHLY },
  { path: "/how-it-works", priority: 0.8, changeFrequency: MONTHLY },
  { path: "/apply", priority: 0.8, changeFrequency: MONTHLY },
  { path: "/rent", priority: 0.8, changeFrequency: WEEKLY },
  { path: "/lease", priority: 0.8, changeFrequency: WEEKLY },
  { path: "/direct-sale", priority: 0.8, changeFrequency: WEEKLY },
  { path: "/faq", priority: 0.7, changeFrequency: MONTHLY },
  { path: "/winners", priority: 0.7, changeFrequency: WEEKLY },
  { path: "/winner-history", priority: 0.7, changeFrequency: WEEKLY },
  { path: "/lucky-plan/fair-draw", priority: 0.7, changeFrequency: WEEKLY },
  { path: "/lucky-plan/verify", priority: 0.7, changeFrequency: WEEKLY },
  { path: "/partners", priority: 0.7, changeFrequency: MONTHLY },
  { path: "/customers", priority: 0.7, changeFrequency: MONTHLY },
  { path: "/blog", priority: 0.7, changeFrequency: WEEKLY },
  { path: "/rulebook", priority: 0.6, changeFrequency: MONTHLY },
  { path: "/vision-trust", priority: 0.6, changeFrequency: MONTHLY },
  { path: "/contracts", priority: 0.6, changeFrequency: MONTHLY },
  { path: "/contracts/advance-emi", priority: 0.6, changeFrequency: MONTHLY },
  { path: "/contracts/rent", priority: 0.6, changeFrequency: MONTHLY },
  { path: "/contracts/lease", priority: 0.6, changeFrequency: MONTHLY },
  { path: "/policies", priority: 0.5, changeFrequency: MONTHLY },
  { path: "/terms", priority: 0.5, changeFrequency: MONTHLY },
  { path: "/privacy", priority: 0.5, changeFrequency: MONTHLY },
  { path: "/warranty", priority: 0.5, changeFrequency: MONTHLY },
  { path: "/refund-cancellation", priority: 0.5, changeFrequency: MONTHLY },
  { path: "/grievance", priority: 0.5, changeFrequency: MONTHLY },
  { path: "/payment-policy", priority: 0.5, changeFrequency: MONTHLY },
  { path: "/delivery-policy", priority: 0.5, changeFrequency: MONTHLY },
  { path: "/service-policy", priority: 0.5, changeFrequency: MONTHLY },
  { path: "/rental-lease-policy", priority: 0.5, changeFrequency: MONTHLY },
  { path: "/direct-sale-policy", priority: 0.5, changeFrequency: MONTHLY },
  { path: "/lucky-plan-policy", priority: 0.5, changeFrequency: MONTHLY },
  { path: "/business-compliance", priority: 0.5, changeFrequency: MONTHLY },
  { path: "/udyam-msme", priority: 0.5, changeFrequency: MONTHLY },
  { path: "/data-requests", priority: 0.4, changeFrequency: MONTHLY },
  { path: "/legal/terms", priority: 0.4, changeFrequency: MONTHLY },
  { path: "/legal/privacy", priority: 0.4, changeFrequency: MONTHLY },
  { path: "/legal/policies", priority: 0.4, changeFrequency: MONTHLY },
  { path: "/legal/disclaimer", priority: 0.4, changeFrequency: MONTHLY },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getPublicSiteUrl();
  const now = new Date();

  return STATIC_ROUTES.map(({ path, priority, changeFrequency }) => ({
    url: `${siteUrl}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }));
}
