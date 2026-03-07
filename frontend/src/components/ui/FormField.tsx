"use client";

import { ReactNode } from "react";

type Tone = "default" | "danger" | "success" | "warning" | "info";

type FormFieldProps = {
  label?: string;
  htmlFor?: string;
  required?: boolean;

  helpText?: string;
  error?: string | null;

  children: ReactNode;

  prefix?: ReactNode;
  suffix?: ReactNode;

  disabled?: boolean;
  readOnly?: boolean;

  tone?: Tone;

  direction?: "column" | "row";
};

function getToneStyles(tone: Tone) {
  switch (tone) {
    case "danger":
      return {
        border: "#fecaca",
        background: "#fffafa",
        label: "#991b1b",
        help: "#b91c1c",
      };
    case "success":
      return {
        border: "#a7f3d0",
        background: "#f0fdf4",
        label: "#065f46",
        help: "#047857",
      };
    case "warning":
      return {
        border: "#fde68a",
        background: "#fffbeb",
        label: "#92400e",
        help: "#b45309",
      };
    case "info":
      return {
        border: "#bfdbfe",
        background: "#eff6ff",
        label: "#1d4ed8",
        help: "#2563eb",
      };
    case "default":
    default:
      return {
        border: "#e5e7eb",
        background: "#ffffff",
        label: "#0f172a",
        help: "#64748b",
      };
  }
}

export default function FormField({
  label,
  htmlFor,
  required = false,
  helpText,
  error,
  children,
  prefix,
  suffix,
  disabled = false,
  readOnly = false,
  tone = "default",
  direction = "column",
}: FormFieldProps) {
  const styles = getToneStyles(error ? "danger" : tone);

  return (
    <div
      style={{
        display: "grid",
        gap: 6,
        width: "100%",
      }}
    >
      {label ? (
        <label
          htmlFor={htmlFor}
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: styles.label,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span>{label}</span>
          {required ? (
            <span
              aria-hidden="true"
              style={{
                color: "#dc2626",
                fontWeight: 800,
              }}
            >
              *
            </span>
          ) : null}
        </label>
      ) : null}

      <div
        style={{
          display: "flex",
          flexDirection: direction === "row" ? "row" : "column",
          alignItems: direction === "row" ? "stretch" : undefined,
          width: "100%",
          border: `1px solid ${styles.border}`,
          borderRadius: 10,
          background: disabled ? "#f8fafc" : styles.background,
          overflow: "hidden",
          opacity: disabled ? 0.75 : 1,
        }}
      >
        {prefix ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "0 12px",
              background: "#f8fafc",
              borderRight: "1px solid #e5e7eb",
              color: "#475569",
              fontSize: 14,
              whiteSpace: "nowrap",
            }}
          >
            {prefix}
          </div>
        ) : null}

        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "stretch",
          }}
        >
          {children}
        </div>

        {suffix ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "0 12px",
              background: "#f8fafc",
              borderLeft: "1px solid #e5e7eb",
              color: "#475569",
              fontSize: 14,
              whiteSpace: "nowrap",
            }}
          >
            {suffix}
          </div>
        ) : null}
      </div>

      {error ? (
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#b91c1c",
            lineHeight: 1.5,
          }}
        >
          {error}
        </div>
      ) : helpText ? (
        <div
          style={{
            fontSize: 12,
            color: styles.help,
            lineHeight: 1.5,
          }}
        >
          {helpText}
        </div>
      ) : null}

      {(disabled || readOnly) && !error ? (
        <div
          style={{
            fontSize: 11,
            color: "#94a3b8",
          }}
        >
          {disabled ? "Disabled" : "Read only"}
        </div>
      ) : null}
    </div>
  );
}