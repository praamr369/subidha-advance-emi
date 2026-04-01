import type { Metadata } from "next";
import Link from "next/link";

import ErrorState from "@/components/feedback/ErrorState";
import PublicFooter from "@/components/ui/public-footer";
import PublicNav from "@/components/ui/public-nav";
import { ROUTES } from "@/lib/routes";
import { listPublicProducts, type PublicProduct } from "@/services/public";
import ProductGrid from "./ProductGrid";

export const metadata: Metadata = {
  title: "Products",
  description:
    "Browse the live Subidha Furniture public catalog before moving into the Lucky Plan apply flow.",
};

export default async function ProductsPage() {
  let products: PublicProduct[] = [];
  let count = 0;
  let error: string | null = null;

  try {
    const payload = await listPublicProducts();
    products = payload.products;
    count = payload.count;
  } catch (err) {
    error = err instanceof Error ? err.message : "Unable to load products right now.";
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PublicNav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 lg:px-8">
        <section className="mb-12 rounded-2xl bg-gradient-to-br from-primary/5 via-primary/10 to-transparent p-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Our Product Catalog
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Browse the live public furniture catalog, then move directly into a
            real Lucky Plan application with the right product context.
          </p>
          <div className="mt-6 flex justify-center gap-4">
            <div className="rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
              {count} Products Available
            </div>
            <Link
              href={ROUTES.public.apply}
              className="rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
            >
              Open Apply Form
            </Link>
          </div>
        </section>

        {error ? (
          <ErrorState
            title="Unable to load products"
            description={error}
          />
        ) : (
          <ProductGrid products={products} />
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
