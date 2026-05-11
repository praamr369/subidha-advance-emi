// frontend/src/components/ui/table.tsx
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type TableProps = {
  head: ReactNode;
  body: ReactNode;
  className?: string;
};

export default function Table({ head, body, className }: TableProps) {
  return (
    <div className="ops-table-scroll max-w-full rounded-2xl border border-border bg-[var(--surface-card-elevated)]">
      <table className={cn("min-w-full border-collapse text-[0.8125rem] leading-snug sm:text-sm", className)}>
        <thead className="border-b border-border bg-[var(--surface-muted)]">{head}</thead>
        <tbody>{body}</tbody>
      </table>
    </div>
  );
}
