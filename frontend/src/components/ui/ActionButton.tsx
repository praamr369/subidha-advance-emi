"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

type ActionButtonVariant =
  | "primary"
  | "secondary"
  | "destructive"
  | "outline"
  | "ghost";

type ActionButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "type" | "disabled" | "onClick" | "className"
> & {
  children: ReactNode;
  href?: string;
  type?: "button" | "submit" | "reset";
  variant?: ActionButtonVariant;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  loading?: boolean;
  isLoading?: boolean;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  ariaLabel?: string;
  onClick?: () => void;
  className?: string;
};

function getVariantClassName(variant: ActionButtonVariant) {
  switch (variant) {
    case "primary":
      return "border-primary/90 bg-primary text-primary-foreground shadow-[0_18px_34px_-24px_rgba(15,23,42,0.62)] hover:-translate-y-0.5 hover:bg-[color-mix(in_oklab,var(--primary)_90%,black_10%)] hover:border-primary";
    case "destructive":
      return "border-red-700/80 bg-red-700 text-white shadow-[0_18px_34px_-24px_rgba(127,29,29,0.76)] hover:-translate-y-0.5 hover:bg-red-800";
    case "outline":
      return "border-[var(--surface-border-strong)] bg-[linear-gradient(180deg,color-mix(in_oklab,white_98%,var(--surface-muted)_2%),color-mix(in_oklab,var(--surface-card-soft)_86%,var(--surface-muted)_14%))] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] hover:-translate-y-0.5 hover:bg-[var(--surface-muted)]";
    case "ghost":
      return "border-transparent bg-transparent text-foreground hover:border-border hover:bg-[var(--surface-muted)]";
    case "secondary":
    default:
      return "border-border bg-[linear-gradient(180deg,color-mix(in_oklab,white_98%,var(--surface-muted)_2%),color-mix(in_oklab,var(--surface-strong)_82%,var(--surface-muted)_18%))] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] hover:-translate-y-0.5 hover:border-[var(--surface-border-strong)] hover:bg-[color-mix(in_oklab,var(--surface-strong)_80%,var(--surface-muted)_20%)]";
  }
}

const baseClassName =
  "inline-flex items-center justify-center gap-2 rounded-xl border font-semibold tracking-[0.01em] transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/40 disabled:cursor-not-allowed disabled:border-border disabled:bg-[var(--surface-muted)] disabled:text-muted-foreground disabled:shadow-none";

function getSizeClassName(size: NonNullable<ActionButtonProps["size"]>) {
  switch (size) {
    case "sm":
      return "h-9 px-3 text-xs";
    case "lg":
      return "h-11 px-5 text-sm";
    case "md":
    default:
      return "h-10 px-4 text-sm";
  }
}

export default function ActionButton({
  children,
  href,
  type = "button",
  variant = "secondary",
  size = "md",
  disabled = false,
  loading = false,
  isLoading,
  fullWidth = false,
  leftIcon,
  rightIcon,
  ariaLabel,
  onClick,
  className,
  ...nativeButtonProps
}: ActionButtonProps) {
  const resolvedLoading = loading || Boolean(isLoading);
  const resolvedDisabled = disabled || resolvedLoading;
  const content = (
    <>
      {leftIcon && !resolvedLoading ? <span className="inline-flex shrink-0">{leftIcon}</span> : null}
      {resolvedLoading ? (
        <span className="inline-flex h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />
      ) : null}
      <span>{children}</span>
      {rightIcon ? <span className="inline-flex shrink-0">{rightIcon}</span> : null}
    </>
  );
  const resolvedClassName = cn(
    baseClassName,
    getSizeClassName(size),
    getVariantClassName(variant),
    fullWidth ? "w-full" : "",
    className
  );

  if (href) {
    return (
      <Link
        href={href}
        aria-disabled={resolvedDisabled}
        aria-busy={resolvedLoading}
        aria-label={ariaLabel}
        tabIndex={resolvedDisabled ? -1 : nativeButtonProps.tabIndex}
        className={cn(resolvedClassName, resolvedDisabled && "pointer-events-none")}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      {...nativeButtonProps}
      type={type}
      onClick={onClick}
      disabled={resolvedDisabled}
      aria-label={ariaLabel ?? nativeButtonProps["aria-label"]}
      aria-busy={resolvedLoading}
      className={resolvedClassName}
    >
      {content}
    </button>
  );
}
