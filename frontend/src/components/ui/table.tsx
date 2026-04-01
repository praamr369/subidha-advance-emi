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
    <div className="overflow-x-auto">
      <table className={cn("min-w-full border-collapse", className)}>
        <thead className="border-b border-border bg-muted/30">{head}</thead>
        <tbody>{body}</tbody>
      </table>
    </div>
  );
}