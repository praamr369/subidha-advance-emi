"use client";

import type { ReactNode } from "react";

import Link from "next/link";

import { cn } from "@/lib/utils";

export type RelatedRecordPreviewRow = {
  label: string;
  value: ReactNode;
};

type RelatedRecordPreviewProps = {
  title: string;
  href?: string | null;
  rows: RelatedRecordPreviewRow[];
  emptyText?: string;
  className?: string;
};

export default function RelatedRecordPreview({
  title,
  href,
  rows,
  emptyText = "Select a record to preview key details here.",
  className,
}: RelatedRecordPreviewProps) {
  const hasRows = rows.length > 0;
  return (
    <div className={cn("rounded-xl border border-border/70 bg-muted/10 px-4 py-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        {href ? (
          <Link
            href={href}
            className="text-xs font-semibold text-primary underline-offset-4 hover:underline"
          >
            Open
          </Link>
        ) : null}
      </div>
      {!hasRows ? <div className="mt-2 text-sm text-muted-foreground">{emptyText}</div> : null}
      {hasRows ? (
        <dl className="mt-3 grid gap-2">
          {rows.map((row) => (
            <div key={row.label} className="grid grid-cols-[9rem_minmax(0,1fr)] gap-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">
                {row.label}
              </dt>
              <dd className="min-w-0 break-words text-sm text-foreground/90">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

