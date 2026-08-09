"use client";

import Link from "next/link";

import PublicContentCarousel from "@/components/public/PublicContentCarousel";
import PublicProductMedia from "@/components/public/PublicProductMedia";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { formatCurrency } from "@/lib/format";
import { ROUTES } from "@/lib/routes";
import type { PublicProduct } from "@/services/public";

function buildApplyHref(product: PublicProduct) {
  const params = new URLSearchParams();
  params.set("product", String(product.id));
  params.set("product_name", product.name);
  params.set("product_code", product.product_code);
  params.set("price", product.base_price);
  return `${ROUTES.public.apply}?${params.toString()}`;
}

export default function HomeFeaturedProductsShowcase({
  products,
  ariaCarouselLabel,
  prevLabel,
  nextLabel,
}: {
  products: PublicProduct[];
  ariaCarouselLabel: string;
  prevLabel: string;
  nextLabel: string;
}) {
  const featured = products.slice(0, 6);
  const withImages = featured.filter((product) => Boolean(product.image));

  const renderCard = (product: PublicProduct) => (
    <article className="overflow-hidden rounded-[2rem] border border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] dark:bg-[linear-gradient(180deg,rgba(30,41,59,0.5),rgba(15,23,42,0.8))] shadow-[0_24px_60px_-46px_rgba(15,23,42,0.72)] dark:shadow-none contain-paint">
      <div className="relative p-3">
        <AspectRatio ratio={4 / 3} className="w-full">
          <PublicProductMedia
            src={product.image}
            alt={product.name}
            badge={product.category || null}
            sizes="(max-width: 768px) 100vw, 33vw"
            quality={70}
            className="absolute inset-0 size-full rounded-[1.7rem]"
            fallbackLabel="Media pending"
          />
        </AspectRatio>
      </div>
      <div className="space-y-3 px-5 pb-5 pt-1">
        <h3 className="text-base font-semibold text-foreground">{product.name}</h3>
        <p className="text-sm font-semibold">{formatCurrency(product.base_price)}</p>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`${ROUTES.public.products}/${product.id}`}
            className="public-action-secondary h-10 px-4 text-sm"
          >
            View
          </Link>
          <Link
            href={buildApplyHref(product)}
            className="public-action-primary h-10 px-4 text-sm"
          >
            Apply
          </Link>
        </div>
      </div>
    </article>
  );

  if (featured.length === 0) {
    return null;
  }

  if (withImages.length >= 2) {
    return (
      <PublicContentCarousel
        ariaLabel={ariaCarouselLabel}
        prevLabel={prevLabel}
        nextLabel={nextLabel}
        className="rounded-[2rem]"
      >
        {withImages.map((product) => (
          <div key={product.id} className="px-1 pb-2 pt-1">
            {renderCard(product)}
          </div>
        ))}
      </PublicContentCarousel>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {featured.map((product) => (
        <div key={product.id}>{renderCard(product)}</div>
      ))}
    </div>
  );
}
