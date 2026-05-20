"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type ERPMobileCardItem = {
  key: string;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  badges?: ReactNode;
  href?: string;
  right?: ReactNode;
};

type ERPMobileCardListProps = {
  items: ReadonlyArray<ERPMobileCardItem>;
  empty?: ReactNode;
  className?: string;
};

export default function ERPMobileCardList({ items, empty, className }: ERPMobileCardListProps) {
  if (items.length === 0) {
    return empty ? <div className={className}>{empty}</div> : null;
  }

  return (
    <div className={cn("grid gap-3 sm:hidden", className)}>
      {items.map((item) => {
        const content = (
          <div className="rounded-[1.4rem] border border-border/70 bg-[var(--surface-card-elevated)] p-4 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.3)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground">{item.title}</div>
                {item.subtitle ? (
                  <div className="mt-1 text-sm leading-6 text-muted-foreground">{item.subtitle}</div>
                ) : null}
              </div>
              {item.right ? <div className="shrink-0">{item.right}</div> : null}
            </div>
            {item.badges ? <div className="mt-3 flex flex-wrap items-center gap-2">{item.badges}</div> : null}
            {item.meta ? <div className="mt-3 text-sm leading-6 text-muted-foreground">{item.meta}</div> : null}
          </div>
        );

        return item.href ? (
          <Link
            key={item.key}
            href={item.href}
            className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/40 focus-visible:ring-offset-2"
          >
            {content}
          </Link>
        ) : (
          <div key={item.key}>{content}</div>
        );
      })}
    </div>
  );
}

