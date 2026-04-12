import { Loader2 } from "lucide-react";

export default function LoadingBlock({
  label = "Loading...",
  compact = false,
}: {
  label?: string;
  compact?: boolean;
}) {
  return (
    <div className="surface-panel-elevated rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <div className="text-sm font-medium text-muted-foreground">{label}</div>
      </div>
      {!compact ? (
        <div className="mt-4 grid gap-2">
          <div className="h-2 rounded bg-[var(--surface-muted)]" />
          <div className="h-2 w-11/12 rounded bg-[var(--surface-muted)]" />
          <div className="h-2 w-4/5 rounded bg-[var(--surface-muted)]" />
        </div>
      ) : null}
    </div>
  );
}
