// frontend/src/components/ui/FormField.tsx
"use client";

import { cn } from "@/lib/utils";
import { Children, cloneElement, isValidElement, ReactNode, type ReactElement } from "react";

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

const getToneStyles = (tone: Tone) => {
  switch (tone) {
    case "danger":
      return "border-red-300 bg-red-50/55 focus-within:border-red-400 focus-within:ring-red-400/35";
    case "success":
      return "border-emerald-300 bg-emerald-50/50 focus-within:border-emerald-400 focus-within:ring-emerald-400/35";
    case "warning":
      return "border-amber-300 bg-amber-50/55 focus-within:border-amber-400 focus-within:ring-amber-400/35";
    case "info":
      return "border-sky-300 bg-sky-50/55 focus-within:border-sky-400 focus-within:ring-sky-400/35";
    default:
      return "border-border bg-[var(--surface-card-elevated)] focus-within:border-[var(--surface-border-strong)] focus-within:ring-[var(--ring)]/35";
  }
};

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
  const effectiveTone = error ? "danger" : tone;
  const fieldId = htmlFor ?? undefined;
  const errorId = fieldId ? `${fieldId}-error` : undefined;
  const helpId = fieldId ? `${fieldId}-help` : undefined;
  const describedBy = error ? errorId : helpText ? helpId : undefined;
  const childArray = Children.toArray(children);
  const firstControlIndex = childArray.findIndex((child) => {
    if (!isValidElement(child)) return false;
    return !(typeof child.type === "string" && !["input", "textarea", "select"].includes(child.type));
  });
  const decoratedChildren = childArray.map((child, index) => {
    if (!isValidElement(child) || index !== firstControlIndex) return child;
    const element = child as ReactElement<Record<string, unknown>>;
    return cloneElement(element, {
      id: fieldId ?? element.props.id,
      "aria-invalid": Boolean(error) || element.props["aria-invalid"],
      "aria-describedby": describedBy ?? element.props["aria-describedby"],
    });
  });

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={htmlFor}
          className="mb-2 block text-sm font-semibold tracking-[0.01em] text-foreground"
        >
          {label}
          {required && <span className="ml-1 text-red-600">*</span>}
        </label>
      )}
      <div
        className={cn(
          "flex items-stretch rounded-xl border shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition focus-within:ring-2",
          getToneStyles(effectiveTone),
          (disabled || readOnly) && "bg-[var(--surface-muted)] opacity-85",
          direction === "row" && "flex-row"
        )}
      >
        {prefix && (
          <div className="flex items-center border-r border-border bg-[var(--surface-muted)] px-3 text-muted-foreground">
            {prefix}
          </div>
        )}
        <div className="min-w-0 flex-1">
          {decoratedChildren}
        </div>
        {suffix && (
          <div className="flex items-center border-l border-border bg-[var(--surface-muted)] px-3 text-muted-foreground">
            {suffix}
          </div>
        )}
      </div>
      {error && (
        <p id={errorId} className="mt-1 text-xs font-medium text-red-700" role="alert">
          {error}
        </p>
      )}
      {helpText && !error && (
        <p id={helpId} className="mt-1 text-xs text-muted-foreground">
          {helpText}
        </p>
      )}
    </div>
  );
}
