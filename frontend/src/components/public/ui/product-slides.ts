import { resolveApiMediaUrl } from "@/lib/media";

export type ProductSlide = { type: "image" | "video"; src: string };

type ProductMediaSource = {
  image?: string | null;
  gallery_images?: string[] | null;
  gallery_videos?: string[] | null;
  video?: string | null;
  sibling_variants?: Array<{ image?: string | null }> | null;
  pim_variants?: Array<{ image?: string | null }> | null;
};

/**
 * Card slideshow order: the product's cover photo first (so cards open on a
 * picture), then the rest of the gallery, then variant photos, then videos — de-duplicated.
 * Plain module (not "use client") so server components can call it too.
 */
export function buildProductSlides(product: ProductMediaSource): ProductSlide[] {
  const variantImages = [
    ...(product.sibling_variants ?? []).map((v) => v.image),
    ...(product.pim_variants ?? []).map((v) => v.image),
  ].filter(Boolean);

  const images = [product.image, ...(product.gallery_images ?? []), ...variantImages];
  // The list API resolves image URLs but returns video paths as stored.
  const videos = [...(product.gallery_videos ?? []), product.video].map((src) => resolveApiMediaUrl(src));

  const seen = new Set<string>();
  const slides: ProductSlide[] = [];
  const add = (type: ProductSlide["type"], src: string | null | undefined) => {
    if (!src || seen.has(src)) return;
    seen.add(src);
    slides.push({ type, src });
  };
  images.forEach((src) => add("image", src));
  videos.forEach((src) => add("video", src));
  return slides;
}
