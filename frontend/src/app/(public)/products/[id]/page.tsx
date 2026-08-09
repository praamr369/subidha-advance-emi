import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Suspense } from "react";

import ProductDetailWorkflowBoundary from "@/components/public/ProductDetailWorkflowBoundary";
import ProductEnquiryHandoffPanel from "@/components/public/ProductEnquiryHandoffPanel";
import { buildProductEnquiryHref } from "@/components/public/product-enquiry-utils";
import PublicPageShell from "@/components/public/PublicPageShell";
import PublicProductInteractiveDetail from "@/components/public/PublicProductInteractiveDetail";
import PublicSeoJsonLd from "@/components/public/PublicSeoJsonLd";
import { getPublicDictionary } from "@/lib/public-i18n";
import { getPublicLocale } from "@/lib/public-i18n.server";
import { getPublicProductDetail } from "@/lib/public-api";
import { buildProductJsonLd, buildPublicMetadata } from "@/lib/public-seo";
import { ROUTES } from "@/lib/routes";

type ProductDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function generateMetadata({
  params,
}: ProductDetailPageProps): Promise<Metadata> {
  const { id } = await params;

  try {
    const product = await getPublicProductDetail(id);

    if (!product) {
      return buildPublicMetadata({
        title: "Product Not Found",
        description: "The requested public product could not be found.",
        path: `/products/${id}`,
        noIndex: true,
      });
    }

    return buildPublicMetadata({
      title: product.name,
      description:
        product.description ||
        `${product.name} is available in the live Subidha Furniture public catalogue for enquiry handoff.`,
      path: `/products/${id}`,
      imagePath: product.image || undefined,
    });
  } catch {
    return buildPublicMetadata({
      title: "Product Detail",
      description: "Live public product detail and enquiry handoff.",
      path: `/products/${id}`,
    });
  }
}

export default async function ProductDetailPage({ params, searchParams }: ProductDetailPageProps) {
  const { id } = await params;
  const product = await getPublicProductDetail(id);

  if (!product) {
    notFound();
  }

  const resolvedSearchParams = (await searchParams) || {};
  
  // Build selected attributes from searchParams for initial hydration
  const selectedAttributes: Record<string, string> = {};
  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    if (key.startsWith("attr_") && typeof value === "string") {
      selectedAttributes[key.replace("attr_", "")] = value;
    }
  }

  const locale = await getPublicLocale();
  const dictionary = getPublicDictionary(locale);

  const applyHref = buildProductEnquiryHref(product);

  const productJsonLd = buildProductJsonLd({
    name: product.name,
    path: `/products/${product.id}`,
    description: product.description,
    image: product.image,
    category: product.category,
    sku: product.product_code,
    price: product.base_price,
  });

  return (
    <>
    <PublicSeoJsonLd payload={productJsonLd} />
    <PublicPageShell
      title={product.name}
      subtitle={
        product.description?.trim() ||
        "This product is published in the live Subidha Furniture catalogue and can be carried into a branch-reviewed enquiry workflow."
      }
      breadcrumbs={[
        { label: "Home", href: ROUTES.public.home },
        { label: "Products", href: ROUTES.public.products },
        { label: "Product" },
      ]}
      actions={[
        { label: "Enquire", href: applyHref, variant: "primary" },
        { label: "Contact", href: ROUTES.public.contact, variant: "secondary" },
      ]}
    >
      <Link
        href={ROUTES.public.products}
        className="inline-flex items-center gap-2 rounded-lg text-sm font-medium text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/45 focus-visible:ring-offset-2"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to catalogue
      </Link>

      <PublicProductInteractiveDetail
        initialProduct={product}
        initialSelectedAttributes={selectedAttributes}
        dict={dictionary}
      />

      <ProductDetailWorkflowBoundary />
    </PublicPageShell>
    </>
  );
}
