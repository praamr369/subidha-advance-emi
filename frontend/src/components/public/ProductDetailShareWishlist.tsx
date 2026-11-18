"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Heart, MessageCircle, Share2, Check } from "lucide-react";
import { ROUTES } from "@/lib/routes";
import { useWishlist, shareProduct } from "@/lib/wishlist";
import type { PublicProduct } from "@/services/public";
import { cn } from "@/lib/utils";

type Props = {
  product: PublicProduct;
  whatsappOrderHref: string | null;
};

export default function ProductDetailShareWishlist({ product, whatsappOrderHref }: Props) {
  const { isInWishlist, toggleWishlist } = useWishlist();
  const [toast, setToast] = useState<string | null>(null);

  const isWishlisted = isInWishlist(product.id) || isInWishlist(product.product_code);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const handleShare = async () => {
    const res = await shareProduct({
      name: product.seo_name || product.name,
      product_code: product.product_code,
    });
    showToast(res === "copied" ? "Product link copied to clipboard! 📋" : "Shared! 🔗");
  };

  const handleWishlist = () => {
    const added = toggleWishlist(product);
    showToast(added ? "Added to Wishlist ❤️" : "Removed from Wishlist 🤍");
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full border border-border/80 bg-foreground/95 px-5 py-2.5 text-xs font-semibold text-background shadow-xl backdrop-blur-md transition-all animate-in fade-in zoom-in-95">
          {toast}
        </div>
      )}

      {/* Back to Catalogue */}
      <Link
        href={ROUTES.public.products}
        className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-background/80 px-3.5 py-2 text-xs font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-95 shadow-xs"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Catalogue
      </Link>

      {/* Action Buttons: Share, Wishlist, WhatsApp */}
      <div className="flex items-center gap-2">
        {/* Share Button */}
        <button
          type="button"
          onClick={handleShare}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border/70 bg-background px-3 text-xs font-semibold text-foreground transition hover:bg-muted active:scale-95 shadow-xs"
          title="Share this product link"
        >
          <Share2 className="h-3.5 w-3.5" />
          <span className="hidden xs:inline">Share</span>
        </button>

        {/* Wishlist Button */}
        <button
          type="button"
          onClick={handleWishlist}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-all active:scale-95 shadow-xs",
            isWishlisted
              ? "border-rose-400 bg-rose-50 text-rose-600 dark:border-rose-900/60 dark:bg-rose-950/80 dark:text-rose-300"
              : "border-border/70 bg-background text-foreground hover:bg-muted"
          )}
          title={isWishlisted ? "Wishlisted" : "Add to wishlist"}
        >
          <Heart
            className={cn(
              "h-3.5 w-3.5 transition-colors",
              isWishlisted && "fill-rose-500 text-rose-500 dark:fill-rose-400 dark:text-rose-400"
            )}
          />
          <span>{isWishlisted ? "Wishlisted" : "Save"}</span>
        </button>

        {/* Order on WhatsApp */}
        {whatsappOrderHref ? (
          <a
            href={whatsappOrderHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#25D366] px-3.5 text-xs font-semibold text-white shadow-xs transition hover:opacity-95 active:scale-95"
          >
            <MessageCircle className="h-4 w-4" />
            <span className="hidden sm:inline">Order on WhatsApp</span>
            <span className="sm:hidden">WhatsApp</span>
          </a>
        ) : null}
      </div>
    </div>
  );
}
