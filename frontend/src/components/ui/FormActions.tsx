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
      "inline-flex items-center justify-center rounded-xl border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60";
    const variantClasses = {
      secondary: "border-border bg-background text-foreground hover:bg-muted",
      danger: "border-destructive/30 bg-background text-destructive hover:bg-destructive/10",
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
        sticky && "sticky bottom-0 bg-background/90 backdrop-blur",
        sticky && "pt-4"
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
              "inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60",
              submitDisabled && "opacity-60"
            )}
          >
            {submitting ? submitLoadingLabel : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}