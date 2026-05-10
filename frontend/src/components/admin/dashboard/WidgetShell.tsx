"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  X,
  Pin,
  PinOff,
  Siren,
  AlertTriangle,
  CheckCircle2,
  CircleDot,
} from "lucide-react";

import type { AdminDashboardWidgetAttention } from "@/lib/admin-dashboard-widgets";
import { cn } from "@/lib/utils";

type WidgetShellProps = {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  attention?: AdminDashboardWidgetAttention;
  attentionLabel?: string;
  openHref?: string;
  pinned?: boolean;
  collapsed?: boolean;
  isFixed?: boolean;
  onTogglePinned?: () => void;
  onToggleCollapsed?: () => void;
  onRemove?: () => void;
  onRefresh?: () => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
};

function attentionConfig(
  attention: AdminDashboardWidgetAttention | undefined
): { label: string; className: string; Icon: typeof CircleDot } {
  if (attention === "urgent") {
    return {
      label: "Urgent",
      className: "chip-tone-danger",
      Icon: Siren,
    };
  }
  if (attention === "warning") {
    return {
      label: "Attention",
      className: "chip-tone-warning",
      Icon: AlertTriangle,
    };
  }
  if (attention === "quiet") {
    return {
      label: "Quiet",
      className: "chip-tone-success",
      Icon: CheckCircle2,
    };
  }
  return {
    label: "Normal",
    className: "border border-border bg-[var(--surface-muted)] text-foreground shadow-[var(--badge-inset-highlight)]",
    Icon: CircleDot,
  };
}

function IconAction({
  label,
  onClick,
  children,
  disabled,
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-[var(--surface-card-elevated)] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] transition hover:-translate-y-0.5 hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-60"
      )}
    >
      {children}
    </button>
  );
}

export default function WidgetShell({
  title,
  subtitle,
  icon,
  attention = "normal",
  attentionLabel,
  openHref,
  pinned = false,
  collapsed = false,
  isFixed = false,
  onTogglePinned,
  onToggleCollapsed,
  onRemove,
  onRefresh,
  onMoveLeft,
  onMoveRight,
  children,
  footer,
  className,
}: WidgetShellProps) {
  const chip = attentionConfig(attention);
  const badgeLabel = attentionLabel ?? chip.label;

  return (
    <section
      className={cn(
        "surface-panel-elevated relative overflow-hidden rounded-[1.75rem] border border-border bg-card shadow-[0_18px_54px_-44px_rgba(15,23,42,0.52)]",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[var(--surface-border-strong)]/70 to-transparent" />

      <header className="flex flex-wrap items-start justify-between gap-3 p-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {icon ? (
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-[var(--surface-card-elevated)] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]">
                {icon}
              </span>
            ) : null}

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-base font-semibold text-foreground">{title}</h2>

                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                    chip.className
                  )}
                >
                  <chip.Icon className="h-3.5 w-3.5" />
                  {badgeLabel}
                </span>
              </div>
              {subtitle ? (
                <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">
                  {subtitle}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onMoveLeft ? (
            <IconAction label="Move left" onClick={onMoveLeft}>
              <ArrowLeft className="h-4 w-4" />
            </IconAction>
          ) : null}
          {onMoveRight ? (
            <IconAction label="Move right" onClick={onMoveRight}>
              <ArrowRight className="h-4 w-4" />
            </IconAction>
          ) : null}

          {openHref ? (
            <Link
              href={openHref}
              aria-label="Open module"
              title="Open module"
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-[var(--surface-strong)] px-3 text-xs font-semibold text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.76)] transition hover:-translate-y-0.5 hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-muted)]"
            >
              Open
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          ) : null}

          {onRefresh ? (
            <IconAction label="Refresh widget" onClick={onRefresh}>
              <RefreshCw className="h-4 w-4" />
            </IconAction>
          ) : null}

          {onTogglePinned ? (
            <IconAction
              label={pinned ? "Unpin widget" : "Pin widget"}
              onClick={onTogglePinned}
            >
              {pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            </IconAction>
          ) : null}

          {onToggleCollapsed ? (
            <IconAction
              label={collapsed ? "Expand widget" : "Collapse widget"}
              onClick={onToggleCollapsed}
            >
              {collapsed ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronUp className="h-4 w-4" />
              )}
            </IconAction>
          ) : null}

          {!isFixed && onRemove ? (
            <IconAction label="Remove widget" onClick={onRemove}>
              <X className="h-4 w-4" />
            </IconAction>
          ) : null}
        </div>
      </header>

      {!collapsed ? (
        <div className="px-5 pb-5">
          {children}
          {footer ? <div className="mt-5 border-t border-border/80 pt-4">{footer}</div> : null}
        </div>
      ) : null}
    </section>
  );
}

