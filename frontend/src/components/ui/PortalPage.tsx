// frontend/src/components/ui/PortalPage.tsx
"use client";

import Link from "next/link";

import { AlertTriangle, CheckCircle2, ChevronRight, Info, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// ... (rest of the file remains as is, but we can add cn usage)

type PortalAction = {
  href: string;
  label: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
};

type PortalBreadcrumb = {
  href?: string;
  label: string;
};

type PortalStat = {
  label: string;
  value: string | number;
  tone?: "default" | "success" | "warning" | "danger" | "info";
};

type PortalStatusBadge = {
  label: string;
  tone?: "default" | "success" | "warning" | "danger" | "info";
};

type PortalPageProps = {
  title: string;
  subtitle?: string;
  actions?: ReadonlyArray<PortalAction>;
  breadcrumbs?: ReadonlyArray<PortalBreadcrumb>;
  stats?: ReadonlyArray<PortalStat>;
  statusBadge?: PortalStatusBadge;
  children?: ReactNode;
  maxWidth?: number | string;
  className?: string;
};

function getActionClassName(variant: PortalAction["variant"] = "secondary") {
  switch (variant) {
    case "primary":
      return "border-primary/80 bg-foreground text-background shadow-[0_18px_40px_-28px_rgba(15,23,42,0.8)] hover:-translate-y-0.5 hover:shadow-[0_24px_48px_-28px_rgba(15,23,42,0.9)]";
    case "danger":
      return "border-destructive/70 bg-destructive text-destructive-foreground shadow-[0_18px_40px_-28px_rgba(127,29,29,0.75)] hover:-translate-y-0.5";
    case "ghost":
      return "border-dashed border-slate-300 bg-transparent text-slate-900 hover:bg-slate-100 hover:text-slate-950";
    case "secondary":
    default:
      return "border-slate-200 bg-slate-100 text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.62)] hover:-translate-y-0.5 hover:bg-slate-200";
  }
}

function getToneClassName(tone: PortalStat["tone"] | PortalStatusBadge["tone"] = "default") {
  switch (tone) {
    case "success":
      return "border-emerald-200/80 bg-emerald-50/90 text-emerald-900";
    case "warning":
      return "border-amber-200/80 bg-amber-50/90 text-amber-900";
    case "danger":
      return "border-red-200/80 bg-red-50/90 text-red-900";
    case "info":
      return "border-sky-200/80 bg-sky-50/90 text-sky-900";
    case "default":
    default:
      return "border-white/70 bg-white/75 text-foreground";
  }
}

function getToneIcon(
  tone: PortalStat["tone"] | PortalStatusBadge["tone"] = "default"
) {
  switch (tone) {
    case "success":
      return CheckCircle2;
    case "warning":
      return AlertTriangle;
    case "danger":
      return ShieldAlert;
    case "info":
      return Info;
    case "default":
    default:
      return Info;
  }
}

export default function PortalPage({
  title,
  subtitle,
  actions = [],
  breadcrumbs = [],
  stats = [],
  statusBadge,
  children,
  maxWidth = 1320,
  className,
}: PortalPageProps) {
  const resolvedMaxWidth =
    typeof maxWidth === "number" ? `${maxWidth}px` : maxWidth;

  return (
    <main
      className={cn(
        "portal-page mx-auto flex flex-col gap-6 px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8",
        className
      )}
      style={{ maxWidth: resolvedMaxWidth }}
    >
      {breadcrumbs.length > 0 ? (
        <nav
          aria-label="Breadcrumb"
          className="portal-page-breadcrumbs flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
        >
          {breadcrumbs.map((crumb, index) => {
            const isLast = index === breadcrumbs.length - 1;

            return (
              <div
                key={`${crumb.label}-${index}`}
                className="flex items-center gap-2"
              >
                {crumb.href && !isLast ? (
                  <Link
                    href={crumb.href}
                    className="inline-flex items-center rounded-full border border-white/70 bg-white/60 px-3 py-1 text-xs font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition hover:bg-white/90 hover:text-foreground"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-3 py-1 text-xs",
                      isLast
                        ? "border-slate-900/10 bg-slate-900 text-white shadow-[0_10px_24px_-18px_rgba(15,23,42,0.8)]"
                        : "border-white/70 bg-white/60 font-medium text-foreground"
                    )}
                  >
                    {crumb.label}
                  </span>
                )}

                {!isLast ? (
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                ) : null}
              </div>
            );
          })}
        </nav>
      ) : null}

      <section className="portal-page-header relative overflow-hidden rounded-[2rem] border border-white/70 bg-[radial-gradient(circle_at_top_right,rgba(125,211,252,0.22),transparent_28%),radial-gradient(circle_at_top_left,rgba(251,191,36,0.16),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] shadow-[0_28px_80px_-48px_rgba(15,23,42,0.68)]">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.24),transparent_45%)]" />
        <div className="pointer-events-none absolute -right-16 top-0 h-44 w-44 rounded-full bg-sky-200/25 blur-3xl" />
        <div className="pointer-events-none absolute left-0 top-16 h-36 w-36 rounded-full bg-amber-200/20 blur-3xl" />
        <div className="relative flex flex-col gap-6 p-5 sm:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight text-card-foreground sm:text-3xl lg:text-[2rem]">
                  {title}
                </h1>

                {statusBadge ? (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] backdrop-blur",
                      getToneClassName(statusBadge.tone)
                    )}
                  >
                    {(() => {
                      const Icon = getToneIcon(statusBadge.tone);
                      return <Icon className="h-3.5 w-3.5" />;
                    })()}
                    {statusBadge.label}
                  </span>
                ) : null}
              </div>

              {subtitle ? (
                <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground sm:text-base">
                  {subtitle}
                </p>
              ) : null}
            </div>

            {actions.length > 0 ? (
              <div className="portal-page-actions flex flex-wrap items-center gap-2 xl:justify-end">
                {actions.map((action) => (
                  <Link
                    key={`${action.href}-${action.label}`}
                    href={action.href}
                    className={cn(
                      "inline-flex h-10 items-center rounded-xl border px-4 text-sm font-medium transition duration-200",
                      getActionClassName(action.variant)
                    )}
                  >
                    {action.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>

          {stats.length > 0 ? (
            <div className="portal-page-stats grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {stats.map((stat, index) => (
                <div
                  key={`${stat.label}-${index}`}
                  className="rounded-[1.4rem] border border-white/75 bg-white/75 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.78),0_18px_45px_-36px_rgba(15,23,42,0.58)] backdrop-blur"
                >
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {stat.label}
                  </div>

                  <div
                    className={cn(
                      "mt-2 text-2xl font-semibold tracking-tight",
                      stat.tone === "success"
                        ? "text-emerald-800"
                        : stat.tone === "warning"
                        ? "text-amber-800"
                        : stat.tone === "danger"
                        ? "text-red-800"
                        : stat.tone === "info"
                        ? "text-sky-800"
                        : "text-foreground"
                    )}
                  >
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="portal-page-content grid gap-5">{children}</section>
    </main>
  );
}
