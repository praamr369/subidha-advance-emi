"use client";

import Image from "next/image";
import { useState } from "react";

import { brandConfig } from "@/config/brand";
import { cn } from "@/lib/utils";

type BrandLockupProps = {
  className?: string;
  compact?: boolean;
  subtitle?: string;
};

export default function BrandLockup({
  className,
  compact = false,
  subtitle,
}: BrandLockupProps) {
  const [logoFailed, setLogoFailed] = useState(false);
  const shouldShowLogo = Boolean(brandConfig.publicLogoSrc) && !logoFailed;

  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[1.15rem] border border-white/70 bg-[linear-gradient(155deg,rgba(255,255,255,0.95),rgba(226,232,240,0.82))] text-slate-900 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.72)]">
        <div className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent" />
        <div className="pointer-events-none absolute -right-4 top-1 h-8 w-8 rounded-full bg-amber-200/45 blur-xl" />
        <div className="pointer-events-none absolute -left-3 bottom-0 h-8 w-8 rounded-full bg-sky-200/35 blur-xl" />
        {shouldShowLogo ? (
          <Image
            src={brandConfig.publicLogoSrc as string}
            alt={brandConfig.publicLogoAlt}
            fill
            className="object-contain p-2"
            sizes="48px"
            onError={() => setLogoFailed(true)}
          />
        ) : (
          <span className="relative text-sm font-semibold tracking-[0.24em]">
            SF
          </span>
        )}
      </div>

      <div className="min-w-0">
        <div className="truncate text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-600">
          {brandConfig.platformName}
        </div>
        <div
          className={cn(
            "truncate font-semibold text-foreground",
            compact ? "text-base" : "text-lg"
          )}
        >
          {brandConfig.companyName}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {subtitle ??
            `${brandConfig.publicProgramName} product browsing, enquiry, and winner transparency`}
        </div>
      </div>
    </div>
  );
}
