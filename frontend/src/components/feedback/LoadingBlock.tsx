import { LoadingSkeleton } from "@/components/ui/portal-primitives";

export default function LoadingBlock({
  label = "Loading...",
  compact = false,
  "aria-label": ariaLabel,
}: {
  label?: string;
  compact?: boolean;
  "aria-label"?: string;
}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" aria-label={ariaLabel ?? label}>
      <LoadingSkeleton label={label} compact={compact} rows={3} className="surface-panel-elevated" />
    </div>
  );
}
