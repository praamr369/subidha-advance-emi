import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import ProductDetailWorkflowBoundary from "@/components/public/ProductDetailWorkflowBoundary";
import ProductEnquiryHandoffPanel, { buildProductEnquiryHref } from "@/components/public/ProductEnquiryHandoffPanel";
import PublicPageShell from "@/components/public/PublicPageShell";
import PublicProductDetailMedia from "@/components/public/PublicProductDetailMedia";
import { getPublicDictionary } from "@/lib/public-i18n";
import { getPublicLocale } from "@/lib/public-i18n.server";
import { getPublicProductDetail } from "@/lib/public-api";
import { ROUTES } from "@/lib/routes";

type ProductDetailPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: ProductDetailPageProps): Promise<Metadata> {
  const { id } = await params;

  try {
    const product = await getPublicProductDetail(id);

    if (!product) {
      return {
        title: "Product Not Found",
        description: "The requested public product could not be found.",
      };
    }

    return {
      title: product.name,
      description:
        product.description ||
        `${product.name} is available in the live Subidha Furniture public catalogue for enquiry handoff.`,
    };
  } catch {
    return {
      title: "Product Detail",
      description: "Live public product detail and enquiry handoff.",
    };
  }
}

export default async function ProductDetailPage({ params }: ProductDetailPageProps) {
  const { id } = await params;
  const product = await getPublicProductDetail(id);

  if (!product) {
    notFound();
  }

  const locale = await getPublicLocale();
  const dictionary = getPublicDictionary(locale);

  const applyHref = buildProductEnquiryHref(product);
  const hasMedia = Boolean(product.image) || (product.gallery_images?.length ?? 0) > 0;
  const mediaState = hasMedia ? "Uploaded product media" : "Media pending";
  const factRows = [
    { label: "Product code", value: product.product_code || "Unassigned" },
    { label: "Category", value: product.category || "Not classified" },
    { label: "Subcategory", value: product.subcategory || "Not classified" },
    { label: "Media state", value: mediaState },
  ];

  return (
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

      <section className="public-surface relative overflow-hidden p-6 sm:p-8 lg:p-10">
        <div className="pointer-events-none absolute inset-x-14 top-0 h-px bg-gradient-to-r from-transparent via-[var(--surface-border-strong)]/70 to-transparent" />
        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <div className="space-y-4">
            <PublicProductDetailMedia
              product={product}
              carouselAriaLabel={dictionary.common.mediaCarousel.productGalleryLabel}
              prevLabel={dictionary.common.mediaCarousel.previousSlide}
              nextLabel={dictionary.common.mediaCarousel.nextSlide}
            />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {factRows.map((fact) => (
                <div
                  key={fact.label}
                  className="public-card p-4 shadow-[0_18px_38px_-28px_rgba(15,23,42,0.24)] dark:shadow-none"
                >
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {fact.label}
                  </div>
                  <div className="mt-2 text-sm font-medium text-foreground">
                    {fact.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <ProductEnquiryHandoffPanel product={product} />
        </div>
      </section>

      <ProductDetailWorkflowBoundary />
    </PublicPageShell>
  );
}
