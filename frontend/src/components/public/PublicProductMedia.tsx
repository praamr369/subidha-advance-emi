"use client";

import Image from "next/image";
import { ImageOff } from "lucide-react";
import { useState } from "react";

import { shouldBypassNextImageOptimization } from "@/lib/media";
import { cn } from "@/lib/utils";

type PublicProductMediaProps = {
  src?: string | null;
  alt: string;
  className?: string;
  imageClassName?: string;
  sizes: string;
  priority?: boolean;
  quality?: number;
  fallbackLabel?: string;
  badge?: string | null;
};

export default function PublicProductMedia({
  src,
  alt,
  className,
  imageClassName,
  sizes,
  priority = false,
  quality = 74,
  fallbackLabel = "Media pending",
  badge,
}: PublicProductMediaProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const resolvedSrc = src ?? null;
  const shouldRenderImage = Boolean(resolvedSrc) && failedSrc !== resolvedSrc;
  const shouldBypassOptimization = shouldBypassNextImageOptimization(src);

  return (
    <div
      className={cn(
        "relative isolate overflow-hidden rounded-[1.7rem] border border-border bg-card shadow-sm contain-paint",
        className
      )}
      data-public-image={shouldRenderImage ? "product" : "fallback"}
    >
      <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white dark:via-white/20 to-transparent" />
      <div className="pointer-events-none absolute -left-10 bottom-0 h-24 w-24 rounded-full bg-amber-200/30 dark:bg-amber-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-12 top-2 h-24 w-24 rounded-full bg-slate-200/40 dark:bg-slate-700/40 blur-3xl" />

      {shouldRenderImage ? (
        <Image
          src={resolvedSrc as string}
          alt={alt}
          fill
          className={cn("object-cover will-change-auto", imageClassName)}
          sizes={sizes}
          priority={priority}
          loading={priority ? undefined : "lazy"}
          quality={quality}
          unoptimized={shouldBypassOptimization}
          onError={() => setFailedSrc(resolvedSrc)}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-card text-muted-foreground">
          <div className="rounded-full border border-border bg-muted p-3">
            <ImageOff className="h-5 w-5" />
          </div>
          <div className="text-sm font-medium">{fallbackLabel}</div>
          <div className="max-w-[14rem] text-center text-xs text-muted-foreground">
            Uploaded product media will appear here once the catalog image is available.
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-slate-950/14 via-slate-950/0 to-transparent" />

      {badge ? (
        <div className="absolute left-4 top-4 rounded-full border border-border bg-slate-950/72 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-white shadow-[0_18px_36px_-24px_rgba(15,23,42,0.88)] backdrop-blur">
          {badge}
        </div>
      ) : null}
    </div>
  );
}
