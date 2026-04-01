import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ShoppingCart } from "lucide-react";

import PublicFooter from "@/components/ui/public-footer";
import PublicNav from "@/components/ui/public-nav";
import { ROUTES } from "@/lib/routes";
import { getPublicProductDetail } from "@/services/public";

type ProductDetailPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: ProductDetailPageProps): Promise<Metadata> {
  const { id } = await params;
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
      `${product.name} is available in the Subidha Furniture public catalog.`,
  };
}

function buildApplyHref(product: {
  id: number;
  name: string;
  product_code: string;
  base_price: string;
}) {
  const params = new URLSearchParams();
  params.set("product", String(product.id));
  params.set("product_name", product.name);
  params.set("product_code", product.product_code);
  params.set("price", product.base_price);

  return `${ROUTES.public.apply}?${params.toString()}`;
}

export default async function ProductDetailPage({
  params,
}: ProductDetailPageProps) {
  const { id } = await params;
  const product = await getPublicProductDetail(id);

  if (!product) {
    notFound();
  }

  const price = parseFloat(product.base_price).toFixed(2);
  const applyHref = buildApplyHref(product);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PublicNav />
      <main className="container mx-auto flex-1 px-4 py-8 lg:px-8">
        <Link
          href={ROUTES.public.products}
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Catalog
        </Link>

        <div className="grid gap-8 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-muted">
              {product.image ? (
                <Image
                  src={product.image}
                  alt={product.name}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 50vw"
                  priority
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <span className="text-sm">No image available</span>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <div className="mb-2 text-sm text-muted-foreground">
                {product.product_code}
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                {product.name}
              </h1>
              {product.category ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    {product.category}
                  </span>
                  {product.subcategory ? (
                    <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                      {product.subcategory}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="border-t border-border pt-6">
              <div className="text-3xl font-bold text-primary">₹{price}</div>
              <p className="mt-2 text-sm text-muted-foreground">
                Use Apply to send this exact product context into a real enquiry.
              </p>
            </div>

            {product.description ? (
              <div className="border-t border-border pt-6">
                <h2 className="text-lg font-semibold text-foreground">Description</h2>
                <p className="mt-2 whitespace-pre-line text-muted-foreground">
                  {product.description}
                </p>
              </div>
            ) : null}

            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-foreground">Next step</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                The enquiry flow will carry this product reference into the
                application form so the branch can follow up with the correct
                catalog context.
              </p>

              <div className="mt-5 flex gap-4">
                <Link
                  href={applyHref}
                  className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-medium text-primary-foreground transition hover:opacity-95"
                >
                  <ShoppingCart className="h-5 w-5" />
                  Enquire Now
                </Link>
                <Link
                  href={ROUTES.public.contact}
                  className="inline-flex h-12 items-center justify-center rounded-xl border border-border bg-background px-6 text-sm font-medium text-foreground transition hover:bg-muted"
                >
                  Contact Us
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
