import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function MoneyCell({
  value,
  className,
}: {
  value: number | string | null | undefined;
  className?: string;
}) {
  return (
    <span className={cn("tabular-nums font-medium text-foreground", className)}>
      {formatCurrency(value)}
    </span>
  );
}
