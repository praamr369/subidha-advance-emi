"use client";

import Link from "next/link";
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

function buttonBaseStyle(): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 42,
    padding: "10px 14px",
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 700,
    textDecoration: "none",
    cursor: "pointer",
    transition: "all 0.2s ease",
    whiteSpace: "nowrap",
  };
}

function renderActionButton(
  action: FormActionButton,
  variant: "secondary" | "danger"
) {
  const style: React.CSSProperties = {
    ...buttonBaseStyle(),
    border:
      variant === "danger" ? "1px solid #dc2626" : "1px solid #d1d5db",
    background: variant === "danger" ? "#ffffff" : "#ffffff",
    color: variant === "danger" ? "#b91c1c" : "#111827",
    opacity: action.disabled ? 0.6 : 1,
    pointerEvents: action.disabled ? "none" : "auto",
  };

  if (action.href) {
    return (
      <Link href={action.href} style={style}>
        {action.label}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={action.onClick}
      disabled={action.disabled}
      style={style}
    >
      {action.label}
    </button>
  );
}

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
      ? "flex-start"
      : align === "between"
      ? "space-between"
      : "flex-end";

  return (
    <div
      style={{
        position: sticky ? "sticky" : "static",
        bottom: sticky ? 0 : undefined,
        zIndex: sticky ? 15 : undefined,
        background: sticky ? "rgba(255,255,255,0.96)" : "transparent",
        backdropFilter: sticky ? "blur(8px)" : undefined,
        borderTop: sticky ? "1px solid #e5e7eb" : undefined,
        padding: sticky ? "14px 0 0" : 0,
        marginTop: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent,
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        {align === "between" ? (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {danger ? renderActionButton(danger, "danger") : null}
            {extraActions}
          </div>
        ) : null}

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            marginLeft: align === "right" ? "auto" : undefined,
          }}
        >
          {align !== "between" && danger ? renderActionButton(danger, "danger") : null}
          {cancel ? renderActionButton(cancel, "secondary") : null}
          <button
            type="submit"
            onClick={onSubmitClick}
            disabled={submitting || submitDisabled}
            style={{
              ...buttonBaseStyle(),
              border: "1px solid #0f172a",
              background: submitting || submitDisabled ? "#94a3b8" : "#0f172a",
              color: "#ffffff",
              opacity: submitting || submitDisabled ? 0.85 : 1,
              cursor: submitting || submitDisabled ? "not-allowed" : "pointer",
            }}
          >
            {submitting ? submitLoadingLabel : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}