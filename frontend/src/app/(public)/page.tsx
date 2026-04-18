import type { Metadata } from "next";
import Link from "next/link";

import BrandLockup from "@/components/public/BrandLockup";
import BlogCard from "@/components/public/BlogCard";
import CtaBanner from "@/components/public/CtaBanner";
import PublicProductMedia from "@/components/public/PublicProductMedia";
import SectionHeader from "@/components/public/SectionHeader";
import TrustStrip from "@/components/public/TrustStrip";
import WinnerSpotlight from "@/components/public/WinnerSpotlight";
import { getAllBlogPosts } from "@/lib/blog-data";
import { formatCurrency } from "@/lib/format";
import { getPublicLatestWinner, getPublicStats, listPublicProducts } from "@/lib/public-api";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Home",
  description:
    "Subidha Furniture in Asansol offers furniture access through a structured monthly plan and a transparent Lucky Plan winner process with future EMI waiver.",
};

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

export default async function PublicHome() {
  const blogPosts = getAllBlogPosts().slice(0, 3);

  const [statsResult, latestWinnerResult, productsResult] = await Promise.allSettled([
    getPublicStats(),
    getPublicLatestWinner(),
    listPublicProducts(),
  ]);

  const stats = statsResult.status === "fulfilled" ? statsResult.value : null;
  const latestWinner =
    latestWinnerResult.status === "fulfilled" ? latestWinnerResult.value.winner : null;
  const products =
    productsResult.status === "fulfilled" ? productsResult.value.products.slice(0, 6) : [];

  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <section className="relative overflow-hidden rounded-[2.25rem] border border-white/75 bg-[radial-gradient(circle_at_top_right,rgba(125,211,252,0.18),transparent_28%),radial-gradient(circle_at_top_left,rgba(251,191,36,0.14),transparent_24%),linear-gradient(140deg,rgba(255,255,255,0.98),rgba(248,250,252,0.92))] p-8 shadow-[0_32px_90px_-52px_rgba(15,23,42,0.68)] sm:p-10">
        <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-slate-300/80 to-transparent" />
        <div className="pointer-events-none absolute -right-20 top-0 h-48 w-48 rounded-full bg-sky-200/30 blur-3xl" />
        <div className="pointer-events-none absolute left-0 top-24 h-40 w-40 rounded-full bg-amber-200/25 blur-3xl" />
        <div className="grid gap-8 lg:grid-cols-[1.25fr_0.75fr] lg:items-center">
          <div>
            <BrandLockup subtitle="Asansol, West Bengal · Lucky Plan EMI" />
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-[3.4rem]">
              Bring Home Furniture with a Smarter Monthly Plan
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
              Subidha Furniture helps families access furniture through a structured
              monthly plan and a transparent Lucky Plan system: join a batch, receive
              a Lucky ID, pay EMI month by month, and see published winners with a
              future EMI waiver benefit.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={ROUTES.public.products}
                className="inline-flex h-11 items-center rounded-xl border border-slate-900/10 bg-slate-900 px-5 text-sm font-medium text-white shadow-[0_18px_40px_-28px_rgba(15,23,42,0.82)] transition hover:-translate-y-0.5"
              >
                View Products
              </Link>
              <Link
                href={ROUTES.public.luckyPlan}
                className="inline-flex h-11 items-center rounded-xl border border-white/75 bg-white/75 px-5 text-sm font-medium text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] transition hover:-translate-y-0.5 hover:bg-white"
              >
                Explore Lucky Plan
              </Link>
              <Link
                href={ROUTES.public.contact}
                className="inline-flex h-11 items-center rounded-xl border border-white/75 bg-white/75 px-5 text-sm font-medium text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] transition hover:-translate-y-0.5 hover:bg-white"
              >
                Contact
              </Link>
            </div>
          </div>

          <div className="rounded-[1.9rem] border border-white/75 bg-white/72 p-6 shadow-[0_26px_60px_-44px_rgba(15,23,42,0.64)] backdrop-blur">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Quick overview
            </div>
            <div className="mt-4 grid gap-3">
              <div className="rounded-[1.4rem] border border-white/75 bg-white/75 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]">
                <div className="font-medium text-foreground">Typical cycle</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  15-month structured plan with clear monthly EMI tracking.
                </p>
              </div>
              <div className="rounded-[1.4rem] border border-white/75 bg-white/75 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]">
                <div className="font-medium text-foreground">Lucky IDs</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  00–99 per batch, assigned based on availability.
                </p>
              </div>
              <div className="rounded-[1.4rem] border border-white/75 bg-white/75 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]">
                <div className="font-medium text-foreground">Winner benefit</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Waiver of remaining future EMI only (no refund of past EMI).
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <TrustStrip />

      <section className="grid gap-6 rounded-[2rem] border border-white/75 bg-white/70 p-6 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.6)]">
        <SectionHeader
          eyebrow="Lucky Plan, explained"
          title="What is Lucky Plan?"
          description="A structured monthly purchase plan with a transparent monthly winner publication cycle."
        />
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-[1.8rem] border border-white/75 bg-white/82 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.76)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              The flow
            </div>
            <ol className="mt-4 grid gap-2 text-sm leading-6 text-muted-foreground">
              <li className="rounded-xl border border-white/75 bg-white/70 px-4 py-3">
                1) Join a batch and receive a Lucky ID (00–99).
              </li>
              <li className="rounded-xl border border-white/75 bg-white/70 px-4 py-3">
                2) Pay EMI month by month on a clear schedule.
              </li>
              <li className="rounded-xl border border-white/75 bg-white/70 px-4 py-3">
                3) One winner is selected per batch per month and published when revealed.
              </li>
              <li className="rounded-xl border border-white/75 bg-white/70 px-4 py-3">
                4) Winner benefit applies to future EMI waiver only (no refund of past paid EMI).
              </li>
            </ol>
          </div>
          <div className="rounded-[1.8rem] border border-white/75 bg-white/82 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.76)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Fairness & transparency
            </div>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">
              The monthly draw is designed for verifiable transparency using a commit–reveal approach.
              In simple terms, a commitment is published first (SHA-256 hash), and the reveal is published later.
              This helps ensure the published outcome matches what was committed earlier.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href={ROUTES.public.howItWorks}
                className="inline-flex h-10 items-center rounded-xl border border-white/80 bg-white/80 px-4 text-sm font-semibold text-foreground shadow-[0_16px_34px_-26px_rgba(15,23,42,0.6)] transition hover:-translate-y-0.5 hover:bg-white"
              >
                See steps
              </Link>
              <Link
                href={ROUTES.public.winnerHistory}
                className="inline-flex h-10 items-center rounded-xl border border-white/80 bg-white/80 px-4 text-sm font-semibold text-foreground shadow-[0_16px_34px_-26px_rgba(15,23,42,0.6)] transition hover:-translate-y-0.5 hover:bg-white"
              >
                Winner history
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-[2rem] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] p-6 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.6)]">
        <SectionHeader
          eyebrow="Live public stats"
          title="Live public business signals"
          description="These indicators come from the live public API and reflect real production records."
        />
        {stats ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Published batches", value: stats.total_batches },
              { label: "Total subscriptions", value: stats.total_subscriptions },
              { label: "Active subscriptions", value: stats.active_subscriptions },
              { label: "Published winners", value: stats.total_winners },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-[1.8rem] border border-white/75 bg-white/80 p-5 shadow-[0_24px_60px_-44px_rgba(15,23,42,0.6)]"
              >
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {item.label}
                </div>
                <div className="mt-4 text-3xl font-semibold tracking-tight text-foreground">
                  {item.value.toLocaleString("en-IN")}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-[1.6rem] border border-white/75 bg-white/80 px-5 py-4 text-sm text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.76)]">
            Live public stats are currently unavailable.
          </div>
        )}
      </section>

      <section className="space-y-4">
        <SectionHeader
          eyebrow="Winner spotlight"
          title="Latest winner"
          description="Published only from revealed lucky draw records. If no draw has been published yet, the public site shows that directly."
        />
        <WinnerSpotlight winner={latestWinner} />
      </section>

      <section className="space-y-4 rounded-[2rem] border border-white/75 bg-white/70 p-6 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.6)]">
        <SectionHeader
          eyebrow="Live catalogue"
          title="Featured products"
          description="These products are loaded from the live public catalogue. If the catalogue is empty, the site shows an honest empty state."
        >
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={ROUTES.public.products}
              className="inline-flex h-10 items-center rounded-xl border border-white/80 bg-white/80 px-4 text-sm font-semibold text-foreground shadow-[0_16px_34px_-26px_rgba(15,23,42,0.6)] transition hover:-translate-y-0.5 hover:bg-white"
            >
              Browse all products
            </Link>
            <Link
              href={ROUTES.public.apply}
              className="inline-flex h-10 items-center rounded-xl border border-slate-950/10 bg-slate-950 px-4 text-sm font-semibold text-white shadow-[0_16px_34px_-26px_rgba(15,23,42,0.6)] transition hover:-translate-y-0.5"
            >
              Apply / Enquire
            </Link>
          </div>
        </SectionHeader>

        {products.length === 0 ? (
          <div className="rounded-[1.6rem] border border-white/75 bg-white/80 px-5 py-4 text-sm leading-6 text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.76)]">
            No products are currently published in the public catalogue. You can still contact the branch to ask about available batches and product options.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {products.map((product) => (
              <div
                key={product.id}
                className="group rounded-[2rem] border border-white/75 bg-white/82 p-5 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.62)]"
              >
                <Link href={`${ROUTES.public.products}/${product.id}`}>
                  <PublicProductMedia
                    src={product.image}
                    alt={product.name}
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="aspect-[5/4]"
                    imageClassName="transition duration-500 group-hover:scale-[1.02]"
                    badge={product.category || "Product"}
                  />
                </Link>
                <div className="mt-4">
                  <div className="text-lg font-semibold text-foreground">
                    {product.name}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {product.product_code}
                  </div>
                  <div className="mt-3 text-base font-semibold text-foreground">
                    {formatCurrency(product.base_price)}
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
                    {product.description?.trim() ||
                      "Published in the live Subidha Furniture catalogue."}
                  </p>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={buildApplyHref(product)}
                    className="inline-flex h-10 items-center rounded-xl border border-white/80 bg-white/80 px-4 text-sm font-semibold text-foreground shadow-[0_16px_34px_-26px_rgba(15,23,42,0.6)] transition hover:bg-white"
                  >
                    Enquire
                  </Link>
                  <Link
                    href={`${ROUTES.public.products}/${product.id}`}
                    className="inline-flex h-10 items-center rounded-xl border border-white/80 bg-white/80 px-4 text-sm font-semibold text-foreground shadow-[0_16px_34px_-26px_rgba(15,23,42,0.6)] transition hover:bg-white"
                  >
                    View
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-[2rem] border border-white/75 bg-white/70 p-6 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.6)]">
        <SectionHeader
          eyebrow="Learn"
          title="Blog"
          description="Plain-language guidance on Lucky Plan rules, winner transparency, and choosing furniture with a monthly plan."
        />
        <div className="grid gap-6 lg:grid-cols-3">
          {blogPosts.map((post) => (
            <BlogCard key={post.slug} post={post} />
          ))}
        </div>
        <div>
          <Link
            href={ROUTES.public.blog}
            className="inline-flex h-10 items-center rounded-xl border border-white/80 bg-white/80 px-4 text-sm font-semibold text-foreground shadow-[0_16px_34px_-26px_rgba(15,23,42,0.6)] transition hover:-translate-y-0.5 hover:bg-white"
          >
            View all articles
          </Link>
        </div>
      </section>

      <CtaBanner
        title="Ready to check products or join a batch?"
        description="Browse the live catalogue, learn the Lucky Plan rules, and submit an enquiry so the branch can follow up with batch availability and plan guidance."
        actions={[
          { href: ROUTES.public.products, label: "View Products", variant: "primary" },
          { href: ROUTES.public.contact, label: "Contact", variant: "secondary" },
        ]}
      />
    </main>
  );
}
