"use client";

import useEmblaCarousel, { type UseEmblaCarouselType } from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
  type HTMLAttributes,
  type KeyboardEvent,
} from "react";

import { cn } from "@/lib/utils";

export type CarouselApi = UseEmblaCarouselType[1];

type CarouselProps = HTMLAttributes<HTMLDivElement> & {
  opts?: NonNullable<Parameters<typeof useEmblaCarousel>[0]>;
  plugins?: Parameters<typeof useEmblaCarousel>[1];
  orientation?: "horizontal" | "vertical";
  setApi?: (api: CarouselApi | undefined) => void;
};

type CarouselContextValue = {
  carouselRef: ReturnType<typeof useEmblaCarousel>[0];
  api: CarouselApi | undefined;
  scrollPrev: () => void;
  scrollNext: () => void;
  canScrollPrev: boolean;
  canScrollNext: boolean;
  orientation: "horizontal" | "vertical";
};

const CarouselContext = createContext<CarouselContextValue | null>(null);

function useCarouselContext() {
  const ctx = useContext(CarouselContext);
  if (!ctx) {
    throw new Error("Carousel subcomponents must be used within <Carousel>.");
  }
  return ctx;
}

export const Carousel = forwardRef<HTMLDivElement, CarouselProps>(
  (
    {
      orientation = "horizontal",
      opts,
      setApi,
      plugins,
      className,
      children,
      onKeyDownCapture,
      ...props
    },
    ref
  ) => {
    const [carouselRef, api] = useEmblaCarousel(
      {
        ...opts,
        axis: orientation === "horizontal" ? "x" : "y",
      },
      plugins
    );
    const [canScrollPrev, setCanScrollPrev] = useState(false);
    const [canScrollNext, setCanScrollNext] = useState(false);

    const updateScrollButtons = useCallback((instance: CarouselApi | undefined) => {
      if (!instance) return;
      setCanScrollPrev(instance.canScrollPrev());
      setCanScrollNext(instance.canScrollNext());
    }, []);

    const scrollPrev = useCallback(() => {
      api?.scrollPrev();
    }, [api]);

    const scrollNext = useCallback(() => {
      api?.scrollNext();
    }, [api]);

    const handleKeyDown = useCallback(
      (event: KeyboardEvent<HTMLDivElement>) => {
        onKeyDownCapture?.(event);
        if (event.defaultPrevented) return;
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          scrollPrev();
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          scrollNext();
        }
      },
      [onKeyDownCapture, scrollNext, scrollPrev]
    );

    useEffect(() => {
      setApi?.(api);
    }, [api, setApi]);

    useEffect(() => {
      if (!api) return;
      const onSelect = () => updateScrollButtons(api);
      api.on("reInit", onSelect);
      api.on("select", onSelect);
      const frame = requestAnimationFrame(onSelect);
      return () => {
        cancelAnimationFrame(frame);
        api.off("select", onSelect);
        api.off("reInit", onSelect);
      };
    }, [api, updateScrollButtons]);

    const contextValue = useMemo<CarouselContextValue>(
      () => ({
        carouselRef,
        api,
        scrollPrev,
        scrollNext,
        canScrollPrev,
        canScrollNext,
        orientation,
      }),
      [
        api,
        canScrollNext,
        canScrollPrev,
        carouselRef,
        orientation,
        scrollNext,
        scrollPrev,
      ]
    );

    return (
      <CarouselContext.Provider value={contextValue}>
        <div
          ref={ref}
          data-slot="carousel"
          role="region"
          aria-roledescription="carousel"
          className={cn("relative", className)}
          onKeyDownCapture={handleKeyDown}
          {...props}
        >
          {children}
        </div>
      </CarouselContext.Provider>
    );
  }
);
Carousel.displayName = "Carousel";

export const CarouselContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    const { carouselRef, orientation } = useCarouselContext();

    return (
      <div ref={carouselRef} className="overflow-hidden rounded-[inherit]" data-slot="carousel-viewport">
        <div
          ref={ref}
          data-slot="carousel-content"
          className={cn(
            "flex",
            orientation === "horizontal" ? "" : "flex-col",
            className
          )}
          {...props}
        />
      </div>
    );
  }
);
CarouselContent.displayName = "CarouselContent";

export const CarouselItem = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      role="group"
      aria-roledescription="slide"
      data-slot="carousel-item"
      className={cn("min-w-0 shrink-0 grow-0 basis-full", className)}
      {...props}
    />
  )
);
CarouselItem.displayName = "CarouselItem";

export const CarouselPrevious = forwardRef<
  HTMLButtonElement,
  ComponentProps<"button"> & { label?: string }
>(({ className, label = "Previous slide", children, disabled, "aria-label": ariaLabelProp, ...props }, ref) => {
  const { scrollPrev, canScrollPrev } = useCarouselContext();

  return (
    <button
      ref={ref}
      type="button"
      data-slot="carousel-previous"
      aria-label={ariaLabelProp ?? label}
      disabled={disabled ?? !canScrollPrev}
      onClick={scrollPrev}
      className={cn(
        "touch-manipulation disabled:pointer-events-none disabled:opacity-40",
        className
      )}
      {...props}
    >
      {children ?? <ChevronLeft className="h-5 w-5" aria-hidden />}
    </button>
  );
});
CarouselPrevious.displayName = "CarouselPrevious";

export const CarouselNext = forwardRef<
  HTMLButtonElement,
  ComponentProps<"button"> & { label?: string }
>(({ className, label = "Next slide", children, disabled, "aria-label": ariaLabelProp, ...props }, ref) => {
  const { scrollNext, canScrollNext } = useCarouselContext();

  return (
    <button
      ref={ref}
      type="button"
      data-slot="carousel-next"
      aria-label={ariaLabelProp ?? label}
      disabled={disabled ?? !canScrollNext}
      onClick={scrollNext}
      className={cn(
        "touch-manipulation disabled:pointer-events-none disabled:opacity-40",
        className
      )}
      {...props}
    >
      {children ?? <ChevronRight className="h-5 w-5" aria-hidden />}
    </button>
  );
});
CarouselNext.displayName = "CarouselNext";
