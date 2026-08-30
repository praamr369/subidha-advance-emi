import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Suspense } from "react";

import ProductDetailWorkflowBoundary from "@/components/public/ProductDetailWorkflowBoundary";
import ProductReviews from "@/components/public/ProductReviews";
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
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function generateMetadata({
  params,
}: ProductDetailPageProps): Promise<Metadata> {
  const { slug } = await params;

  try {
    const product = await getPublicProductDetail(slug);

    if (!product) {
      return buildPublicMetadata({
        title: "Product Not Found",
        description: "The requested public product could not be found.",
        path: `/products/${slug}`,
        noIndex: true,
      });
    }

    // For variant pages, build a richer title from the defining attributes
    // Prefer backend-computed seo_name, fall back to manual attribute assembly
    let title = product.seo_name || product.name;
    let description = product.description ?? "";
    if (product.is_variant_page && product.selected_attributes && !product.seo_name) {
      const attrParts = Object.entries(product.selected_attributes)
        .filter(([k]) => ["Size", "Color", "Bed Type", "Type", "Variant"].includes(k))
        .map(([, v]) => v);
      if (attrParts.length) title = `${product.name} — ${attrParts.join(", ")}`;
    }
    if (!description) {
      description = `${title} is available for enquiry at Subidha Furniture, Asansol. EMI, rent, lease and direct sale options available.`;
    }

    return buildPublicMetadata({
      title,
      description,
      path: `/products/${slug}`,
      imagePath: product.image || undefined,
    });
  } catch {
    return buildPublicMetadata({
      title: "Product Detail",
      description: "Live public product detail and enquiry handoff.",
      path: `/products/${slug}`,
    });
  }
}

export default async function ProductDetailPage({ params, searchParams }: ProductDetailPageProps) {
  const { slug } = await params;
  const product = await getPublicProductDetail(slug);

  if (!product) {
    notFound();
  }

  const resolvedSearchParams = (await searchParams) || {};

  // Build selected attributes: URL params take priority, then fall back to
  // the product's own selected_attributes (set by backend for variant pages).
  const selectedAttributes: Record<string, string> = {
    ...(product.selected_attributes ?? {}),
  };
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
    path: `/products/${product.product_code}`,
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
      title={product.seo_name || product.name}
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

      {/* Reviews section */}
      <div className="mt-10">
        <ProductReviews
          productId={product.id}
          productName={product.name}
        />
      </div>
    </PublicPageShell>
    </>
  );
}
