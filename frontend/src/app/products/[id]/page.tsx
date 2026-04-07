import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, ShoppingCart } from "lucide-react";

import PublicProductMedia from "@/components/public/PublicProductMedia";
import PublicFooter from "@/components/ui/public-footer";
import PublicNav from "@/components/ui/public-nav";
import { formatCurrency } from "@/lib/format";
import { ROUTES } from "@/lib/routes";
import { getPublicProductDetail } from "@/services/public";

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
        `${product.name} is available in the live Subidha Furniture public catalogue.`,
    };
  } catch {
    return {
      title: "Product Detail",
      description: "Live public product detail and enquiry handoff.",
    };
  }
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

  const applyHref = buildApplyHref(product);
  const mediaState = product.image ? "Uploaded product media" : "Media pending";
  const factRows = [
    { label: "Product code", value: product.product_code || "Unassigned" },
    { label: "Category", value: product.category || "Not classified" },
    { label: "Subcategory", value: product.subcategory || "Not classified" },
    { label: "Media state", value: mediaState },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-[linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)]">
      <PublicNav />
      <main className="mx-auto flex w-full max-w-[1320px] flex-1 flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <Link
          href={ROUTES.public.products}
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to catalogue
        </Link>

        <section className="relative overflow-hidden rounded-[2.5rem] border border-white/75 bg-[radial-gradient(circle_at_top_right,rgba(125,211,252,0.18),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(251,191,36,0.16),transparent_24%),linear-gradient(145deg,rgba(255,255,255,0.99),rgba(248,250,252,0.94))] p-6 shadow-[0_34px_90px_-58px_rgba(15,23,42,0.78)] sm:p-8 lg:p-10">
          <div className="pointer-events-none absolute inset-x-14 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent" />
          <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
            <div className="space-y-4">
              <PublicProductMedia
                src={product.image}
                alt={product.name}
                badge={product.category || "Public catalogue"}
                sizes="(max-width: 1024px) 100vw, 54vw"
                priority
                className="aspect-[5/4]"
                imageClassName="transition duration-500 hover:scale-[1.02]"
                fallbackLabel="Product media pending"
              />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {factRows.map((fact) => (
                  <div
                    key={fact.label}
                    className="rounded-[1.4rem] border border-white/80 bg-white/80 p-4 shadow-[0_18px_38px_-28px_rgba(15,23,42,0.74)]"
                  >
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {fact.label}
                    </div>
                    <div className="mt-2 text-sm font-medium text-foreground">
                      {fact.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Live public product detail
                </div>
                <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                  {product.name}
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
                  {product.description?.trim() ||
                    "This product is published in the live Subidha Furniture catalogue and can be carried directly into the Lucky Plan enquiry workflow."}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {product.category ? (
                  <span className="rounded-full border border-white/80 bg-white/85 px-3 py-1 text-xs font-medium text-slate-700 shadow-[0_16px_36px_-28px_rgba(15,23,42,0.72)]">
                    {product.category}
                  </span>
                ) : null}
                {product.subcategory ? (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                    {product.subcategory}
                  </span>
                ) : null}
                <span
                  className={[
                    "rounded-full border px-3 py-1 text-xs font-medium",
                    product.image
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-amber-200 bg-amber-50 text-amber-700",
                  ].join(" ")}
                >
                  {mediaState}
                </span>
              </div>

              <div className="rounded-[2rem] border border-white/80 bg-white/82 p-6 shadow-[0_26px_62px_-40px_rgba(15,23,42,0.74)]">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Base price
                </div>
                <div className="mt-2 text-4xl font-semibold tracking-tight text-foreground">
                  {formatCurrency(product.base_price)}
                </div>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  The enquiry form will carry this product reference and base price
                  so branch staff can follow up using the correct catalogue context.
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[1.4rem] border border-white/80 bg-white/82 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Enquiry path
                    </div>
                    <div className="mt-2 text-sm font-medium text-foreground">
                      Product context preserved
                    </div>
                  </div>
                  <div className="rounded-[1.4rem] border border-white/80 bg-white/82 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Public status
                    </div>
                    <div className="mt-2 text-sm font-medium text-foreground">
                      Live catalogue listing
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <Link
                    href={applyHref}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 px-6 text-sm font-medium text-white shadow-[0_20px_42px_-30px_rgba(15,23,42,0.88)] transition hover:-translate-y-0.5"
                  >
                    <ShoppingCart className="h-4 w-4" />
                    Enquire Now
                  </Link>
                  <Link
                    href={ROUTES.public.contact}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/80 bg-white/85 px-6 text-sm font-medium text-foreground shadow-[0_20px_42px_-30px_rgba(15,23,42,0.72)] transition hover:-translate-y-0.5 hover:bg-white"
                  >
                    Contact branch
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>

              <section className="rounded-[2rem] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] p-6 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.72)]">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Product identity
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[1.3rem] border border-white/80 bg-white/82 p-4 shadow-[0_16px_36px_-28px_rgba(15,23,42,0.72)]">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Catalogue reference
                    </div>
                    <div className="mt-2 text-base font-semibold text-foreground">
                      {product.product_code}
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      This code remains attached when the enquiry workflow opens.
                    </p>
                  </div>
                  <div className="rounded-[1.3rem] border border-white/80 bg-white/82 p-4 shadow-[0_16px_36px_-28px_rgba(15,23,42,0.72)]">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Media delivery
                    </div>
                    <div className="mt-2 text-base font-semibold text-foreground">
                      {mediaState}
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Uploaded backend media is rendered directly in the public catalogue view.
                    </p>
                  </div>
                </div>
              </section>

              <section className="rounded-[2rem] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] p-6 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.72)]">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  What happens next
                </div>
                <div className="mt-3 grid gap-3">
                  <div className="rounded-[1.3rem] border border-white/80 bg-white/80 px-4 py-3 text-sm text-slate-700 shadow-[0_16px_36px_-28px_rgba(15,23,42,0.72)]">
                    1. Open the enquiry form with this product already selected.
                  </div>
                  <div className="rounded-[1.3rem] border border-white/80 bg-white/80 px-4 py-3 text-sm text-slate-700 shadow-[0_16px_36px_-28px_rgba(15,23,42,0.72)]">
                    2. Submit your phone number and branch follow-up details.
                  </div>
                  <div className="rounded-[1.3rem] border border-white/80 bg-white/80 px-4 py-3 text-sm text-slate-700 shadow-[0_16px_36px_-28px_rgba(15,23,42,0.72)]">
                    3. The branch receives the same product context you reviewed here.
                  </div>
                </div>
              </section>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
