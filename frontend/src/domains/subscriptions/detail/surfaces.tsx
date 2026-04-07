"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type SurfaceTone = "default" | "success" | "info" | "warning" | "danger";

type DetailHeroSurfaceProps = {
  eyebrow: string;
  title: string;
  description: string;
  tone?: SurfaceTone;
  badge?: ReactNode;
  meta?: ReactNode;
  footer?: ReactNode;
  className?: string;
};

type DetailSectionShellProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

type DetailMetricTileProps = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: SurfaceTone;
  className?: string;
};

function surfaceToneClassName(tone: SurfaceTone = "default") {
  switch (tone) {
    case "success":
      return "border-emerald-200/80 bg-[linear-gradient(160deg,rgba(236,253,245,0.95),rgba(209,250,229,0.85))]";
    case "info":
      return "border-sky-200/80 bg-[linear-gradient(160deg,rgba(240,249,255,0.96),rgba(224,242,254,0.84))]";
    case "warning":
      return "border-amber-200/80 bg-[linear-gradient(160deg,rgba(255,251,235,0.96),rgba(254,243,199,0.86))]";
    case "danger":
      return "border-red-200/80 bg-[linear-gradient(160deg,rgba(254,242,242,0.96),rgba(254,226,226,0.86))]";
    case "default":
    default:
      return "border-slate-200/80 bg-[linear-gradient(160deg,rgba(255,255,255,0.96),rgba(248,250,252,0.88))]";
  }
}

export function DetailHeroSurface({
  eyebrow,
  title,
  description,
  tone = "default",
  badge,
  meta,
  footer,
  className,
}: DetailHeroSurfaceProps) {
  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-[26px] border p-5 shadow-[0_24px_90px_-40px_rgba(15,23,42,0.3)] backdrop-blur-xl",
        surfaceToneClassName(tone),
        className
      )}
    >
      <div className="relative flex h-full flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              {eyebrow}
            </p>
            <h2 className="mt-3 text-xl font-semibold tracking-tight text-slate-950">
              {title}
            </h2>
          </div>
          {badge ? <div className="shrink-0">{badge}</div> : null}
        </div>

        <p className="max-w-2xl text-sm leading-6 text-slate-600">{description}</p>

        {meta ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{meta}</div>
        ) : null}

        {footer ? <div className="mt-auto">{footer}</div> : null}
      </div>
    </article>
  );
}

export function DetailMetricTile({
  label,
  value,
  hint,
  tone = "default",
  className,
}: DetailMetricTileProps) {
  const valueToneClassName =
    tone === "success"
      ? "text-emerald-700"
      : tone === "info"
      ? "text-sky-700"
      : tone === "warning"
      ? "text-amber-700"
      : tone === "danger"
      ? "text-red-700"
      : "text-slate-950";

  return (
    <div
      className={cn(
        "rounded-[22px] border border-white/70 bg-white/75 p-4 shadow-[0_20px_60px_-38px_rgba(15,23,42,0.35)] backdrop-blur-lg",
        className
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <div className={cn("mt-3 text-2xl font-semibold tracking-tight", valueToneClassName)}>
        {value}
      </div>
      {hint ? <div className="mt-2 text-sm text-slate-500">{hint}</div> : null}
    </div>
  );
}

export function DetailSectionShell({
  title,
  description,
  action,
  children,
  className,
  contentClassName,
}: DetailSectionShellProps) {
  return (
    <section
      className={cn(
        "rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.9))] p-5 shadow-[0_26px_90px_-42px_rgba(15,23,42,0.32)] backdrop-blur-xl",
        className
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight text-slate-950">{title}</h2>
          {description ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>

      <div className={cn("mt-5", contentClassName)}>{children}</div>
    </section>
  );
}
