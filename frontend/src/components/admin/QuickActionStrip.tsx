"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

export type QuickActionItem = {
  label: string;
  href: string;
};

type QuickActionStripProps = {
  actions?: QuickActionItem[];
};

export default function QuickActionStrip({ actions }: QuickActionStripProps) {
  if (!actions || actions.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action, idx) => (
        <Link
          key={`${action.href}-${idx}`}
          href={action.href}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted hover:border-ring"
        >
          {action.label}
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      ))}
    </div>
  );
}
