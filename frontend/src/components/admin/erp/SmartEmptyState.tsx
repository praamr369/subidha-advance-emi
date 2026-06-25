"use client";

export function SmartEmptyState({ label = "No pending records." }: { label?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
      {label}
    </div>
  );
}
