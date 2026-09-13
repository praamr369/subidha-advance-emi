"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { useI18n } from "@/components/i18n/I18nProvider";
import ProductImagePlaceholder from "@/components/public/ProductImagePlaceholder";
import type { ProductSlide } from "@/components/public/ui/product-slides";
import { shouldBypassNextImageOptimization } from "@/lib/media";
import { cn } from "@/lib/utils";

type ProductMediaSlideshowProps = {
  slides: ProductSlide[];
  alt: string;
  /** When set, tapping a slide opens this product page. */
  href?: string;
  category?: string | null;
  subcategory?: string | null;
  sizes: string;
  className?: string;
};

const ARROW_CLASS =
  "absolute top-1/2 z-10 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-sm transition-opacity hover:bg-white focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/slides:opacity-100";

/**
 * Swipeable photo + video slideshow for product cards. Native scroll-snap does
 * the sliding (no animation library, no autoplay); a video only loads and plays
 * while its slide is showing and the card is on screen.
 */
export default function ProductMediaSlideshow({
  slides,
  alt,
  href,
  category,
  subcategory,
  sizes,
  className,
}: ProductMediaSlideshowProps) {
  const { t } = useI18n();
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [inView, setInView] = useState(false);
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const count = slides.length;
  const hasVideo = slides.some((slide) => slide.type === "video");

  const onScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track || !track.clientWidth) return;
    const index = Math.round(track.scrollLeft / track.clientWidth);
    setActive((prev) => (prev === index ? prev : index));
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || !hasVideo) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.5 });
    observer.observe(track);
    return () => observer.disconnect();
  }, [hasVideo]);

  const goTo = (index: number) => {
    const track = trackRef.current;
    if (!track || count < 2) return;
    const next = (index + count) % count;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollTo({ left: next * track.clientWidth, behavior: reduceMotion ? "auto" : "smooth" });
  };

  const wrap = (content: ReactNode) =>
    href ? (
      <Link href={href} tabIndex={-1} className="absolute inset-0 block">
        {content}
      </Link>
    ) : (
      content
    );

  const placeholder = (
    <div className="absolute inset-0 flex items-center justify-center">
      <ProductImagePlaceholder name={alt} category={category || ""} subcategory={subcategory} />
    </div>
  );

  if (count === 0) return <div className={cn("relative h-full w-full", className)}>{wrap(placeholder)}</div>;

  return (
    <div
      className={cn("group/slides relative h-full w-full", className)}
      role="region"
      aria-roledescription="carousel"
      aria-label={alt}
    >
      <div
        ref={trackRef}
        onScroll={onScroll}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((slide, index) => (
          <div
            key={slide.src}
            className="relative h-full w-full shrink-0 snap-center"
            aria-roledescription="slide"
            aria-label={`${index + 1} / ${count}`}
          >
            {slide.type === "video" ? (
              <>
                <VideoSlide src={slide.src} label={alt} play={inView && index === active} />
                {href ? <Link href={href} tabIndex={-1} aria-label={alt} className="absolute inset-0" /> : null}
              </>
            ) : (
              wrap(
                failed.has(slide.src) ? (
                  placeholder
                ) : (
                  <Image
                    src={slide.src}
                    alt={index === 0 ? alt : `${alt} (${index + 1})`}
                    fill
                    sizes={sizes}
                    quality={70}
                    loading={index === 0 ? undefined : "lazy"}
                    className="object-cover"
                    unoptimized={shouldBypassNextImageOptimization(slide.src)}
                    onError={() => setFailed((prev) => new Set(prev).add(slide.src))}
                  />
                )
              )
            )}
          </div>
        ))}
      </div>

      {count > 1 ? (
        <>
          <button
            type="button"
            onClick={() => goTo(active - 1)}
            aria-label={t("common.mediaCarousel.previousSlide")}
            className={cn(ARROW_CLASS, "left-2")}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => goTo(active + 1)}
            aria-label={t("common.mediaCarousel.nextSlide")}
            className={cn(ARROW_CLASS, "right-2")}
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
          <div className="absolute inset-x-0 bottom-2 z-10 flex justify-center gap-1.5">
            {slides.map((slide, index) => (
              <button
                key={slide.src}
                type="button"
                onClick={() => goTo(index)}
                aria-label={`${index + 1} / ${count}`}
                aria-current={index === active ? "true" : undefined}
                className={cn(
                  "h-1.5 rounded-full shadow-[0_0_3px_rgba(0,0,0,0.45)] transition-[width,background-color] duration-200",
                  index === active ? "w-4 bg-white" : "w-1.5 bg-white/60"
                )}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function VideoSlide({ src, label, play }: { src: string; label: string; play: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  // Attach the source only once the slide is first shown, so cards never download video up front.
  const [armed, setArmed] = useState(false);
  if (play && !armed) setArmed(true);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (play) void video.play().catch(() => undefined);
    else video.pause();
  }, [play, armed]);

  return (
    <div className="absolute inset-0 bg-slate-950">
      <video
        ref={ref}
        src={armed ? src : undefined}
        muted
        loop
        playsInline
        preload="none"
        aria-label={label}
        className="h-full w-full object-cover"
      />
      <span className="pointer-events-none absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-950/70 text-white">
        <Play className="ml-px h-3 w-3" aria-hidden="true" />
      </span>
      {!play ? (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow">
            <Play className="ml-0.5 h-5 w-5" aria-hidden="true" />
          </span>
        </span>
      ) : null}
    </div>
  );
}
