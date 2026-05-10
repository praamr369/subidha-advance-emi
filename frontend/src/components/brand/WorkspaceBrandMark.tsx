"use client";

import Image from "next/image";
import { useState } from "react";

import { brandConfig } from "@/config/brand";
import { cn } from "@/lib/utils";

type WorkspaceBrandMarkProps = {
  className?: string;
  /** Edge length in CSS pixels */
  size?: number;
  variant?: "onSidebar" | "onLight";
};

/**
 * Compact logo tile for dashboard chrome: uses `/brand/logo.png` when available,
 * otherwise a professional “SF” monogram aligned with Subidha Furniture styling.
 */
export function WorkspaceBrandMark({ className, size = 32, variant = "onLight" }: WorkspaceBrandMarkProps) {
  const [logoFailed, setLogoFailed] = useState(false);
  const src = brandConfig.publicLogoSrc;
  const showLogo = Boolean(src) && !logoFailed;
  const dim = `${size}px`;
  const tooltip = `${brandConfig.companyName} — ${brandConfig.systemProductName}`;

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg",
        variant === "onSidebar"
          ? "bg-[color-mix(in_oklab,var(--sidebar-primary)_22%,transparent)] ring-1 ring-white/12"
          : "bg-gradient-to-br from-amber-50 via-amber-50/95 to-amber-100/85 ring-1 ring-amber-900/12",
        className
      )}
      style={{ width: dim, height: dim }}
      role="img"
      aria-label={brandConfig.publicLogoAlt}
      title={tooltip}
    >
      {showLogo ? (
        <Image
          src={src}
          alt=""
          fill
          className="object-contain p-[3px]"
          sizes={dim}
          onError={() => setLogoFailed(true)}
        />
      ) : (
        <span
          className={cn(
            "select-none text-[11px] font-bold tracking-tight",
            variant === "onSidebar" ? "text-[var(--sidebar-primary)]" : "text-amber-950"
          )}
          aria-hidden
        >
          SF
        </span>
      )}
    </div>
  );
}
