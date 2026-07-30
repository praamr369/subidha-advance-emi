import type { ReactNode } from "react";

export function WorkbenchKPIList({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {children}
    </div>
  );
}

export function WorkbenchKPICard({
  label,
  value,
  subtext,
  trend,
}: {
  label: string;
  value: ReactNode;
  subtext?: ReactNode;
  trend?: "positive" | "negative" | "neutral";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
      {subtext ? (
        <div className="mt-1 text-sm text-muted-foreground">{subtext}</div>
      ) : null}
    </div>
  );
}
