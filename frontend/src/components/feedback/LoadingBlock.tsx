import { LoadingSkeleton } from "@/components/ui/portal-primitives";

export default function LoadingBlock({
  label = "Loading...",
  compact = false,
}: {
  label?: string;
  compact?: boolean;
}) {
  return <LoadingSkeleton label={label} compact={compact} rows={3} className="surface-panel-elevated" />;
}
