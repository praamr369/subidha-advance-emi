import { resolveApiMediaUrl } from "@/lib/media";

export type ProductSlide = { type: "image" | "video"; src: string };

type ProductMediaSource = {
  image?: string | null;
  gallery_images?: string[] | null;
  gallery_videos?: string[] | null;
  video?: string | null;
};

/**
 * Card slideshow order: the product's cover photo first (so cards open on a
 * picture), then the rest of the gallery, then videos — de-duplicated.
 * Plain module (not "use client") so server components can call it too.
 */
export function buildProductSlides(product: ProductMediaSource): ProductSlide[] {
  const images = [product.image, ...(product.gallery_images ?? [])];
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
