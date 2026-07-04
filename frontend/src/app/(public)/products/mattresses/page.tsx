import type { Metadata } from "next";
import { notFound } from "next/navigation";

import ProductCategoryLanding from "@/components/public/ProductCategoryLanding";
import { getSeoCategory } from "@/lib/product-category-seo";
import { buildPublicMetadata } from "@/lib/public-seo";

const CATEGORY_SLUG = "mattresses";
const category = getSeoCategory(CATEGORY_SLUG);

export const metadata: Metadata = buildPublicMetadata({
  title: category?.metaTitle ?? "Furniture in Asansol",
  description: category?.metaDescription ?? "Furniture at Subidha Furniture, Asansol.",
  path: `/products/${CATEGORY_SLUG}`,
});

export default function Page() {
  if (!category) notFound();
  return <ProductCategoryLanding category={category} />;
}
