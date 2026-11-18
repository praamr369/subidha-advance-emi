"use client";

import { useState } from "react";
import Link from "next/link";
import { Heart, Share2, MessageCircle, Sparkles } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { cn } from "@/lib/utils";
import ProductMediaSlideshow from "./ProductMediaSlideshow";
import type { ProductSlide } from "./product-slides";
import { tone } from "./tone";
import { useWishlist, shareProduct, getProductWhatsappShareUrl } from "@/lib/wishlist";

interface ProductCard3DProps {
  id: string;
  productCode?: string;
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
  /** Key PIM attributes to display on the card */
  attributes?: Array<{ name: string; value: string }>;
  rentYieldEstimates?: {
    short_tenure_min: string;
    short_tenure_max: string;
    long_tenure_min: string;
    long_tenure_max: string;
  } | null;
  stockStatus?: string | null;
  onToast?: (message: string) => void;
}

export default function ProductCard3D({
  id,
  productCode,
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
  attributes,
  rentYieldEstimates,
  stockStatus,
  onToast,
}: ProductCard3DProps) {
  const { t } = useI18n();
  const { isInWishlist, toggleWishlist } = useWishlist();
  const [isHeartPopping, setIsHeartPopping] = useState(false);

  const code = productCode || href.replace("/products/", "");
  const isWishlisted = isInWishlist(id) || (code ? isInWishlist(code) : false);

  const slides: ProductSlide[] = media ?? (imageUrl ? [{ type: "image", src: imageUrl }] : []);

  const discountPercent =
    originalPrice != null && originalPrice > price && originalPrice > 0
      ? Math.round(((originalPrice - price) / originalPrice) * 100)
      : null;

  const handleWishlistClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsHeartPopping(true);
    setTimeout(() => setIsHeartPopping(false), 400);

    const added = toggleWishlist({
      id,
      product_code: code,
      name: title,
      category,
      subcategory,
      price,
      originalPrice,
      emiAmount: hideMonthly ? null : emiAmount,
      image: imageUrl,
      stock_status: stockStatus,
    });

    if (onToast) {
      onToast(added ? "Added to Wishlist ❤️" : "Removed from Wishlist 🤍");
    }
  };

  const handleShareClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const result = await shareProduct({
      name: title,
      product_code: code,
    });
    if (onToast) {
      onToast(result === "copied" ? "Link copied to clipboard! 📋" : "Shared! 🔗");
    }
  };

  const whatsappHref = getProductWhatsappShareUrl({
    name: title,
    product_code: code,
  });

  return (
    <article
      className={cn(
        "group relative flex w-full min-w-0 flex-col overflow-hidden rounded-2xl border bg-card transition-all duration-300 hover:shadow-lg dark:hover:shadow-black/40",
        tone.surface,
        tone.line,
        tone.hoverAccentLine,
        className
      )}
    >
      <Link href={href} className="absolute inset-0 z-10" aria-label={`View ${title}`}>
        <span className="sr-only">View {title}</span>
      </Link>

      {/* Media Slideshow with Overlay Buttons */}
      <div className={cn("relative z-20 aspect-[4/3] w-full overflow-hidden rounded-t-2xl bg-muted/40", tone.wash)}>
        <ProductMediaSlideshow
          slides={slides}
          alt={title}
          href={href}
          category={category}
          subcategory={subcategory}
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
        />

        {/* Top-Right Action Buttons: Wishlist & Share */}
        <div className="absolute right-2 top-2 z-30 flex items-center gap-1.5">
          {/* Share Button */}
          <button
            type="button"
            onClick={handleShareClick}
            aria-label={`Share ${title}`}
            title="Share product"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-background/85 text-foreground backdrop-blur-md transition-transform duration-200 hover:scale-110 hover:bg-background active:scale-95 shadow-sm"
          >
            <Share2 className="h-3.5 w-3.5" />
          </button>

          {/* Wishlist Button */}
          <button
            type="button"
            onClick={handleWishlistClick}
            aria-label={isWishlisted ? `Remove ${title} from wishlist` : `Add ${title} to wishlist`}
            title={isWishlisted ? "Wishlisted" : "Add to wishlist"}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full border backdrop-blur-md transition-all duration-200 hover:scale-110 active:scale-95 shadow-sm",
              isWishlisted
                ? "border-rose-300 bg-rose-50 text-rose-500 dark:border-rose-900/60 dark:bg-rose-950/80 dark:text-rose-400"
                : "border-border/60 bg-background/85 text-foreground hover:bg-background",
              isHeartPopping && "scale-125 transition-transform"
            )}
          >
            <Heart
              className={cn(
                "h-4 w-4 transition-colors",
                isWishlisted && "fill-rose-500 text-rose-500 dark:fill-rose-400 dark:text-rose-400"
              )}
            />
          </button>
        </div>

        {/* Top-Left Discount Badge */}
        {discountPercent != null && discountPercent > 0 && (
          <div className="pointer-events-none absolute left-2 top-2 z-20 rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
            {discountPercent}% OFF
          </div>
        )}

        {/* Bottom-Left Category Tag */}
        <div className="pointer-events-none absolute bottom-2 left-2 z-20 rounded-md border border-white/40 bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
          {category}
        </div>
      </div>

      {/* Product Content Details */}
      <div className="flex flex-1 flex-col p-2.5 sm:p-4">
        {/* Title */}
        <h3
          className={cn(
            "line-clamp-2 text-xs font-semibold leading-snug sm:text-sm tracking-tight text-foreground transition-colors group-hover:text-primary",
            tone.text
          )}
          title={title}
        >
          {title}
        </h3>

        {/* Subcategory / Key Attribute */}
        {subcategory ? (
          <p className="mt-1 line-clamp-1 text-[11px] font-medium text-muted-foreground">
            {subcategory}
          </p>
        ) : null}

        {/* Price & SFEMI Section */}
        <div className="mt-auto pt-2.5">
          {/* Selling Price & Original Price */}
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-sm font-bold text-foreground sm:text-base">
              ₹{price.toLocaleString("en-IN")}
            </span>
            {originalPrice != null && originalPrice > price ? (
              <span className="text-[11px] font-medium text-muted-foreground line-through sm:text-xs">
                ₹{originalPrice.toLocaleString("en-IN")}
              </span>
            ) : null}
          </div>

          {/* Monthly SFEMI / EMI Tag */}
          {!hideMonthly && emiAmount > 0 && (
            <div className="mt-1 flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                <Sparkles className="h-2.5 w-2.5 text-emerald-600" />
                ₹{emiAmount.toLocaleString("en-IN")}/mo SFEMI
              </span>
            </div>
          )}

          {/* Rent Yield Mini Indicator */}
          {rentYieldEstimates && (
            <div className="mt-1.5 hidden sm:block text-[10px] text-muted-foreground">
              Rent: ₹{Number(rentYieldEstimates.short_tenure_min).toLocaleString("en-IN")} - ₹{Number(rentYieldEstimates.short_tenure_max).toLocaleString("en-IN")}/mo
            </div>
          )}
        </div>

        {/* Action Row */}
        <div className="relative z-20 mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-1.5 pt-1">
          <Link
            href={href}
            className={cn(
              "inline-flex h-8 sm:h-9 items-center justify-center rounded-xl bg-primary/10 px-2 sm:px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tone.focusRing
            )}
          >
            {t("public.ProductCard3D_text6") || "View Plans"}
          </Link>
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Ask about ${title} on WhatsApp`}
            title="Chat on WhatsApp"
            className="inline-flex h-8 sm:h-9 w-8 sm:w-9 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100 hover:text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/60 dark:text-emerald-300"
          >
            <MessageCircle className="h-4 w-4 text-[#25D366]" />
          </a>
        </div>
      </div>
    </article>
  );
}
