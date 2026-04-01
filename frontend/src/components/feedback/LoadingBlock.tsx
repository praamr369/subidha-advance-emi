import { Loader2 } from "lucide-react";

export default function LoadingBlock({
  label = "Loading...",
}: {
  label?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <div className="text-sm text-muted-foreground">{label}</div>
      </div>
      <div className="mt-4 grid gap-2">
        <div className="h-2 rounded bg-muted" />
        <div className="h-2 w-11/12 rounded bg-muted" />
        <div className="h-2 w-4/5 rounded bg-muted" />
      </div>
    </div>
  );
}
