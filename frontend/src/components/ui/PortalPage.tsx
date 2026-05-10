// frontend/src/components/ui/PortalPage.tsx
"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronRight, Info, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

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
  eyebrow?: string;
  title: string;
  subtitle?: string;
  helperNote?: string;
  helperTone?: "default" | "info" | "warning";
  actions?: ReadonlyArray<PortalAction>;
  breadcrumbs?: ReadonlyArray<PortalBreadcrumb>;
  stats?: ReadonlyArray<PortalStat>;
  statusBadge?: PortalStatusBadge;
  children?: ReactNode;
  maxWidth?: number | string;
  className?: string;
  presentation?: "page" | "popup";
};

function getActionClassName(variant: PortalAction["variant"] = "secondary") {
  switch (variant) {
    case "primary":
      return "border-primary/80 bg-primary text-primary-foreground shadow-[0_18px_34px_-24px_rgba(30,64,175,0.62)] hover:bg-[color-mix(in_oklab,var(--primary)_90%,black_10%)]";
    case "danger":
      return "border-destructive/70 bg-destructive text-destructive-foreground shadow-[0_18px_40px_-28px_rgba(127,29,29,0.75)]";
    case "ghost":
      return "border-border bg-[var(--surface-card-elevated)] text-foreground hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-muted)]";
    case "secondary":
    default:
      return "border-border bg-[var(--surface-strong)] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.68)] hover:border-[var(--surface-border-strong)] hover:bg-[color-mix(in_oklab,var(--surface-strong)_76%,var(--surface-muted)_24%)]";
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
      return "border-slate-300 bg-slate-100 text-foreground";
  }
}

function getToneIcon(tone: PortalStat["tone"] | PortalStatusBadge["tone"] = "default") {
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

function normalizeStatValue(value: string | number): string | number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  const trimmed = value.trim();
  return trimmed || "—";
}

export default function PortalPage({
  eyebrow,
  title,
  subtitle,
  helperNote,
  helperTone = "default",
  actions = [],
  breadcrumbs = [],
  stats = [],
  statusBadge,
  children,
  maxWidth = "none",
  className,
  presentation = "page",
}: PortalPageProps) {
  const resolvedMaxWidth = typeof maxWidth === "number" ? `${maxWidth}px` : maxWidth;
  const widthStyle =
    resolvedMaxWidth === "none" || resolvedMaxWidth === "100%" ? undefined : { maxWidth: resolvedMaxWidth };
  const isPopup = presentation === "popup";
  const showPopupMeta = isPopup && Boolean(subtitle || helperNote || statusBadge || actions.length > 0);

  return (
    <main
      className={cn(
        "portal-page flex w-full min-w-0 max-w-none flex-col gap-[var(--workspace-gap)]",
        isPopup ? "popup-workflow-page px-0 py-1 sm:px-0 sm:py-1 lg:px-0 lg:py-1" : "px-2 py-4 sm:px-4 sm:py-5 lg:px-6 lg:py-6",
        className
      )}
      style={widthStyle}
    >
      {!isPopup && breadcrumbs.length > 0 ? (
        <nav
          aria-label="Breadcrumb"
          className="portal-page-breadcrumbs flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
        >
          {breadcrumbs.map((crumb, index) => {
            const isLast = index === breadcrumbs.length - 1;

            return (
              <div key={`${crumb.label}-${index}`} className="flex items-center gap-2">
                {crumb.href && !isLast ? (
                  <Link
                    href={crumb.href}
                    className="workspace-pill inline-flex items-center px-3 py-1 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold",
                      isLast
                        ? "border-primary/65 bg-primary text-primary-foreground shadow-[0_14px_30px_-24px_rgba(30,64,175,0.68)]"
                        : "workspace-pill text-foreground"
                    )}
                  >
                    {crumb.label}
                  </span>
                )}

                {!isLast ? <ChevronRight className="h-4 w-4 text-slate-400" /> : null}
              </div>
            );
          })}
        </nav>
      ) : null}

      {isPopup ? (
        <>
          <h1 className="sr-only">{title}</h1>
          {showPopupMeta ? (
            <section className="popup-workflow-toolbar workspace-header-panel rounded-[1.45rem] px-4 py-4 sm:px-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 flex-1">
                  {eyebrow ? <div className="enterprise-eyebrow">{eyebrow}</div> : null}
                  {statusBadge ? (
                    <span
                      className={cn(
                        "workspace-pill mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]",
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

                  {subtitle ? (
                    <p
                      className={cn(
                        "max-w-4xl text-sm leading-6 text-muted-foreground",
                        statusBadge || eyebrow ? "mt-3" : ""
                      )}
                    >
                      {subtitle}
                    </p>
                  ) : null}

                  {helperNote ? (
                    <div
                      className={cn(
                        "mt-3 inline-flex max-w-4xl items-start rounded-xl border px-3 py-2 text-xs font-medium leading-6",
                        helperTone === "warning"
                          ? "border-amber-200/90 bg-amber-50/85 text-amber-900"
                          : helperTone === "info"
                            ? "border-sky-200/90 bg-sky-50/85 text-sky-900"
                            : "border-border bg-[var(--surface-muted)] text-foreground"
                      )}
                    >
                      {helperNote}
                    </div>
                  ) : null}
                </div>

                {actions.length > 0 ? (
                  <div className="portal-page-actions workspace-action-bar flex flex-wrap items-center gap-2 p-2 xl:justify-end">
                    {actions.map((action) => (
                      <Link
                        key={`${action.href}-${action.label}`}
                        href={action.href}
                        className={cn(
                          "inline-flex h-10 items-center rounded-xl border px-4 text-sm font-semibold tracking-[0.01em] transition duration-200",
                          getActionClassName(action.variant)
                        )}
                      >
                        {action.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <section className="portal-page-header workspace-header-panel">
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[var(--surface-border-strong)]/70 to-transparent" />
          <div className="relative flex flex-col gap-5 p-4 sm:p-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0 flex-1">
                {eyebrow ? <div className="enterprise-eyebrow">{eyebrow}</div> : null}
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="enterprise-title">{title}</h1>

                  {statusBadge ? (
                    <span
                      className={cn(
                        "workspace-pill inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold",
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
                  <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground sm:text-base">{subtitle}</p>
                ) : null}

                {helperNote ? (
                  <div
                    className={cn(
                      "mt-3 inline-flex max-w-4xl items-start rounded-xl border px-3 py-2 text-xs font-medium leading-6",
                      helperTone === "warning"
                        ? "border-amber-200/90 bg-amber-50/85 text-amber-900"
                        : helperTone === "info"
                          ? "border-sky-200/90 bg-sky-50/85 text-sky-900"
                          : "border-border bg-[var(--surface-muted)] text-foreground"
                    )}
                  >
                    {helperNote}
                  </div>
                ) : null}
              </div>

              {actions.length > 0 ? (
                <div className="portal-page-actions workspace-action-bar flex flex-wrap items-center gap-2 p-2 xl:justify-end">
                  {actions.map((action) => (
                    <Link
                      key={`${action.href}-${action.label}`}
                      href={action.href}
                      className={cn(
                        "inline-flex h-10 items-center rounded-xl border px-4 text-sm font-semibold tracking-[0.01em] transition duration-200",
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
              <div className="portal-page-stats workspace-kpi-band grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 xl:grid-cols-4">
                {stats.map((stat, index) => (
                  <div
                    key={`${stat.label}-${index}`}
                    className="rounded-[1.1rem] border border-[color-mix(in_oklab,var(--surface-border-strong)_78%,white_22%)] bg-[var(--surface-card-elevated)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.78),0_12px_35px_-28px_rgba(15,23,42,0.28)]"
                  >
                    <div className="enterprise-eyebrow">{stat.label}</div>

                    <div
                      className={cn(
                        "enterprise-metric mt-2",
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
                      {normalizeStatValue(stat.value)}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      )}

      <section className="portal-page-content grid min-w-0 gap-4 sm:gap-5">{children}</section>
    </main>
  );
}
