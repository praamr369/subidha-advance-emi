import type { MetadataRoute } from "next";

import { listPublicProducts } from "@/lib/public-api";
import { getPublicSiteUrl } from "@/lib/public-seo";

const DAILY = "daily" as const;
const WEEKLY = "weekly" as const;
const MONTHLY = "monthly" as const;

// Static public pages with their crawl priority
const STATIC_ROUTES: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }> = [
  { path: "/", priority: 1.0, changeFrequency: DAILY },
  { path: "/furniture-store-asansol", priority: 0.95, changeFrequency: WEEKLY },
  { path: "/lucky-plan-emi-furniture-asansol", priority: 0.95, changeFrequency: WEEKLY },
  { path: "/delivery-asansol", priority: 0.85, changeFrequency: MONTHLY },
  { path: "/products", priority: 0.9, changeFrequency: DAILY },
  { path: "/products/beds", priority: 0.85, changeFrequency: WEEKLY },
  { path: "/products/sofas", priority: 0.85, changeFrequency: WEEKLY },
  { path: "/products/wardrobes", priority: 0.85, changeFrequency: WEEKLY },
  { path: "/products/dining-tables", priority: 0.85, changeFrequency: WEEKLY },
  { path: "/products/mattresses", priority: 0.85, changeFrequency: WEEKLY },
  { path: "/products/appliances", priority: 0.85, changeFrequency: WEEKLY },
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

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getPublicSiteUrl();
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map(({ path, priority, changeFrequency }) => ({
    url: `${siteUrl}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }));

  // Base product pages (blueprint-level, one per product family)
  let productEntries: MetadataRoute.Sitemap = [];
  // Variant SKU pages (one per variant — has its own price, attributes, URL)
  let variantEntries: MetadataRoute.Sitemap = [];

  try {
    // Fetch all published products including variant SKUs in one call
    const { products } = await listPublicProducts({ include_variants: true });

    for (const product of products) {
      if (product.is_variant_page) {
        // Variant pages: slightly lower priority than base, but still indexed
        // so search engines can find size/type-specific pages directly
        variantEntries.push({
          url: `${siteUrl}/products/${product.id}`,
          lastModified: now,
          changeFrequency: WEEKLY,
          priority: 0.55,
        });
      } else {
        productEntries.push({
          url: `${siteUrl}/products/${product.id}`,
          lastModified: now,
          changeFrequency: WEEKLY,
          priority: 0.7,
        });
      }
    }
  } catch {
    productEntries = [];
    variantEntries = [];
  }

  return [...staticEntries, ...productEntries, ...variantEntries];
}
