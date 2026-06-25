"use client";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import { Children, useEffect, useId, useMemo, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Public media/product carousel backed by Embla (shadcn Carousel primitives).
 * Renders real slide children only — no placeholder media.
 */
export default function PublicContentCarousel({
  ariaLabel,
  prevLabel,
  nextLabel,
  children,
  className,
}: {
  ariaLabel: string;
  prevLabel: string;
  nextLabel: string;
  children: ReactNode;
  className?: string;
}) {
  const slides = useMemo(() => Children.toArray(children).filter(Boolean), [children]);
  const slideCount = slides.length;
  const baseId = useId();
  const [api, setApi] = useState<CarouselApi>();
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!api) return;
    const sync = () => setActiveIndex(api.selectedScrollSnap());
    sync();
    api.on("select", sync);
    api.on("reInit", sync);
    return () => {
      api.off("select", sync);
      api.off("reInit", sync);
    };
  }, [api]);

  if (slideCount < 2) {
    return <div className={className}>{slides}</div>;
  }

  const floatingControlClass =
    "pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-lg transition hover:bg-card";

  return (
    <Carousel
      setApi={setApi}
      opts={{ loop: false, align: "start" }}
      className={cn("relative contain-paint", className)}
      aria-label={ariaLabel}
      tabIndex={0}
    >
      <CarouselContent>
        {slides.map((slide, index) => (
          <CarouselItem
            key={`${baseId}-slide-${index}`}
            id={`${baseId}-slide-${index}`}
            aria-label={`Slide ${index + 1} of ${slideCount}`}
          >
            {slide}
          </CarouselItem>
        ))}
      </CarouselContent>

      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center px-1 sm:px-2">
        <CarouselPrevious label={prevLabel} className={floatingControlClass} />
      </div>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1 sm:px-2">
        <CarouselNext label={nextLabel} className={floatingControlClass} />
      </div>

      <p className="sr-only" aria-live="polite">
        Slide {activeIndex + 1} of {slideCount}
      </p>
    </Carousel>
  );
}
