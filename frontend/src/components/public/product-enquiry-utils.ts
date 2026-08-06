import { ROUTES } from "@/lib/routes";
import type { PublicProduct } from "@/services/public";

export type ProductPlanInterest = "NOT_SURE" | "LUCKY_PLAN" | "RENT" | "LEASE" | "DIRECT_SALE";

export function buildProductEnquiryHref(
  product: PublicProduct, 
  planInterest: ProductPlanInterest = "NOT_SURE",
  variantSku?: string,
  stockStatus?: string
) {
  const params = new URLSearchParams();
  params.set("product", String(product.id));
  params.set("product_name", product.name);
  params.set("product_code", variantSku || product.product_code);
  params.set("price", product.base_price);
  params.set("plan_interest", planInterest);
  params.set("source", "product_detail");
  if (stockStatus) {
    params.set("stock_status", stockStatus);
  }

  return `${ROUTES.public.apply}?${params.toString()}`;
}
