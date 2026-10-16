"use client";

import Image from "next/image";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Camera, ChevronLeft, ChevronRight, Play } from "lucide-react";

import PublicProductMedia from "@/components/public/PublicProductMedia";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import { shouldBypassNextImageOptimization, toBrowserReachableMediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";

export type ProductMediaGalleryItem = {
  id: string;
  type: "image" | "video";
  url: string;
  title?: string;
  isHero?: boolean;
};

/**
 * Normalizes public product payloads into a deduped, ordered gallery list.
 * Order: PIM hero/gallery images, videos, additional variant images.
 */
export function buildPublicProductMediaItems(product: {
  image?: string | null;
  video?: string | null;
  gallery_images?: string[] | null;
  gallery_videos?: string[] | null;
  sibling_variants?: Array<{ image?: string | null }> | null;
  pim_variants?: Array<{ image?: string | null }> | null;
}): ProductMediaGalleryItem[] {
  const items: ProductMediaGalleryItem[] = [];
  const seenUrls = new Set<string>();

  // 1. Videos (PIM gallery videos first, then primary product.video)
  const galleryVideos = (product.gallery_videos ?? []).filter(Boolean);
  galleryVideos.forEach((v, idx) => {
    const reachable = toBrowserReachableMediaUrl(v);
    if (reachable && !seenUrls.has(reachable)) {
      seenUrls.add(reachable);
      items.push({ id: `video-${idx}`, type: "video", url: reachable, title: "Product Video" });
    }
  });

  if (product.video) {
    const reachable = toBrowserReachableMediaUrl(product.video);
    if (reachable && !seenUrls.has(reachable)) {
      seenUrls.add(reachable);
      items.push({ id: "video-primary", type: "video", url: reachable, title: "Product Video" });
    }
  }

  // 2. Images (PIM gallery images first — already sorted hero first by backend)
  const galleryImages = (product.gallery_images ?? []).filter(Boolean);
  galleryImages.forEach((img, idx) => {
    const reachable = toBrowserReachableMediaUrl(img);
    if (reachable && !seenUrls.has(reachable)) {
      seenUrls.add(reachable);
      items.push({
        id: `image-${idx}`,
        type: "image",
        url: reachable,
        title: idx === 0 ? "Primary Photo" : `Photo ${idx + 1}`,
        isHero: idx === 0,
      });
    }
  });

  // 3. Main product image fallback
  if (product.image) {
    const reachable = toBrowserReachableMediaUrl(product.image);
    if (reachable && !seenUrls.has(reachable)) {
      seenUrls.add(reachable);
      items.unshift({
        id: "image-primary",
        type: "image",
        url: reachable,
        title: "Primary Photo",
        isHero: true,
      });
    }
  }

  // 4. Variant images if available and not yet included
  const variantSources = [
    ...(product.sibling_variants ?? []),
    ...(product.pim_variants ?? []),
  ];
  variantSources.forEach((v, idx) => {
    if (v.image) {
      const reachable = toBrowserReachableMediaUrl(v.image);
      if (reachable && !seenUrls.has(reachable)) {
        seenUrls.add(reachable);
        items.push({
          id: `variant-img-${idx}`,
          type: "image",
          url: reachable,
          title: `Variant Option ${idx + 1}`,
        });
      }
    }
  });

  return items;
}

/**
 * Normalizes customer & partner catalog product payloads into gallery items.
 */
export function buildCatalogProductMediaItems(product: {
  image?: string | null;
  media_items?: Array<{ url: string; kind: string; is_hero?: boolean; title?: string }> | null;
  pim_variants?: Array<{ image?: string | null }> | null;
}): ProductMediaGalleryItem[] {
  const items: ProductMediaGalleryItem[] = [];
  const seenUrls = new Set<string>();

  // 1. Process media_items
  const rawMedia = product.media_items ?? [];
  for (const [idx, item] of rawMedia.entries()) {
    if (!item.url) continue;
    const reachable = toBrowserReachableMediaUrl(item.url);
    if (!reachable || seenUrls.has(reachable)) continue;
    seenUrls.add(reachable);

    const isVideo = (item.kind || "").toUpperCase() === "VIDEO";
    items.push({
      id: `media-${idx}`,
      type: isVideo ? "video" : "image",
      url: reachable,
      title: item.title || (isVideo ? "Product Video" : `Photo ${idx + 1}`),
      isHero: Boolean(item.is_hero),
    });
  }

  // 2. Primary image fallback
  if (product.image) {
    const reachable = toBrowserReachableMediaUrl(product.image);
    if (reachable && !seenUrls.has(reachable)) {
      seenUrls.add(reachable);
      items.unshift({
        id: "catalog-image-primary",
        type: "image",
        url: reachable,
        title: "Primary Photo",
        isHero: true,
      });
    }
  }

  // 3. Variant images fallback
  const variants = product.pim_variants ?? [];
  variants.forEach((v, idx) => {
    if (v.image) {
      const reachable = toBrowserReachableMediaUrl(v.image);
      if (reachable && !seenUrls.has(reachable)) {
        seenUrls.add(reachable);
        items.push({
          id: `catalog-variant-${idx}`,
          type: "image",
          url: reachable,
          title: `Option Photo ${idx + 1}`,
        });
      }
    }
  });

  return items;
}

export type ProductMediaGalleryProps = {
  items: ProductMediaGalleryItem[];
  productName: string;
  category?: string | null;
  subcategory?: string | null;
  badge?: string | null;
  aspectRatio?: number;
  sizes?: string;
  className?: string;
  carouselAriaLabel?: string;
  prevLabel?: string;
  nextLabel?: string;
};

export default function ProductMediaGallery({
  items,
  productName,
  category,
  subcategory,
  badge,
  aspectRatio = 5 / 4,
  sizes = "(max-width: 1024px) 100vw, 54vw",
  className,
  carouselAriaLabel = "Product Media Gallery",
  prevLabel = "Previous media item",
  nextLabel = "Next media item",
}: ProductMediaGalleryProps) {
  const [api, setApi] = useState<CarouselApi>();
  const [activeIndex, setActiveIndex] = useState(0);
  const baseId = useId();
  const thumbnailContainerRef = useRef<HTMLDivElement>(null);
  const thumbnailRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const totalCount = items.length;
  const photoCount = useMemo(() => items.filter((i) => i.type === "image").length, [items]);
  const videoCount = useMemo(() => items.filter((i) => i.type === "video").length, [items]);

  // Keep active index in sync with Embla carousel
  const onSelect = useCallback(() => {
    if (!api) return;
    setActiveIndex(api.selectedScrollSnap());
  }, [api]);

  useEffect(() => {
    if (!api) return;
    onSelect();
    api.on("select", onSelect);
    api.on("reInit", onSelect);
    return () => {
      api.off("select", onSelect);
      api.off("reInit", onSelect);
    };
  }, [api, onSelect]);

  // Automatically scroll active thumbnail into view
  useEffect(() => {
    const activeThumb = thumbnailRefs.current[activeIndex];
    if (activeThumb && thumbnailContainerRef.current) {
      activeThumb.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [activeIndex]);

  const handleThumbnailClick = (index: number) => {
    if (api) {
      api.scrollTo(index);
    }
    setActiveIndex(index);
  };

  const scrollPrev = () => {
    if (api) api.scrollPrev();
  };

  const scrollNext = () => {
    if (api) api.scrollNext();
  };

  // Thumbnail track manual scroll buttons (for desktop mouse users)
  const scrollThumbnails = (direction: "left" | "right") => {
    if (!thumbnailContainerRef.current) return;
    const offset = direction === "left" ? -240 : 240;
    thumbnailContainerRef.current.scrollBy({ left: offset, behavior: "smooth" });
  };

  // Fallback when product has zero media items
  if (totalCount === 0) {
    return (
      <div className={cn("w-full space-y-3", className)}>
        <AspectRatio ratio={aspectRatio} className="w-full">
          <PublicProductMedia
            src={null}
            alt={productName}
            badge={badge || category || "Catalogue"}
            sizes={sizes}
            priority
            fallbackLabel="Photography coming soon"
            category={category}
            subcategory={subcategory}
            className="absolute inset-0 size-full rounded-[1.7rem]"
          />
        </AspectRatio>
      </div>
    );
  }

  // Single media item view (no carousel needed, but displays sleek counter & info)
  if (totalCount === 1) {
    const single = items[0];
    return (
      <div className={cn("w-full space-y-3", className)}>
        <AspectRatio ratio={aspectRatio} className="w-full relative overflow-hidden rounded-[1.7rem] border border-border bg-card shadow-sm">
          {single.type === "video" ? (
            <video
              src={single.url}
              controls
              playsInline
              preload="metadata"
              className="absolute inset-0 size-full object-contain bg-black rounded-[1.7rem]"
            />
          ) : (
            <PublicProductMedia
              src={single.url}
              alt={productName}
              badge={badge || category || "Catalogue"}
              sizes={sizes}
              priority
              category={category}
              subcategory={subcategory}
              className="absolute inset-0 size-full rounded-[1.7rem]"
              imageClassName="transition duration-500 hover:scale-[1.02]"
            />
          )}

          {/* Single media counter badge */}
          <div className="pointer-events-none absolute bottom-3.5 right-3.5 z-10 flex items-center gap-1.5 rounded-full bg-slate-950/75 px-3 py-1 text-xs font-medium text-white shadow-md backdrop-blur border border-white/10">
            {single.type === "video" ? <Play className="size-3 fill-white" /> : <Camera className="size-3" />}
            <span>1 {single.type === "video" ? "Video" : "Photo"}</span>
          </div>
        </AspectRatio>
      </div>
    );
  }

  const currentItem = items[activeIndex] || items[0];

  return (
    <div className={cn("w-full space-y-3 sm:space-y-4", className)}>
      {/* Main Showcase Stage */}
      <div className="group/stage relative w-full overflow-hidden rounded-[1.7rem] border border-border bg-card shadow-sm">
        <Carousel
          setApi={setApi}
          opts={{ loop: true, align: "start" }}
          className="w-full"
          aria-label={carouselAriaLabel}
        >
          <CarouselContent className="ml-0">
            {items.map((item, index) => (
              <CarouselItem
                key={`${baseId}-stage-${item.id || index}`}
                className="pl-0"
                aria-label={`Slide ${index + 1} of ${totalCount}`}
              >
                <AspectRatio ratio={aspectRatio} className="w-full relative overflow-hidden bg-card">
                  {item.type === "video" ? (
                    <video
                      src={item.url}
                      controls
                      playsInline
                      preload="metadata"
                      className="absolute inset-0 size-full object-contain bg-black rounded-[inherit]"
                    />
                  ) : (
                    <PublicProductMedia
                      src={item.url}
                      alt={item.title ? `${productName} — ${item.title}` : `${productName} (${index + 1})`}
                      badge={badge || category || "Catalogue"}
                      sizes={sizes}
                      priority={index === 0}
                      quality={index === 0 ? 80 : 70}
                      category={category}
                      subcategory={subcategory}
                      className="absolute inset-0 size-full rounded-[inherit]"
                      imageClassName="transition duration-500 hover:scale-[1.02]"
                    />
                  )}
                </AspectRatio>
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>

        {/* Floating Navigation Chevrons */}
        <button
          type="button"
          onClick={scrollPrev}
          aria-label={prevLabel}
          className="absolute left-3 top-1/2 -translate-y-1/2 z-20 flex size-9 sm:size-10 items-center justify-center rounded-full border border-border/60 bg-background/85 text-foreground shadow-lg backdrop-blur-md transition hover:bg-background hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary opacity-90 sm:opacity-0 sm:group-hover/stage:opacity-100"
        >
          <ChevronLeft className="size-5" />
        </button>

        <button
          type="button"
          onClick={scrollNext}
          aria-label={nextLabel}
          className="absolute right-3 top-1/2 -translate-y-1/2 z-20 flex size-9 sm:size-10 items-center justify-center rounded-full border border-border/60 bg-background/85 text-foreground shadow-lg backdrop-blur-md transition hover:bg-background hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary opacity-90 sm:opacity-0 sm:group-hover/stage:opacity-100"
        >
          <ChevronRight className="size-5" />
        </button>

        {/* Floating Counter Chip */}
        <div className="pointer-events-none absolute bottom-3.5 right-3.5 z-20 flex items-center gap-1.5 rounded-full bg-slate-950/75 px-3 py-1 text-xs font-medium text-white shadow-md backdrop-blur border border-white/10">
          {currentItem.type === "video" ? (
            <Play className="size-3 fill-white" />
          ) : (
            <Camera className="size-3" />
          )}
          <span>
            {activeIndex + 1} / {totalCount}
          </span>
        </div>
      </div>

      {/* Modern E-Commerce Thumbnails Bar */}
      <div className="space-y-2">
        {/* Gallery Header Summary */}
        <div className="flex items-center justify-between px-1 text-xs font-medium text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-foreground font-semibold">
              <Camera className="size-3.5 text-muted-foreground" />
              {photoCount} {photoCount === 1 ? "Photo" : "Photos"}
            </span>
            {videoCount > 0 && (
              <>
                <span>•</span>
                <span className="flex items-center gap-1 text-primary font-semibold">
                  <Play className="size-3.5 fill-current" />
                  {videoCount} {videoCount === 1 ? "Video" : "Videos"}
                </span>
              </>
            )}
          </div>
          <span className="text-[11px] text-muted-foreground">
            Tap thumbnail to inspect
          </span>
        </div>

        {/* Horizontal Scrolling Thumbnails Strip */}
        <div className="relative group/thumbs">
          {/* Scroll left button (visible on hover if overflow) */}
          {totalCount > 4 && (
            <button
              type="button"
              onClick={() => scrollThumbnails("left")}
              aria-label="Scroll thumbnails left"
              className="hidden sm:flex absolute -left-2 top-1/2 -translate-y-1/2 z-10 size-7 items-center justify-center rounded-full bg-background border border-border shadow-md text-foreground transition hover:bg-muted opacity-0 group-hover/thumbs:opacity-100"
            >
              <ChevronLeft className="size-3.5" />
            </button>
          )}

          <div
            ref={thumbnailContainerRef}
            className="flex items-center gap-2.5 sm:gap-3 overflow-x-auto py-1 px-1 scroll-smooth no-scrollbar"
            role="tablist"
            aria-label="Product media thumbnails"
          >
            {items.map((item, index) => {
              const isActive = index === activeIndex;
              const isVideo = item.type === "video";

              return (
                <button
                  key={item.id || `${item.url}-${index}`}
                  ref={(el) => {
                    thumbnailRefs.current[index] = el;
                  }}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-label={`View ${isVideo ? "video" : "photo"} ${index + 1} of ${totalCount}`}
                  onClick={() => handleThumbnailClick(index)}
                  className={cn(
                    "group/thumb relative size-16 sm:size-20 shrink-0 overflow-hidden rounded-2xl border-2 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    isActive
                      ? "border-primary ring-2 ring-primary/40 shadow-md scale-[1.03] opacity-100 bg-background"
                      : "border-border/70 hover:border-primary/50 opacity-65 hover:opacity-100 hover:scale-[1.01] bg-muted/40"
                  )}
                >
                  {isVideo ? (
                    <div className="absolute inset-0 bg-slate-900 flex items-center justify-center">
                      <video
                        src={item.url}
                        className="size-full object-cover opacity-60 pointer-events-none"
                        preload="metadata"
                      />
                      <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-0.5">
                        <div className="size-6 rounded-full bg-primary/95 text-primary-foreground flex items-center justify-center shadow-md">
                          <Play className="size-3 fill-current ml-0.5" />
                        </div>
                        <span className="text-[8px] font-bold text-white tracking-wider uppercase">
                          Video
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="relative size-full">
                      <Image
                        src={item.url}
                        alt={item.title || `${productName} thumbnail ${index + 1}`}
                        fill
                        sizes="80px"
                        className="object-cover transition duration-300 group-hover/thumb:scale-105"
                        unoptimized={shouldBypassNextImageOptimization(item.url)}
                      />
                    </div>
                  )}

                  {/* Thumbnail sequential number badge */}
                  <div
                    className={cn(
                      "absolute top-1 left-1 rounded-md px-1 py-0.5 text-[9px] font-semibold leading-none shadow-sm backdrop-blur",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "bg-black/60 text-white"
                    )}
                  >
                    {index + 1}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Scroll right button (visible on hover if overflow) */}
          {totalCount > 4 && (
            <button
              type="button"
              onClick={() => scrollThumbnails("right")}
              aria-label="Scroll thumbnails right"
              className="hidden sm:flex absolute -right-2 top-1/2 -translate-y-1/2 z-10 size-7 items-center justify-center rounded-full bg-background border border-border shadow-md text-foreground transition hover:bg-muted opacity-0 group-hover/thumbs:opacity-100"
            >
              <ChevronRight className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

