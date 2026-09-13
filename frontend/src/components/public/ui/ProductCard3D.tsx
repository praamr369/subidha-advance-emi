"use client";
import { useI18n } from "@/components/i18n/I18nProvider";

import Link from "next/link";
import { cn } from "@/lib/utils";
import ProductMediaSlideshow from "./ProductMediaSlideshow";
import type { ProductSlide } from "./product-slides";
import { tone } from "./tone";

interface ProductCard3DProps {
  id: string;
  title: string;
  category: string;
  price: number;
  emiAmount: number;
  imageUrl: string;
  href: string;
  className?: string;
  /** Undiscounted cash price; shown struck through when an offer is live. */
  originalPrice?: number | null;
  /** True when no monthly plan is configured, so the EMI figure is hidden. */
  hideMonthly?: boolean;
  /** Drives the placeholder icon; more descriptive than the category. */
  subcategory?: string | null;
  /** Photos + videos for the swipeable slideshow; falls back to `imageUrl`. */
  media?: ProductSlide[];
}

export default function ProductCard3D({
  title,
  category,
  price,
  emiAmount,
  imageUrl,
  href,
  className,
  originalPrice = null,
  hideMonthly = false,
  subcategory = null,
  media,
}: ProductCard3DProps) {
  const { t } = useI18n();
  const slides: ProductSlide[] = media ?? (imageUrl ? [{ type: "image", src: imageUrl }] : []);

  return (
    <div
      className={cn(
        "group relative flex min-w-[240px] flex-col overflow-hidden rounded-xl border p-4 shadow-sm transition-[box-shadow,border-color] duration-300 hover:shadow-md",
        tone.surface,
        tone.line,
        tone.hoverAccentLine,
        className
      )}
    >
      <Link href={href} className="absolute inset-0 z-10">
        <span className="sr-only">View {title}</span>
      </Link>

      {/* Sits above the card-wide link so swipes and arrows reach the slideshow; each slide links to the product. */}
      <div className={cn("relative z-20 aspect-[4/3] w-full overflow-hidden rounded-lg", tone.wash)}>
        <ProductMediaSlideshow
          slides={slides}
          alt={title}
          href={href}
          category={category}
          subcategory={subcategory}
          sizes="(max-width: 768px) 100vw, 33vw"
        />
        <div className="pointer-events-none absolute left-2 top-2 z-20 rounded border border-white/40 bg-white/85 px-2 py-0.5 text-[10px] font-semibold text-slate-800 dark:border-black/40 dark:bg-black/60 dark:text-slate-200">
          {category}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-1 px-1 pb-1">
        <h3 className={cn("line-clamp-2 text-sm font-semibold leading-snug", tone.text)}>{title}</h3>

        <div className="mt-2 flex items-end justify-between">
          <div className="flex flex-col">
            {hideMonthly ? null : (
              <>
                <span className={cn("text-[10px] font-medium uppercase tracking-wider", tone.muted)}>{t('public.ProductCard3D_text3')}</span>
                <span className={cn("text-lg font-bold", tone.accentText)}>
                  ₹{emiAmount.toLocaleString("en-IN")}
                  <span className={cn("text-xs font-medium", tone.muted)}>{t('public.ProductCard3D_text4')}</span>
                </span>
              </>
            )}
          </div>
          <div className="flex flex-col items-end">
            <span className={cn("text-[10px] font-medium", tone.muted)}>{t('public.ProductCard3D_text5')}</span>
            <span className="flex items-baseline gap-1.5">
              {originalPrice != null && originalPrice > price ? (
                <span className={cn("text-xs font-medium line-through", tone.muted)}>₹{originalPrice.toLocaleString("en-IN")}</span>
              ) : null}
              <span className={cn("text-sm font-semibold", tone.text)}>₹{price.toLocaleString("en-IN")}</span>
            </span>
          </div>
        </div>

        <Link
          href={href}
          className={cn(
            "relative z-20 mt-4 inline-flex w-full items-center justify-center rounded-md py-2.5 text-xs font-semibold transition-colors hover:bg-[color:var(--primary)] hover:text-[color:var(--primary-foreground)]",
            tone.fillSoft,
            tone.accentText,
            tone.focusRing
          )}
        >
          View Plans
        </Link>
      </div>
    </div>
  );
}
