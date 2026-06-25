import Image from "next/image";

import type { PublicMarketingAsset } from "@/lib/public-marketing-assets";
import { cn } from "@/lib/utils";

type GeneratedMarketingVisualProps = {
  asset?: PublicMarketingAsset;
  src?: string;
  alt?: string;
  imageExists?: boolean;
  priority?: boolean;
  className?: string;
  label?: string;
  sizes?: string;
  quality?: number;
};

export default function GeneratedMarketingVisual({
  asset,
  src,
  alt,
  imageExists,
  priority = false,
  className,
  label,
  sizes = "(max-width: 768px) 100vw, 50vw",
  quality = 78,
}: GeneratedMarketingVisualProps) {
  const resolvedSrc = asset?.src ?? src;
  const resolvedAlt = asset?.alt ?? alt ?? "Decorative generated public marketing visual";
  const resolvedImageExists = asset?.imageExists ?? imageExists ?? false;
  const resolvedLabel = asset?.label ?? label ?? "Generated visual pending";

  return (
    <div
      className={cn(
        "public-card public-card-animated relative min-h-[18rem] overflow-hidden p-4 contain-paint",
        className
      )}
      data-public-image={resolvedImageExists && resolvedSrc ? "generated" : "fallback"}
    >
      {resolvedImageExists && resolvedSrc ? (
        <Image
          src={resolvedSrc}
          alt={resolvedAlt}
          fill
          priority={priority}
          loading={priority ? undefined : "lazy"}
          quality={quality}
          sizes={sizes}
          className="object-cover object-center will-change-auto"
        />
      ) : (
        <div
          role="img"
          aria-label={resolvedAlt}
          className="absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_25%_20%,rgba(214,170,94,0.28),transparent_32%),radial-gradient(circle_at_86%_16%,rgba(112,72,42,0.2),transparent_34%),linear-gradient(145deg,rgba(255,255,255,0.72),rgba(244,237,226,0.88))] dark:bg-[radial-gradient(circle_at_25%_20%,rgba(214,170,94,0.12),transparent_32%),radial-gradient(circle_at_86%_16%,rgba(112,72,42,0.22),transparent_34%),linear-gradient(145deg,rgba(48,39,31,0.9),rgba(35,30,26,0.94))]"
        >
          <div className="absolute left-8 top-8 rounded-full border border-border/70 bg-[color-mix(in_oklab,var(--surface-card-elevated)_74%,transparent)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground shadow-[inset_0_1px_0_var(--hairline-shine)]">
            {resolvedLabel}
          </div>
          <div className="absolute left-8 top-20 max-w-[14rem] text-sm font-semibold leading-6 text-foreground/78">
            Decorative marketing asset slot. Replace with approved generated `.webp` artwork only.
          </div>
          <div className="absolute bottom-10 left-8 h-16 w-36 rounded-[2rem_2rem_1rem_1rem] border border-border/70 bg-[color-mix(in_oklab,var(--primary)_20%,var(--surface-card-elevated)_80%)] shadow-[0_24px_54px_-38px_rgba(15,23,42,0.72)]" />
          <div className="absolute bottom-8 left-16 h-4 w-48 rounded-full bg-[color-mix(in_oklab,var(--foreground)_14%,transparent)] blur-sm" />
          <div className="absolute bottom-16 right-10 h-28 w-24 rounded-xl border border-border/70 bg-[color-mix(in_oklab,var(--surface-card-elevated)_78%,transparent)] shadow-[0_24px_54px_-38px_rgba(15,23,42,0.72)]" />
          <div className="absolute bottom-24 right-24 h-16 w-28 rounded-xl border border-border/70 bg-[color-mix(in_oklab,var(--accent)_42%,var(--surface-card-elevated)_58%)] shadow-[0_24px_54px_-38px_rgba(15,23,42,0.72)]" />
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full border border-border/50 bg-[color-mix(in_oklab,var(--primary)_10%,transparent)] blur-sm" />
        </div>
      )}
    </div>
  );
}
