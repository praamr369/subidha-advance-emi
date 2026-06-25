"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import DocumentActionBar from "@/components/documents/DocumentActionBar";
import DocumentStatusBadge from "@/components/documents/DocumentStatusBadge";

export type DocumentPanelItem = {
  id: string | number;
  title: string;
  documentType?: string | null;
  documentNumber?: string | null;
  status?: string | null;
  statusLabel?: string | null;
  generatedAtLabel?: string | null;
  subtitle?: string | null;
  disabledReason?: string | null;
  actions?: ReactNode;
};

export default function DocumentPanel({
  title = "Documents",
  description,
  loading = false,
  error,
  emptyLabel = "No documents available.",
  items = [],
  headerActions,
  className,
}: {
  title?: string;
  description?: string;
  loading?: boolean;
  error?: string | null;
  emptyLabel?: string;
  items?: DocumentPanelItem[];
  headerActions?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[1.4rem] border border-border bg-[var(--surface-card)] shadow-[var(--card-shadow)]",
        className
      )}
    >
      <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {headerActions ? <DocumentActionBar className="sm:shrink-0">{headerActions}</DocumentActionBar> : null}
      </div>

      <div className="px-4 py-4 sm:px-6">
        {loading ? (
          <div className="rounded-xl border border-border bg-muted/50 px-4 py-6 text-sm text-muted-foreground">
            Loading documents…
          </div>
        ) : error ? (
          <div className="rounded-xl border border-border bg-muted/50 px-4 py-6 text-sm text-destructive">
            {error}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-border bg-muted/50 px-4 py-6 text-sm text-muted-foreground">
            {emptyLabel}
          </div>
        ) : (
          <div className="grid gap-3">
            {items.map((item) => (
              <article
                key={item.id}
                className="rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 py-4 shadow-[inset_0_1px_0_var(--hairline-shine)]"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-semibold text-foreground">{item.title}</h4>
                      {item.status || item.statusLabel ? (
                        <DocumentStatusBadge
                          status={item.status}
                          label={item.statusLabel || item.status}
                          hideIcon
                        />
                      ) : null}
                    </div>
                    <div className="mt-1 grid gap-1 text-xs text-muted-foreground">
                      {item.subtitle ? <div>{item.subtitle}</div> : null}
                      {item.documentNumber ? <div>Document No: {item.documentNumber}</div> : null}
                      {item.generatedAtLabel ? <div>Generated: {item.generatedAtLabel}</div> : null}
                      {item.disabledReason ? <div className="text-amber-600 dark:text-amber-400">{item.disabledReason}</div> : null}
                    </div>
                  </div>

                  {item.actions ? <div className="flex shrink-0 flex-wrap gap-2">{item.actions}</div> : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

