import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

type Action = {
  label: string;
  href: string;
  variant?: "primary" | "secondary";
};

type PublicHeroBannerProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  primaryAction?: Action;
  secondaryAction?: Action;
  imageSrc?: string;
  imageAlt?: string;
  imageExists?: boolean;
  imagePosition?: "left" | "right" | "center";
  badges?: readonly string[];
  legalVariant?: boolean;
  compact?: boolean;
  imagePriority?: boolean;
};

const positionMap = {
  left: "object-left",
  right: "object-right",
  center: "object-center",
} as const;

export default function PublicHeroBanner({
  eyebrow,
  title,
  subtitle,
  primaryAction,
  secondaryAction,
  imageSrc,
  imageAlt,
  imageExists = false,
  imagePosition = "center",
  badges = [],
  legalVariant = false,
  compact = false,
  imagePriority = false,
}: PublicHeroBannerProps) {
  return (
    <section
      className={cn(
        "public-hero-banner group relative overflow-hidden rounded-[2rem] border border-white/75 p-6 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.62)] sm:p-8",
        legalVariant
          ? "bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(245,245,244,0.94))]"
          : "bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92))]",
        compact ? "min-h-[14rem]" : "min-h-[20rem]"
      )}
    >
      <div className="pointer-events-none absolute inset-0">
        {imageSrc && imageExists ? (
          <div className="absolute inset-y-0 right-0 w-full sm:w-[48%]">
            <Image
              src={imageSrc}
              alt={imageAlt || "Subidha Furniture public banner"}
              fill
              priority={imagePriority}
              sizes="(max-width: 640px) 100vw, 48vw"
              className={cn(
                "public-hero-image-motion opacity-45 mix-blend-multiply saturate-110",
                positionMap[imagePosition]
              )}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-white via-white/90 to-white/45" />
          </div>
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(180,147,106,0.24),transparent_45%),radial-gradient(circle_at_12%_90%,rgba(15,23,42,0.08),transparent_40%)]" />
        )}
      </div>

      <div className="relative z-10 flex h-full flex-col justify-between gap-5">
        <div>
          {eyebrow ? (
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {eyebrow}
            </div>
          ) : null}
          <h1 className={cn("mt-2 max-w-3xl font-semibold tracking-tight text-foreground", compact ? "text-3xl sm:text-4xl" : "text-4xl sm:text-5xl")}>
            {title}
          </h1>
          {subtitle ? (
            <p className={cn("mt-4 max-w-2xl text-muted-foreground", compact ? "text-sm leading-7" : "text-base leading-7")}>
              {subtitle}
            </p>
          ) : null}

          {badges.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {badges.map((badge) => (
                <span key={badge} className="inline-flex items-center rounded-full border border-white/80 bg-white/80 px-3 py-1 text-xs font-medium text-foreground">
                  {badge}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {(primaryAction || secondaryAction) ? (
          <div className="flex flex-wrap gap-3">
            {secondaryAction ? (
              <Link href={secondaryAction.href} className="public-action-secondary">
                {secondaryAction.label}
              </Link>
            ) : null}
            {primaryAction ? (
              <Link href={primaryAction.href} className="public-action-primary">
                {primaryAction.label}
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
