"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
  X,
  Play,
  Camera,
} from "lucide-react";

import { shouldBypassNextImageOptimization, toBrowserReachableMediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";

export type LightboxMediaItem = {
  id?: string;
  type: "image" | "video";
  url: string;
  title?: string;
};

export type ProductImageLightboxProps = {
  isOpen: boolean;
  onClose: () => void;
  items: LightboxMediaItem[];
  initialIndex?: number;
  productName: string;
};

const ZOOM_STEPS = [1, 1.5, 2, 2.5, 3];

export default function ProductImageLightbox({
  isOpen,
  onClose,
  items,
  initialIndex = 0,
  productName,
}: ProductImageLightboxProps) {
  const [mounted, setMounted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const currentPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const thumbnailRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const thumbContainerRef = useRef<HTMLDivElement>(null);

  // Sync initialIndex when lightbox opens
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex);
      setScale(1);
      setPosition({ x: 0, y: 0 });
    }
  }, [isOpen, initialIndex]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock body scroll while lightbox is active
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  // Scroll active thumbnail into view
  useEffect(() => {
    if (!isOpen) return;
    const thumb = thumbnailRefs.current[currentIndex];
    if (thumb && thumbContainerRef.current) {
      thumb.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [currentIndex, isOpen]);

  const totalCount = items.length;
  const currentItem = items[currentIndex] || items[0];

  const resetZoom = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    currentPosRef.current = { x: 0, y: 0 };
  }, []);

  const goToNext = useCallback(() => {
    if (totalCount <= 1) return;
    setCurrentIndex((prev) => (prev + 1) % totalCount);
    resetZoom();
  }, [totalCount, resetZoom]);

  const goToPrev = useCallback(() => {
    if (totalCount <= 1) return;
    setCurrentIndex((prev) => (prev - 1 + totalCount) % totalCount);
    resetZoom();
  }, [totalCount, resetZoom]);

  const zoomIn = useCallback(() => {
    setScale((prev) => {
      const nextStep = ZOOM_STEPS.find((s) => s > prev + 0.05);
      return nextStep ?? 3;
    });
  }, []);

  const zoomOut = useCallback(() => {
    setScale((prev) => {
      const reversed = [...ZOOM_STEPS].reverse();
      const nextStep = reversed.find((s) => s < prev - 0.05);
      const target = nextStep ?? 1;
      if (target <= 1) {
        setPosition({ x: 0, y: 0 });
        currentPosRef.current = { x: 0, y: 0 };
      }
      return target;
    });
  }, []);

  const toggleDoubleTapZoom = useCallback(() => {
    if (scale > 1) {
      resetZoom();
    } else {
      setScale(2);
    }
  }, [scale, resetZoom]);

  // Keyboard navigation & zoom shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goToNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goToPrev();
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoomIn();
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        zoomOut();
      } else if (e.key === "0") {
        e.preventDefault();
        resetZoom();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, goToNext, goToPrev, zoomIn, zoomOut, resetZoom]);

  // Mouse & touch dragging when zoomed
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || scale <= 1) return;
    const newX = e.clientX - dragStartRef.current.x;
    const newY = e.clientY - dragStartRef.current.y;
    // Bound pan range
    const maxPan = 400 * (scale - 1);
    const clampedX = Math.max(-maxPan, Math.min(maxPan, newX));
    const clampedY = Math.max(-maxPan, Math.min(maxPan, newY));
    setPosition({ x: clampedX, y: clampedY });
    currentPosRef.current = { x: clampedX, y: clampedY };
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch drag
  const handleTouchStart = (e: React.TouchEvent) => {
    if (scale <= 1 || e.touches.length !== 1) return;
    const touch = e.touches[0];
    setIsDragging(true);
    dragStartRef.current = { x: touch.clientX - position.x, y: touch.clientY - position.y };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || scale <= 1 || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const newX = touch.clientX - dragStartRef.current.x;
    const newY = touch.clientY - dragStartRef.current.y;
    const maxPan = 400 * (scale - 1);
    const clampedX = Math.max(-maxPan, Math.min(maxPan, newX));
    const clampedY = Math.max(-maxPan, Math.min(maxPan, newY));
    setPosition({ x: clampedX, y: clampedY });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  if (!isOpen || !mounted || typeof document === "undefined" || totalCount === 0) {
    return null;
  }

  const resolvedUrl = toBrowserReachableMediaUrl(currentItem?.url) ?? currentItem?.url;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${productName} full-screen photo viewer`}
      className="fixed inset-0 z-[9999] flex flex-col bg-black/95 text-white select-none backdrop-blur-xl animate-in fade-in duration-200"
    >
      {/* Top Header Bar */}
      <header className="relative z-50 flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-4 sm:px-6 bg-black/50 backdrop-blur-md">
        <div className="flex items-center gap-3 min-w-0 pr-4">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/90">
              {currentItem?.type === "video" ? <Play className="size-3 fill-white" /> : <Camera className="size-3" />}
              <span>
                {currentIndex + 1} / {totalCount}
              </span>
            </span>
          </div>
          <h2 className="truncate text-sm font-medium text-white/90 max-w-[200px] sm:max-w-md">
            {productName} {currentItem?.title ? `— ${currentItem.title}` : ""}
          </h2>
        </div>

        {/* Zoom & Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {currentItem?.type === "image" && (
            <div className="hidden sm:flex items-center gap-1 rounded-full border border-white/15 bg-white/5 p-1">
              <button
                type="button"
                onClick={zoomOut}
                disabled={scale <= 1}
                aria-label="Zoom out"
                title="Zoom out (-)"
                className="flex size-8 items-center justify-center rounded-full text-white/80 hover:bg-white/15 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition"
              >
                <Minus className="size-4" />
              </button>
              <button
                type="button"
                onClick={resetZoom}
                aria-label="Reset zoom"
                title="Reset zoom (0)"
                className="px-2 text-xs font-semibold tabular-nums text-white/90 hover:text-white"
              >
                {Math.round(scale * 100)}%
              </button>
              <button
                type="button"
                onClick={zoomIn}
                disabled={scale >= 3}
                aria-label="Zoom in"
                title="Zoom in (+)"
                className="flex size-8 items-center justify-center rounded-full text-white/80 hover:bg-white/15 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition"
              >
                <Plus className="size-4" />
              </button>
              {scale > 1 && (
                <button
                  type="button"
                  onClick={resetZoom}
                  aria-label="Reset position"
                  title="Reset to 100%"
                  className="flex size-8 items-center justify-center rounded-full text-white/80 hover:bg-white/15 hover:text-white transition"
                >
                  <RotateCcw className="size-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Close Lightbox */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close photo viewer"
            title="Close (Esc)"
            className="flex size-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 active:scale-95 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <X className="size-5" />
          </button>
        </div>
      </header>

      {/* Main Showcase Stage */}
      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden p-2 sm:p-6"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Previous Chevron Button */}
        {totalCount > 1 && (
          <button
            type="button"
            onClick={goToPrev}
            aria-label="Previous photo"
            className="absolute left-3 sm:left-6 z-40 flex size-11 sm:size-12 items-center justify-center rounded-full bg-black/60 text-white shadow-xl backdrop-blur-md border border-white/20 transition hover:bg-white hover:text-black hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <ChevronLeft className="size-6" />
          </button>
        )}

        {/* Media Container */}
        <div
          className={cn(
            "relative size-full flex items-center justify-center",
            currentItem?.type === "image" && (scale > 1 ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in")
          )}
          onDoubleClick={toggleDoubleTapZoom}
        >
          {currentItem?.type === "video" ? (
            <div className="relative max-h-full max-w-full aspect-video w-[min(90vw,1200px)] rounded-2xl overflow-hidden shadow-2xl bg-black">
              <video
                src={resolvedUrl}
                controls
                autoPlay
                playsInline
                className="size-full object-contain"
              />
            </div>
          ) : (
            <div
              style={{
                transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                transition: isDragging ? "none" : "transform 0.25s cubic-bezier(0.2, 0, 0, 1)",
                transformOrigin: "center center",
              }}
              className="relative max-h-[82vh] max-w-[92vw] size-full flex items-center justify-center"
            >
              <div className="relative size-full max-h-[80vh] max-w-[88vw]">
                <Image
                  src={resolvedUrl}
                  alt={currentItem?.title || `${productName} full resolution`}
                  fill
                  priority
                  quality={95}
                  sizes="100vw"
                  className="object-contain"
                  unoptimized={shouldBypassNextImageOptimization(resolvedUrl)}
                  draggable={false}
                />
              </div>
            </div>
          )}
        </div>

        {/* Next Chevron Button */}
        {totalCount > 1 && (
          <button
            type="button"
            onClick={goToNext}
            aria-label="Next photo"
            className="absolute right-3 sm:right-6 z-40 flex size-11 sm:size-12 items-center justify-center rounded-full bg-black/60 text-white shadow-xl backdrop-blur-md border border-white/20 transition hover:bg-white hover:text-black hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <ChevronRight className="size-6" />
          </button>
        )}

        {/* Double-tap / Zoom Hint Toast (shown when not zoomed) */}
        {currentItem?.type === "image" && scale === 1 && (
          <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 z-30 hidden sm:flex items-center gap-2 rounded-full bg-black/70 px-4 py-1.5 text-xs text-white/80 shadow-lg backdrop-blur-md border border-white/10">
            <Maximize2 className="size-3 text-white/60" />
            <span>Double-click or tap to zoom • Esc to close</span>
          </div>
        )}
      </div>

      {/* Bottom Thumbnails Strip */}
      {totalCount > 1 && (
        <footer className="relative z-50 flex h-20 shrink-0 items-center justify-center border-t border-white/10 px-4 bg-black/60 backdrop-blur-md">
          <div
            ref={thumbContainerRef}
            className="flex items-center gap-2 overflow-x-auto py-2 px-2 max-w-full scroll-smooth no-scrollbar"
          >
            {items.map((item, idx) => {
              const isActive = idx === currentIndex;
              const isVideo = item.type === "video";
              const thumbUrl = toBrowserReachableMediaUrl(item.url) ?? item.url;

              return (
                <button
                  key={item.id || `${item.url}-${idx}`}
                  ref={(el) => {
                    thumbnailRefs.current[idx] = el;
                  }}
                  type="button"
                  onClick={() => {
                    setCurrentIndex(idx);
                    resetZoom();
                  }}
                  aria-label={`Jump to photo ${idx + 1}`}
                  className={cn(
                    "relative size-12 sm:size-14 shrink-0 overflow-hidden rounded-xl border-2 transition-all",
                    isActive
                      ? "border-primary ring-2 ring-primary/60 scale-105 opacity-100 shadow-md"
                      : "border-white/20 opacity-50 hover:opacity-90 hover:scale-100"
                  )}
                >
                  {isVideo ? (
                    <div className="size-full bg-slate-900 flex items-center justify-center">
                      <Play className="size-4 fill-white text-white" />
                    </div>
                  ) : (
                    <Image
                      src={thumbUrl}
                      alt={`Thumbnail ${idx + 1}`}
                      fill
                      sizes="60px"
                      className="object-cover"
                      unoptimized={shouldBypassNextImageOptimization(thumbUrl)}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </footer>
      )}
    </div>,
    document.body
  );
}

