import UiStatusBadge from "@/components/ui/status-badge";

export default function StatusBadge({ status }: { status: string }) {
  return <UiStatusBadge status={status} size="sm" />;
}
