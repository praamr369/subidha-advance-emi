import type { Metadata } from "next";
import Link from "next/link";

import PublicPageShell from "@/components/public/PublicPageShell";
import { ROUTES } from "@/lib/routes";
import { listPublicProducts, type PublicProduct } from "@/lib/public-api";
import ProductGrid from "./ProductGrid";

export const metadata: Metadata = {
  title: "Products",
  description:
    "Browse Subidha Furniture’s live public catalogue. Products are loaded from the real backend product master and rendered with safe empty states.",
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

  const mediaReadyCount = products.filter((product) => Boolean(product.image)).length;

  return (
    <PublicPageShell
      title="Products"
      subtitle="Browse the live catalogue and carry the product context into the Lucky Plan enquiry flow."
      breadcrumbs={[
        { label: "Home", href: ROUTES.public.home },
        { label: "Products" },
      ]}
      actions={[
        { label: "Lucky Plan", href: ROUTES.public.luckyPlan, variant: "secondary" },
        { label: "Apply", href: ROUTES.public.apply, variant: "primary" },
      ]}
    >
      <section className="rounded-[2rem] border border-white/75 bg-white/70 p-6 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.6)]">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-[1.5rem] border border-white/80 bg-white/82 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Published products
            </div>
            <div className="mt-2 text-3xl font-semibold text-foreground">{count}</div>
            <p className="mt-2 text-sm text-muted-foreground">
              Products currently visible to customers on the public website.
            </p>
          </div>
          <div className="rounded-[1.5rem] border border-white/80 bg-white/82 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Media-ready cards
            </div>
            <div className="mt-2 text-3xl font-semibold text-foreground">
              {mediaReadyCount}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Catalogue entries currently carrying uploaded product media.
            </p>
          </div>
          <div className="rounded-[1.5rem] border border-white/80 bg-white/82 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Workflow
            </div>
            <div className="mt-2 text-lg font-semibold text-foreground">
              Browse → Inspect → Enquire
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Product context stays attached when you open the enquiry form.
            </p>
          </div>
        </div>

        {error ? (
          <div className="mt-6 rounded-[1.6rem] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
            {error}
          </div>
        ) : (
          <div className="mt-6">
            <ProductGrid products={products} />
          </div>
        )}
      </section>

      <section className="rounded-[2rem] border border-white/75 bg-white/70 p-6 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.6)]">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Note
        </div>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          Product price shown here is the base price from the live master. Batch availability and plan onboarding details are confirmed by the branch during follow-up.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={ROUTES.public.apply}
            className="inline-flex h-10 items-center rounded-xl border border-slate-950/10 bg-slate-950 px-4 text-sm font-semibold text-white shadow-[0_16px_34px_-26px_rgba(15,23,42,0.6)] transition hover:-translate-y-0.5"
          >
            Apply / Enquire
          </Link>
          <Link
            href={ROUTES.public.contact}
            className="inline-flex h-10 items-center rounded-xl border border-white/80 bg-white/80 px-4 text-sm font-semibold text-foreground shadow-[0_16px_34px_-26px_rgba(15,23,42,0.6)] transition hover:-translate-y-0.5 hover:bg-white"
          >
            Contact branch
          </Link>
        </div>
      </section>
    </PublicPageShell>
  );
}

