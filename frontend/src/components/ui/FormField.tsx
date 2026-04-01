// frontend/src/components/ui/FormField.tsx
"use client";

import { cn } from "@/lib/utils";
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

const getToneStyles = (tone: Tone) => {
  switch (tone) {
    case "danger":
      return "border-destructive/50 bg-destructive/5 focus-within:ring-destructive";
    case "success":
      return "border-emerald-500/50 bg-emerald-50/20 focus-within:ring-emerald-500";
    case "warning":
      return "border-amber-500/50 bg-amber-50/20 focus-within:ring-amber-500";
    case "info":
      return "border-blue-500/50 bg-blue-50/20 focus-within:ring-blue-500";
    default:
      return "border-border bg-background focus-within:ring-ring";
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
  
  tone = "default",
  direction = "column",
}: FormFieldProps) {
  const effectiveTone = error ? "danger" : tone;

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={htmlFor}
          className="mb-2 block text-sm font-medium text-foreground"
        >
          {label}
          {required && <span className="ml-1 text-destructive">*</span>}
        </label>
      )}
      <div
        className={cn(
          "flex items-stretch rounded-xl border transition focus-within:ring-2",
          getToneStyles(effectiveTone),
          disabled && "bg-muted/50 opacity-70",
          direction === "row" && "flex-row"
        )}
      >
        {prefix && (
          <div className="flex items-center border-r border-border px-3 text-muted-foreground">
            {prefix}
          </div>
        )}
        <div className="min-w-0 flex-1">
          {children}
        </div>
        {suffix && (
          <div className="flex items-center border-l border-border px-3 text-muted-foreground">
            {suffix}
          </div>
        )}
      </div>
      {error && (
        <p className="mt-1 text-xs text-destructive">{error}</p>
      )}
      {helpText && !error && (
        <p className="mt-1 text-xs text-muted-foreground">{helpText}</p>
      )}
    </div>
  );
}