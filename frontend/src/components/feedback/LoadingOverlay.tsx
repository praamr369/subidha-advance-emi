import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

type LoadingOverlayProps = {
  active: boolean;
  label?: string;
  className?: string;
};

export default function LoadingOverlay({
  active,
  label = "Updating data...",
  className,
}: LoadingOverlayProps) {
  if (!active) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "absolute inset-0 z-20 flex items-center justify-center rounded-inherit bg-white/65 backdrop-blur-[1px]",
        className
      )}
    >
      <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3 py-2 text-sm font-medium text-foreground shadow-[0_12px_28px_-20px_rgba(15,23,42,0.5)]">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span>{label}</span>
      </div>
    </div>
  );
}
