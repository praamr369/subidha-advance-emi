import type { Metadata } from "next";
import Link from "next/link";

<<<<<<< ours
import CtaBanner from "@/components/public/CtaBanner";
import PublicSeoJsonLd from "@/components/public/PublicSeoJsonLd";
=======
import BrandLockup from "@/components/public/BrandLockup";
import CtaBanner from "@/components/public/CtaBanner";
import PlanCategoryShowcase from "@/components/public/PlanCategoryShowcase";
import PublicMarketingBanner from "@/components/public/PublicMarketingBanner";
import SectionHeader from "@/components/public/SectionHeader";
>>>>>>> theirs
import TrustStrip from "@/components/public/TrustStrip";
import WinnerSpotlight from "@/components/public/WinnerSpotlight";
import { brandConfig } from "@/config/brand";
import { formatCurrency } from "@/lib/format";
<<<<<<< ours
<<<<<<< ours
import {
  buildPublicMetadata,
  getPublicDictionary,
} from "@/lib/public-i18n";
import { getPublicLocale } from "@/lib/public-i18n.server";
=======
import { getText, publicContent } from "@/lib/public-i18n";
import { getPublicLanguage } from "@/lib/public-i18n.server";
>>>>>>> theirs
=======
import { getText, publicContent } from "@/lib/public-i18n";
import { getPublicLanguage } from "@/lib/public-i18n.server";
>>>>>>> theirs
import { getPublicLatestWinner, getPublicStats, listPublicProducts } from "@/lib/public-api";
import { getResolvedPublicBusinessProfile } from "@/lib/public-profile";
import { buildOrganizationJsonLd, buildPublicMetadata } from "@/lib/public-seo";
import { ROUTES } from "@/lib/routes";

<<<<<<< ours
<<<<<<< ours
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getPublicLocale();
  const dictionary = getPublicDictionary(locale);
  return buildPublicMetadata({
    title: dictionary.seo.homeTitle,
    description: dictionary.seo.homeDescription,
    path: "/",
  });
}

export default async function PublicHome() {
  const locale = await getPublicLocale();
  const dictionary = getPublicDictionary(locale);
=======
=======
>>>>>>> theirs
export const metadata: Metadata = buildPublicMetadata({
  title: "Home",
  description:
    "Bring home furniture, electronics, and home appliances with easy monthly plans and transparent Lucky Plan winner publication.",
  path: "/",
});

function buildApplyHref(product: { id: number; name: string; product_code: string; base_price: string }) {
  const params = new URLSearchParams();
  params.set("product", String(product.id));
  params.set("product_name", product.name);
  params.set("product_code", product.product_code);
  params.set("price", product.base_price);
  return `${ROUTES.public.apply}?${params.toString()}`;
}

export default async function PublicHome() {
  const language = await getPublicLanguage();
<<<<<<< ours
>>>>>>> theirs
=======
>>>>>>> theirs
  const profile = await getResolvedPublicBusinessProfile();
  const [statsResult, latestWinnerResult, productsResult] = await Promise.allSettled([
    getPublicStats(),
    getPublicLatestWinner(),
    listPublicProducts(),
  ]);

  const stats = statsResult.status === "fulfilled" ? statsResult.value : null;
  const latestWinner = latestWinnerResult.status === "fulfilled" ? latestWinnerResult.value.winner : null;
  const products = productsResult.status === "fulfilled" ? productsResult.value.products.slice(0, 6) : [];
<<<<<<< ours
<<<<<<< ours

  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <PublicSeoJsonLd
        payload={{
          "@context": "https://schema.org",
          "@type": "LocalBusiness",
          name: profile.resolved_display_name,
          areaServed: brandConfig.publicBranchLocation,
          telephone: profile.support_phone || undefined,
          address: profile.address_text || undefined,
          url: "https://subidhafurniture.com",
        }}
      />

      <section className="public-hero p-8 sm:p-10">
        <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-[3.2rem]">
          {dictionary.homePage.title}
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
          {dictionary.homePage.subtitle}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={ROUTES.public.products} className="inline-flex h-11 items-center rounded-xl border border-slate-900/10 bg-slate-900 px-5 text-sm font-medium text-white">
            {dictionary.homePage.ctaProducts}
          </Link>
          <Link href={ROUTES.public.luckyPlan} className="inline-flex h-11 items-center rounded-xl border border-white/75 bg-white/75 px-5 text-sm font-medium text-foreground">
            {dictionary.homePage.ctaPlan}
          </Link>
          <Link href={ROUTES.public.contact} className="inline-flex h-11 items-center rounded-xl border border-white/75 bg-white/75 px-5 text-sm font-medium text-foreground">
            {dictionary.homePage.ctaContact}
          </Link>
=======
=======
>>>>>>> theirs

  const heroTitle = (profile.hero_title || "").trim() || getText(publicContent.homeHero.title, language);
  const heroSubtitle = (profile.hero_subtitle || "").trim() || getText(publicContent.homeHero.subtitle, language);

  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildOrganizationJsonLd()) }}
      />

      <section className="public-hero p-8 sm:p-10">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div>
            <BrandLockup
              logoSrc={profile.resolved_logo_src}
              companyName={profile.resolved_display_name}
              subtitle={`${profile.resolved_tagline} · ${brandConfig.publicBranchLocation}`}
            />
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-[3.2rem]">{heroTitle}</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">{heroSubtitle}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href={ROUTES.public.apply} className="inline-flex h-11 items-center rounded-xl border border-slate-900/10 bg-slate-900 px-5 text-sm font-semibold text-white">Apply now</Link>
              <Link href={ROUTES.public.products} className="inline-flex h-11 items-center rounded-xl border border-white/75 bg-white/75 px-5 text-sm font-semibold text-foreground">Explore products</Link>
              <Link href={ROUTES.public.luckyPlan} className="inline-flex h-11 items-center rounded-xl border border-white/75 bg-white/75 px-5 text-sm font-semibold text-foreground">See Lucky Plan</Link>
              <Link href={ROUTES.public.winners} className="inline-flex h-11 items-center rounded-xl border border-white/75 bg-white/75 px-5 text-sm font-semibold text-foreground">Visit winners</Link>
            </div>
          </div>

          <PublicMarketingBanner
            eyebrow="Featured categories"
            title="Designed for family shopping"
            description="Realistic product categories our customers ask for every day."
            items={[
              { title: "Furniture", description: "Sofas, beds, wardrobes, dining sets." },
              { title: "Electronics", description: "TV and essential home electronics." },
              { title: "Home appliances", description: "Refrigerator, washing machine, kitchen appliances." },
            ]}
          />
<<<<<<< ours
>>>>>>> theirs
=======
>>>>>>> theirs
        </div>
      </section>

      <TrustStrip />

<<<<<<< ours
<<<<<<< ours
      <section className="public-surface space-y-4 p-6">
        <h2 className="text-2xl font-semibold text-foreground">Why local families choose Subidha Furniture</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            "Easy monthly payment plans",
            "Clear Lucky Plan rules",
            "Branch support before and after purchase",
            "Transparent winner publication",
          ].map((item) => (
            <div key={item} className="public-card p-5 text-sm text-muted-foreground">{item}</div>
          ))}
        </div>
      </section>

      <section className="public-surface space-y-4 p-6">
        <h2 className="text-2xl font-semibold text-foreground">Featured categories for your home upgrade</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {["Sofas & living room furniture", "Beds & wardrobes", "Refrigerators & washing machines", "TVs and home appliances"].map((category) => (
            <div key={category} className="rounded-2xl border border-white/80 bg-white/80 p-4 text-sm font-medium text-foreground">{category}</div>
          ))}
        </div>
      </section>

      <section className="public-surface space-y-4 p-6">
        <h2 className="text-2xl font-semibold text-foreground">Easy monthly plan in 3 steps</h2>
        <ol className="grid gap-3 lg:grid-cols-3">
          {[
            "Choose product and preferred monthly budget.",
            "Join Lucky Plan batch and get your Lucky ID.",
            "Pay monthly EMI and track winner updates transparently.",
          ].map((step, index) => (
            <li key={step} className="public-card p-5 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">Step {index + 1}.</span> {step}
            </li>
          ))}
        </ol>
      </section>

      <section className="public-surface space-y-4 p-6">
        <h2 className="text-2xl font-semibold text-foreground">Popular products from live catalogue</h2>
        {products.length === 0 ? (
          <div className="public-card-sm px-5 py-4 text-sm text-muted-foreground">Catalogue items will appear as soon as published from the live backend.</div>
=======
      <PublicMarketingBanner
        eyebrow="Easy monthly plan"
        title="Simple process, transparent records"
        description="Choose a product, join an active batch, pay monthly EMI, and track published winners with no fake claims."
        items={[
          { title: "Clear monthly amount", description: "Know your monthly commitment before enrollment." },
          { title: "Transparent winner process", description: "Published records come from revealed draws only." },
          { title: "Support-first onboarding", description: "Branch team helps with product and document readiness." },
        ]}
      />

      <PlanCategoryShowcase />

      <section className="public-surface space-y-4 p-6">
=======
      <PublicMarketingBanner
        eyebrow="Easy monthly plan"
        title="Simple process, transparent records"
        description="Choose a product, join an active batch, pay monthly EMI, and track published winners with no fake claims."
        items={[
          { title: "Clear monthly amount", description: "Know your monthly commitment before enrollment." },
          { title: "Transparent winner process", description: "Published records come from revealed draws only." },
          { title: "Support-first onboarding", description: "Branch team helps with product and document readiness." },
        ]}
      />

      <PlanCategoryShowcase />

      <section className="public-surface space-y-4 p-6">
>>>>>>> theirs
        <SectionHeader eyebrow="Live public stats" title="Live public business signals" description="These indicators come from live public APIs and reflect production records." />
        {stats ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Published batches", value: stats.total_batches },
              { label: "Total subscriptions", value: stats.total_subscriptions },
              { label: "Active subscriptions", value: stats.active_subscriptions },
              { label: "Published winners", value: stats.total_winners },
            ].map((item) => (
              <div key={item.label} className="public-card p-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{item.label}</div>
                <div className="mt-4 text-3xl font-semibold tracking-tight text-foreground">{item.value.toLocaleString("en-IN")}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="public-card-sm px-5 py-4 text-sm text-muted-foreground">Live public stats are currently unavailable.</div>
        )}
      </section>

      <section className="space-y-4">
        <SectionHeader eyebrow="Winner spotlight" title="Latest winner" description="Published from revealed lucky draw records only." />
        <WinnerSpotlight winner={latestWinner} />
      </section>

      <section className="public-surface space-y-4 p-6">
        <SectionHeader eyebrow="Live catalogue" title="Featured products" description="Products are loaded from the real backend catalogue." />
        {products.length === 0 ? (
          <div className="public-card-sm px-5 py-4 text-sm leading-6 text-muted-foreground">No products are currently published in the public catalogue.</div>
<<<<<<< ours
>>>>>>> theirs
=======
>>>>>>> theirs
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {products.map((product) => (
              <article key={product.id} className="public-card p-5">
                <h3 className="text-base font-semibold text-foreground">{product.name}</h3>
<<<<<<< ours
<<<<<<< ours
                <p className="mt-1 text-sm text-muted-foreground">{product.category || "General"}</p>
                <p className="mt-3 text-sm font-semibold text-foreground">{formatCurrency(product.base_price)}</p>
                <Link href={`${ROUTES.public.products}/${product.id}`} className="mt-4 inline-flex text-sm font-semibold text-slate-900 underline underline-offset-2">
                  View details
                </Link>
=======
=======
>>>>>>> theirs
                <p className="mt-2 text-sm text-muted-foreground">Code: {product.product_code}</p>
                <p className="mt-2 text-sm font-semibold">Base price: {formatCurrency(product.base_price)}</p>
                <div className="mt-4 flex gap-2">
                  <Link href={`${ROUTES.public.products}/${product.id}`} className="inline-flex h-10 items-center rounded-xl border border-white/80 bg-white/80 px-4 text-sm font-semibold">View</Link>
                  <Link href={buildApplyHref(product)} className="inline-flex h-10 items-center rounded-xl border border-slate-900/10 bg-slate-900 px-4 text-sm font-semibold text-white">Apply</Link>
                </div>
<<<<<<< ours
>>>>>>> theirs
=======
>>>>>>> theirs
              </article>
            ))}
          </div>
        )}
      </section>

<<<<<<< ours
<<<<<<< ours
      <WinnerSpotlight winner={latestWinner} />

      {stats ? (
        <section className="public-surface grid gap-4 p-6 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Published batches", value: stats.total_batches },
            { label: "Active subscriptions", value: stats.active_subscriptions },
            { label: "Published winners", value: stats.total_winners },
            { label: "Total subscriptions", value: stats.total_subscriptions },
          ].map((item) => (
            <div key={item.label} className="public-card p-5">
              <div className="text-xs uppercase text-muted-foreground">{item.label}</div>
              <div className="mt-2 text-3xl font-semibold text-foreground">{item.value.toLocaleString("en-IN")}</div>
            </div>
          ))}
        </section>
      ) : null}

      <CtaBanner
        title="Need help selecting the right plan for your family?"
        description="Talk to our branch team for product guidance, monthly budget matching, and Lucky Plan enrollment support."
        actions={[
          { href: ROUTES.public.contact, label: dictionary.common.contact, variant: "secondary" },
          { href: ROUTES.public.apply, label: dictionary.common.apply, variant: "primary" },
=======
      <CtaBanner
=======
      <CtaBanner
>>>>>>> theirs
        title="Need guidance in your preferred language?"
        description="Use the language switcher in the header for English, हिन्दी, or বাংলা, then connect with the branch for assisted enrollment."
        actions={[
          { href: ROUTES.public.contact, label: "Contact us", variant: "secondary" },
          { href: ROUTES.public.apply, label: "Start application", variant: "primary" },
<<<<<<< ours
>>>>>>> theirs
=======
>>>>>>> theirs
        ]}
      />
    </main>
  );
}
