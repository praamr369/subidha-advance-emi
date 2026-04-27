"use client";

export function SmartEmptyState({ label = "No pending records." }: { label?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-muted-foreground">
      {label}
    </div>
  );
}
