// frontend/src/components/ui/RiskBadge.tsx
import { cn } from "@/lib/utils";

type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | null | undefined;

export default function RiskBadge({ level }: { level: RiskLevel }) {
  const value = (level || "LOW").toUpperCase();

  const classes = {
    CRITICAL: "border-destructive/30 bg-destructive/10 text-destructive",
    HIGH: "border-orange-500/30 bg-orange-500/10 text-orange-600",
    MEDIUM: "border-yellow-500/30 bg-yellow-500/10 text-yellow-700",
    LOW: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
  }[value] || "border-border bg-muted text-foreground";

  return (
    <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-medium", classes)}>
      {value}
    </span>
  );
}