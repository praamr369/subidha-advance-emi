// frontend/src/components/ui/FormActions.tsx
"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

type FormActionButton = {
  label: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
};

type FormActionsProps = {
  submitLabel?: string;
  submitLoadingLabel?: string;
  onSubmitClick?: () => void;
  submitting?: boolean;
  submitDisabled?: boolean;
  cancel?: FormActionButton | null;
  danger?: FormActionButton | null;
  extraActions?: ReactNode;
  align?: "left" | "right" | "between";
  sticky?: boolean;
};

export default function FormActions({
  submitLabel = "Save",
  submitLoadingLabel = "Saving...",
  onSubmitClick,
  submitting = false,
  submitDisabled = false,
  cancel = null,
  danger = null,
  extraActions,
  align = "right",
  sticky = false,
}: FormActionsProps) {
  const justifyContent =
    align === "left"
      ? "justify-start"
      : align === "between"
      ? "justify-between"
      : "justify-end";

  const renderAction = (action: FormActionButton, variant: "secondary" | "danger") => {
    const baseClasses =
      "inline-flex h-10 items-center justify-center rounded-xl border px-4 text-sm font-semibold tracking-[0.01em] transition disabled:cursor-not-allowed disabled:opacity-60";
    const variantClasses = {
      secondary:
        "border-border bg-[linear-gradient(180deg,color-mix(in_oklab,white_98%,var(--surface-muted)_2%),color-mix(in_oklab,var(--surface-card-soft)_86%,var(--surface-muted)_14%))] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] hover:-translate-y-0.5 hover:border-border hover:bg-muted/50",
      danger:
        "border-red-300 bg-red-50 text-red-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] hover:-translate-y-0.5 hover:border-red-400 hover:bg-red-100",
    };

    if (action.href) {
      return (
        <Link
          href={action.href}
          className={cn(baseClasses, variantClasses[variant])}
        >
          {action.label}
        </Link>
      );
    }

    return (
      <button
        type="button"
        onClick={action.onClick}
        disabled={action.disabled}
        className={cn(baseClasses, variantClasses[variant])}
      >
        {action.label}
      </button>
    );
  };

  return (
    <div
      className={cn(
        "mt-6",
        sticky && "popup-action-bar mt-6"
      )}
    >
      <div className={cn("flex flex-wrap items-center gap-3", justifyContent)}>
        {align === "between" && (
          <div className="flex flex-wrap gap-3">
            {danger && renderAction(danger, "danger")}
            {extraActions}
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          {align !== "between" && danger && renderAction(danger, "danger")}
          {cancel && renderAction(cancel, "secondary")}
            <button
              type="submit"
            onClick={onSubmitClick}
            disabled={submitting || submitDisabled}
            className={cn(
              "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-primary/80 bg-primary px-4 text-sm font-semibold tracking-[0.01em] text-primary-foreground shadow-[0_16px_35px_-22px_rgba(30,64,175,0.68)] transition hover:-translate-y-0.5 hover:bg-[color-mix(in_oklab,var(--primary)_90%,black_10%)] disabled:cursor-not-allowed disabled:opacity-60",
              submitDisabled && "opacity-60"
            )}
            >
              {submitting ? (
                <span className="inline-flex h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />
              ) : null}
              {submitting ? submitLoadingLabel : submitLabel}
            </button>
          </div>
      </div>
    </div>
  );
}
