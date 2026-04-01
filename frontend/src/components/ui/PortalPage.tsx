// frontend/src/components/ui/PortalPage.tsx
"use client";

import Link from "next/link";

import { AlertTriangle, CheckCircle2, ChevronRight, Info, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";

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
      return "bg-primary text-primary-foreground border-primary hover:opacity-95";
    case "danger":
      return "bg-destructive text-destructive-foreground border-destructive hover:opacity-95";
    case "ghost":
      return "bg-transparent text-foreground border-dashed border-border hover:bg-accent hover:text-accent-foreground";
    case "secondary":
    default:
      return "bg-card text-foreground border-border hover:bg-accent hover:text-accent-foreground";
  }
}

function getToneClassName(tone: PortalStat["tone"] | PortalStatusBadge["tone"] = "default") {
  switch (tone) {
    case "success":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "danger":
      return "border-red-200 bg-red-50 text-red-700";
    case "info":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "default":
    default:
      return "border-border bg-muted text-foreground";
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
      className={[
        "portal-page mx-auto grid gap-5 px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8",
        className ?? "",
      ].join(" ")}
      style={{ maxWidth: resolvedMaxWidth }}
    >
      {breadcrumbs.length > 0 ? (
        <nav
          aria-label="Breadcrumb"
          className="portal-page-breadcrumbs flex flex-wrap items-center gap-1 text-sm text-muted-foreground"
        >
          {breadcrumbs.map((crumb, index) => {
            const isLast = index === breadcrumbs.length - 1;

            return (
              <div
                key={`${crumb.label}-${index}`}
                className="flex items-center gap-1"
              >
                {crumb.href && !isLast ? (
                  <Link
                    href={crumb.href}
                    className="rounded-sm transition hover:text-foreground"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className={isLast ? "font-medium text-foreground" : ""}>
                    {crumb.label}
                  </span>
                )}

                {!isLast ? <ChevronRight className="h-4 w-4" /> : null}
              </div>
            );
          })}
        </nav>
      ) : null}

      <section className="portal-page-header rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-5 p-5 sm:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight text-card-foreground sm:text-3xl">
                  {title}
                </h1>

                {statusBadge ? (
                  <span
                    className={[
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold",
                      getToneClassName(statusBadge.tone),
                    ].join(" ")}
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
                    className={[
                      "inline-flex h-10 items-center rounded-xl border px-4 text-sm font-medium transition",
                      getActionClassName(action.variant),
                    ].join(" ")}
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
                  className="rounded-xl border border-border bg-muted/40 p-4"
                >
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {stat.label}
                  </div>

                  <div
                    className={[
                      "mt-2 text-2xl font-bold tracking-tight",
                      stat.tone === "success"
                        ? "text-emerald-700"
                        : stat.tone === "warning"
                        ? "text-amber-700"
                        : stat.tone === "danger"
                        ? "text-red-700"
                        : stat.tone === "info"
                        ? "text-blue-700"
                        : "text-foreground",
                    ].join(" ")}
                  >
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="portal-page-content grid gap-4">{children}</section>
    </main>
  );
}
