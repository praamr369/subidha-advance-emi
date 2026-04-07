import type { Metadata } from "next";
import Link from "next/link";

import BrandLockup from "@/components/public/BrandLockup";
import ErrorState from "@/components/feedback/ErrorState";
import PublicFooter from "@/components/ui/public-footer";
import PublicNav from "@/components/ui/public-nav";
import { ROUTES } from "@/lib/routes";
import { listPublicProducts, type PublicProduct } from "@/services/public";
import ProductGrid from "./ProductGrid";

export const metadata: Metadata = {
  title: "Products",
  description:
    "Browse the live Subidha Furniture public catalogue with real product media, product pricing, and direct Lucky Plan enquiry handoff.",
};

const trustPoints = [
  "Live public catalogue entries only",
  "Base price comes from the real product master",
  "Enquiry handoff keeps product context intact",
];

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
    <div className="flex min-h-screen flex-col bg-[linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)]">
      <PublicNav />
      <main className="mx-auto flex w-full max-w-[1320px] flex-1 flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <section className="relative overflow-hidden rounded-[2.5rem] border border-white/75 bg-[radial-gradient(circle_at_top_right,rgba(125,211,252,0.18),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(251,191,36,0.16),transparent_24%),linear-gradient(140deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] p-8 shadow-[0_34px_90px_-58px_rgba(15,23,42,0.78)] sm:p-10">
          <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent" />
          <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div>
              <BrandLockup subtitle="Public furniture catalogue with real media, pricing, and direct enquiry flow" />
              <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                Explore the live product catalogue before you enter the Lucky Plan flow.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
                Every product card comes from the real product master. Browse pricing,
                inspect media, and carry the exact product reference into the enquiry form.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href={ROUTES.public.apply}
                  className="inline-flex h-11 items-center rounded-xl bg-slate-950 px-5 text-sm font-medium text-white shadow-[0_20px_42px_-30px_rgba(15,23,42,0.88)] transition hover:-translate-y-0.5"
                >
                  Open enquiry form
                </Link>
                <Link
                  href={ROUTES.public.winnerHistory}
                  className="inline-flex h-11 items-center rounded-xl border border-white/80 bg-white/82 px-5 text-sm font-medium text-foreground shadow-[0_20px_42px_-30px_rgba(15,23,42,0.74)] transition hover:-translate-y-0.5 hover:bg-white"
                >
                  Review winner history
                </Link>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/80 bg-white/76 p-6 shadow-[0_26px_60px_-42px_rgba(15,23,42,0.74)] backdrop-blur">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Public catalogue status
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div className="rounded-[1.5rem] border border-white/80 bg-white/82 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Published products
                  </div>
                  <div className="mt-2 text-3xl font-semibold text-foreground">{count}</div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Live products visible to customers and public enquiries.
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
                    Product context stays attached when the enquiry form opens.
                  </p>
                </div>
              </div>
              <div className="mt-5 grid gap-2">
                {trustPoints.map((point) => (
                  <div
                    key={point}
                    className="rounded-[1.2rem] border border-white/75 bg-white/74 px-4 py-3 text-sm text-slate-700 shadow-[0_16px_32px_-28px_rgba(15,23,42,0.72)]"
                  >
                    {point}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {error ? (
          <section className="rounded-[2rem] border border-white/75 bg-white/85 p-6 shadow-[0_24px_60px_-48px_rgba(15,23,42,0.72)]">
            <ErrorState
              title="Unable to load products"
              description={error}
            />
          </section>
        ) : (
          <ProductGrid products={products} />
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
