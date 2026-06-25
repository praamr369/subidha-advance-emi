// frontend/src/components/ui/PortalPage.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronRight, Info, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";

import ERPPageHeader from "@/components/erp/ERPPageHeader";
import { buildAdminCustomerAccountStatementPrintRoute } from "@/lib/route-builders";
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
  /**
   * Header rendering mode.
   * - "portal" (default): existing PortalPage header layout
   * - "erp": ERPPageHeader styling (behavior-neutral; links/stats preserved)
   */
  headerMode?: "portal" | "erp";
};

function getActionClassName(variant: PortalAction["variant"] = "secondary") {
  switch (variant) {
    case "primary":
      return "border-primary/85 bg-primary text-primary-foreground shadow-[0_16px_36px_-22px_color-mix(in_oklab,var(--primary)_38%,transparent)] hover:bg-[color-mix(in_oklab,var(--primary)_88%,black_12%)]";
    case "danger":
      return "border-destructive/70 bg-destructive text-destructive-foreground shadow-[0_18px_40px_-28px_rgba(127,29,29,0.75)]";
    case "ghost":
      return "border-border bg-[var(--surface-card-elevated)] text-foreground hover:border-border hover:bg-muted/50";
    case "secondary":
    default:
      return "border-border bg-background text-foreground shadow-[inset_0_1px_0_var(--hairline-shine)] hover:border-border hover:bg-muted/30";
  }
}

function getToneClassName(tone: PortalStat["tone"] | PortalStatusBadge["tone"] = "default") {
  switch (tone) {
    case "success":
      return "chip-tone-success font-semibold";
    case "warning":
      return "chip-tone-warning font-semibold";
    case "danger":
      return "chip-tone-danger font-semibold";
    case "info":
      return "chip-tone-info font-semibold";
    case "default":
    default:
      return "border-border bg-muted text-foreground";
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

function buildCustomerStatementAction(pathname: string | null): PortalAction | null {
  const match = pathname?.match(/^\/admin\/customers\/([^/?#]+)$/);
  const customerId = match?.[1];
  if (!customerId) return null;
  return {
    href: buildAdminCustomerAccountStatementPrintRoute(customerId),
    label: "Customer Account Statement PDF / Print",
    variant: "secondary",
  };
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
  headerMode = "portal",
}: PortalPageProps) {
  const pathname = usePathname();
  const customerStatementAction = buildCustomerStatementAction(pathname);
  const resolvedActions = customerStatementAction && !actions.some((action) => action.href === customerStatementAction.href)
    ? [...actions, customerStatementAction]
    : actions;
  const resolvedMaxWidth = typeof maxWidth === "number" ? `${maxWidth}px` : maxWidth;
  const widthStyle =
    resolvedMaxWidth === "none" || resolvedMaxWidth === "100%" ? undefined : { maxWidth: resolvedMaxWidth };
  const isPopup = presentation === "popup";
  const showPopupMeta = isPopup && Boolean(subtitle || helperNote || statusBadge || resolvedActions.length > 0);

  return (
    <div
      className={cn(
        "portal-page flex w-full min-w-0 max-w-none flex-col gap-[var(--workspace-gap)]",
        isPopup ? "popup-workflow-page px-0 py-1 sm:px-0 sm:py-1 lg:px-0 lg:py-1" : "px-3 py-4 sm:px-4 sm:py-5 lg:px-6 lg:py-6 xl:px-8",
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
              <div className="flex min-w-0 flex-col gap-4">
                <div className="w-full min-w-0">
                  {eyebrow ? <div className="enterprise-eyebrow">{eyebrow}</div> : null}
                  {statusBadge ? (
                    <span
                      className={cn(
                        "mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]",
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
                        "mt-3 inline-flex max-w-4xl items-start rounded-xl px-3 py-2 text-xs font-medium leading-6",
                        helperTone === "warning"
                          ? "chip-tone-warning"
                          : helperTone === "info"
                            ? "chip-tone-info"
                            : "border border-border bg-muted/50 text-foreground"
                      )}
                    >
                      {helperNote}
                    </div>
                  ) : null}
                </div>

                {resolvedActions.length > 0 ? (
                  <div className="portal-page-actions workspace-action-bar flex min-w-0 w-full max-w-full flex-wrap items-center gap-2 p-2 sm:justify-end">
                    {resolvedActions.map((action) => (
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
          <div className="relative flex min-w-0 flex-col gap-5 p-4 sm:p-6">
            {headerMode === "erp" ? (
              <>
                <ERPPageHeader
                  eyebrow={eyebrow}
                  title={title}
                  description={subtitle}
                  helperNote={helperNote}
                  helperTone={helperTone}
                  status={
                    statusBadge ? (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold",
                          getToneClassName(statusBadge.tone)
                        )}
                      >
                        {(() => {
                          const Icon = getToneIcon(statusBadge.tone);
                          return <Icon className="h-3.5 w-3.5" />;
                        })()}
                        {statusBadge.label}
                      </span>
                    ) : null
                  }
                  actions={
                    resolvedActions.length > 0 ? (
                      <div className="portal-page-actions workspace-action-bar flex min-w-0 w-full max-w-full flex-wrap items-center gap-2 p-2 sm:justify-end">
                        {resolvedActions.map((action) => (
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
                    ) : null
                  }
                  className="border-transparent bg-transparent p-0 shadow-none"
                />

                {stats.length > 0 ? (
                  <div className="portal-page-stats workspace-kpi-band grid grid-cols-1 gap-3 p-3 sm:grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))]">
                    {stats.map((stat, index) => (
                      <div
                        key={`${stat.label}-${index}`}
                        className="portal-stat-tile rounded-[1.1rem] border border-border bg-[var(--surface-card-elevated)] p-4 shadow-[inset_0_1px_0_var(--hairline-shine),0_12px_35px_-28px_rgba(15,23,42,0.22)]"
                      >
                        <div className="enterprise-eyebrow">{stat.label}</div>

                        <div
                          className={cn(
                            "enterprise-metric mt-2",
                            stat.tone === "success"
                              ? "text-[var(--semantic-success-fg)]"
                              : stat.tone === "warning"
                                ? "text-[var(--semantic-warning-fg)]"
                                : stat.tone === "danger"
                                  ? "text-[var(--semantic-danger-fg)]"
                                  : stat.tone === "info"
                                    ? "text-[var(--semantic-info-fg)]"
                                    : "text-foreground"
                          )}
                        >
                          {normalizeStatValue(stat.value)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div className="flex min-w-0 flex-col gap-4">
                  <div className="w-full min-w-0">
                    {eyebrow ? <div className="enterprise-eyebrow">{eyebrow}</div> : null}
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                      <h1 className="enterprise-title block w-full max-w-full break-words">{title}</h1>

                      {statusBadge ? (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold",
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

                    {helperNote ? (
                      <div
                        className={cn(
                          "mt-3 inline-flex max-w-4xl items-start rounded-xl border px-3 py-2 text-xs font-medium leading-6",
                          helperTone === "warning"
                            ? "border-amber-200/90 bg-amber-50/85 text-amber-900"
                            : helperTone === "info"
                              ? "border-sky-200/90 bg-sky-50/85 text-sky-900"
                              : "border-border bg-muted/50 text-foreground"
                        )}
                      >
                        {helperNote}
                      </div>
                    ) : null}
                  </div>

                  {resolvedActions.length > 0 ? (
                    <div className="portal-page-actions workspace-action-bar flex min-w-0 w-full max-w-full flex-wrap items-center gap-2 p-2 sm:justify-end">
                      {resolvedActions.map((action) => (
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
                  <div className="portal-page-stats workspace-kpi-band grid grid-cols-1 gap-3 p-3 sm:grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))]">
                    {stats.map((stat, index) => (
                      <div
                        key={`${stat.label}-${index}`}
                        className="portal-stat-tile rounded-[1.1rem] border border-border bg-[var(--surface-card-elevated)] p-4 shadow-[inset_0_1px_0_var(--hairline-shine),0_12px_35px_-28px_rgba(15,23,42,0.22)]"
                      >
                        <div className="enterprise-eyebrow">{stat.label}</div>

                        <div
                          className={cn(
                            "enterprise-metric mt-2",
                            stat.tone === "success"
                              ? "text-[var(--semantic-success-fg)]"
                              : stat.tone === "warning"
                                ? "text-[var(--semantic-warning-fg)]"
                                : stat.tone === "danger"
                                  ? "text-[var(--semantic-danger-fg)]"
                                  : stat.tone === "info"
                                    ? "text-[var(--semantic-info-fg)]"
                                    : "text-foreground"
                          )}
                        >
                          {normalizeStatValue(stat.value)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </section>
      )}

      <section className="portal-page-content grid min-w-0 gap-4 sm:gap-5">{children}</section>
    </div>
  );
}
