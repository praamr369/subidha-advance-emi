import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import type { CategoryKey, HomeCopy } from "@/components/public/home/home-copy";
import HomeSectionHeading from "@/components/public/home/HomeSectionHeading";
import ProductMediaSlideshow from "@/components/public/ui/ProductMediaSlideshow";
import { buildProductSlides } from "@/components/public/ui/product-slides";
import { tone } from "@/components/public/ui/tone";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { PublicProduct } from "@/services/public";

const CATEGORIES: ReadonlyArray<{ key: CategoryKey; href: string; image: string }> = [
  { key: "sofas", href: `${ROUTES.public.products}/sofas`, image: "/images/category_sofa.jpg" },
  { key: "beds", href: `${ROUTES.public.products}/beds`, image: "/images/category_bedroom.jpg" },
  { key: "dining", href: `${ROUTES.public.products}/dining-tables`, image: "/images/category_dining.jpg" },
  { key: "wardrobes", href: `${ROUTES.public.products}/wardrobes`, image: "/images/category_wardrobe.jpg" },
  { key: "appliances", href: `${ROUTES.public.products}/appliances`, image: "/images/category_appliances.jpg" },
];

const inr = (value: number) => `₹${Math.round(value).toLocaleString("en-IN")}`;

function buildEnquiryHref(product: PublicProduct) {
  const params = new URLSearchParams();
  params.set("product", String(product.id));
  params.set("product_name", product.name);
  params.set("product_code", product.product_code);
  params.set("price", product.base_price);
  return `${ROUTES.public.apply}?${params.toString()}`;
}

function ProductTile({ product, copy }: { product: PublicProduct; copy: HomeCopy["products"] }) {
  const title = product.seo_name || product.name;
  const href = `${ROUTES.public.products}/${product.product_code}`;
  // Prefer server-computed scheme pricing (live offers, configured tenures),
  // same precedence as the catalogue grid.
  const pricing = product.scheme_pricing;
  const cash = Number(pricing?.cash_price ?? product.base_price) || 0;
  const rangeMin = Number(product.price_range?.min) || 0;
  const price = cash || rangeMin;
  const original = pricing?.cash_has_discount ? Number(pricing.cash_base_price ?? product.base_price) || 0 : 0;
  const monthly = pricing?.lowest_monthly != null ? Number(pricing.lowest_monthly) : null;

  return (
    <article
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border transition-[border-color,box-shadow] duration-200 hover:shadow-[0_14px_30px_-22px_rgba(15,23,42,0.45)]",
        tone.surface,
        tone.line,
        tone.hoverAccentLine
      )}
    >
      <div className={cn("relative aspect-[4/3]", tone.wash)}>
        <ProductMediaSlideshow
          slides={buildProductSlides(product)}
          alt={title}
          href={href}
          category={product.category}
          subcategory={product.subcategory}
          sizes="(max-width: 1024px) 50vw, 25vw"
        />
      </div>
      <div className="flex flex-1 flex-col p-3 sm:p-4">
        {product.category ? (
          <p className={cn("truncate text-[10px] font-semibold uppercase tracking-[0.12em] sm:text-[11px]", tone.muted)}>
            {product.category}
          </p>
        ) : null}
        <h4 className={cn("mt-1 line-clamp-2 text-sm font-semibold leading-snug", tone.text)}>
          <Link href={href} className={cn("focus-visible:underline focus-visible:outline-none", tone.hoverAccentText)}>
            {title}
          </Link>
        </h4>
        <div className="mt-auto pt-3">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className={cn("text-base font-semibold", tone.text)}>
              {price > 0 ? (!cash && rangeMin ? copy.fromPrice(inr(price)) : inr(price)) : copy.priceOnRequest}
            </span>
            {original > price ? <span className={cn("text-xs line-through", tone.muted)}>{inr(original)}</span> : null}
          </p>
          {monthly != null && monthly > 0 ? (
            <p className={cn("mt-0.5 text-xs font-medium", tone.accentText)}>{copy.perMonth(inr(monthly))}</p>
          ) : null}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link
            href={href}
            className={cn(
              "inline-flex h-9 items-center justify-center rounded-lg border text-xs font-semibold transition-colors sm:text-sm",
              tone.line,
              tone.text,
              tone.hoverWash
            )}
          >
            {copy.details}
          </Link>
          <Link
            href={buildEnquiryHref(product)}
            className={cn(
              "inline-flex h-9 items-center justify-center rounded-lg text-xs font-semibold transition-colors sm:text-sm",
              tone.fill,
              tone.fillHover
            )}
          >
            {copy.enquire}
          </Link>
        </div>
      </div>
    </article>
  );
}

export default function HomeProductShowcase({
  copy,
  products,
  totalCount,
}: {
  copy: HomeCopy["products"];
  products: PublicProduct[];
  totalCount: number | null;
}) {
  return (
    <section id="products" aria-label={copy.eyebrow} className="scroll-mt-24 space-y-6 lg:scroll-mt-64">
      <HomeSectionHeading eyebrow={copy.eyebrow} title={copy.title} description={copy.description} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {CATEGORIES.map((category) => (
          <Link
            key={category.key}
            href={category.href}
            className={cn("group relative block aspect-[4/3] overflow-hidden rounded-2xl border lg:aspect-[4/5]", tone.line, tone.wash)}
          >
            <Image
              src={category.image}
              alt=""
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
              quality={70}
              className="object-cover"
            />
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/85 to-transparent px-3 pb-3 pt-10 text-sm font-semibold text-white group-hover:underline">
              {copy.categories[category.key]}
            </span>
          </Link>
        ))}
        <Link
          href={ROUTES.public.products}
          className={cn("flex aspect-[4/3] flex-col justify-between rounded-2xl p-4 transition-colors lg:aspect-[4/5]", tone.fill, tone.fillHover)}
        >
          <span className="text-sm font-semibold">{copy.fullCatalogue}</span>
          <span>
            <span className="block text-2xl font-semibold tabular-nums">
              {totalCount ? totalCount.toLocaleString("en-IN") : copy.all}
            </span>
            <span className={cn("text-xs", tone.onFillMuted)}>{copy.productsOnline}</span>
          </span>
          <span className="inline-flex items-center gap-1 text-sm font-semibold">
            {copy.browseAll}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </span>
        </Link>
      </div>

      <div className="flex items-end justify-between gap-4 pt-2">
        <h3 className={cn("text-lg font-semibold", tone.text)}>{copy.featured}</h3>
        <Link href={ROUTES.public.products} className={cn("shrink-0 text-sm font-semibold hover:underline", tone.accentText)}>
          {copy.viewAll}
        </Link>
      </div>

      {products.length === 0 ? (
        <div className={cn("rounded-2xl border border-dashed px-5 py-8 text-center text-sm", tone.surface, tone.line, tone.muted)}>
          {copy.empty}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {products.map((product) => (
            <ProductTile key={product.id} product={product} copy={copy} />
          ))}
        </div>
      )}
    </section>
  );
}
