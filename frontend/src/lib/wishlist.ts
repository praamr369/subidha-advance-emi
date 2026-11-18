"use client";

import { useEffect, useState, useCallback } from "react";
import { readJson, writeJson, isBrowser } from "./storage";
import type { PublicProduct } from "@/services/public";

export const WISHLIST_STORAGE_KEY = "subidha_user_wishlist";
export const WISHLIST_EVENT = "subidha:wishlist:change";

export type WishlistItem = {
  id: string | number;
  product_code: string;
  name: string;
  seo_name?: string | null;
  category?: string | null;
  subcategory?: string | null;
  price: number;
  originalPrice?: number | null;
  emiAmount?: number | null;
  image?: string | null;
  stock_status?: string | null;
  addedAt: number;
};

export function getStoredWishlist(): WishlistItem[] {
  if (!isBrowser()) return [];
  const items = readJson<WishlistItem[]>(WISHLIST_STORAGE_KEY, []);
  return Array.isArray(items) ? items : [];
}

export function isItemInWishlist(id: string | number | undefined | null): boolean {
  if (id == null) return false;
  const items = getStoredWishlist();
  const target = String(id);
  return items.some((item) => String(item.id) === target || item.product_code === target);
}

export function toggleWishlistItem(
  product:
    | PublicProduct
    | WishlistItem
    | {
        id: string | number;
        product_code: string;
        name: string;
        seo_name?: string | null;
        category?: string | null;
        subcategory?: string | null;
        price?: number;
        base_price?: string | number;
        originalPrice?: number | null;
        emiAmount?: number | null;
        image?: string | null;
        stock_status?: string | null;
        scheme_pricing?: PublicProduct["scheme_pricing"];
      }
): boolean {
  if (!isBrowser()) return false;
  const items = getStoredWishlist();
  const idStr = String(product.id);
  const codeStr = product.product_code;

  const existingIndex = items.findIndex(
    (item) => String(item.id) === idStr || (Boolean(codeStr) && item.product_code === codeStr)
  );

  let isAdded = false;
  if (existingIndex >= 0) {
    items.splice(existingIndex, 1);
    isAdded = false;
  } else {
    const pricing = "scheme_pricing" in product ? product.scheme_pricing : null;
    const basePrice = Number("base_price" in product ? product.base_price : product.price) || 0;
    const cashPrice = Number(pricing?.cash_price ?? basePrice) || basePrice;
    const originalPrice = pricing?.cash_has_discount
      ? Number(pricing.cash_base_price ?? basePrice) || null
      : ("originalPrice" in product ? product.originalPrice ?? null : null);
    const emi =
      pricing?.lowest_monthly != null
        ? Math.round(Number(pricing.lowest_monthly))
        : ("emiAmount" in product ? product.emiAmount ?? null : null);

    const newItem: WishlistItem = {
      id: product.id,
      product_code: product.product_code,
      name: product.name,
      seo_name: "seo_name" in product ? product.seo_name : undefined,
      category: product.category,
      subcategory: product.subcategory,
      price: cashPrice,
      originalPrice,
      emiAmount: emi,
      image: product.image,
      stock_status: product.stock_status,
      addedAt: Date.now(),
    };
    items.unshift(newItem);
    isAdded = true;
  }

  writeJson(WISHLIST_STORAGE_KEY, items);
  window.dispatchEvent(new CustomEvent(WISHLIST_EVENT));
  return isAdded;
}

export function removeWishlistItem(id: string | number): void {
  if (!isBrowser()) return;
  const items = getStoredWishlist();
  const target = String(id);
  const filtered = items.filter((item) => String(item.id) !== target && item.product_code !== target);
  writeJson(WISHLIST_STORAGE_KEY, filtered);
  window.dispatchEvent(new CustomEvent(WISHLIST_EVENT));
}

export function clearWishlist(): void {
  if (!isBrowser()) return;
  writeJson(WISHLIST_STORAGE_KEY, []);
  window.dispatchEvent(new CustomEvent(WISHLIST_EVENT));
}

export function useWishlist() {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setItems(getStoredWishlist());
    setIsLoaded(true);

    const handleChange = () => {
      setItems(getStoredWishlist());
    };

    window.addEventListener(WISHLIST_EVENT, handleChange);
    window.addEventListener("storage", handleChange);

    return () => {
      window.removeEventListener(WISHLIST_EVENT, handleChange);
      window.removeEventListener("storage", handleChange);
    };
  }, []);

  const isInWishlist = useCallback(
    (id: string | number | undefined | null) => {
      if (id == null) return false;
      const target = String(id);
      return items.some((item) => String(item.id) === target || item.product_code === target);
    },
    [items]
  );

  const toggle = useCallback(
    (
      product:
        | PublicProduct
        | WishlistItem
        | {
            id: string | number;
            product_code: string;
            name: string;
            seo_name?: string | null;
            category?: string | null;
            subcategory?: string | null;
            price?: number;
            base_price?: string | number;
            originalPrice?: number | null;
            emiAmount?: number | null;
            image?: string | null;
            stock_status?: string | null;
            scheme_pricing?: PublicProduct["scheme_pricing"];
          }
    ) => {
      return toggleWishlistItem(product);
    },
    []
  );

  const remove = useCallback((id: string | number) => {
    removeWishlistItem(id);
  }, []);

  const clear = useCallback(() => {
    clearWishlist();
  }, []);

  return {
    wishlist: items,
    count: items.length,
    isLoaded,
    isInWishlist,
    toggleWishlist: toggle,
    removeFromWishlist: remove,
    clearWishlist: clear,
  };
}

export async function shareProduct(product: {
  name: string;
  product_code: string;
  seo_name?: string | null;
}): Promise<"shared" | "copied"> {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const shareUrl = `${origin}/products/${product.product_code}`;
  const shareTitle = product.seo_name || product.name;
  const shareText = `Check out ${shareTitle} at Subidha Furniture, Asansol:`;

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({
        title: shareTitle,
        text: shareText,
        url: shareUrl,
      });
      return "shared";
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        return "shared";
      }
    }
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(shareUrl);
      return "copied";
    } catch {
      // Clipboard write failed
    }
  }

  return "copied";
}

export function getProductWhatsappShareUrl(product: {
  name: string;
  product_code: string;
}): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const shareUrl = `${origin}/products/${product.product_code}`;
  const text = `Hello! Check out this product on Subidha Furniture:\n${product.name}\n${shareUrl}`;
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
}
