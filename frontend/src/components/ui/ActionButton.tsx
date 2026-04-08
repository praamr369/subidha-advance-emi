"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type ActionButtonVariant =
  | "primary"
  | "secondary"
  | "destructive"
  | "outline"
  | "ghost";

type ActionButtonProps = {
  children: ReactNode;
  href?: string;
  type?: "button" | "submit" | "reset";
  variant?: ActionButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
  className?: string;
};

function getVariantClassName(variant: ActionButtonVariant) {
  switch (variant) {
    case "primary":
      return "border-slate-950 bg-slate-950 text-white shadow-[0_18px_38px_-24px_rgba(15,23,42,0.9)] hover:bg-slate-900";
    case "destructive":
      return "border-red-700 bg-red-700 text-white shadow-[0_18px_38px_-24px_rgba(127,29,29,0.78)] hover:bg-red-800";
    case "outline":
      return "border-slate-300 bg-white text-slate-900 hover:bg-slate-50";
    case "ghost":
      return "border-transparent bg-transparent text-slate-900 hover:bg-slate-100";
    case "secondary":
    default:
      return "border-slate-200 bg-slate-100 text-slate-900 hover:bg-slate-200";
  }
}

const baseClassName =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-medium transition duration-200 focus:outline-none focus:ring-2 focus:ring-slate-400/60 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none";

export default function ActionButton({
  children,
  href,
  type = "button",
  variant = "secondary",
  disabled = false,
  loading = false,
  onClick,
  className,
}: ActionButtonProps) {
  const resolvedDisabled = disabled || loading;
  const content = (
    <>
      {loading ? (
        <span className="inline-flex h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />
      ) : null}
      <span>{children}</span>
    </>
  );
  const resolvedClassName = cn(baseClassName, getVariantClassName(variant), className);

  if (href) {
    return (
      <Link
        href={href}
        aria-disabled={resolvedDisabled}
        className={cn(resolvedClassName, resolvedDisabled && "pointer-events-none")}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={resolvedDisabled}
      className={resolvedClassName}
    >
      {content}
    </button>
  );
}

