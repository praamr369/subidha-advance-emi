"use client";

import { cn } from "@/lib/utils";

type ValidationSummaryProps = {
  title?: string;
  frontendErrors?: string[];
  backendMessage?: string | null;
  backendFieldErrors?: Record<string, string[]>;
  className?: string;
};

function flattenBackendErrors(fieldErrors: Record<string, string[]>): string[] {
  const items: string[] = [];
  for (const [field, messages] of Object.entries(fieldErrors)) {
    for (const message of messages) {
      const prefix = field === "non_field_errors" ? "" : `${field}: `;
      items.push(`${prefix}${message}`);
    }
  }
  return items;
}

export default function ValidationSummary({
  title = "Validation",
  frontendErrors,
  backendMessage,
  backendFieldErrors,
  className,
}: ValidationSummaryProps) {
  const frontend = (frontendErrors || []).filter(Boolean);
  const backend = backendFieldErrors ? flattenBackendErrors(backendFieldErrors) : [];
  const visible = frontend.length > 0 || backend.length > 0 || Boolean(backendMessage);
  if (!visible) return null;

  return (
    <div className={cn("rounded-2xl border border-destructive/35 bg-destructive/10 px-4 py-3 text-sm", className)}>
      <div className="font-semibold text-foreground">{title}</div>
      {backendMessage ? <div className="mt-2 text-sm text-foreground/90">{backendMessage}</div> : null}
      <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
        {frontend.map((item) => (
          <li key={`f:${item}`}>{item}</li>
        ))}
        {backend.map((item, idx) => (
          <li key={`b:${idx}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

